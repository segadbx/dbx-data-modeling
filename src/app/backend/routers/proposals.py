"""
Proposals router — CRUD over Lakebase.

* Reads return all proposals (POC: no row-level filter; trivial to add `WHERE created_by = user`).
* Writes use the App SP creds (Lakebase OBO would force individual DB roles per user).
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import CurrentUser, current_user
from backend import proposal_store
from agent.tools import catalog_introspect, proposal_validator, reuse_scanner


router = APIRouter()


def _build_report(model: dict[str, Any]) -> dict[str, Any]:
    """Run the validator against a proposal model with UC context filled in.

    Silver / gold introspection is best-effort — a transient UC failure shouldn't
    block validation of the contract rules (R1-R5/R8). Catch and skip R6/R7 only.
    """
    silver_tables: set[str] | None
    gold_tables: set[str]
    try:
        silver_tables = set(catalog_introspect.list_silver_tables())
    except Exception:
        silver_tables = None
    try:
        gold_tables = set(catalog_introspect.list_gold_tables())
    except Exception:
        gold_tables = set()
    seed_names = {d["name"] for d in reuse_scanner.list_all_seed_dims() if d.get("name")}
    issues = proposal_validator.validate(
        model,
        silver_tables=silver_tables,
        seed_dim_names=seed_names,
        existing_gold_tables=gold_tables,
    )
    return proposal_validator.report(issues)


class ApproveBody(BaseModel):
    pass  # No fields yet; user identity comes from headers.


@router.get("")
def list_all() -> list[dict[str, Any]]:
    return [_to_dict(p) for p in proposal_store.list_proposals()]


@router.get("/{proposal_id}")
def get(proposal_id: str) -> dict[str, Any]:
    p = proposal_store.get_proposal(uuid.UUID(proposal_id))
    if not p:
        raise HTTPException(status_code=404)
    return _to_dict(p)


@router.post("/{proposal_id}/validate")
def validate(proposal_id: str) -> dict[str, Any]:
    p = proposal_store.get_proposal(uuid.UUID(proposal_id))
    if not p:
        raise HTTPException(status_code=404)
    return _build_report(p.model or {})


@router.post("/{proposal_id}/approve")
def approve(
    proposal_id: str, body: ApproveBody, user: CurrentUser = Depends(current_user)
) -> dict[str, str]:
    p = proposal_store.get_proposal(uuid.UUID(proposal_id))
    if not p:
        raise HTTPException(status_code=404)
    rep = _build_report(p.model or {})
    if not rep["ok"]:
        raise HTTPException(status_code=422, detail=rep)
    proposal_store.approve(uuid.UUID(proposal_id), approved_by=user.user_name)
    return {"status": "approved"}


def _to_dict(p) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "version": p.version,
        "status": p.status,
        "created_by": p.created_by,
        "model": p.model,
        "ddl_text": p.ddl_text,
    }

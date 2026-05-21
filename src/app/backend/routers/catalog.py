"""
Catalog router — UC introspection passthrough.

Runs as the *user* (OBO) so grants are enforced naturally.
"""
from __future__ import annotations

import os

from databricks.sdk import WorkspaceClient
from fastapi import APIRouter, Depends, HTTPException

from backend.auth import CurrentUser, current_user


router = APIRouter()


def _env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"{name} is not set in the app environment.")
    return v


CATALOG = _env("CATALOG_NAME")
SILVER = _env("SILVER_SCHEMA")


def _user_workspace(user: CurrentUser) -> WorkspaceClient:
    # auth_type="pat" disambiguates from the App SP's OAuth env vars
    # (DATABRICKS_CLIENT_ID/SECRET) the runtime also injects.
    return WorkspaceClient(
        token=user.obo_token,
        host=os.environ["DATABRICKS_HOST"],
        auth_type="pat",
    )


@router.get("/tables")
def list_tables(user: CurrentUser = Depends(current_user)) -> list[dict[str, str]]:
    w = _user_workspace(user)
    tables = w.tables.list(catalog_name=CATALOG, schema_name=SILVER)
    return [
        {
            "name": t.name,
            "full_name": t.full_name,
            "comment": t.comment or "",
            "table_type": str(t.table_type),
        }
        for t in tables
    ]


@router.get("/tables/{table_name}")
def describe(table_name: str, user: CurrentUser = Depends(current_user)) -> dict:
    w = _user_workspace(user)
    try:
        t = w.tables.get(full_name=f"{CATALOG}.{SILVER}.{table_name}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {
        "name": t.name,
        "full_name": t.full_name,
        "comment": t.comment or "",
        "columns": [
            {
                "name": c.name,
                "type": c.type_text,
                "comment": c.comment or "",
                "position": c.position,
            }
            for c in (t.columns or [])
        ],
    }

"""
Apply router — triggers the apply_ddl job via Jobs SDK with proposal_id parameter.
Runs as the App SP.
"""
from __future__ import annotations

import os

from databricks.sdk import WorkspaceClient
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import CurrentUser, current_user


router = APIRouter()


class ApplyBody(BaseModel):
    proposal_id: str


@router.post("")
def trigger(body: ApplyBody, user: CurrentUser = Depends(current_user)) -> dict:
    job_id = os.environ.get("APPLY_JOB_ID")
    if not job_id:
        raise HTTPException(status_code=500, detail="APPLY_JOB_ID env var not set")
    w = WorkspaceClient()
    run = w.jobs.run_now(
        job_id=int(job_id),
        job_parameters={"proposal_id": body.proposal_id},
    )
    return {"run_id": run.run_id, "proposal_id": body.proposal_id}


@router.get("/{run_id}")
def status(run_id: int) -> dict:
    w = WorkspaceClient()
    r = w.jobs.get_run(run_id=run_id)
    return {
        "run_id": run_id,
        "life_cycle_state": str(r.state.life_cycle_state) if r.state else None,
        "result_state": str(r.state.result_state) if r.state else None,
        "state_message": r.state.state_message if r.state else None,
    }

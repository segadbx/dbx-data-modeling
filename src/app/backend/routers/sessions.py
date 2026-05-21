"""
Chat sessions router — CRUD over Lakebase `chat_sessions` + their messages.

Sessions are scoped to the calling user (`created_by = user.user_name`). A 404
is returned for cross-user reads so existence isn't leaked.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import CurrentUser, current_user
from backend import proposal_store


router = APIRouter()


class CreateSessionBody(BaseModel):
    title: str | None = None


class UpdateSessionBody(BaseModel):
    title: str


@router.get("")
def list_sessions(user: CurrentUser = Depends(current_user)) -> list[dict[str, Any]]:
    return [_to_dict(s) for s in proposal_store.list_sessions(user.user_name)]


@router.post("")
def create_session(
    body: CreateSessionBody, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    s = proposal_store.create_session(created_by=user.user_name, title=body.title)
    return _to_dict(s)


@router.get("/{session_id}")
def get_session(session_id: str, user: CurrentUser = Depends(current_user)) -> dict[str, Any]:
    sid = _parse_uuid(session_id)
    s = proposal_store.get_session(sid)
    if not s or s.created_by != user.user_name:
        raise HTTPException(status_code=404, detail="Session not found")
    rows = proposal_store.get_session_messages(sid)
    return {
        **_to_dict(s),
        "messages": [
            {"role": r["role"], "content": r["content"]}
            for r in rows
            if r["role"] in ("user", "assistant")
        ],
    }


@router.patch("/{session_id}")
def update_session(
    session_id: str,
    body: UpdateSessionBody,
    user: CurrentUser = Depends(current_user),
) -> dict[str, Any]:
    sid = _parse_uuid(session_id)
    existing = proposal_store.get_session(sid)
    if not existing or existing.created_by != user.user_name:
        raise HTTPException(status_code=404, detail="Session not found")
    updated = proposal_store.update_session_title(sid, body.title)
    return _to_dict(updated)


@router.delete("/{session_id}")
def delete_session(session_id: str, user: CurrentUser = Depends(current_user)) -> dict[str, str]:
    sid = _parse_uuid(session_id)
    existing = proposal_store.get_session(sid)
    if not existing or existing.created_by != user.user_name:
        raise HTTPException(status_code=404, detail="Session not found")
    proposal_store.delete_session(sid)
    return {"status": "deleted"}


def _parse_uuid(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid session id: {e}") from e


def _to_dict(s) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "created_by": s.created_by,
        "title": s.title,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "last_message_at": s.last_message_at.isoformat() if s.last_message_at else None,
        "proposal_id": str(s.proposal_id) if s.proposal_id else None,
    }

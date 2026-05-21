"""
Lakebase-backed proposal store.

CRUD over the `proposals`, `conversations`, `approvals` tables.

See `agent/tools/proposal_store.py` for the connection contract — Databricks Apps PG*
env vars + SDK-minted, cached OAuth password.
"""
from __future__ import annotations

import json
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

# Connection metadata + OAuth password are centralized in `agent.tools.proposal_store`
# so both modules share one cached token. Re-exported here so callers can resolve
# either symbol via `backend.proposal_store`.
from agent.tools.proposal_store import (  # noqa: F401
    ensure_lakebase_password,
    lakebase_connection_params,
)


@dataclass
class Proposal:
    id: uuid.UUID
    version: int
    status: str
    created_by: str
    model: dict[str, Any]
    ddl_text: str | None


@dataclass
class Session:
    id: uuid.UUID
    created_by: str
    title: str | None
    created_at: Any
    updated_at: Any
    last_message_at: Any
    proposal_id: uuid.UUID | None


# ----- Connection -----------------------------------------------------------

def _build_dsn() -> str:
    p = lakebase_connection_params()
    pwd = ensure_lakebase_password()
    parts = [
        f"host={p.host}",
        f"port={p.port}",
        f"dbname={p.database}",
        f"user={p.user}",
        f"password={pwd}",
        "sslmode=require",
    ]
    if p.app_name:
        parts.append(f"application_name={p.app_name}")
    return " ".join(parts)


@contextmanager
def conn() -> Iterator[psycopg.Connection]:
    with psycopg.connect(_build_dsn(), row_factory=dict_row) as c:
        yield c


# ----- Proposals ------------------------------------------------------------

def create_proposal(created_by: str, model: dict[str, Any]) -> Proposal:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "INSERT INTO proposals (created_by, model_jsonb) VALUES (%s, %s) "
            "RETURNING id, version, status, created_by, model_jsonb, ddl_text",
            (created_by, json.dumps(model)),
        )
        row = cur.fetchone()
        c.commit()
    return _row_to_proposal(row)


def get_proposal(proposal_id: uuid.UUID) -> Proposal | None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "SELECT id, version, status, created_by, model_jsonb, ddl_text "
            "FROM proposals WHERE id = %s",
            (proposal_id,),
        )
        row = cur.fetchone()
    return _row_to_proposal(row) if row else None


def list_proposals(limit: int = 50) -> list[Proposal]:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "SELECT id, version, status, created_by, model_jsonb, ddl_text "
            "FROM proposals ORDER BY updated_at DESC LIMIT %s",
            (limit,),
        )
        rows = cur.fetchall()
    return [_row_to_proposal(r) for r in rows]


def update_proposal_model(proposal_id: uuid.UUID, model: dict[str, Any]) -> Proposal:
    """Bumps version and overwrites the JSON model. Caller is responsible for versioning
    semantics (e.g., reset ddl_text since the model changed)."""
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "UPDATE proposals SET model_jsonb = %s, ddl_text = NULL, "
            "version = version + 1, updated_at = now() WHERE id = %s "
            "RETURNING id, version, status, created_by, model_jsonb, ddl_text",
            (json.dumps(model), proposal_id),
        )
        row = cur.fetchone()
        c.commit()
    return _row_to_proposal(row)


def set_ddl(proposal_id: uuid.UUID, ddl_text: str) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "UPDATE proposals SET ddl_text = %s, updated_at = now() WHERE id = %s",
            (ddl_text, proposal_id),
        )
        c.commit()


def approve(proposal_id: uuid.UUID, approved_by: str) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "INSERT INTO approvals (proposal_id, approved_by) VALUES (%s, %s) "
            "ON CONFLICT (proposal_id) DO UPDATE SET approved_by = EXCLUDED.approved_by, "
            "approved_at = now()",
            (proposal_id, approved_by),
        )
        cur.execute(
            "UPDATE proposals SET status = 'approved' WHERE id = %s",
            (proposal_id,),
        )
        c.commit()


def record_apply_result(proposal_id: uuid.UUID, run_id: int, status: str) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "UPDATE approvals SET applied_run_id = %s, applied_status = %s, applied_at = now() "
            "WHERE proposal_id = %s",
            (run_id, status, proposal_id),
        )
        c.commit()


# ----- Chat sessions --------------------------------------------------------

_SESSION_COLS = (
    "id, created_by, title, created_at, updated_at, last_message_at, proposal_id"
)


def create_session(created_by: str, title: str | None = None) -> Session:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            f"INSERT INTO chat_sessions (created_by, title) VALUES (%s, %s) "
            f"RETURNING {_SESSION_COLS}",
            (created_by, title),
        )
        row = cur.fetchone()
        c.commit()
    return _row_to_session(row)


def get_session(session_id: uuid.UUID) -> Session | None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            f"SELECT {_SESSION_COLS} FROM chat_sessions WHERE id = %s",
            (session_id,),
        )
        row = cur.fetchone()
    return _row_to_session(row) if row else None


def list_sessions(created_by: str, limit: int = 50) -> list[Session]:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            f"SELECT {_SESSION_COLS} FROM chat_sessions "
            f"WHERE created_by = %s ORDER BY last_message_at DESC LIMIT %s",
            (created_by, limit),
        )
        rows = cur.fetchall()
    return [_row_to_session(r) for r in rows]


def update_session_title(session_id: uuid.UUID, title: str) -> Session | None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            f"UPDATE chat_sessions SET title = %s, updated_at = now() WHERE id = %s "
            f"RETURNING {_SESSION_COLS}",
            (title, session_id),
        )
        row = cur.fetchone()
        c.commit()
    return _row_to_session(row) if row else None


def touch_session(session_id: uuid.UUID) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "UPDATE chat_sessions SET last_message_at = now(), updated_at = now() WHERE id = %s",
            (session_id,),
        )
        c.commit()


def link_session_to_proposal(session_id: uuid.UUID, proposal_id: uuid.UUID) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "UPDATE chat_sessions SET proposal_id = %s, updated_at = now() WHERE id = %s",
            (proposal_id, session_id),
        )
        c.commit()


def delete_session(session_id: uuid.UUID) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute("DELETE FROM chat_sessions WHERE id = %s", (session_id,))
        c.commit()


# ----- Conversations (session-keyed) ----------------------------------------

def append_conversation(
    session_id: uuid.UUID,
    role: str,
    content: str,
    tool_calls: dict[str, Any] | None = None,
    proposal_id: uuid.UUID | None = None,
) -> None:
    """Append a turn to a session's conversation log. Bumps `last_message_at` so
    the sidebar sort order updates."""
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "INSERT INTO conversations "
            "(session_id, proposal_id, turn, role, content, tool_calls_jsonb) "
            "VALUES (%s, %s, "
            "COALESCE((SELECT MAX(turn) FROM conversations WHERE session_id = %s), 0) + 1, "
            "%s, %s, %s)",
            (
                session_id,
                proposal_id,
                session_id,
                role,
                content,
                json.dumps(tool_calls) if tool_calls else None,
            ),
        )
        cur.execute(
            "UPDATE chat_sessions SET last_message_at = now(), updated_at = now() WHERE id = %s",
            (session_id,),
        )
        c.commit()


def get_session_messages(session_id: uuid.UUID) -> list[dict[str, Any]]:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "SELECT turn, role, content, tool_calls_jsonb, created_at "
            "FROM conversations WHERE session_id = %s ORDER BY turn ASC",
            (session_id,),
        )
        return cur.fetchall()


# ----- Helpers --------------------------------------------------------------

def _row_to_proposal(row: dict[str, Any]) -> Proposal:
    return Proposal(
        id=row["id"],
        version=row["version"],
        status=row["status"],
        created_by=row["created_by"],
        model=row["model_jsonb"],
        ddl_text=row["ddl_text"],
    )


def _row_to_session(row: dict[str, Any]) -> Session:
    return Session(
        id=row["id"],
        created_by=row["created_by"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        last_message_at=row["last_message_at"],
        proposal_id=row["proposal_id"],
    )



"""
Lakebase-backed proposal store.

CRUD over the `proposals`, `conversations`, `approvals` tables.

Connection model
----------------
Databricks Apps auto-injects the standard PostgreSQL env vars (`PGHOST`, `PGPORT`,
`PGUSER`, `PGDATABASE`, `PGAPPNAME`) when a database resource is bound to the app.
`PGPASSWORD` is **not** injected — it's minted on demand via the SDK and cached for
~50 min (just under the ~1h token expiry).

The SDK's `generate_database_credential` needs the *instance name* (not the host).
The Apps platform doesn't propagate that as an env var, so on first call we resolve
it by listing instances and matching `read_write_dns == PGHOST`. The resolved name
is cached in process memory. `LAKEBASE_INSTANCE_NAME` is honored as an override
when set to a non-hostname value (useful for local dev pointing at a known instance).

For local dev, export `PGPASSWORD` directly to skip the SDK mint path entirely.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

from databricks.sdk import WorkspaceClient


@dataclass
class Proposal:
    id: uuid.UUID
    version: int
    status: str
    created_by: str
    model: dict[str, Any]
    ddl_text: str | None


# ----- Connection -----------------------------------------------------------


@dataclass(frozen=True)
class LakebaseConnParams:
    host: str
    port: str
    user: str
    database: str
    app_name: str | None  # PGAPPNAME — applied as application_name in the DSN


_PG_REQUIRED = ("PGHOST", "PGPORT", "PGUSER", "PGDATABASE")
_PWD_TTL_SECONDS = 50 * 60
_cached_pwd: str | None = None
_pwd_expires_at: float | None = None
_resolved_instance: str | None = None


def lakebase_connection_params() -> LakebaseConnParams:
    """Read Lakebase connection metadata from the Apps-injected PG* env vars."""
    missing = [k for k in _PG_REQUIRED if not os.environ.get(k)]
    if missing:
        raise RuntimeError(
            f"Missing Databricks Apps PG env vars: {missing}. These are auto-injected "
            f"by the Apps platform when a database resource is bound. For local dev, "
            f"export them directly."
        )
    return LakebaseConnParams(
        host=os.environ["PGHOST"],
        port=os.environ["PGPORT"],
        user=os.environ["PGUSER"],
        database=os.environ["PGDATABASE"],
        app_name=os.environ.get("PGAPPNAME"),
    )


def _resolve_instance_name(w: WorkspaceClient, host: str) -> str:
    """Find the Lakebase instance whose `read_write_dns` matches PGHOST.

    Honors `LAKEBASE_INSTANCE_NAME` as an override iff it's set and doesn't look like a
    hostname (legacy `valueFrom: lakebase` bindings resolved to the host DNS, which is
    useless as an instance identifier).
    """
    global _resolved_instance
    if _resolved_instance:
        return _resolved_instance
    override = os.environ.get("LAKEBASE_INSTANCE_NAME")
    if override and "." not in override:
        _resolved_instance = override
        return _resolved_instance
    for inst in w.database.list_database_instances():
        if inst.read_write_dns == host:
            _resolved_instance = inst.name
            return _resolved_instance
    raise RuntimeError(
        f"No Lakebase instance found with read_write_dns={host!r}. "
        f"Verify the app's `database` resource binding or set LAKEBASE_INSTANCE_NAME "
        f"to the instance name."
    )


def refresh_creds(instance_name: str, *, database_name: str) -> None:
    """Populate PG* env vars from a Lakebase instance, for callers running outside
    the Databricks Apps container (e.g. Jobs).

    Inside an App, the platform injects PGHOST/PGPORT/PGUSER/PGDATABASE/PGAPPNAME
    when a database resource is bound. Jobs get nothing — this function fills the
    same vars from the SDK so the rest of `proposal_store` works unchanged.

    Also invalidates the cached OAuth token so the next connection mints a fresh one.
    """
    global _cached_pwd, _pwd_expires_at, _resolved_instance
    w = WorkspaceClient()
    inst = w.database.get_database_instance(name=instance_name)
    me = w.current_user.me()
    os.environ["PGHOST"] = inst.read_write_dns
    os.environ["PGPORT"] = os.environ.get("PGPORT", "5432")
    os.environ["PGUSER"] = me.user_name
    os.environ["PGDATABASE"] = database_name
    os.environ["LAKEBASE_INSTANCE_NAME"] = instance_name
    _resolved_instance = instance_name
    _cached_pwd = None
    _pwd_expires_at = None


def ensure_lakebase_password() -> str:
    """Return a current Lakebase OAuth token, minting + caching as needed.

    Order of precedence:
      1. `PGPASSWORD` env var if set — local dev or a future platform-injected token.
      2. Cached SDK-minted token if not yet expired.
      3. Otherwise: resolve the instance name from `PGHOST` (or LAKEBASE_INSTANCE_NAME
         override) and call `WorkspaceClient.database.generate_database_credential`.

    Errors propagate — no broad-catch.
    """
    global _cached_pwd, _pwd_expires_at
    static = os.environ.get("PGPASSWORD")
    if static:
        return static
    if _cached_pwd and _pwd_expires_at and time.monotonic() < _pwd_expires_at:
        return _cached_pwd
    host = os.environ.get("PGHOST")
    if not host:
        raise RuntimeError(
            "Cannot mint Lakebase credential: PGHOST is not set. "
            "These vars are auto-injected by Databricks Apps when a database resource "
            "is bound — verify the binding in resources/apps/modeler_app.yml."
        )
    w = WorkspaceClient()
    instance = _resolve_instance_name(w, host)
    cred = w.database.generate_database_credential(
        request_id=str(uuid.uuid4()), instance_names=[instance]
    )
    _cached_pwd = cred.token
    _pwd_expires_at = time.monotonic() + _PWD_TTL_SECONDS
    return _cached_pwd


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


# Schema owned by the App SP for LangGraph checkpoint tables. The SP has
# CAN_CONNECT_AND_CREATE on the database (can CREATE SCHEMA) but not CREATE on
# `public` (owned by the deploy user); langgraph creates its tables with
# unqualified names, so we redirect via search_path in the checkpointer DSN.
# Overridable so local dev (connecting as the deploy *user*, not the App SP that owns
# the deployed `langgraph_checkpoints` tables) can point at a schema it owns and avoid
# "must be owner of table checkpoints" during the checkpointer's idempotent migration.
CHECKPOINT_SCHEMA = os.environ.get("CHECKPOINT_SCHEMA", "langgraph_checkpoints")
_checkpoint_schema_ready = False


async def ensure_checkpoint_schema() -> None:
    """Create the langgraph checkpoint schema once per process. Idempotent."""
    global _checkpoint_schema_ready
    if _checkpoint_schema_ready:
        return
    async with await psycopg.AsyncConnection.connect(
        _build_dsn(), autocommit=True
    ) as aconn:
        async with aconn.cursor() as cur:
            await cur.execute(
                f'CREATE SCHEMA IF NOT EXISTS "{CHECKPOINT_SCHEMA}" '
                f"AUTHORIZATION CURRENT_USER"
            )
    _checkpoint_schema_ready = True


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


# ----- Conversations --------------------------------------------------------

def append_conversation(
    proposal_id: uuid.UUID,
    role: str,
    content: str,
    tool_calls: dict[str, Any] | None = None,
) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "INSERT INTO conversations (proposal_id, turn, role, content, tool_calls_jsonb) "
            "VALUES (%s, COALESCE((SELECT MAX(turn) FROM conversations WHERE proposal_id = %s), 0) + 1, "
            "%s, %s, %s)",
            (proposal_id, proposal_id, role, content, json.dumps(tool_calls) if tool_calls else None),
        )
        c.commit()


def get_conversation(proposal_id: uuid.UUID) -> list[dict[str, Any]]:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "SELECT turn, role, content, tool_calls_jsonb, created_at "
            "FROM conversations WHERE proposal_id = %s ORDER BY turn ASC",
            (proposal_id,),
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

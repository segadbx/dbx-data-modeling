"""
Unity Catalog introspection helpers.

Exposed as agent tools:
  * `list_silver_tables` — names of all tables in the silver schema
  * `describe_table` — schema + comments + sample rows + column profile

The agent uses a Databricks SQL warehouse (warehouse_id env var) via the SQL connector.
For local dev (databricks-connect) we fall back to a SparkSession.
"""
from __future__ import annotations

import contextlib
import contextvars
import json
import os
from dataclasses import asdict, dataclass
from functools import lru_cache
from typing import Any, Iterator

import mlflow

try:
    from databricks import sql as dbsql  # databricks-sql-connector
except Exception:  # pragma: no cover - import only fails locally without the pkg
    dbsql = None  # type: ignore


# OBO token for the current request. When set (by the FastAPI agent router via
# `with_obo_token`), `_connection()` uses it directly so UC reads run as the calling
# user — enforcing per-user grants on silver/gold. When unset (local dev, jobs),
# `_connection()` falls back to env-var or SDK-resolved credentials (App SP).
_OBO_TOKEN: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "catalog_introspect_obo_token", default=None
)


@contextlib.contextmanager
def with_obo_token(token: str | None) -> Iterator[None]:
    """Bind an OBO token for the duration of the block.

    Contextvar inheritance carries this into any asyncio tasks spawned inside, so
    LangGraph nodes (and the synchronous SQL calls inside them) pick it up
    without each node having to thread the token explicitly.
    """
    handle = _OBO_TOKEN.set(token)
    try:
        yield
    finally:
        _OBO_TOKEN.reset(handle)


def _require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"{name} is not set in the environment.")
    return v


# Env vars are resolved lazily inside the helpers (not at import) so the module
# can be imported by the FastAPI app at startup before app.yaml env is applied
# in a local devloop. GOLD_SCHEMA stays optional — when unset, the agent runs in
# greenfield mode (extension_analyzer treats the gold schema as empty).


@dataclass
class ColumnInfo:
    name: str
    type: str
    comment: str | None
    null_pct: float | None
    distinct_estimate: int | None


@dataclass
class TableDescription:
    full_name: str
    table_comment: str | None
    columns: list[ColumnInfo]
    sample_rows: list[dict[str, Any]]
    row_count: int

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=str)


# ----- Connection -----------------------------------------------------------

def _connection():
    """Return a databricks-sql-connector Connection. Requires WAREHOUSE_ID + host.

    Token sourcing, in order:
      1. OBO token from the `_OBO_TOKEN` contextvar (set by the FastAPI router) — UC
         reads run as the calling user, so grants are enforced.
      2. `DATABRICKS_TOKEN` / `DATABRICKS_OAUTH_TOKEN` env var — local dev path
         (`src/app/agent/local_dev.py`).
      3. SDK-resolved credentials — falls back to App-SP / workspace profile via
         `WorkspaceClient`.
    """
    if dbsql is None:
        raise RuntimeError("databricks-sql-connector not installed")
    warehouse_id = os.environ.get("DATABRICKS_WAREHOUSE_ID")
    if not warehouse_id:
        raise RuntimeError("DATABRICKS_WAREHOUSE_ID is not set in the environment.")

    obo = _OBO_TOKEN.get()
    host = os.environ.get("DATABRICKS_HOST", "")
    token: str | None = obo or os.environ.get("DATABRICKS_TOKEN") or os.environ.get("DATABRICKS_OAUTH_TOKEN")

    if not host or not token:
        from databricks.sdk import WorkspaceClient
        w = WorkspaceClient()
        host = host or (w.config.host or "")
        if not token:
            token = w.config.token
            if not token:
                bearer = w.config.authenticate().get("Authorization", "")
                token = bearer.removeprefix("Bearer ").strip() or None

    host = host.replace("https://", "").rstrip("/")
    if not host:
        raise RuntimeError("Could not resolve Databricks workspace host")
    if not token:
        raise RuntimeError("Could not obtain a bearer token for the SQL warehouse")

    return dbsql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        access_token=token,
    )


def _query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with _connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ----- Tools ----------------------------------------------------------------

@mlflow.trace
def list_silver_tables(catalog: str | None = None, schema: str | None = None) -> list[str]:
    catalog = catalog or _require_env("CATALOG_NAME")
    schema = schema or _require_env("SILVER_SCHEMA")
    rows = _query(
        f"SELECT table_name FROM {catalog}.information_schema.tables "
        f"WHERE table_schema = '{schema}' ORDER BY table_name"
    )
    return [r["table_name"] for r in rows]


@mlflow.trace
def describe_table(
    table_name: str,
    catalog: str | None = None,
    schema: str | None = None,
    sample_rows: int = 10,
) -> TableDescription:
    catalog = catalog or _require_env("CATALOG_NAME")
    schema = schema or _require_env("SILVER_SCHEMA")
    fqn = f"{catalog}.{schema}.{table_name}"

    # Table comment
    tbl_meta = _query(
        f"SELECT comment FROM {catalog}.information_schema.tables "
        f"WHERE table_schema = '{schema}' AND table_name = '{table_name}'"
    )
    table_comment = tbl_meta[0]["comment"] if tbl_meta else None

    # Column meta
    col_rows = _query(
        f"SELECT column_name, full_data_type, comment "
        f"FROM {catalog}.information_schema.columns "
        f"WHERE table_schema = '{schema}' AND table_name = '{table_name}' "
        f"ORDER BY ordinal_position"
    )

    # Sample
    sample = _query(f"SELECT * FROM {fqn} LIMIT {int(sample_rows)}")

    # Row count + per-column null pct + distinct estimate
    count_rows = _query(f"SELECT COUNT(*) AS c FROM {fqn}")
    row_count = int(count_rows[0]["c"]) if count_rows else 0

    columns: list[ColumnInfo] = []
    if row_count > 0 and col_rows:
        agg_parts: list[str] = []
        for r in col_rows:
            cn = r["column_name"]
            agg_parts.append(
                f"SUM(CASE WHEN {cn} IS NULL THEN 1 ELSE 0 END) AS null_{cn}"
            )
            agg_parts.append(f"approx_count_distinct({cn}) AS dist_{cn}")
        profile = _query(f"SELECT {', '.join(agg_parts)} FROM {fqn}")[0]
        for r in col_rows:
            cn = r["column_name"]
            nulls = profile.get(f"null_{cn}") or 0
            dist = profile.get(f"dist_{cn}") or 0
            columns.append(
                ColumnInfo(
                    name=cn,
                    type=r["full_data_type"],
                    comment=r.get("comment"),
                    null_pct=(nulls / row_count) if row_count else None,
                    distinct_estimate=int(dist),
                )
            )
    else:
        for r in col_rows:
            columns.append(
                ColumnInfo(
                    name=r["column_name"],
                    type=r["full_data_type"],
                    comment=r.get("comment"),
                    null_pct=None,
                    distinct_estimate=None,
                )
            )

    return TableDescription(
        full_name=fqn,
        table_comment=table_comment,
        columns=columns,
        sample_rows=sample,
        row_count=row_count,
    )


@lru_cache(maxsize=1)
def silver_overview() -> dict[str, TableDescription]:
    """Cached per-process overview of all silver tables — convenient for the analyzer."""
    return {t: describe_table(t) for t in list_silver_tables()}


# ----- Gold-schema introspection (for extension mode) -------------------------

@mlflow.trace
def list_gold_tables(catalog: str | None = None, schema: str | None = None) -> list[str]:
    """Return names of all tables in the gold schema.

    Returns [] when GOLD_SCHEMA is unset (greenfield-mode signal) or when the schema is
    present but empty. The agent's extension_analyzer treats either case as "no existing
    gold model" and falls back to the original greenfield design flow.
    """
    catalog = catalog or _require_env("CATALOG_NAME")
    schema = schema if schema is not None else os.environ.get("GOLD_SCHEMA")
    if not schema:
        return []
    rows = _query(
        f"SELECT table_name FROM {catalog}.information_schema.tables "
        f"WHERE table_schema = '{schema}' ORDER BY table_name"
    )
    return [r["table_name"] for r in rows]


@mlflow.trace
def describe_gold_table(
    table_name: str,
    catalog: str | None = None,
    schema: str | None = None,
) -> TableDescription:
    """Lightweight describe for a deployed gold table.

    Compared to `describe_table`, this skips sample rows and per-column null/distinct
    profiling — the extension designer only needs the schema + comments to recognize
    what's already deployed and where existing dims can be reused.
    """
    catalog = catalog or _require_env("CATALOG_NAME")
    schema = schema if schema is not None else os.environ.get("GOLD_SCHEMA")
    if not schema:
        raise RuntimeError("GOLD_SCHEMA env var is not set; cannot describe gold tables.")
    fqn = f"{catalog}.{schema}.{table_name}"

    tbl_meta = _query(
        f"SELECT comment FROM {catalog}.information_schema.tables "
        f"WHERE table_schema = '{schema}' AND table_name = '{table_name}'"
    )
    table_comment = tbl_meta[0]["comment"] if tbl_meta else None

    col_rows = _query(
        f"SELECT column_name, full_data_type, comment "
        f"FROM {catalog}.information_schema.columns "
        f"WHERE table_schema = '{schema}' AND table_name = '{table_name}' "
        f"ORDER BY ordinal_position"
    )

    count_rows = _query(f"SELECT COUNT(*) AS c FROM {fqn}")
    row_count = int(count_rows[0]["c"]) if count_rows else 0

    columns = [
        ColumnInfo(
            name=r["column_name"],
            type=r["full_data_type"],
            comment=r.get("comment"),
            null_pct=None,
            distinct_estimate=None,
        )
        for r in col_rows
    ]

    return TableDescription(
        full_name=fqn,
        table_comment=table_comment,
        columns=columns,
        sample_rows=[],
        row_count=row_count,
    )

"""
apply_ddl job task.

Reads the approved proposal's DDL text from Lakebase and executes it against the SQL
warehouse, then writes the run status back to the `approvals` row.
"""
from __future__ import annotations

import os as _os
import sys as _sys
try:
    _here = _os.path.dirname(_os.path.abspath(__file__))
except NameError:
    _here = _os.path.dirname(_os.path.abspath(_sys.argv[0]))
_root = _os.path.abspath(_os.path.join(_here, "..", ".."))
if _root not in _sys.path:
    _sys.path.insert(0, _root)

import argparse
import logging
import os
import sys
import uuid

from databricks import sql as dbsql
from databricks.sdk import WorkspaceClient

from src.app.agent.tools import proposal_store


log = logging.getLogger(__name__)


def _run_id() -> int:
    """The Databricks Jobs runtime injects this for parent_run_id."""
    rid = os.environ.get("DATABRICKS_JOB_RUN_ID", "0")
    try:
        return int(rid)
    except ValueError:
        return 0


def _connect(warehouse_id: str):
    w = WorkspaceClient()
    host = (w.config.host or os.environ.get("DATABRICKS_HOST") or "").replace("https://", "").rstrip("/")
    if not host:
        raise RuntimeError(
            "Could not resolve Databricks host: SDK config has none and DATABRICKS_HOST is unset."
        )
    token = w.config.token or os.environ.get("DATABRICKS_TOKEN")
    if not token:
        token = w.config.authenticate().get("Authorization", "").replace("Bearer ", "")
    return dbsql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        access_token=token,
    )


def _split_statements(sql_text: str) -> list[str]:
    """Naïve splitter — fine because the renderer emits clean `;`-separated DDL."""
    return [s.strip() for s in sql_text.split(";") if s.strip()]


def run(proposal_id: str, warehouse_id: str, lakebase_instance: str, lakebase_database: str) -> int:
    proposal_store.refresh_creds(lakebase_instance, database_name=lakebase_database)
    proposal = proposal_store.get_proposal(uuid.UUID(proposal_id))
    if not proposal or not proposal.ddl_text:
        log.error("No DDL found for proposal %s", proposal_id)
        return 2
    if proposal.status != "approved":
        log.error("Proposal %s is not approved (status=%s)", proposal_id, proposal.status)
        return 3

    log.info("Applying %d statement(s) for proposal %s", len(_split_statements(proposal.ddl_text)), proposal_id)
    rid = _run_id()
    status = "running"
    try:
        with _connect(warehouse_id) as conn, conn.cursor() as cur:
            for stmt in _split_statements(proposal.ddl_text):
                cur.execute(stmt)
        status = "success"
    except Exception as e:  # noqa: BLE001
        log.exception("Apply failed: %s", e)
        status = f"failed: {e.__class__.__name__}"
    finally:
        proposal_store.record_apply_result(uuid.UUID(proposal_id), rid, status)

    return 0 if status == "success" else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--proposal-id", required=True)
    ap.add_argument("--warehouse-id", required=True)
    ap.add_argument("--lakebase-instance", required=True)
    ap.add_argument("--lakebase-database", required=True)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return run(args.proposal_id, args.warehouse_id, args.lakebase_instance, args.lakebase_database)


if __name__ == "__main__":
    sys.exit(main())

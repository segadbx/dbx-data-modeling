"""
Run Alembic migrations against the Lakebase instance, then grant the App SP table-level
access on the migrated tables.

Job task entrypoint. Fetches a short-lived OAuth token from the Databricks SDK and exposes
it to Alembic via env vars consumed by `migrations/env.py`.

Why grants live here: `CAN_CONNECT_AND_CREATE` on the Lakebase resource gives the App SP
login + CREATE-schema rights but no privileges on tables owned by the deployer (who runs
this job). Without these post-migration GRANTs the app fails on its first INSERT into
`proposals`.
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
import subprocess
import sys

import psycopg
from psycopg import sql

from databricks.sdk import WorkspaceClient


log = logging.getLogger(__name__)

# Tables that the App SP reads/writes. Keep in sync with migrations/.
_APP_TABLES = ("proposals", "conversations", "approvals", "chat_sessions")


def _lakebase_creds(instance_name: str) -> tuple[str, str, str]:
    """Return (host, username, oauth_token) for the named Lakebase instance."""
    w = WorkspaceClient()
    inst = w.database.get_database_instance(name=instance_name)
    cred = w.database.generate_database_credential(
        instance_names=[instance_name],
        request_id="seed-lakebase",
    )
    # The current_user.me().user_name is also a valid DB username for OBO scenarios;
    # for the seed job we use the service principal identity.
    me = w.current_user.me()
    username = me.user_name
    return inst.read_write_dns, username, cred.token


def _resolve_app_sp_pg_role(app_name: str) -> str:
    """Return the Postgres role name the named Databricks App connects as.

    Lakebase uses the SP's `application_id` (UUID) as the PG role name — *not* the
    display name. The SDK's App object exposes this as `service_principal_client_id`;
    we fall back to looking up the SP by id if that attribute is missing on older SDK
    builds.
    """
    w = WorkspaceClient()
    app = w.apps.get(name=app_name)
    role = getattr(app, "service_principal_client_id", None)
    if role:
        return role
    sp_id = getattr(app, "service_principal_id", None)
    if not sp_id:
        raise RuntimeError(
            f"Could not resolve App SP for app={app_name!r}: neither "
            f"service_principal_client_id nor service_principal_id present."
        )
    sp = w.service_principals.get(id=str(sp_id))
    if not sp.application_id:
        raise RuntimeError(f"Service principal {sp_id} has no application_id")
    return sp.application_id


def _grant_app_sp(
    host: str, database: str, deployer: str, token: str, sp_role: str
) -> None:
    """Grant the App SP the privileges needed to read/write the app's tables.

    Connects as the deployer (the table owner) and issues GRANTs in a single
    transaction. Idempotent — safe to re-run after future migrations. The
    ALTER DEFAULT PRIVILEGES line ensures tables created by *future* alembic
    revisions are also covered, without re-running this job.
    """
    dsn = (
        f"host={host} port=5432 dbname={database} user={deployer} "
        f"password={token} sslmode=require application_name=seed_lakebase"
    )
    role = sql.Identifier(sp_role)
    tables = sql.SQL(", ").join(sql.Identifier(t) for t in _APP_TABLES)
    log.info("Granting Postgres privileges to App SP role=%s on %s", sp_role, _APP_TABLES)
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {role}").format(role=role))
            cur.execute(
                sql.SQL(
                    "GRANT SELECT, INSERT, UPDATE, DELETE ON {tables} TO {role}"
                ).format(tables=tables, role=role)
            )
            cur.execute(
                sql.SQL(
                    "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                    "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role}"
                ).format(role=role)
            )
        conn.commit()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--instance", required=True)
    ap.add_argument("--database", required=True, help="Logical Lakebase database name")
    ap.add_argument("--app-name", required=True, help="Databricks App name (for SP lookup)")
    ap.add_argument("--migrations-dir", default="migrations")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    host, user, token = _lakebase_creds(args.instance)

    env = os.environ.copy()
    env["LAKEBASE_HOST"] = host
    env["LAKEBASE_USER"] = user
    env["LAKEBASE_PASSWORD"] = token
    env["LAKEBASE_DB"] = args.database

    log.info("Running alembic upgrade head against %s db=%s", host, args.database)
    cp = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
        env=env,
        cwd=args.migrations_dir,
        check=False,
    )
    if cp.returncode:
        return cp.returncode

    sp_role = _resolve_app_sp_pg_role(args.app_name)
    _grant_app_sp(host=host, database=args.database, deployer=user, token=token, sp_role=sp_role)
    return 0


if __name__ == "__main__":
    rc = main()
    if rc:
        sys.exit(rc)

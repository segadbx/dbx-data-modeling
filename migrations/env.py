"""
Alembic environment.

Runs as a Databricks Job task. The DB URL is built at runtime from the Lakebase OAuth
token + instance host (env vars), not from alembic.ini.
"""
from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _build_url() -> str:
    required = ("LAKEBASE_HOST", "LAKEBASE_USER", "LAKEBASE_PASSWORD", "LAKEBASE_DB")
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise RuntimeError(f"Missing Lakebase env vars for Alembic: {missing}")
    host = os.environ["LAKEBASE_HOST"]
    db = os.environ["LAKEBASE_DB"]
    user = os.environ["LAKEBASE_USER"]
    pwd = os.environ["LAKEBASE_PASSWORD"]  # short-lived OAuth token
    return f"postgresql+psycopg://{user}:{pwd}@{host}:5432/{db}?sslmode=require"


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section) or {}
    cfg["sqlalchemy.url"] = _build_url()
    connectable = engine_from_config(cfg, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError("Offline migrations not supported for this POC")

run_migrations_online()

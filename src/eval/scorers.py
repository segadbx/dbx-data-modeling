"""
Scorers for the modeler agent.

Three scorers per the plan:

  reuse_recall      — deterministic; share of expected_reuse dims that the proposal
                      references (either as reused_from_seed dims or as join targets).
  schema_validity   — deterministic; runs the generated DDL on a scratch UC schema and
                      passes if no SQL errors occur. Drops the schema after.
  no_duplicate      — LLM judge (Guidelines); does the schema avoid creating new dims
                      that semantically duplicate seed dims?

Each scorer reads the agent's custom_outputs (proposal + ddl) from the response.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

import mlflow
from mlflow.genai.scorers import scorer
from mlflow.metrics.genai import make_genai_metric

from src.app.agent.tools import reuse_scanner


# ----- reuse_recall ---------------------------------------------------------

@scorer
def reuse_recall(outputs: dict[str, Any], expectations: dict[str, Any]) -> float:
    expected = set(expectations.get("expected_reuse") or [])
    if not expected:
        return 1.0  # vacuously passes
    proposal = (outputs or {}).get("custom_outputs", {}).get("proposal", {})
    referenced: set[str] = set()
    for d in proposal.get("dims", []):
        if d.get("reused_from_seed"):
            referenced.add(d["name"])
    for f in proposal.get("facts", []):
        for j in f.get("joins", []):
            referenced.add(j.get("dim", ""))
    hits = expected & referenced
    return len(hits) / len(expected)


# ----- schema_validity ------------------------------------------------------

def _scratch_run_sql(
    ddl: str,
    warehouse_id: str,
    catalog: str,
    agent_state_schema: str,
    gold_schema: str,
) -> tuple[bool, str]:
    from databricks import sql as dbsql
    from databricks.sdk import WorkspaceClient

    w = WorkspaceClient()
    host = os.environ["DATABRICKS_HOST"].replace("https://", "").rstrip("/")
    token = w.config.token or os.environ.get("DATABRICKS_TOKEN", "")
    scratch = f"eval_{uuid.uuid4().hex[:10]}"
    fq_schema = f"{catalog}.{agent_state_schema}.{scratch}"

    # Rewrite the DDL to use the scratch schema instead of the real gold schema.
    rewritten = re.sub(
        r"\b" + re.escape(catalog) + r"\." + re.escape(gold_schema) + r"\.",
        f"{fq_schema}.",
        ddl,
    )
    rewritten = rewritten.replace(
        f"USE SCHEMA {gold_schema}", f"USE SCHEMA {agent_state_schema}.{scratch}"
    )

    err = ""
    with dbsql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        access_token=token,
    ) as conn, conn.cursor() as cur:
        try:
            cur.execute(f"CREATE SCHEMA IF NOT EXISTS {fq_schema}")
            for stmt in [s.strip() for s in rewritten.split(";") if s.strip()]:
                cur.execute(stmt)
        except Exception as e:  # noqa: BLE001
            err = f"{e.__class__.__name__}: {e}"
        finally:
            try:
                cur.execute(f"DROP SCHEMA IF EXISTS {fq_schema} CASCADE")
            except Exception:
                pass
    return (err == "", err)


@scorer
def schema_validity(outputs: dict[str, Any]) -> dict[str, Any]:
    ddl = (outputs or {}).get("custom_outputs", {}).get("ddl", "")
    if not ddl:
        return {"value": 0.0, "rationale": "no DDL produced"}
    warehouse_id = os.environ.get("DATABRICKS_WAREHOUSE_ID")
    catalog = os.environ.get("CATALOG_NAME")
    agent_state_schema = os.environ.get("AGENT_STATE_SCHEMA")
    gold_schema = os.environ.get("GOLD_SCHEMA")
    if not warehouse_id:
        return {"value": 0.5, "rationale": "DATABRICKS_WAREHOUSE_ID not set; skipped"}
    if not (catalog and agent_state_schema and gold_schema):
        return {"value": 0.5, "rationale": "CATALOG_NAME/AGENT_STATE_SCHEMA/GOLD_SCHEMA not set; skipped"}
    ok, err = _scratch_run_sql(
        ddl, warehouse_id=warehouse_id, catalog=catalog,
        agent_state_schema=agent_state_schema, gold_schema=gold_schema,
    )
    return {"value": 1.0 if ok else 0.0, "rationale": err or "ok"}


# ----- no_duplicate (LLM judge) --------------------------------------------

_NO_DUPLICATE_PROMPT = (
    "You are a data architect. Below is a list of EXISTING reference dimensions and a PROPOSED "
    "dimensional model. Return PASS if the proposal avoids creating a NEW dimension that "
    "semantically duplicates any existing one (e.g., a 'dim_labor' when 'dim_employee' is "
    "available). Otherwise return FAIL. Reply on the first line with PASS or FAIL only."
)


@scorer
def no_duplicate(outputs: dict[str, Any]) -> dict[str, Any]:
    """Cheap LLM judge using the configured LLM endpoint."""
    proposal = (outputs or {}).get("custom_outputs", {}).get("proposal", {})
    seed = reuse_scanner.list_all_seed_dims()
    seed_names = [d["name"] for d in seed]
    new_dims = [d.get("name") for d in proposal.get("dims", []) if not d.get("reused_from_seed")]

    if not new_dims:
        return {"value": 1.0, "rationale": "no new dims proposed"}

    from databricks_langchain import ChatDatabricks
    from langchain_core.messages import HumanMessage

    body = (
        f"Existing dims: {seed_names}\n"
        f"Newly proposed dims: {new_dims}\n"
        f"Reasoning detail: a new dim duplicates an existing one if it captures the same business entity "
        f"(employee/person, location/place, asset/equipment, vendor/supplier, date/calendar)."
    )
    endpoint = os.environ.get("LLM_ENDPOINT_NAME")
    if not endpoint:
        return {"value": 0.5, "rationale": "LLM_ENDPOINT_NAME not set; judge skipped"}
    llm = ChatDatabricks(endpoint=endpoint, temperature=0)
    resp = llm.invoke([
        HumanMessage(content=f"{_NO_DUPLICATE_PROMPT}\n\n{body}"),
    ])
    first_line = (resp.content or "").splitlines()[0].strip().upper()
    return {"value": 1.0 if first_line.startswith("PASS") else 0.0, "rationale": resp.content[:400]}

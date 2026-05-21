"""
LangGraph data-modeling agent.

Graph
-----
START → analyzer → extension_analyzer → reuse_scanner → designer → ddl_generator → END

`extension_analyzer` runs after the silver analyzer. It introspects the *deployed* gold
schema; when gold tables exist, it flips the graph into "extension mode" — restricting the
candidate set to silver tables not yet represented in gold, and seeding the designer
prompt with the existing model so the LLM proposes additive extensions (new facts and/or
new conformed dimensions reusing existing dims for FK joins). When gold is empty, the
node is a pass-through and the original greenfield design flow runs unchanged.

The graph is rebuilt on each ChatAgent invocation; the *checkpointer* is the only piece
of long-lived state, and it lives in Lakebase (Postgres). This means multi-turn refinement
works across Model Serving container restarts.

Inputs
------
The graph expects an initial state with:
  * messages: list of LangChain BaseMessages (the user thread)
  * proposal_id: optional uuid string — if present, the graph LOADS the existing proposal
    from Lakebase as starting context (refinement turn). If absent, it generates a new one.

Output
------
The final state has:
  * proposal: dict matching prompts/system.md output contract
  * ddl: rendered SQL string
  * proposal_id: persisted uuid
  * extension_mode: bool — True iff an existing gold model was detected and incorporated
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Annotated, Any, TypedDict
from urllib.parse import quote

import mlflow
from databricks_langchain import ChatDatabricks
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from agent.json_extract import parse_proposal
from agent.tools import catalog_introspect, ddl_renderer, proposal_store, reuse_scanner


log = logging.getLogger(__name__)


# ----- State ----------------------------------------------------------------

class AgentState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    silver_overview: dict[str, Any]       # populated by analyzer
    candidate_dims: list[dict[str, Any]]  # populated by analyzer (filtered in extension mode)
    candidate_facts: list[dict[str, Any]] # populated by analyzer (filtered in extension mode)
    reuse_matches: dict[str, list[dict[str, Any]]]  # dim_name -> matches
    proposal: dict[str, Any]              # populated by designer
    ddl: str                              # populated by ddl_generator
    proposal_id: str | None
    # Extension-mode fields (populated by extension_analyzer when gold schema is non-empty)
    extension_mode: bool
    existing_gold_model: dict[str, Any]   # {gold_table_name: TableDescription JSON}
    new_silver_tables: list[str]          # silver tables not yet represented in gold


# ----- LLM ------------------------------------------------------------------

def _llm():
    endpoint = os.environ.get("LLM_ENDPOINT_NAME")
    if not endpoint:
        raise RuntimeError(
            "LLM_ENDPOINT_NAME is not set. Configure it via DAB var.llm_endpoint."
        )
    return ChatDatabricks(endpoint=endpoint, temperature=0.0, max_tokens=8000)


_SYSTEM = (Path(__file__).parent / "prompts" / "system.md").read_text()
_FEW_SHOT = (Path(__file__).parent / "prompts" / "few_shot.md").read_text()


# ----- Nodes ----------------------------------------------------------------

@mlflow.trace
async def analyzer(state: AgentState) -> dict[str, Any]:
    """Inspect silver schemas; classify each table as fact_candidate or dim_candidate."""
    tables = catalog_introspect.list_silver_tables()
    overview = {t: catalog_introspect.describe_table(t).to_json() for t in tables}

    # Simple heuristic classification — LLM is asked to confirm/refine in designer.
    candidate_dims: list[dict[str, Any]] = []
    candidate_facts: list[dict[str, Any]] = []
    for name in tables:
        desc_json = overview[name]
        desc = json.loads(desc_json)
        # Heuristic: presence of timestamp + many rows relative to candidate FKs => fact
        col_types = {c["name"]: c["type"] for c in desc["columns"]}
        has_ts = any("timestamp" in (t or "").lower() or "date" in (t or "").lower()
                     for t in col_types.values())
        row_count = desc.get("row_count", 0)
        if has_ts and row_count > 5_000:
            candidate_facts.append({"name": name, "row_count": row_count})
        else:
            candidate_dims.append({"name": name, "row_count": row_count})

    return {
        "silver_overview": overview,
        "candidate_dims": candidate_dims,
        "candidate_facts": candidate_facts,
    }


@mlflow.trace
async def extension_analyzer(state: AgentState) -> dict[str, Any]:
    """Detect whether an existing gold model is deployed and, if so, flip extension mode.

    In extension mode:
      * `existing_gold_model` is populated with deployed table descriptions so the
        designer LLM can reuse deployed dims for FK joins and avoid redefining them.
      * `new_silver_tables` lists silver tables that look "uncovered" by the existing
        gold model (name-based heuristic). `candidate_dims` / `candidate_facts` are
        narrowed to this set so the designer prompt stays focused.

    If the gold schema is empty (or `GOLD_SCHEMA` env var is unset), this node is a
    pass-through and the original greenfield analysis carries through.
    """
    gold_tables = catalog_introspect.list_gold_tables()
    if not gold_tables:
        return {"extension_mode": False}

    existing: dict[str, Any] = {}
    for t in gold_tables:
        existing[t] = catalog_introspect.describe_gold_table(t).to_json()

    silver_tables = list(state.get("silver_overview", {}).keys())

    def _is_covered(silver_name: str) -> bool:
        s = silver_name.lower()
        for g in gold_tables:
            gl = g.lower()
            if s in gl:
                return True
        return False

    new_silver = [s for s in silver_tables if not _is_covered(s)]

    candidate_dims = [c for c in state.get("candidate_dims", []) if c["name"] in new_silver]
    candidate_facts = [c for c in state.get("candidate_facts", []) if c["name"] in new_silver]

    return {
        "extension_mode": True,
        "existing_gold_model": existing,
        "new_silver_tables": new_silver,
        "candidate_dims": candidate_dims,
        "candidate_facts": candidate_facts,
    }


@mlflow.trace
async def reuse_scan(state: AgentState) -> dict[str, Any]:
    """For each candidate dim, find similar seed dims."""
    matches: dict[str, list[dict[str, Any]]] = {}
    for cd in state.get("candidate_dims", []):
        name = cd["name"]
        desc = json.loads(state["silver_overview"][name])
        proposed_cols = [{"name": c["name"], "comment": c.get("comment", "")} for c in desc["columns"]]
        # Heuristic dim_<name> as the proposed name
        m = reuse_scanner.find_similar_seed_dims(
            proposed_name=f"dim_{name}",
            proposed_columns=proposed_cols,
            top_k=2,
        )
        matches[name] = [
            {"name": x.name, "score": x.score, "scd": x.scd, "use_when": x.use_when}
            for x in m
        ]
    return {"reuse_matches": matches}


@mlflow.trace
async def designer(state: AgentState) -> dict[str, Any]:
    """LLM produces the proposal JSON.

    In extension mode the prompt is shaped to focus the LLM on the new silver tables and
    surface the deployed gold model (so reused dims are referenced, not redefined). In
    greenfield mode the original full-silver prompt is used.
    """
    seed = reuse_scanner.list_all_seed_dims()

    ext_mode = bool(state.get("extension_mode"))
    if ext_mode:
        new_tables = state.get("new_silver_tables", [])
        # Restrict the silver overview to only the new tables — keeps the prompt focused.
        silver_focus = {k: v for k, v in state.get("silver_overview", {}).items() if k in new_tables}
        extension_blocks = (
            f"## Existing deployed gold model\n"
            f"You are EXTENDING this model. Reuse these dims via FK joins; do NOT redefine them.\n"
            f"```json\n{json.dumps(state.get('existing_gold_model', {}), indent=2)}\n```\n\n"
            f"## New silver tables to incorporate\n"
            f"Model ONLY these silver tables. Silver tables already covered by the existing gold "
            f"model above are out of scope for this proposal.\n"
            f"```json\n{json.dumps(new_tables, indent=2)}\n```\n\n"
        )
    else:
        silver_focus = state.get("silver_overview", {})
        extension_blocks = ""

    prompt = (
        f"{_SYSTEM}\n\n## Reference examples\n{_FEW_SHOT}\n\n"
        f"## Available seed dimensions (reuse these when applicable)\n"
        f"```json\n{json.dumps(seed, indent=2)}\n```\n\n"
        f"{extension_blocks}"
        f"## Silver overview (table descriptions in scope for this proposal)\n"
        f"```json\n{json.dumps(silver_focus, indent=2)}\n```\n\n"
        f"## Heuristic classification\n"
        f"- candidate_facts: {state.get('candidate_facts', [])}\n"
        f"- candidate_dims: {state.get('candidate_dims', [])}\n\n"
        f"## Reuse-scanner matches\n"
        f"```json\n{json.dumps(state.get('reuse_matches', {}), indent=2)}\n```\n\n"
        f"Produce the proposal JSON now. Reply with ONLY the JSON object — no prose, no fences. "
        f"The very first character of your response must be `{{` and the last must be `}}`."
    )

    # The user's conversation messages are appended so refinement turns are honored.
    messages: list[BaseMessage] = [SystemMessage(content=prompt)] + state.get("messages", [])

    # The Databricks Claude endpoint does not support `response_format={"type":"json_object"}`,
    # so we cannot enforce JSON via the OpenAI-style structured-output flag. We instead lean on
    # a tight prompt instruction plus the multi-strategy `parse_proposal` extractor and a single
    # retry below to recover from any prose drift or fenced output.
    llm = _llm()
    resp: AIMessage = await llm.ainvoke(messages)
    raw = (resp.content or "").strip() if isinstance(resp.content, str) else str(resp.content)
    last_resp: AIMessage = resp

    proposal, parse_err = parse_proposal(raw)
    if proposal is None:
        # Single retry: feed the bad output back with the parse error so the model can self-correct.
        log.warning("Designer returned unparseable JSON (%s); retrying once.", parse_err)
        retry_messages: list[BaseMessage] = messages + [
            AIMessage(content=raw),
            HumanMessage(content=(
                f"Your previous response could not be parsed as JSON. Parse error: {parse_err}. "
                "Reply with ONLY a valid JSON object matching the proposal contract — "
                "no prose, no fences, no commentary."
            )),
        ]
        retry_resp: AIMessage = await llm.ainvoke(retry_messages)
        retry_raw = (retry_resp.content or "").strip() if isinstance(retry_resp.content, str) else str(retry_resp.content)
        last_resp = retry_resp
        proposal, parse_err = parse_proposal(retry_raw)
        if proposal is None:
            log.error("Designer raw output failed parse after retry: %s", retry_raw)
            proposal = {
                "error": "invalid_json",
                "raw": retry_raw[:2000],
                "parse_error": parse_err,
            }

    # Stamp the target catalog/schema from env vars. The LLM may have proposed values, but
    # they are authoritative only as a hint — actual deployment targets come from config.
    if "error" not in proposal:
        catalog = os.environ.get("CATALOG_NAME")
        gold_schema = os.environ.get("GOLD_SCHEMA")
        silver_schema = os.environ.get("SILVER_SCHEMA")
        if not catalog or not gold_schema or not silver_schema:
            raise RuntimeError(
                "CATALOG_NAME, GOLD_SCHEMA, and SILVER_SCHEMA env vars must be set for "
                "the designer to stamp the proposal's deployment target."
            )
        proposal["catalog"] = catalog
        proposal["schema"] = gold_schema
        proposal["silver_schema"] = silver_schema

    return {
        "proposal": proposal,
        "messages": [last_resp],
    }


@mlflow.trace
async def ddl_generator(state: AgentState) -> dict[str, Any]:
    proposal = state.get("proposal", {})
    if proposal.get("error"):
        return {"ddl": "-- designer failed; no DDL emitted"}
    ddl = ddl_renderer.render(proposal)
    return {"ddl": ddl}


# ----- Graph builder --------------------------------------------------------

def build_graph(checkpointer=None):
    g = StateGraph(AgentState)
    g.add_node("analyzer", analyzer)
    g.add_node("extension_analyzer", extension_analyzer)
    g.add_node("reuse_scan", reuse_scan)
    g.add_node("designer", designer)
    g.add_node("ddl_generator", ddl_generator)
    g.add_edge(START, "analyzer")
    g.add_edge("analyzer", "extension_analyzer")
    g.add_edge("extension_analyzer", "reuse_scan")
    g.add_edge("reuse_scan", "designer")
    g.add_edge("designer", "ddl_generator")
    g.add_edge("ddl_generator", END)
    return g.compile(checkpointer=checkpointer)


def checkpointer_dsn() -> str:
    """Build a Postgres URI for AsyncPostgresSaver.

    AsyncPostgresSaver.from_conn_string returns an async context manager — the caller
    must `async with` it, so the saver's connection lifetime is bound to the call scope.
    See `src/app/backend/routers/agent.py` (`chat` / `chat_stream`) for canonical usage.

    Reads connection metadata from Apps-injected PG* env vars and mints + caches the
    OAuth password via `agent.tools.proposal_store.ensure_lakebase_password`.
    """
    p = proposal_store.lakebase_connection_params()
    pwd = proposal_store.ensure_lakebase_password()
    # URL-encode the userinfo — Lakebase usernames can be an email (contains `@`) and
    # OAuth tokens can contain reserved chars, both of which would corrupt the URI's
    # authority section (the `@` would be read as the host delimiter).
    user_q = quote(p.user, safe="")
    pwd_q = quote(pwd, safe="")
    uri = (
        f"postgresql://{user_q}:{pwd_q}@{p.host}:{p.port}/{p.database}?sslmode=require"
    )
    if p.app_name:
        uri += f"&application_name={p.app_name}"
    # Redirect the saver's unqualified DDL (CREATE TABLE checkpoints, etc.) to a
    # schema the App SP owns — public is owned by the deploy user.
    uri += f"&options=-c%20search_path%3D{proposal_store.CHECKPOINT_SCHEMA}"
    return uri

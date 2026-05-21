"""
Agent router — invokes the LangGraph data-modeling agent in-process.

The Model Serving endpoint that previously hosted this agent has been retired;
this router takes its place. Lakebase remains the LangGraph checkpoint store and
proposal store. UC reads inside the graph run as the calling user via the OBO
token threaded through `catalog_introspect.with_obo_token`.

Response shape is preserved from the prior Model Serving proxy so the React
frontend keeps working unchanged.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from pydantic import BaseModel

import mlflow

from agent import graph as graph_module
from agent.tools import catalog_introspect, proposal_store
from backend import proposal_store as backend_store
from backend.auth import CurrentUser, current_user


log = logging.getLogger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    proposal_id: str | None = None
    session_id: str | None = None


# ----- Helpers --------------------------------------------------------------

def _thread_id(session_id: str) -> str:
    return f"session:{session_id}"


def _ensure_session(session_id: str | None, user_name: str, messages: list[ChatMessage]) -> tuple[uuid.UUID, bool]:
    """Resolve or create a chat_sessions row. Returns (id, created_now).

    If `session_id` is provided, it's reused as-is (caller already created it via
    POST /api/chat/sessions). Otherwise we mint a new session and seed the title
    from the first user message so the sidebar has something to show.
    """
    if session_id:
        return uuid.UUID(session_id), False
    title = None
    for m in messages:
        if m.role == "user" and m.content.strip():
            title = m.content.strip()[:60]
            break
    s = backend_store.create_session(created_by=user_name, title=title)
    return s.id, True


def _summarize(proposal: dict[str, Any]) -> str:
    if not proposal or proposal.get("error"):
        return "I couldn't produce a clean proposal — please rephrase or share more context."
    dims = proposal.get("dims", [])
    facts = proposal.get("facts", [])
    reused = [d["name"] for d in dims if d.get("reused_from_seed")]
    new_dims = [d["name"] for d in dims if not d.get("reused_from_seed")]
    lines = [
        f"Proposed star schema in `{proposal.get('catalog', '?')}.{proposal.get('schema', 'gold')}`:",
        f"- {len(facts)} fact table(s): " + ", ".join(f["name"] for f in facts),
        f"- {len(new_dims)} new dim(s): " + (", ".join(new_dims) or "none"),
        f"- {len(reused)} reused dim(s): " + (", ".join(reused) or "none"),
        "",
        "Review the **Model Canvas** for details and approve when ready.",
    ]
    return "\n".join(lines)


def _to_lc_messages(messages: list[ChatMessage]):
    return [HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content)
            for m in messages]


def _persist(proposal: dict[str, Any], ddl: str, proposal_id: str | None, user_name: str) -> str | None:
    """Persist proposal + DDL to Lakebase. Returns the saved proposal id, or None on failure."""
    try:
        if proposal_id:
            proposal_store.update_proposal_model(uuid.UUID(proposal_id), proposal)
            proposal_store.set_ddl(uuid.UUID(proposal_id), ddl)
            return proposal_id
        p = proposal_store.create_proposal(created_by=user_name, model=proposal)
        proposal_store.set_ddl(p.id, ddl)
        return str(p.id)
    except Exception as e:  # noqa: BLE001
        log.exception("Failed to persist proposal: %s", e)
        return None


# ----- Routes ---------------------------------------------------------------

@router.post("/chat")
async def chat(req: ChatRequest, user: CurrentUser = Depends(current_user)) -> dict[str, Any]:
    dsn = graph_module.checkpointer_dsn()
    session_uuid, _session_created = _ensure_session(req.session_id, user.user_name, req.messages)
    session_id_str = str(session_uuid)
    thread_id = _thread_id(session_id_str)
    cfg = {"configurable": {"thread_id": thread_id}}
    lc_messages = _to_lc_messages(req.messages)

    if req.messages:
        last = req.messages[-1]
        if last.role == "user" and last.content.strip():
            try:
                backend_store.append_conversation(session_uuid, "user", last.content)
            except Exception:  # noqa: BLE001
                log.exception("[chat] Failed to persist user turn for session=%s", session_uuid)
    
    # Gather detailed trace info for troubleshooting authorization issues
    trace_info = {
        "user_name": getattr(user, "user_name", None),
        "user_roles": getattr(user, "roles", None),
        "obo_token_present": bool(getattr(user, "obo_token", None)),
        "request_proposal_id": req.proposal_id,
        "thread_id": thread_id,
        "n_messages": len(req.messages),
        "message_sample": req.messages[0].content if req.messages else None,
        "requester_ip": getattr(user, "ip", None) if hasattr(user, "ip") else None,
    }
    log.info(
        "[chat] Begin chat | trace_info=%s",
        trace_info,
    )

    await proposal_store.ensure_checkpoint_schema()

    with catalog_introspect.with_obo_token(user.obo_token):
        async with AsyncPostgresSaver.from_conn_string(dsn) as cp:
            await cp.setup()
            log.info(
                "[chat] Opened AsyncPostgresSaver | user=%s | thread_id=%s | roles=%s | obo_token_present=%s",
                getattr(user, "user_name", None), thread_id, getattr(user, "roles", None), bool(getattr(user, "obo_token", None))
            )
            agent = graph_module.build_graph(checkpointer=cp)
            log.info(
                "[chat] Built modeling agent | user=%s | roles=%s | thread_id=%s",
                getattr(user, "user_name", None), getattr(user, "roles", None), thread_id
            )
            with mlflow.start_span(name="modeler_agent.invoke") as span:
                span.set_inputs({
                    "thread_id": thread_id,
                    "n_messages": len(req.messages),
                    "user": getattr(user, "user_name", None),
                    "roles": getattr(user, "roles", None),
                    "obo_token_present": bool(getattr(user, "obo_token", None)),
                })
                try:
                    final = await agent.ainvoke({"messages": lc_messages}, config=cfg)
                except Exception as exc:
                    # Trace and reraise
                    log.exception(
                        "[chat] Exception during agent.ainvoke | user=%s | roles=%s | obo_token_present=%s | exc=%s",
                        getattr(user, "user_name", None), getattr(user, "roles", None), bool(getattr(user, "obo_token", None)), exc
                    )
                    raise
                span.set_outputs({"has_proposal": bool(final.get("proposal"))})

    proposal = final.get("proposal", {}) or {}
    ddl = final.get("ddl", "") or ""
    saved_id = _persist(proposal, ddl, req.proposal_id, getattr(user, "user_name", None))

    if saved_id:
        try:
            backend_store.link_session_to_proposal(session_uuid, uuid.UUID(saved_id))
        except Exception:  # noqa: BLE001
            log.exception("[chat] Failed to link session %s -> proposal %s", session_uuid, saved_id)

    assistant_summary = _summarize(proposal)
    try:
        backend_store.append_conversation(
            session_uuid,
            "assistant",
            assistant_summary,
            proposal_id=uuid.UUID(saved_id) if saved_id else None,
        )
    except Exception:  # noqa: BLE001
        log.exception("[chat] Failed to persist assistant turn for session=%s", session_uuid)

    log.info(
        "[chat] Response ready | saved_id=%s | user=%s | thread_id=%s | proposal_keys=%s",
        saved_id, getattr(user, "user_name", None), thread_id, list(proposal.keys())
    )

    return {
        "messages": [{"role": "assistant", "content": assistant_summary}],
        "custom_outputs": {
            "proposal_id": saved_id,
            "proposal": proposal,
            "ddl": ddl,
            "session_id": session_id_str,
        },
    }


# Human-readable labels shown in the reasoning UI while each node is in-flight.
# Keys must match the node names passed to `g.add_node(...)` in agent/graph.py.
NODE_LABELS: dict[str, str] = {
    "analyzer": "Inspecting silver catalog…",
    "extension_analyzer": "Checking deployed gold model…",
    "reuse_scan": "Scanning seed dims for reuse…",
    "designer": "Drafting proposal…",
    "ddl_generator": "Rendering DDL…",
}


def _node_end_summary(name: str, output: dict[str, Any]) -> str:
    """One-line, user-facing summary of what a node produced."""
    if name == "analyzer":
        return (
            f"{len(output.get('candidate_facts', []))} fact candidate(s), "
            f"{len(output.get('candidate_dims', []))} dim candidate(s)"
        )
    if name == "extension_analyzer":
        if output.get("extension_mode"):
            return (
                f"Extension mode — {len(output.get('existing_gold_model', {}))} existing "
                f"gold table(s), {len(output.get('new_silver_tables', []))} new silver table(s)"
            )
        return "Greenfield (no existing gold tables)"
    if name == "reuse_scan":
        matches = output.get("reuse_matches", {})
        hit = sum(1 for v in matches.values() if v)
        return f"Reuse matches found for {hit}/{len(matches)} dim candidate(s)"
    if name == "designer":
        proposal = output.get("proposal", {}) or {}
        err = proposal.get("error")
        if err:
            raw = (proposal.get("raw") or "").strip()
            tail = f" — got: {raw[:200]!r}" if raw else ""
            return f"Designer error: {err}{tail}"
        return (
            f"Proposal: {len(proposal.get('dims', []))} dim(s), "
            f"{len(proposal.get('facts', []))} fact(s)"
        )
    if name == "ddl_generator":
        return f"DDL: {len(output.get('ddl', '') or '')} chars"
    return ""


def _sse(payload: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(payload)}\n\n".encode()


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, user: CurrentUser = Depends(current_user)):
    # SSE envelope is a tagged-union of events; see ReasoningEvent in
    # frontend/src/api/client.ts for the consumer side. Event types:
    #   node_start  {name, label}                    — graph node entered
    #   node_end    {name, summary}                  — graph node finished
    #   llm_token   {content}                        — designer LLM streaming token
    #   final       {messages, custom_outputs}       — terminal result, parity with /chat
    #   error       {message}                        — graph raised
    dsn = graph_module.checkpointer_dsn()
    session_uuid, _session_created = _ensure_session(req.session_id, user.user_name, req.messages)
    session_id_str = str(session_uuid)
    thread_id = _thread_id(session_id_str)
    cfg = {"configurable": {"thread_id": thread_id}}
    lc_messages = _to_lc_messages(req.messages)

    if req.messages:
        last = req.messages[-1]
        if last.role == "user" and last.content.strip():
            try:
                backend_store.append_conversation(session_uuid, "user", last.content)
            except Exception:  # noqa: BLE001
                log.exception("[chat_stream] Failed to persist user turn for session=%s", session_uuid)

    async def event_stream() -> AsyncIterator[bytes]:
        log.info(
            "[chat_stream] Start | user=%s thread_id=%s n_messages=%d",
            getattr(user, "user_name", None), thread_id, len(req.messages),
        )
        await proposal_store.ensure_checkpoint_schema()
        final: dict[str, Any] = {}
        try:
            with catalog_introspect.with_obo_token(user.obo_token):
                async with AsyncPostgresSaver.from_conn_string(dsn) as cp:
                    await cp.setup()
                    agent = graph_module.build_graph(checkpointer=cp)
                    async for event in agent.astream_events(
                        {"messages": lc_messages}, config=cfg, version="v2"
                    ):
                        kind = event["event"]
                        name = event.get("name") or ""
                        if kind == "on_chain_start" and name in NODE_LABELS:
                            yield _sse({
                                "type": "node_start",
                                "name": name,
                                "label": NODE_LABELS[name],
                            })
                        elif kind == "on_chain_end" and name in NODE_LABELS:
                            output = (event.get("data") or {}).get("output") or {}
                            yield _sse({
                                "type": "node_end",
                                "name": name,
                                "summary": _node_end_summary(name, output),
                            })
                        elif kind == "on_chat_model_stream":
                            chunk = event["data"]["chunk"]
                            if chunk.content:
                                yield _sse({"type": "llm_token", "content": chunk.content})
                        elif kind == "on_chain_end" and name == "LangGraph":
                            final = (event.get("data") or {}).get("output") or {}
        except Exception as exc:  # noqa: BLE001
            log.exception("[chat_stream] Graph raised: %s", exc)
            yield _sse({"type": "error", "message": str(exc)})
            return

        proposal = final.get("proposal", {}) or {}
        ddl = final.get("ddl", "") or ""
        saved_id = _persist(proposal, ddl, req.proposal_id, user.user_name)

        if saved_id:
            try:
                backend_store.link_session_to_proposal(session_uuid, uuid.UUID(saved_id))
            except Exception:  # noqa: BLE001
                log.exception(
                    "[chat_stream] Failed to link session %s -> proposal %s", session_uuid, saved_id
                )

        assistant_summary = _summarize(proposal)
        try:
            backend_store.append_conversation(
                session_uuid,
                "assistant",
                assistant_summary,
                proposal_id=uuid.UUID(saved_id) if saved_id else None,
            )
        except Exception:  # noqa: BLE001
            log.exception("[chat_stream] Failed to persist assistant turn for session=%s", session_uuid)

        yield _sse({
            "type": "final",
            "messages": [{"role": "assistant", "content": assistant_summary}],
            "custom_outputs": {
                "proposal_id": saved_id,
                "proposal": proposal,
                "ddl": ddl,
                "session_id": session_id_str,
            },
        })

    return StreamingResponse(event_stream(), media_type="text/event-stream")

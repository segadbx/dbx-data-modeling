"""
Option B — MLflow ResponsesAgent with explicit function-calling.

NOT BUILT. Skeleton only — runs locally if you wire creds, but no Model Serving deploy
config is included in the bundle.

The idea: skip LangGraph's graph runtime. Use MLflow's ResponsesAgent abstraction, which
is closer to the OpenAI tool-calling pattern: the LLM decides whether to call a tool,
the agent runs the tool, sends the result back, and loops until the LLM stops requesting
tools. Simpler to debug than a graph, weaker for multi-step deterministic control flow.

When to switch to this:
  * Designer node is doing all the heavy lifting anyway and the graph structure is overkill.
  * We need clearer trace UI in MLflow (function-call style traces are very legible).
"""
from __future__ import annotations

import json
import os
from typing import Any

import mlflow
from mlflow.pyfunc import ResponsesAgent
from mlflow.types.agent import (
    ChatAgentMessage,
    ChatContext,
)

from agent.tools import catalog_introspect, ddl_renderer, proposal_store, reuse_scanner


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_silver_tables",
            "description": "List the tables in the silver schema.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "describe_table",
            "description": "Return schema + comments + sample + profile for a silver table.",
            "parameters": {
                "type": "object",
                "properties": {"table_name": {"type": "string"}},
                "required": ["table_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_similar_seed_dims",
            "description": "Find seed reference dims similar to a proposed dim.",
            "parameters": {
                "type": "object",
                "properties": {
                    "proposed_name": {"type": "string"},
                    "proposed_columns": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["proposed_name", "proposed_columns"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "render_ddl",
            "description": "Render CREATE+MERGE SQL from a proposal JSON.",
            "parameters": {
                "type": "object",
                "properties": {"proposal": {"type": "object"}},
                "required": ["proposal"],
            },
        },
    },
]


def _dispatch_tool(name: str, args: dict[str, Any]) -> Any:
    if name == "list_silver_tables":
        return catalog_introspect.list_silver_tables()
    if name == "describe_table":
        d = catalog_introspect.describe_table(args["table_name"])
        return json.loads(d.to_json())
    if name == "find_similar_seed_dims":
        return [
            {"name": m.name, "score": m.score, "scd": m.scd}
            for m in reuse_scanner.find_similar_seed_dims(
                args["proposed_name"], args["proposed_columns"]
            )
        ]
    if name == "render_ddl":
        return ddl_renderer.render(args["proposal"])
    raise ValueError(f"Unknown tool: {name}")


class ModelerResponsesAgent(ResponsesAgent):
    """ResponsesAgent skeleton. Wire up at deploy time if you choose to build this."""

    def predict(self, messages, context: ChatContext | None = None, custom_inputs=None):
        raise NotImplementedError("Sketch only — see TODO comments")


# mlflow.models.set_model(ModelerResponsesAgent())  # uncomment to actually deploy

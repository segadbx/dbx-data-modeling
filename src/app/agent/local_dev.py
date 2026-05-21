"""
Local-dev entrypoint for the graph — bypass the FastAPI app and run nodes directly.

Run from `src/app/`:
  cd src/app
  python -m agent.local_dev "Propose a model for fact_workorder."

after exporting:
  DATABRICKS_HOST, DATABRICKS_TOKEN     (PAT or OAuth)
  DATABRICKS_WAREHOUSE_ID               (warehouse for catalog introspect)
  CATALOG_NAME, BRONZE_SCHEMA, SILVER_SCHEMA, GOLD_SCHEMA, AGENT_STATE_SCHEMA
  LLM_ENDPOINT_NAME
  PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD   (Lakebase connection — same
    contract as the deployed Apps platform. Set PGPASSWORD to a static value to
    skip the SDK token mint path, or set LAKEBASE_INSTANCE_NAME to mint one.)

Match these to whatever you used as DAB variables for `bundle deploy -t dev`. This
lets you iterate on the graph without redeploying the App.
"""
from __future__ import annotations

import os as _os
import sys as _sys
try:
    _here = _os.path.dirname(_os.path.abspath(__file__))
except NameError:
    _here = _os.path.dirname(_os.path.abspath(_sys.argv[0]))
# Put src/app/ (parent of this package) on sys.path so `import agent.graph` resolves.
_root = _os.path.abspath(_os.path.join(_here, ".."))
if _root not in _sys.path:
    _sys.path.insert(0, _root)

import asyncio
import json
import os
import sys

from langchain_core.messages import HumanMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from agent import graph as graph_module


async def _amain(user_prompt: str) -> None:
    dsn = graph_module.checkpointer_dsn()
    async with AsyncPostgresSaver.from_conn_string(dsn) as cp:
        await cp.setup()
        agent = graph_module.build_graph(checkpointer=cp)
        cfg = {"configurable": {"thread_id": "local-dev"}}
        state = {"messages": [HumanMessage(content=user_prompt)]}
        final = await agent.ainvoke(state, config=cfg)
        print(json.dumps(final.get("proposal", {}), indent=2))
        print("\n----- DDL -----\n")
        print(final.get("ddl", ""))


def main() -> int:
    prompt = (
        " ".join(sys.argv[1:])
        or "Propose a dimensional model for the silver source tables. Reuse seed dims where applicable."
    )
    asyncio.run(_amain(prompt))
    return 0


if __name__ == "__main__":
    sys.exit(main())

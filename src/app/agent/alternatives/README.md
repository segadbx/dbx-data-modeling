# Alternative agent designs

The reference implementation (`src/agent/graph.py`) is a **LangGraph ChatAgent**. This
folder documents three additional Databricks-native ways the same job could be done. They
are **not built** for the POC — they are sketches you can pick from after the reference
implementation is working and we know what we like / dislike.

| Option | Built? | Where it lives |
|---|---|---|
| **A. LangGraph ChatAgent** *(reference)* | **Yes** | `src/agent/graph.py`, `chat_agent.py` |
| B. ResponsesAgent + tool calling | sketch only | `option_b_responses_agent.py` |
| C. Agent Bricks (Genie + Knowledge Assistant + Multi-Agent Supervisor) | YAML sketch | `option_c_agent_bricks.md` |
| D. DSPy + MLflow (compiled prompts) | sketch only | `option_d_dspy.md` |

Two earlier candidates were **dropped** during planning:
- `ai_query` STRUCT pipeline — not really an agent (no HITL loop, no tool use). Useful
  only as a non-agent baseline.
- Standalone Genie API + pyfunc designer — redundant with C; only orchestration location
  differs.

---

## Comparison cheat sheet

|  | LangGraph | ResponsesAgent | Agent Bricks | DSPy |
|---|---|---|---|---|
| Control flow | explicit DAG | single-pass with tool use | declarative supervisor | program graph + compiler |
| Built-in human-in-the-loop | yes (interrupt + resume) | requires app-side orchestration | yes (Genie + chat) | manual |
| State persistence | LangGraph checkpointer (Postgres on Lakebase) | none — app/Lakebase owns it | UC + chat history | none — caller persists |
| Prompt optimization | manual | manual | manual | **automated (MIPRO/GEPA)** |
| Lines of code to wire up | medium | low | very low (YAML) | medium-high |
| Lock-in to a framework | moderate | low | high (DBX-specific) | moderate |
| Best when | multi-step refinement with branching | simple agentic loops | "no-code" stakeholder ask | quality is the bottleneck and labeled data exists |

## Decision factors after POC week 2

- If the designer step's quality is the bottleneck → consider **DSPy** (compile/optimize
  the designer prompt against the eval dataset).
- If non-engineers need to maintain the agent → migrate to **Agent Bricks** (YAML +
  Knowledge Assistant + Genie).
- If we want simpler, single-shot behavior with explicit tool use → **ResponsesAgent**.
- If the graph approach is working and we just need to iterate → stay on **LangGraph**
  and add the deferred critic node.

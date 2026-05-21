# Option C — Agent Bricks (Genie + Knowledge Assistant + Multi-Agent Supervisor)

Not built. YAML sketches and a wiring plan for replacing the LangGraph reference agent
with a fully Databricks-managed Agent Bricks stack.

## Components

### 1. Genie Space — `silver_genie`
SQL exploration interface over the `silver.*` tables. Lets the modeler agent (and humans)
ask natural-language questions about the data, e.g. "how many work orders per asset
type", "show me the meter reading frequency by asset".

```yaml
# resources/genie_space.yml (sketch — not wired in)
resources:
  genie_spaces:
    silver_explore:
      name: "Silver — modeling exploration"
      description: "NL query interface over silver source tables for the modeler agent."
      tables:
        - ${var.catalog_name}.silver.workorder
        - ${var.catalog_name}.silver.asset
        - ${var.catalog_name}.silver.labor
        - ${var.catalog_name}.silver.item
        - ${var.catalog_name}.silver.locations
        - ${var.catalog_name}.silver.companies
        - ${var.catalog_name}.silver.worklog
        - ${var.catalog_name}.silver.meterreading
      instructions: |
        You are a SQL assistant for an EAM-style dataset. Use appropriate joins
        (workorder→asset, workorder→labor, workorder→locations). Prefer COUNT(*),
        AVG, percentile_approx when asked about aggregates.
```

### 2. Knowledge Assistant — `dimensional_modeling_kb`
Indexed on dimensional-modeling reference material: Kimball, Star Schema, SCD patterns,
the seed-dim corpus (`src/agent/seed_dims.json` rendered to markdown), and the system
prompt from `src/agent/prompts/system.md`.

```yaml
# resources/knowledge_assistant.yml (sketch)
resources:
  knowledge_assistants:
    dimensional_modeling_kb:
      name: "Dimensional modeling KB"
      source_documents:
        - path: /Volumes/${var.catalog_name}/agent_state/kb/kimball.pdf
        - path: /Volumes/${var.catalog_name}/agent_state/kb/seed_dims.md
      embedding_model: databricks-gte-large-en
```

### 3. Multi-Agent Supervisor (MAS)
Orchestrates the two sub-agents above plus a code-gen helper.

```yaml
resources:
  multi_agent_supervisors:
    modeler_supervisor:
      name: "Dimensional Modeler Supervisor"
      description: "Routes user turns to Genie (data questions), KB (modeling guidance), and DDL renderer."
      sub_agents:
        - name: genie
          endpoint: silver_explore
          when: "user asks about row counts, distributions, sample data"
        - name: kb
          endpoint: dimensional_modeling_kb
          when: "user asks about modeling strategy, SCD, grain, naming"
        - name: ddl_renderer
          endpoint: ${var.modeler_endpoint_name}-rendercall
          when: "user has approved a proposal and asks for SQL"
      system_prompt: |
        You are a senior data architect proposing a dimensional model. Use Genie to
        understand data shape, KB to apply Kimball best practices, and ddl_renderer
        to emit MERGE+CREATE statements. Reuse the seed dimensions before proposing
        new ones.
```

## Trade-offs vs the LangGraph reference

**Pros**
- **Lowest code** — three YAML resources replace ~600 lines of Python.
- **Stakeholder demo value** — every senior leader at Databricks will ask "can't you just
  use Agent Bricks?" Having this option documented is the right answer.
- Built-in chat history, observability, and PII redaction.

**Cons**
- Less direct control over the structure of the JSON proposal — Agent Bricks favors
  conversational output, not strict schemas.
- DDL rendering would need to become its own endpoint that the supervisor calls.
- Couples the POC tightly to Databricks-internal services; harder to compare apples-to-apples
  with non-Databricks AI workflows.

## When to switch to this
- After the LangGraph reference is shipping and users start asking for *more* exploratory
  capability that the rigid graph can't accommodate.
- When non-engineers need to maintain the agent (modeling guidance lives in a doc, not
  in a Python prompt).

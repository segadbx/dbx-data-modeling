# Option D — DSPy + MLflow (compiled, optimizable prompts)

Not built. Outline for replacing the **designer** node with a DSPy program that can be
*compiled* against the eval dataset using MIPRO / GEPA — turning prompt engineering into
a measurable optimization problem.

## Why this is interesting

The designer node is the quality bottleneck. Its output is a structured JSON proposal,
which is exactly the shape DSPy's `Signature` + `TypedPredictor` are designed for. Once
you have:
- A signature (`silver_overview, seed_dims → proposal`)
- A scorer (`reuse_recall` + `schema_validity` from `src/eval/scorers.py`)
- A small dataset (the existing `src/eval/dataset.jsonl`)

You can run `dspy.compile()` and have the prompt + few-shots optimized automatically. The
LangGraph wrapper stays unchanged — only the LLM call inside `designer` becomes a
`dspy.Module.forward()`.

## Sketch

```python
# src/agent/alternatives/dspy_designer.py (not committed)
import dspy

class Proposal(dspy.Signature):
    """Propose a dimensional model. Output ONLY a JSON object."""
    silver_overview: str = dspy.InputField()
    seed_dims: str = dspy.InputField()
    proposal_json: str = dspy.OutputField()

class Designer(dspy.Module):
    def __init__(self):
        super().__init__()
        self.predict = dspy.TypedPredictor(Proposal)

    def forward(self, silver_overview, seed_dims):
        return self.predict(silver_overview=silver_overview, seed_dims=seed_dims)

# Compile against eval cases
trainset = load_eval_cases()  # [{silver_overview, seed_dims, expected_proposal}]
metric = lambda example, pred, trace: schema_validity(pred) + reuse_recall(example, pred)
compiled_designer = dspy.MIPROv2(metric=metric).compile(Designer(), trainset=trainset)
```

## Trade-offs

**Pros**
- Quality becomes a *measurable* lever, not vibes.
- The compiled program is portable (works against any LLM that DSPy supports).
- Plays nicely with MLflow — DSPy programs can be logged with `mlflow.dspy.log_model`.

**Cons**
- Adds a meaningful dependency (`dspy`) to the served model.
- Compilation needs labeled training data — 5–10 cases is the floor; ~30 is healthier.
- Optimization runs are slow; bakes minutes into every prompt iteration.

## When to switch
- When the eval scorecard plateaus and we can no longer improve via prompt tweaks by hand.
- When we have ~30 labeled cases (organic from production traces) and a clear preference
  signal (`reuse_recall`, `schema_validity`).

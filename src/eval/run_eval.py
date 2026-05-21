"""
Run mlflow.genai.evaluate against the deployed ModelerAgent.

Usage:
    python -m src.eval.run_eval \\
        --model-uri models:/<catalog>.<agent_state_schema>.<agent_model_name>/<version> \\
        --experiment <mlflow_experiment_path> \\
        --dataset src/eval/dataset.jsonl
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
import json
import os
from pathlib import Path

import mlflow

from src.eval.scorers import no_duplicate, reuse_recall, schema_validity


def load_dataset(path: Path) -> list[dict]:
    cases = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            cases.append(json.loads(line))
    return cases


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-uri", required=True)
    ap.add_argument("--experiment", required=True)
    ap.add_argument("--dataset", required=True)
    args = ap.parse_args()

    mlflow.set_experiment(args.experiment)
    cases = load_dataset(Path(args.dataset))

    # Load the model ONCE, not per case (saves minutes per eval run).
    model = mlflow.pyfunc.load_model(args.model_uri)

    eval_data = [{"request": c["request"], "expectations": c["expected"], "id": c["id"]} for c in cases]

    def predict_fn(**req):
        return model.predict(req)

    with mlflow.start_run(run_name="modeler-eval"):
        result = mlflow.genai.evaluate(
            data=eval_data,
            predict_fn=predict_fn,
            scorers=[reuse_recall, schema_validity, no_duplicate],
        )
        print("Eval done.")
        print(result.metrics)


if __name__ == "__main__":
    main()

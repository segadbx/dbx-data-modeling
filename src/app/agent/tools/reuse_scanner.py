"""
Reuse scanner: given a proposed dimension (name + columns), find similar entries in
seed_dims.json so the agent reuses existing dims instead of inventing duplicates.

Stand-in for a Vector Search index while gold is empty (advisor cut for POC scope).
Replace this with a VS-backed indexer once gold tables exist.

Algorithm: TF-IDF over (dim_name + column names + comments) cosine similarity. Cheap,
deterministic, no extra infra.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import mlflow
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


SEED_PATH = Path(__file__).parent.parent / "seed_dims.json"


@dataclass
class ReuseMatch:
    name: str
    score: float
    columns: list[dict[str, Any]]
    scd: str
    use_when: str


def _load_seed() -> list[dict[str, Any]]:
    with open(SEED_PATH, "r") as f:
        return json.load(f)["dims"]


def _doc_for(dim: dict[str, Any]) -> str:
    # `dict.get(k, default)` returns the default only when the key is *missing* —
    # if the value is explicitly None (as it is for columns without a UC comment),
    # it returns None, which breaks " ".join. Use `or ""` to coerce.
    parts = [dim["name"] or "", dim.get("use_when") or ""]
    for c in dim["columns"]:
        parts.append(c.get("name") or "")
        parts.append(c.get("comment") or "")
    return " ".join(parts).lower()


def _proposal_doc(proposed_name: str, proposed_columns: list[dict[str, Any]]) -> str:
    parts = [proposed_name or ""]
    for c in proposed_columns:
        parts.append(c.get("name") or "")
        parts.append(c.get("comment") or "")
    return " ".join(parts).lower()


@mlflow.trace
def find_similar_seed_dims(
    proposed_name: str,
    proposed_columns: list[dict[str, Any]],
    top_k: int = 3,
    threshold: float = 0.20,
) -> list[ReuseMatch]:
    """Return seed dims whose cosine similarity > threshold, ranked desc, top_k max."""
    seed = _load_seed()
    if not seed:
        return []

    docs = [_doc_for(d) for d in seed]
    query = _proposal_doc(proposed_name, proposed_columns)
    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    matrix = vec.fit_transform(docs + [query])
    sims = cosine_similarity(matrix[-1], matrix[:-1])[0]

    ranked = sorted(enumerate(sims), key=lambda x: x[1], reverse=True)
    matches: list[ReuseMatch] = []
    for idx, score in ranked[:top_k]:
        if score < threshold:
            continue
        d = seed[idx]
        matches.append(
            ReuseMatch(
                name=d["name"],
                score=float(score),
                columns=d["columns"],
                scd=d.get("scd", "type1"),
                use_when=d.get("use_when", ""),
            )
        )
    return matches


def list_all_seed_dims() -> list[dict[str, Any]]:
    """Useful for the analyzer to know what's available before designing."""
    return _load_seed()

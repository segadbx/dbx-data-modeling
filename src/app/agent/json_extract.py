"""JSON extraction helpers for the designer LLM output.

Separated from `graph.py` so unit tests can exercise these pure functions
without importing the heavy LangChain / mlflow / langgraph runtime stack.
"""
from __future__ import annotations

import json
import re
from typing import Any


_FENCE_OPEN_RE = re.compile(r"^\s*```(?:json|JSON)?\s*\n?")
_FENCE_CLOSE_RE = re.compile(r"\n?```\s*$")


def strip_fences(s: str) -> str:
    """Strip a leading ```json / ``` fence and trailing ``` if present.

    Tolerant of a missing closing fence (truncated output) — leading fence is
    stripped independently of the trailing one.
    """
    out = _FENCE_OPEN_RE.sub("", s, count=1)
    out = _FENCE_CLOSE_RE.sub("", out, count=1)
    return out.strip()


def extract_balanced_json(s: str) -> str | None:
    """Return the substring spanning the first balanced top-level {...} block.

    Walks character-by-character tracking string state (with `\\` escapes) and
    brace depth. Returns `None` if no balanced object is found.
    """
    start = s.find("{")
    if start == -1:
        return None
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return s[start : i + 1]
    return None


def parse_proposal(raw: str) -> tuple[dict[str, Any] | None, str | None]:
    """Best-effort JSON extraction for the designer output.

    Tries three strategies in order: direct parse, fence-strip + parse,
    balanced-brace extract + parse. Returns `(proposal, None)` on success
    or `(None, parse_error_str)` if every strategy fails.
    """
    last_err: str | None = None
    candidates = [raw, strip_fences(raw)]
    extracted = extract_balanced_json(raw)
    if extracted:
        candidates.append(extracted)
    for cand in candidates:
        if not cand:
            continue
        try:
            obj = json.loads(cand)
        except json.JSONDecodeError as e:
            last_err = str(e)
            continue
        if isinstance(obj, dict):
            return obj, None
        last_err = f"top-level JSON is {type(obj).__name__}, expected object"
    return None, last_err or "no JSON object found"

"""Unit tests for the designer-node JSON extraction helpers.

These exercise pure functions only — no LangChain, no Databricks, no LLM mocking.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make `src/app` importable so `from agent.graph import ...` works in tests run
# from the repo root without an editable install of the app package.
_APP_DIR = Path(__file__).resolve().parents[2] / "src" / "app"
if str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from agent.json_extract import (  # noqa: E402
    extract_balanced_json as _extract_balanced_json,
    parse_proposal as _parse_proposal,
    strip_fences as _strip_fences,
)


# ----- _strip_fences --------------------------------------------------------

def test_strip_fences_pure_json_unchanged():
    raw = '{"a": 1}'
    assert _strip_fences(raw) == '{"a": 1}'


def test_strip_fences_handles_json_tag():
    raw = '```json\n{"a": 1}\n```'
    assert _strip_fences(raw) == '{"a": 1}'


def test_strip_fences_handles_bare_fence():
    raw = '```\n{"a": 1}\n```'
    assert _strip_fences(raw) == '{"a": 1}'


def test_strip_fences_missing_closing_fence():
    raw = '```json\n{"a": 1}'
    assert _strip_fences(raw) == '{"a": 1}'


def test_strip_fences_preserves_inner_backticks():
    raw = '```json\n{"comment": "uses `foo` syntax"}\n```'
    assert _strip_fences(raw) == '{"comment": "uses `foo` syntax"}'


# ----- _extract_balanced_json ----------------------------------------------

def test_extract_pure_object():
    raw = '{"a": 1, "b": [1, 2, 3]}'
    assert _extract_balanced_json(raw) == raw


def test_extract_with_leading_prose():
    raw = 'Here is the proposal:\n{"a": 1}\nThanks!'
    assert _extract_balanced_json(raw) == '{"a": 1}'


def test_extract_nested_objects():
    raw = '{"outer": {"inner": {"x": 1}}}'
    assert _extract_balanced_json(raw) == raw


def test_extract_with_brace_in_string():
    raw = '{"comment": "this has a } in it", "x": 1}'
    assert _extract_balanced_json(raw) == raw


def test_extract_with_escaped_quote_in_string():
    raw = '{"q": "she said \\"hi\\"", "x": 1}'
    assert _extract_balanced_json(raw) == raw


def test_extract_truncated_returns_none():
    raw = '{"a": 1, "b": [1, 2,'
    assert _extract_balanced_json(raw) is None


def test_extract_no_brace_returns_none():
    assert _extract_balanced_json("just prose, no JSON here") is None


# ----- _parse_proposal -----------------------------------------------------

def test_parse_proposal_pure_json():
    proposal, err = _parse_proposal('{"dims": [], "facts": []}')
    assert err is None
    assert proposal == {"dims": [], "facts": []}


def test_parse_proposal_fenced_json():
    raw = '```json\n{"dims": [], "facts": []}\n```'
    proposal, err = _parse_proposal(raw)
    assert err is None
    assert proposal == {"dims": [], "facts": []}


def test_parse_proposal_prose_wrapped():
    raw = 'Sure! Here is the proposal:\n{"dims": [], "facts": []}\nLet me know.'
    proposal, err = _parse_proposal(raw)
    assert err is None
    assert proposal == {"dims": [], "facts": []}


def test_parse_proposal_truncated_returns_error():
    raw = '{"dims": [{"name": "dim_x"'
    proposal, err = _parse_proposal(raw)
    assert proposal is None
    assert err is not None and len(err) > 0


def test_parse_proposal_empty_returns_error():
    proposal, err = _parse_proposal("")
    assert proposal is None
    assert err is not None


def test_parse_proposal_rejects_non_object_top_level():
    proposal, err = _parse_proposal('[1, 2, 3]')
    assert proposal is None
    assert err is not None and "object" in err

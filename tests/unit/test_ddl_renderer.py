"""Unit tests for ddl_renderer.render — filtering of reused dims and scd defaulting."""
from __future__ import annotations

import sys
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parents[2] / "src" / "app"
if str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from agent.tools.ddl_renderer import render  # noqa: E402


def _new_dim(**overrides):
    base = {
        "name": "dim_new",
        "comment": "a brand new dim",
        "scd": "type1",
        "natural_key": "new_id",
        "source_table": "new_src",
        "columns": [
            {"name": "new_id", "type": "STRING", "comment": "natural key"},
            {"name": "label", "type": "STRING", "comment": "human label"},
        ],
        "source_columns": [
            {"name": "new_id", "source": "new_id"},
            {"name": "label", "source": "label"},
        ],
    }
    base.update(overrides)
    return base


def _base_proposal(**overrides):
    base = {"catalog": "c", "schema": "s", "dims": [], "facts": []}
    base.update(overrides)
    return base


def test_reused_dim_is_skipped_entirely():
    proposal = _base_proposal(
        dims=[{"name": "dim_asset", "reused_from_seed": True}],
    )
    sql = render(proposal)
    # Reused dim must not appear in any CREATE TABLE / MERGE statement.
    assert "dim_asset" not in sql


def test_mixed_dims_render_only_new_ones():
    proposal = _base_proposal(
        dims=[
            {"name": "dim_asset", "reused_from_seed": True},
            _new_dim(),
        ],
    )
    sql = render(proposal)
    assert "CREATE TABLE IF NOT EXISTS c.s.dim_new" in sql
    assert "dim_asset" not in sql


def test_missing_scd_defaults_to_type1():
    dim = _new_dim()
    dim.pop("scd")
    proposal = _base_proposal(dims=[dim])
    sql = render(proposal)
    assert "SCD1 merge for dim_new" in sql
    assert "SCD2 merge" not in sql


def test_explicit_scd_type2_picks_scd2_branch():
    dim = _new_dim(
        scd="type2",
        scd2_change_cols=["label"],
        columns=_new_dim()["columns"] + [
            {"name": "is_current", "type": "BOOLEAN", "comment": "scd2 current flag"},
            {"name": "scd_start_date", "type": "DATE", "comment": "scd2 start"},
            {"name": "scd_end_date", "type": "DATE", "comment": "scd2 end"},
        ],
    )
    proposal = _base_proposal(dims=[dim])
    sql = render(proposal)
    assert "SCD2 merge for dim_new" in sql
    assert "SCD1 merge" not in sql


def test_render_does_not_mutate_input_proposal():
    dim = _new_dim()
    dim.pop("scd")
    proposal = _base_proposal(dims=[dim])
    render(proposal)
    # Caller's dim dict must not have been mutated with a defaulted scd.
    assert "scd" not in proposal["dims"][0]


def test_only_reused_dims_renders_without_raising():
    proposal = _base_proposal(
        dims=[
            {"name": "dim_asset", "reused_from_seed": True},
            {"name": "dim_employee", "reused_from_seed": True},
        ],
    )
    sql = render(proposal)
    # No dim DDL at all, but the catalog/schema preamble should still appear.
    assert "USE CATALOG c" in sql
    assert "USE SCHEMA s" in sql
    assert "CREATE TABLE" not in sql


def test_missing_catalog_raises():
    import pytest

    with pytest.raises(ValueError):
        render({"schema": "s", "dims": [], "facts": []})

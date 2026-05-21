"""
Silver SDP pipeline (Lakeflow Declarative Pipelines).

Bronze (raw Delta from Auto Loader) -> Silver (cleaned, typed, deduplicated).

Design choices for POC
----------------------
* Silver tables are **materialized views** (non-streaming) rather than streaming tables.
  Rationale: row counts are POC-scale, and `@dlt.table` with `spark.table(...)` + a clean
  `dropDuplicates` keeps the dedup deterministic and lets us read cross-schema from
  `<catalog>.bronze.*` (which `dlt.read_stream` cannot do). For real workloads, swap to
  `dlt.create_streaming_table` + `dlt.apply_changes`.
* SCD2 is NOT applied at the silver layer for the POC — per plan, SCD2 is demonstrated by
  the agent's generated *gold* DDL.
"""
from __future__ import annotations

import os

import dlt
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window


def _require_conf(name: str) -> str:
    # Lakeflow/DLT exposes pipeline `configuration:` values via spark.conf, not os.environ.
    v = spark.conf.get(name, None)  # noqa: F821 — `spark` injected by DLT
    if not v:
        raise RuntimeError(
            f"{name} is not set. Set it in resources/pipelines/silver_pipeline.yml "
            f"`configuration:` block."
        )
    return v


CATALOG = _require_conf("CATALOG_NAME")
BRONZE_SCHEMA = _require_conf("BRONZE_SCHEMA")


def _bronze(table: str) -> DataFrame:
    """Batch read of a bronze Delta table."""
    return spark.table(f"{CATALOG}.{BRONZE_SCHEMA}.{table}")  # noqa: F821 — `spark` injected by DLT


def _dedup_latest(df: DataFrame, natural_key: str) -> DataFrame:
    """Keep the latest row per natural key by _ingest_ts (deterministic on tie via _source_file)."""
    w = Window.partitionBy(natural_key).orderBy(
        F.col("_ingest_ts").desc_nulls_last(), F.col("_source_file").desc_nulls_last()
    )
    return (
        df.withColumn("_rn", F.row_number().over(w))
        .where(F.col("_rn") == 1)
        .drop("_rn", "_ingest_ts", "_source_file")
    )


# ----- Dimensions ---------------------------------------------------------------------

@dlt.table(name="locations", comment="Silver: deduplicated hierarchical locations.")
@dlt.expect_or_drop("valid_location_id", "location_id IS NOT NULL")
def locations():
    return _dedup_latest(_bronze("locations"), "location_id")


@dlt.table(name="asset", comment="Silver: deduplicated assets (latest snapshot per asset_id).")
@dlt.expect_or_drop("valid_asset_id", "asset_id IS NOT NULL")
@dlt.expect("valid_status", "status IN ('OPERATING','DOWN','RETIRED','STANDBY')")
def asset():
    return _dedup_latest(_bronze("asset"), "asset_id")


@dlt.table(name="labor", comment="Silver: workforce.")
@dlt.expect_or_drop("valid_labor_id", "labor_id IS NOT NULL")
def labor():
    return _dedup_latest(_bronze("labor"), "labor_id")


@dlt.table(name="item", comment="Silver: inventory items.")
@dlt.expect_or_drop("valid_item_id", "item_id IS NOT NULL")
def item():
    return _dedup_latest(_bronze("item"), "item_id")


@dlt.table(name="companies", comment="Silver: vendors / suppliers.")
@dlt.expect_or_drop("valid_vendor_id", "vendor_id IS NOT NULL")
def companies():
    return _dedup_latest(_bronze("companies"), "vendor_id")


# ----- Facts --------------------------------------------------------------------------

@dlt.table(name="workorder", comment="Silver: maintenance work orders.")
@dlt.expect_or_drop("valid_workorder_id", "workorder_id IS NOT NULL")
@dlt.expect("nonneg_hours", "actual_hours IS NULL OR actual_hours >= 0")
def workorder():
    return _dedup_latest(_bronze("workorder"), "workorder_id")


@dlt.table(name="worklog", comment="Silver: per-workorder labor log entries.")
@dlt.expect_or_drop("valid_worklog_id", "worklog_id IS NOT NULL")
def worklog():
    return _dedup_latest(_bronze("worklog"), "worklog_id")


@dlt.table(name="meterreading", comment="Silver: time-series sensor readings.")
@dlt.expect_or_drop("valid_reading_id", "reading_id IS NOT NULL")
@dlt.expect("valid_reading_ts", "reading_ts IS NOT NULL")
def meterreading():
    return _dedup_latest(_bronze("meterreading"), "reading_id")


# ----- New-wave tables (simulated "new data arrival") ---------------------------------
# These tables are produced by the `synth_new_data` job and arrive in bronze with a
# domain prefix. They flow through the silver pipeline using the same dedup pattern; the
# data-modeling agent's extension_analyzer node detects them as not-yet-modeled and
# proposes incorporating them into the existing gold star schema.

@dlt.table(name="procurement_purchase_order", comment="Silver: purchase order lines (new-wave).")
@dlt.expect_or_drop("valid_po_id", "po_id IS NOT NULL")
def procurement_purchase_order():
    return _dedup_latest(_bronze("procurement_purchase_order"), "po_id")


@dlt.table(name="procurement_inventory_movement", comment="Silver: stock movements (new-wave).")
@dlt.expect_or_drop("valid_movement_id", "movement_id IS NOT NULL")
@dlt.expect("valid_movement_ts", "movement_ts IS NOT NULL")
def procurement_inventory_movement():
    return _dedup_latest(_bronze("procurement_inventory_movement"), "movement_id")


@dlt.table(name="reliability_failure_code", comment="Silver: reliability/failure classification codes (new-wave).")
@dlt.expect_or_drop("valid_failure_code", "failure_code IS NOT NULL")
def reliability_failure_code():
    return _dedup_latest(_bronze("reliability_failure_code"), "failure_code")

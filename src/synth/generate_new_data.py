"""
Synthetic generator for the SECOND wave of source data ("new data arrival").

Mirrors `generate_to_volume.py` but produces three additional tables that simulate new
business data landing in bronze after the initial 8-table core:

  * procurement_purchase_order      (fact candidate)
  * procurement_inventory_movement  (fact candidate)
  * reliability_failure_code        (dim candidate)

Referential integrity to existing dims is preserved by sampling PK values out of the
already-populated bronze tables (`companies.vendor_id`, `item.item_id`, `asset.asset_id`,
`locations.location_id`). This means the agent's downstream join inference has real FKs
to chew on.

Output: parquet under `<volume_path>/wave2/<table>/`, plus `comments_new.sql` for the
bronze ingest task to apply via COMMENT ON.

Run AFTER `synth_data_gen` has populated `<catalog>.<bronze_schema>.*`.
"""
from __future__ import annotations

# Make `from src.*` imports work when invoked as a serverless spark_python_task.
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
import logging

import dbldatagen as dg
from pyspark.sql import DataFrame, SparkSession

from src.synth.extension_schema import ALL_NEW_TABLES


log = logging.getLogger(__name__)


# ----- Row counts per table (small by default; --scale multiplies) -----
DEFAULT_ROW_COUNTS = {
    "procurement_purchase_order": 400,
    "procurement_inventory_movement": 1000,
    "reliability_failure_code": 30,
}


def _spark() -> SparkSession:
    return SparkSession.builder.getOrCreate()


def _read_bronze_ids(
    spark: SparkSession, catalog: str, bronze_schema: str, table: str, col: str
) -> list[str]:
    fqn = f"{catalog}.{bronze_schema}.{table}"
    return [row[col] for row in spark.table(fqn).select(col).distinct().collect()]


def _build_purchase_order(
    spark: SparkSession, n: int, vendors: list[str], items: list[str], assets: list[str]
) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="procurement_purchase_order", rows=n, partitions=4)
        .withColumn("po_id", "string", template=r"PO-\\n\\n\\n\\n\\n\\n\\n\\n")
        .withColumn("vendor_id", "string", values=vendors)
        .withColumn("item_id", "string", values=items)
        .withColumn("asset_id", "string", values=assets, percentNulls=0.3)
        .withColumn("po_date", "timestamp", begin="2024-01-01 00:00:00", end="2025-12-31 00:00:00")
        .withColumn("qty", "decimal(10,2)", minValue=1, maxValue=500)
        .withColumn("unit_cost", "decimal(12,2)", minValue=1, maxValue=10_000)
        .withColumn("total_cost", "decimal(14,2)", minValue=1, maxValue=500_000)
        .withColumn("status", "string", values=["DRAFT", "ISSUED", "PARTIAL", "RECEIVED", "CANCELLED"], weights=[1, 3, 1, 4, 1])
        .withColumn("expected_delivery_date", "date", begin="2024-01-15", end="2026-01-31")
        .withColumn("actual_delivery_date", "date", begin="2024-01-15", end="2026-01-31", percentNulls=0.2)
        .build()
    )


def _build_inventory_movement(
    spark: SparkSession, n: int, items: list[str], locations: list[str]
) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="procurement_inventory_movement", rows=n, partitions=8)
        .withColumn("movement_id", "string", template=r"IM-\\n\\n\\n\\n\\n\\n\\n\\n\\n")
        .withColumn("item_id", "string", values=items)
        .withColumn("location_id", "string", values=locations)
        .withColumn("movement_ts", "timestamp", begin="2024-01-01 00:00:00", end="2025-12-31 23:59:59")
        .withColumn("movement_type", "string", values=["RECEIPT", "ISSUE", "TRANSFER", "ADJUST"], weights=[3, 4, 2, 1])
        .withColumn("qty", "decimal(12,2)", minValue=-200, maxValue=500)
        .withColumn("unit_cost", "decimal(12,2)", minValue=1, maxValue=10_000)
        .withColumn("reference_doc", "string", template=r"REF-\\n\\n\\n\\n\\n\\n", percentNulls=0.15)
        .build()
    )


def _build_failure_code(spark: SparkSession, n: int) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="reliability_failure_code", rows=n)
        .withColumn("failure_code", "string", template=r"FC-\\n\\n\\n\\n")
        .withColumn("failure_category", "string", values=["MECHANICAL", "ELECTRICAL", "HYDRAULIC", "SOFTWARE", "HUMAN"])
        .withColumn("failure_description", "string", template=r"\\w \\w \\w \\w")
        .withColumn("severity", "int", minValue=1, maxValue=5)
        .withColumn("root_cause_category", "string", values=["WEAR", "FATIGUE", "CORROSION", "OVERLOAD", "DESIGN", "OPERATOR", "OTHER"])
        .withColumn("recommended_action", "string", template=r"\\w \\w \\w")
        .build()
    )


# ----- COMMENT SQL generation ---------------------------------------------------------

def _render_comments_sql(catalog: str, schemas: list[str]) -> str:
    """Render COMMENT ON TABLE/COLUMN statements for the 3 new tables across the given schemas."""
    parts: list[str] = []
    for schema in schemas:
        for spec in ALL_NEW_TABLES:
            fqn = f"{catalog}.{schema}.{spec.name}"
            parts.append(f"COMMENT ON TABLE {fqn} IS '{_sql_escape(spec.table_comment)}';")
            for col in spec.columns:
                parts.append(
                    f"COMMENT ON COLUMN {fqn}.{col.name} IS '{_sql_escape(col.comment)}';"
                )
    return "\n".join(parts) + "\n"


def _sql_escape(s: str) -> str:
    return s.replace("'", "''")


# ----- Main ---------------------------------------------------------------------------

def _write_table(df: DataFrame, wave_path: str, name: str) -> None:
    out_path = f"{wave_path}/{name}"
    log.info("Writing %s rows to %s", df.count(), out_path)
    (
        df.coalesce(1)
        .write.mode("overwrite")
        .format("parquet")
        .save(out_path)
    )


def run(
    catalog: str,
    bronze_schema: str,
    silver_schema: str,
    volume_path: str,
    row_counts: dict[str, int],
) -> None:
    spark = _spark()
    wave_path = f"{volume_path}/wave2"

    log.info("Sampling existing bronze IDs for referential integrity ...")
    vendors = _read_bronze_ids(spark, catalog, bronze_schema, "companies", "vendor_id")
    items = _read_bronze_ids(spark, catalog, bronze_schema, "item", "item_id")
    assets = _read_bronze_ids(spark, catalog, bronze_schema, "asset", "asset_id")
    locations = _read_bronze_ids(spark, catalog, bronze_schema, "locations", "location_id")
    if not vendors or not items or not assets or not locations:
        raise RuntimeError(
            "One of the required bronze dim tables is empty or missing — run "
            "`synth_data_gen` first to populate bronze with the original 8 tables."
        )

    log.info(
        "Generating new-wave tables (%s vendors, %s items, %s assets, %s locations) ...",
        len(vendors), len(items), len(assets), len(locations),
    )
    po_df = _build_purchase_order(spark, row_counts["procurement_purchase_order"], vendors, items, assets)
    im_df = _build_inventory_movement(spark, row_counts["procurement_inventory_movement"], items, locations)
    fc_df = _build_failure_code(spark, row_counts["reliability_failure_code"])

    log.info("Writing parquet to %s ...", wave_path)
    _write_table(po_df, wave_path, "procurement_purchase_order")
    _write_table(im_df, wave_path, "procurement_inventory_movement")
    _write_table(fc_df, wave_path, "reliability_failure_code")

    log.info("Writing comments_new.sql ...")
    # Bronze-only — same rationale as `generate_to_volume.py`: silver tables don't exist
    # when `bronze_ingest_new` applies this SQL, and silver inherits comments via the DLT
    # decorator + Spark column metadata.
    _ = silver_schema  # kept on the CLI for backward compat; no longer used here
    comments_sql = _render_comments_sql(catalog, schemas=[bronze_schema])
    sql_path = f"{wave_path}/comments_new.sql"
    dbutils = _get_dbutils(spark)
    if dbutils is not None:
        dbutils.fs.put(sql_path, comments_sql, overwrite=True)
    else:
        spark.createDataFrame([(comments_sql,)], "value string").coalesce(1).write.mode(
            "overwrite"
        ).text(sql_path)

    log.info("Done.")


def _get_dbutils(spark: SparkSession):  # noqa: ANN202
    try:
        from pyspark.dbutils import DBUtils  # type: ignore

        return DBUtils(spark)
    except Exception:
        return None


def _parse_rows_override(spec: str | None) -> dict[str, int]:
    out: dict[str, int] = {}
    if not spec:
        return out
    for chunk in spec.split(","):
        if not chunk.strip():
            continue
        if "=" not in chunk:
            raise ValueError(f"--rows entry '{chunk}' must be table=count")
        k, v = chunk.split("=", 1)
        k = k.strip()
        if k not in DEFAULT_ROW_COUNTS:
            raise ValueError(f"unknown new table '{k}'; valid: {sorted(DEFAULT_ROW_COUNTS)}")
        out[k] = int(v)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--bronze-schema", required=True)
    ap.add_argument("--silver-schema", required=True)
    ap.add_argument("--volume-path", required=True,
                    help="e.g. /Volumes/<catalog>/<bronze_schema>/<volume_name>")
    ap.add_argument("--scale", type=float, default=1.0,
                    help="Global multiplier on default row counts.")
    ap.add_argument("--rows", default=None,
                    help="Per-table override, e.g. 'procurement_purchase_order=5000'. Beats --scale.")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    counts = {k: max(1, int(v * args.scale)) for k, v in DEFAULT_ROW_COUNTS.items()}
    counts.update(_parse_rows_override(args.rows))
    log.info("Row counts: %s", counts)
    run(args.catalog, args.bronze_schema, args.silver_schema, args.volume_path, counts)


if __name__ == "__main__":
    main()

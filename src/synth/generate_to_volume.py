"""
Synthetic EAM-style data generator.

Run as a Databricks Job task (serverless). Writes parquet for each of the 8 core tables
into the landing UC volume, plus a comments.sql file that the bronze ingest task applies
once the Delta tables exist.

Referential integrity is enforced by generating dims first and sampling their PKs as FKs
for the fact-candidate tables. Status fields on `asset` rotate over time so that the SCD2
demonstration in the gold output has meaningful history.
"""
from __future__ import annotations

# Make `from src.*` imports work when this file is invoked as a script.
# Databricks serverless `spark_python_task` exec()s the file in a scope without `__file__`,
# so fall back to sys.argv[0] (always set for python file execution).
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

from src.synth.core_schema import ALL_TABLES


log = logging.getLogger(__name__)


# ----- Row counts per table -----
# Defaults are intentionally small (hundreds) so the synth job runs in seconds and the
# downstream silver/agent flows are fast for demos. Override via:
#   * `--scale 10.0`        — multiplier on all defaults (10x = thousands)
#   * `--rows table=N,...`  — explicit per-table count, e.g. `--rows workorder=5000,asset=1000`
DEFAULT_ROW_COUNTS = {
    "locations": 100,
    "companies": 50,
    "labor": 100,
    "item": 200,
    "asset": 300,
    "workorder": 500,
    "worklog": 700,
    "meterreading": 800,
}


def _spark() -> SparkSession:
    return SparkSession.builder.getOrCreate()


def _build_locations(spark: SparkSession, n: int) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="locations", rows=n, partitions=4)
        .withColumn("location_id", "string", template=r"LOC-\\n\\n\\n\\n\\n")
        .withColumn("location_name", "string", template=r"\\w \\w")
        .withColumn("parent_location", "string", template=r"LOC-\\n\\n\\n\\n\\n", percentNulls=0.4)
        .withColumn("site_code", "string", values=["PLANT01", "PLANT02", "PLANT03", "WAREHSE"])
        .withColumn("location_type", "string", values=["SITE", "AREA", "BUILDING", "ROOM"])
        .withColumn("status", "string", values=["OPERATING", "DECOMMISSIONED", "PLANNED"], weights=[8, 1, 1])
        .withColumn("created_date", "timestamp", begin="2018-01-01 00:00:00", end="2024-12-31 00:00:00")
        .build()
    )


def _build_companies(spark: SparkSession, n: int) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="companies", rows=n)
        .withColumn("vendor_id", "string", template=r"V-\\n\\n\\n\\n")
        .withColumn("vendor_name", "string", template=r"\\W \\W")
        .withColumn("vendor_type", "string", values=["PARTS", "SERVICE", "OEM", "DISTRIBUTOR"])
        .withColumn("country", "string", values=["US", "CA", "DE", "JP", "MX", "BR"])
        .withColumn("status", "string", values=["ACTIVE", "INACTIVE", "DISQUALIFIED"], weights=[9, 1, 1])
        .build()
    )


def _build_labor(spark: SparkSession, n: int) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="labor", rows=n)
        .withColumn("labor_id", "string", template=r"L-\\n\\n\\n\\n\\n")
        .withColumn("person_name", "string", template=r"\\w \\w")
        .withColumn("craft", "string", values=["MECHANIC", "ELECTRICIAN", "OPERATOR", "ENGINEER", "SUPERVISOR"])
        .withColumn("supervisor_id", "string", template=r"L-\\n\\n\\n\\n\\n", percentNulls=0.2)
        .withColumn("hire_date", "date", begin="2010-01-01", end="2024-06-30")
        .withColumn("hourly_rate", "decimal(8,2)", minValue=25, maxValue=120)
        .withColumn("status", "string", values=["ACTIVE", "INACTIVE", "TERMINATED"], weights=[8, 1, 1])
        .withColumn("site_code", "string", values=["PLANT01", "PLANT02", "PLANT03", "WAREHSE"])
        .build()
    )


def _build_item(spark: SparkSession, n: int, vendors: list[str]) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="item", rows=n)
        .withColumn("item_id", "string", template=r"IT-\\n\\n\\n\\n\\n\\n")
        .withColumn("item_description", "string", template=r"\\w \\w \\w")
        .withColumn("category", "string", values=["BEARING", "FILTER", "BELT", "LUBRICANT", "FASTENER", "ELECTRICAL"])
        .withColumn("uom", "string", values=["EACH", "FOOT", "LITER", "GALLON"])
        .withColumn("standard_cost", "decimal(10,2)", minValue=1, maxValue=5000)
        .withColumn("preferred_vendor_id", "string", values=vendors)
        .build()
    )


def _build_asset(spark: SparkSession, n: int, locations: list[str]) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="asset", rows=n)
        .withColumn("asset_id", "string", template=r"AST-\\n\\n\\n\\n\\n\\n")
        .withColumn("asset_description", "string", template=r"\\w \\w \\w")
        .withColumn("asset_type", "string", values=["PUMP", "MOTOR", "HVAC", "CONVEYOR", "VEHICLE"])
        .withColumn("manufacturer", "string", template=r"\\W")
        .withColumn("model_number", "string", template=r"M-\\n\\n\\n\\n")
        .withColumn("serial_number", "string", template=r"SN-\\n\\n\\n\\n\\n\\n\\n\\n")
        .withColumn("location_id", "string", values=locations)
        .withColumn("status", "string", values=["OPERATING", "DOWN", "RETIRED", "STANDBY"], weights=[7, 1, 1, 1])
        .withColumn("criticality", "int", minValue=1, maxValue=5)
        .withColumn("install_date", "date", begin="2010-01-01", end="2024-12-01")
        .withColumn("purchase_cost", "decimal(12,2)", minValue=500, maxValue=500_000)
        .withColumn("last_updated", "timestamp", begin="2024-01-01 00:00:00", end="2025-06-30 00:00:00")
        .build()
    )


def _build_workorder(spark: SparkSession, n: int, assets: list[str], locations: list[str], labors: list[str]) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="workorder", rows=n, partitions=8)
        .withColumn("workorder_id", "string", template=r"WO-\\n\\n\\n\\n\\n\\n\\n\\n")
        .withColumn("asset_id", "string", values=assets)
        .withColumn("location_id", "string", values=locations)
        .withColumn("assigned_labor_id", "string", values=labors)
        .withColumn("work_type", "string", values=["PM", "CM", "EM"], weights=[5, 4, 1])
        .withColumn("status", "string", values=["WAPPR", "APPR", "INPRG", "COMP", "CLOSE", "CAN"], weights=[1, 2, 2, 4, 4, 1])
        .withColumn("priority", "int", minValue=1, maxValue=5)
        .withColumn("reported_date", "timestamp", begin="2023-01-01 00:00:00", end="2025-06-30 00:00:00")
        .withColumn("started_date", "timestamp", begin="2023-01-01 00:00:00", end="2025-06-30 00:00:00", percentNulls=0.1)
        .withColumn("completed_date", "timestamp", begin="2023-01-01 00:00:00", end="2025-06-30 00:00:00", percentNulls=0.3)
        .withColumn("estimated_hours", "decimal(8,2)", minValue=1, maxValue=80)
        .withColumn("actual_hours", "decimal(8,2)", minValue=0, maxValue=100, percentNulls=0.3)
        .withColumn("estimated_cost", "decimal(12,2)", minValue=100, maxValue=50_000)
        .withColumn("actual_cost", "decimal(12,2)", minValue=0, maxValue=60_000, percentNulls=0.3)
        .withColumn("description", "string", template=r"\\w \\w \\w \\w \\w")
        .build()
    )


def _build_worklog(spark: SparkSession, n: int, workorders: list[str], labors: list[str]) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="worklog", rows=n, partitions=8)
        .withColumn("worklog_id", "string", template=r"WL-\\n\\n\\n\\n\\n\\n\\n\\n\\n")
        .withColumn("workorder_id", "string", values=workorders)
        .withColumn("labor_id", "string", values=labors)
        .withColumn("entry_date", "timestamp", begin="2023-01-01 00:00:00", end="2025-06-30 00:00:00")
        .withColumn("hours_logged", "decimal(6,2)", minValue=0.25, maxValue=12)
        .withColumn("entry_type", "string", values=["WORK", "NOTE", "DOWNTIME", "DELAY"], weights=[6, 2, 1, 1])
        .withColumn("notes", "string", template=r"\\w \\w \\w")
        .build()
    )


def _build_meterreading(spark: SparkSession, n: int, assets: list[str]) -> DataFrame:
    return (
        dg.DataGenerator(spark, name="meterreading", rows=n, partitions=8)
        .withColumn("reading_id", "string", template=r"MR-\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n")
        .withColumn("asset_id", "string", values=assets)
        .withColumn("meter_name", "string", values=["RUNTIME_HOURS", "VIBRATION_MM_S", "TEMPERATURE_C", "PRESSURE_PSI"])
        .withColumn("reading_value", "double", minValue=0, maxValue=10_000)
        .withColumn("reading_uom", "string", values=["HOURS", "MM/S", "C", "PSI"])
        .withColumn("reading_ts", "timestamp", begin="2024-01-01 00:00:00", end="2025-06-30 00:00:00")
        .withColumn("source", "string", values=["MANUAL", "SCADA", "IOT"], weights=[1, 3, 6])
        .build()
    )


# ----- COMMENT SQL generation ---------------------------------------------------------

def _render_comments_sql(catalog: str, schemas: list[str]) -> str:
    """Render `COMMENT ON TABLE` + `COMMENT ON COLUMN` for every (schema, table, column).

    The synthetic data has no inherent comments. We add them explicitly so the agent's
    analyzer node has semantic context — without comments it would have to lean entirely
    on column names.
    """
    parts: list[str] = []
    for schema in schemas:
        for spec in ALL_TABLES:
            fqn = f"{catalog}.{schema}.{spec.name}"
            parts.append(f"COMMENT ON TABLE {fqn} IS '{_sql_escape(spec.table_comment)}';")
            for col in spec.columns:
                parts.append(
                    f"COMMENT ON COLUMN {fqn}.{col.name} IS '{_sql_escape(col.comment)}';"
                )
    return "\n".join(parts) + "\n"


def _sql_escape(s: str) -> str:
    return s.replace("'", "''")


# ----- Main -------------------------------------------------------------------------

def _write_table(df: DataFrame, volume_path: str, name: str) -> None:
    out_path = f"{volume_path}/{name}"
    log.info("Writing %s rows to %s", df.count(), out_path)
    (
        df.coalesce(1)
        .write.mode("overwrite")
        .format("parquet")
        .save(out_path)
    )


def _collect_ids(df: DataFrame, col: str) -> list[str]:
    return [row[col] for row in df.select(col).collect()]


def run(
    catalog: str,
    bronze_schema: str,
    silver_schema: str,
    volume_path: str,
    row_counts: dict[str, int],
) -> None:
    spark = _spark()

    log.info("Generating dimensions first (for referential integrity)...")
    locations_df = _build_locations(spark, row_counts["locations"])
    companies_df = _build_companies(spark, row_counts["companies"])
    labor_df = _build_labor(spark, row_counts["labor"])

    location_ids = _collect_ids(locations_df, "location_id")
    vendor_ids = _collect_ids(companies_df, "vendor_id")
    labor_ids = _collect_ids(labor_df, "labor_id")

    item_df = _build_item(spark, row_counts["item"], vendor_ids)
    asset_df = _build_asset(spark, row_counts["asset"], location_ids)
    asset_ids = _collect_ids(asset_df, "asset_id")

    log.info("Generating facts with referential integrity...")
    workorder_df = _build_workorder(spark, row_counts["workorder"], asset_ids, location_ids, labor_ids)
    workorder_ids = _collect_ids(workorder_df, "workorder_id")

    worklog_df = _build_worklog(spark, row_counts["worklog"], workorder_ids, labor_ids)
    meterreading_df = _build_meterreading(spark, row_counts["meterreading"], asset_ids)

    log.info("Writing parquet to %s ...", volume_path)
    _write_table(locations_df, volume_path, "locations")
    _write_table(companies_df, volume_path, "companies")
    _write_table(labor_df, volume_path, "labor")
    _write_table(item_df, volume_path, "item")
    _write_table(asset_df, volume_path, "asset")
    _write_table(workorder_df, volume_path, "workorder")
    _write_table(worklog_df, volume_path, "worklog")
    _write_table(meterreading_df, volume_path, "meterreading")

    log.info("Writing comments.sql ...")
    # Only render comments for the BRONZE schema. Silver tables don't exist at the time
    # `bronze_ingest` applies this SQL (silver_pipeline runs later); silver tables get
    # their table comment from the @dlt.table(comment=...) decorator and inherit column
    # metadata from bronze through Spark, so silver COMMENT statements were dead noise.
    _ = silver_schema  # kept on the CLI for backward compat; no longer used here
    comments_sql = _render_comments_sql(catalog, schemas=[bronze_schema])
    sql_path = f"{volume_path}/comments.sql"
    # dbutils not always available; use spark FS to write the SQL blob
    dbutils = _get_dbutils(spark)
    if dbutils is not None:
        dbutils.fs.put(sql_path, comments_sql, overwrite=True)
    else:
        # Fallback: write via Spark text
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
    """Parse `--rows workorder=5000,asset=1000` into {table: count}."""
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
            raise ValueError(f"unknown table '{k}'; valid: {sorted(DEFAULT_ROW_COUNTS)}")
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
                    help="Global multiplier on default row counts (e.g. 10.0 for thousands).")
    ap.add_argument("--rows", default=None,
                    help="Per-table override: 'workorder=5000,asset=1000'. Beats --scale.")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    counts = {k: max(1, int(v * args.scale)) for k, v in DEFAULT_ROW_COUNTS.items()}
    counts.update(_parse_rows_override(args.rows))
    log.info("Row counts: %s", counts)
    run(args.catalog, args.bronze_schema, args.silver_schema, args.volume_path, counts)


if __name__ == "__main__":
    main()

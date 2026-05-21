"""
Bronze ingest task for the SECOND wave of synthetic data.

Mirrors `bronze_ingest.py`. Auto Loader reads parquet from `<volume_path>/wave2/<table>`
and lands raw Delta tables in `<catalog>.<bronze_schema>.<table>` for the three new tables
defined in `extension_schema.ALL_NEW_TABLES`. After all tables exist, applies
`comments_new.sql` so the agent sees table/column descriptions.

Independent checkpoint + schema-location paths under `wave2/_checkpoints` and
`wave2/_schemas` so this task does not interfere with the original `bronze_ingest`
checkpoints.
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
import logging

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

from src.synth.extension_schema import ALL_NEW_TABLES


log = logging.getLogger(__name__)


def _spark() -> SparkSession:
    return SparkSession.builder.getOrCreate()


def _ingest_one(
    spark: SparkSession,
    catalog: str,
    bronze_schema: str,
    volume_path: str,
    table_name: str,
) -> None:
    src = f"{volume_path}/wave2/{table_name}"
    tgt = f"{catalog}.{bronze_schema}.{table_name}"
    chk = f"{volume_path}/wave2/_checkpoints/{table_name}"
    schema_loc = f"{volume_path}/wave2/_schemas/{table_name}"

    log.info("Auto Loader %s -> %s", src, tgt)
    (
        spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", "parquet")
        .option("cloudFiles.schemaLocation", schema_loc)
        .option("cloudFiles.inferColumnTypes", "true")
        .load(src)
        .withColumn("_ingest_ts", F.current_timestamp())
        .withColumn("_source_file", F.col("_metadata.file_path"))
        .writeStream.format("delta")
        .option("checkpointLocation", chk)
        .option("mergeSchema", "true")
        .trigger(availableNow=True)
        .toTable(tgt)
    ).awaitTermination()


def _split_sql(text: str) -> list[str]:
    # `;` inside a SQL string literal is part of the comment text, not a statement
    # boundary — naively splitting drops the rest of the string into the next "statement".
    out: list[str] = []
    buf: list[str] = []
    in_str = False
    i = 0
    while i < len(text):
        c = text[i]
        if c == "'":
            if in_str and i + 1 < len(text) and text[i + 1] == "'":
                buf.append("''")
                i += 2
                continue
            in_str = not in_str
            buf.append(c)
        elif c == ";" and not in_str:
            stmt = "".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
        else:
            buf.append(c)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def _apply_comments(spark: SparkSession, volume_path: str) -> None:
    sql_path = f"{volume_path}/wave2/comments_new.sql"
    try:
        raw = spark.read.text(sql_path).collect()
        text = "\n".join(r["value"] for r in raw)
    except Exception:
        df = spark.sparkContext.wholeTextFiles(sql_path).collect()
        text = "\n".join(payload for _, payload in df)

    for stmt in _split_sql(text):
        try:
            spark.sql(stmt)
        except Exception as e:  # noqa: BLE001
            log.warning("COMMENT statement failed (ok if target table missing): %s", e)


def run(catalog: str, bronze_schema: str, volume_path: str) -> None:
    spark = _spark()
    spark.sql(f"USE CATALOG {catalog}")
    spark.sql(f"USE SCHEMA {bronze_schema}")
    for spec in ALL_NEW_TABLES:
        _ingest_one(spark, catalog, bronze_schema, volume_path, spec.name)
    _apply_comments(spark, volume_path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--bronze-schema", required=True)
    ap.add_argument("--volume-path", required=True)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run(args.catalog, args.bronze_schema, args.volume_path)


if __name__ == "__main__":
    main()

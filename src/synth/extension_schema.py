"""
Schema specs for the SECOND wave of synthetic data ("new data arrival").

Three additional tables that simulate new business domains landing in bronze after the
initial 8-table core. The data modeling agent's `extension_analyzer` node sees these as
silver tables not yet represented in the deployed gold model, and proposes extensions to
the star schema: two new facts (procurement) + one new conformed dimension (reliability).

Table names carry a DOMAIN PREFIX (`procurement_*`, `reliability_*`) so they are visually
distinct from the original core tables in bronze/silver.

`Column` and `TableSpec` are imported from `core_schema` to avoid duplication.
"""
from __future__ import annotations

from src.synth.core_schema import Column, TableSpec


# ----- procurement_purchase_order -----------------------------------------------------
PROCUREMENT_PURCHASE_ORDER = TableSpec(
    name="procurement_purchase_order",
    table_comment=(
        "Purchase orders for spare parts and services. Grain = one row per PO line. Each "
        "PO references a vendor (companies), an item, and optionally the asset it was "
        "ordered for. Drives procurement spend analysis and on-time-delivery KPIs."
    ),
    role_hint="fact_candidate",
    columns=[
        Column("po_id", "string", "Natural key for the PO line.", is_pk=True),
        Column("vendor_id", "string", "Supplying vendor.", fk_table="companies"),
        Column("item_id", "string", "Item being procured.", fk_table="item"),
        Column("asset_id", "string", "Asset the PO is associated with (optional).", fk_table="asset"),
        Column("po_date", "timestamp", "When the PO was raised."),
        Column("qty", "decimal(10,2)", "Quantity ordered."),
        Column("unit_cost", "decimal(12,2)", "Unit cost at order time."),
        Column("total_cost", "decimal(14,2)", "Extended cost (qty * unit_cost)."),
        Column("status", "string", "DRAFT / ISSUED / PARTIAL / RECEIVED / CANCELLED."),
        Column("expected_delivery_date", "date", "Promised delivery date."),
        Column("actual_delivery_date", "date", "Actual delivery date (nullable until received)."),
    ],
)


# ----- procurement_inventory_movement -------------------------------------------------
PROCUREMENT_INVENTORY_MOVEMENT = TableSpec(
    name="procurement_inventory_movement",
    table_comment=(
        "Stock movement ledger. Grain = one row per movement event. Captures receipts "
        "from vendors, issues to work orders, transfers between locations, and adjustments. "
        "Drives inventory turnover and on-hand balance analytics."
    ),
    role_hint="fact_candidate",
    columns=[
        Column("movement_id", "string", "Natural key for the movement event.", is_pk=True),
        Column("item_id", "string", "Item being moved.", fk_table="item"),
        Column("location_id", "string", "Source or destination location.", fk_table="locations"),
        Column("movement_ts", "timestamp", "Movement event timestamp."),
        Column("movement_type", "string", "RECEIPT / ISSUE / TRANSFER / ADJUST."),
        Column("qty", "decimal(12,2)", "Signed quantity (positive = inflow, negative = outflow)."),
        Column("unit_cost", "decimal(12,2)", "Unit cost at the time of movement."),
        Column("reference_doc", "string", "Source doc ID (PO, WO, transfer ticket); nullable for adjustments."),
    ],
)


# ----- reliability_failure_code -------------------------------------------------------
RELIABILITY_FAILURE_CODE = TableSpec(
    name="reliability_failure_code",
    table_comment=(
        "Reliability engineering codes used to classify asset failures and work-order root "
        "causes. Conformed reference data — joinable to workorder (and to incident, if/when "
        "modeled). Slowly changing; small (~30 rows). Ideal new conformed dimension."
    ),
    role_hint="dim_candidate",
    columns=[
        Column("failure_code", "string", "Natural key for the failure classification.", is_pk=True),
        Column("failure_category", "string", "MECHANICAL / ELECTRICAL / HYDRAULIC / SOFTWARE / HUMAN."),
        Column("failure_description", "string", "Human-readable description of the failure mode."),
        Column("severity", "int", "1 (catastrophic) to 5 (trivial)."),
        Column("root_cause_category", "string", "WEAR / FATIGUE / CORROSION / OVERLOAD / DESIGN / OPERATOR / OTHER."),
        Column("recommended_action", "string", "Standard mitigation recommended by reliability engineering."),
    ],
)


ALL_NEW_TABLES: list[TableSpec] = [
    PROCUREMENT_PURCHASE_ORDER,
    PROCUREMENT_INVENTORY_MOVEMENT,
    RELIABILITY_FAILURE_CODE,
]


def get_new_table(name: str) -> TableSpec:
    for t in ALL_NEW_TABLES:
        if t.name == name:
            return t
    raise KeyError(f"Unknown extension table: {name}")

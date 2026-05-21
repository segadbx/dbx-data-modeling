"""
EAM-style schema for the synthetic data generator.

Eight core tables modeled on a typical enterprise asset-management entity layout, scoped
down for the POC. Each entry holds:
  - columns: ordered list of (name, spark_type, comment) tuples
  - table_comment: written via COMMENT ON TABLE after Auto Loader lands the data
  - role_hint: not used by the generator, but kept here as documentation for the agent's
    analyzer node (it should derive role from data shape, not from a label).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


RoleHint = Literal["dim_candidate", "fact_candidate"]


@dataclass(frozen=True)
class Column:
    name: str
    spark_type: str
    comment: str
    is_pk: bool = False
    fk_table: str | None = None  # informational; not enforced in bronze


@dataclass(frozen=True)
class TableSpec:
    name: str
    table_comment: str
    role_hint: RoleHint
    columns: list[Column] = field(default_factory=list)


LOCATIONS = TableSpec(
    name="locations",
    table_comment=(
        "Hierarchical asset locations (sites, areas, buildings, rooms). Parent/child via "
        "parent_location. Slowly changing — locations rarely move."
    ),
    role_hint="dim_candidate",
    columns=[
        Column("location_id", "string", "Natural key for the location.", is_pk=True),
        Column("location_name", "string", "Human-readable location name."),
        Column("parent_location", "string", "FK to parent location_id (self-reference).", fk_table="locations"),
        Column("site_code", "string", "Top-level site code (e.g., PLANT01)."),
        Column("location_type", "string", "Category: SITE, AREA, BUILDING, ROOM."),
        Column("status", "string", "OPERATING / DECOMMISSIONED / PLANNED."),
        Column("created_date", "timestamp", "When the location was first registered."),
    ],
)


ASSET = TableSpec(
    name="asset",
    table_comment=(
        "Physical assets managed by the EAM system. Each asset has a current location and a "
        "criticality. Status (OPERATING / DOWN / RETIRED) changes over time — good SCD2 candidate."
    ),
    role_hint="dim_candidate",
    columns=[
        Column("asset_id", "string", "Natural key for the asset.", is_pk=True),
        Column("asset_description", "string", "Free-text asset description."),
        Column("asset_type", "string", "PUMP / MOTOR / HVAC / CONVEYOR / VEHICLE."),
        Column("manufacturer", "string", "Vendor that manufactured the asset."),
        Column("model_number", "string", "Manufacturer model."),
        Column("serial_number", "string", "Manufacturer serial number."),
        Column("location_id", "string", "Current physical location.", fk_table="locations"),
        Column("status", "string", "OPERATING / DOWN / RETIRED / STANDBY — changes over time."),
        Column("criticality", "int", "1 (mission critical) to 5 (low impact)."),
        Column("install_date", "date", "Install date of the asset."),
        Column("purchase_cost", "decimal(12,2)", "Acquisition cost in USD."),
        Column("last_updated", "timestamp", "Last status/attribute update — drives SCD2."),
    ],
)


LABOR = TableSpec(
    name="labor",
    table_comment=(
        "Workforce: technicians, engineers, supervisors. Each labor record has a craft and an "
        "optional supervisor (self-FK)."
    ),
    role_hint="dim_candidate",
    columns=[
        Column("labor_id", "string", "Natural key for the labor record.", is_pk=True),
        Column("person_name", "string", "Person's full name."),
        Column("craft", "string", "MECHANIC / ELECTRICIAN / OPERATOR / ENGINEER / SUPERVISOR."),
        Column("supervisor_id", "string", "FK to a supervising labor_id.", fk_table="labor"),
        Column("hire_date", "date", "Hire date."),
        Column("hourly_rate", "decimal(8,2)", "Standard hourly rate in USD."),
        Column("status", "string", "ACTIVE / INACTIVE / TERMINATED."),
        Column("site_code", "string", "Primary site assignment."),
    ],
)


ITEM = TableSpec(
    name="item",
    table_comment=(
        "Inventory items / spare parts catalog. Used in workorders and worklog as part usage."
    ),
    role_hint="dim_candidate",
    columns=[
        Column("item_id", "string", "Natural key for the inventory item.", is_pk=True),
        Column("item_description", "string", "Free-text description."),
        Column("category", "string", "BEARING / FILTER / BELT / LUBRICANT / FASTENER / ELECTRICAL."),
        Column("uom", "string", "Unit of measure: EACH / FOOT / LITER / GALLON."),
        Column("standard_cost", "decimal(10,2)", "Standard cost per UOM."),
        Column("preferred_vendor_id", "string", "Default purchase vendor.", fk_table="companies"),
    ],
)


COMPANIES = TableSpec(
    name="companies",
    table_comment=(
        "Vendors and suppliers. Source of parts and service for the EAM operation."
    ),
    role_hint="dim_candidate",
    columns=[
        Column("vendor_id", "string", "Natural key for the vendor.", is_pk=True),
        Column("vendor_name", "string", "Company name."),
        Column("vendor_type", "string", "PARTS / SERVICE / OEM / DISTRIBUTOR."),
        Column("country", "string", "ISO country code."),
        Column("status", "string", "ACTIVE / INACTIVE / DISQUALIFIED."),
    ],
)


WORKORDER = TableSpec(
    name="workorder",
    table_comment=(
        "Maintenance work orders — the central transactional table. Each work order targets an "
        "asset at a location, is assigned to a labor record, and tracks estimated vs actual cost "
        "and hours. Grain = one row per workorder."
    ),
    role_hint="fact_candidate",
    columns=[
        Column("workorder_id", "string", "Natural key for the workorder.", is_pk=True),
        Column("asset_id", "string", "Target asset.", fk_table="asset"),
        Column("location_id", "string", "Location of the work.", fk_table="locations"),
        Column("assigned_labor_id", "string", "Primary assigned technician.", fk_table="labor"),
        Column("work_type", "string", "PM (preventive) / CM (corrective) / EM (emergency)."),
        Column("status", "string", "WAPPR / APPR / INPRG / COMP / CLOSE / CAN."),
        Column("priority", "int", "1 (highest) to 5 (lowest)."),
        Column("reported_date", "timestamp", "When the work was reported."),
        Column("started_date", "timestamp", "When work actually started."),
        Column("completed_date", "timestamp", "When work was completed."),
        Column("estimated_hours", "decimal(8,2)", "Estimated labor hours."),
        Column("actual_hours", "decimal(8,2)", "Actual labor hours."),
        Column("estimated_cost", "decimal(12,2)", "Estimated total cost (labor + parts)."),
        Column("actual_cost", "decimal(12,2)", "Actual total cost."),
        Column("description", "string", "Free-text description of the work."),
    ],
)


WORKLOG = TableSpec(
    name="worklog",
    table_comment=(
        "Per-workorder labor entries and notes. Grain = one row per workorder per labor per "
        "entry timestamp. Captures actual hours logged by individual technicians."
    ),
    role_hint="fact_candidate",
    columns=[
        Column("worklog_id", "string", "Natural key for the worklog row.", is_pk=True),
        Column("workorder_id", "string", "Parent workorder.", fk_table="workorder"),
        Column("labor_id", "string", "Technician who logged the work.", fk_table="labor"),
        Column("entry_date", "timestamp", "Timestamp of the log entry."),
        Column("hours_logged", "decimal(6,2)", "Hours recorded by this technician."),
        Column("entry_type", "string", "WORK / NOTE / DOWNTIME / DELAY."),
        Column("notes", "string", "Free-text technician notes."),
    ],
)


METERREADING = TableSpec(
    name="meterreading",
    table_comment=(
        "Time-series sensor / meter readings against an asset. Grain = (asset, meter, ts). "
        "Drives condition-based maintenance and is a natural fact candidate."
    ),
    role_hint="fact_candidate",
    columns=[
        Column("reading_id", "string", "Natural key for the reading row.", is_pk=True),
        Column("asset_id", "string", "Asset being measured.", fk_table="asset"),
        Column("meter_name", "string", "RUNTIME_HOURS / VIBRATION_MM_S / TEMPERATURE_C / PRESSURE_PSI."),
        Column("reading_value", "double", "Numeric reading value."),
        Column("reading_uom", "string", "Unit of measure for the reading."),
        Column("reading_ts", "timestamp", "When the reading was taken."),
        Column("source", "string", "MANUAL / SCADA / IOT."),
    ],
)


ALL_TABLES: list[TableSpec] = [
    LOCATIONS,
    ASSET,
    LABOR,
    ITEM,
    COMPANIES,
    WORKORDER,
    WORKLOG,
    METERREADING,
]


def get_table(name: str) -> TableSpec:
    for t in ALL_TABLES:
        if t.name == name:
            return t
    raise KeyError(f"Unknown core table: {name}")

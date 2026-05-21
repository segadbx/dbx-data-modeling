# Few-shot examples

## Example 1 — workorder → fact_workorder

**Silver inputs:**
- `silver.workorder` (~20k rows; grain = workorder; columns include workorder_id, asset_id,
  location_id, assigned_labor_id, work_type, status, reported_date, completed_date,
  estimated_hours, actual_hours, estimated_cost, actual_cost)
- `silver.asset` (~2k rows; columns include asset_id, asset_type, criticality)
- `silver.labor` (~500 rows; columns include labor_id, craft, supervisor_id)
- `silver.locations` (~200 rows; columns include location_id, site_code, location_type)

**Seed-dim matches found:**
- `dim_asset` (score 0.41) — reuse
- `dim_employee` (score 0.32) — reuse for labor
- `dim_location` (score 0.29) — reuse
- `dim_date` (score 0.18, below threshold but reuse because dates are universal)

**Expected proposal (excerpt):**

```json
{
  "dims": [
    {"name": "dim_asset", "reused_from_seed": true},
    {"name": "dim_employee", "reused_from_seed": true},
    {"name": "dim_location", "reused_from_seed": true},
    {"name": "dim_date", "reused_from_seed": true}
  ],
  "facts": [{
    "name": "fact_workorder",
    "grain": "one row per workorder",
    "natural_key": "workorder_id",
    "source_table": "workorder",
    "partition_by": ["reported_date_key"],
    "columns": [
      {"name": "workorder_id", "type": "string"},
      {"name": "asset_sk", "type": "bigint"},
      {"name": "employee_sk", "type": "bigint"},
      {"name": "location_sk", "type": "bigint"},
      {"name": "reported_date_key", "type": "int"},
      {"name": "completed_date_key", "type": "int"},
      {"name": "work_type", "type": "string"},
      {"name": "status", "type": "string"},
      {"name": "priority", "type": "int"},
      {"name": "estimated_hours", "type": "decimal(8,2)"},
      {"name": "actual_hours", "type": "decimal(8,2)"},
      {"name": "estimated_cost", "type": "decimal(12,2)"},
      {"name": "actual_cost", "type": "decimal(12,2)"},
      {"name": "duration_hours", "type": "decimal(8,2)", "comment": "Derived: completed - started in hours"}
    ],
    "joins": [
      {"dim": "dim_asset", "alias": "a", "src_col": "asset_id", "dim_col": "asset_id", "scd2": true},
      {"dim": "dim_employee", "alias": "e", "src_col": "assigned_labor_id", "dim_col": "employee_id", "scd2": true},
      {"dim": "dim_location", "alias": "l", "src_col": "location_id", "dim_col": "location_id", "scd2": false}
    ]
  }]
}
```

Note: when `reused_from_seed: true`, the fact joins to the *existing* dim — no new dim
DDL is emitted for it.

## Example 2 — Extension mode: new procurement + reliability data

**Existing deployed gold model:**
- `dim_vendor`, `dim_item`, `dim_asset`, `dim_location`, `dim_employee`, `dim_date` — all
  already populated by an earlier modeling pass.
- `fact_workorder` — central fact, grain = workorder, joining to dim_asset/dim_employee/
  dim_location/dim_date.

**New silver tables to incorporate:**
- `procurement_purchase_order` (~400 rows; grain = PO line; FKs to companies/item/asset)
- `procurement_inventory_movement` (~1000 rows; grain = movement event; FKs to item/location)
- `reliability_failure_code` (~30 rows; static reference data; PK = failure_code)

**Expected proposal (excerpt):**

```json
{
  "dims": [
    {
      "name": "dim_failure_code",
      "comment": "Reliability/failure classification dimension. Conformed; joinable to fact_workorder and fact_purchase_order.",
      "scd": "type1",
      "natural_key": "failure_code",
      "source_table": "reliability_failure_code",
      "columns": [
        {"name": "failure_code_sk", "type": "bigint"},
        {"name": "failure_code", "type": "string"},
        {"name": "failure_category", "type": "string"},
        {"name": "failure_description", "type": "string"},
        {"name": "severity", "type": "int"},
        {"name": "root_cause_category", "type": "string"},
        {"name": "recommended_action", "type": "string"}
      ],
      "source_columns": [
        {"name": "failure_code", "source": "failure_code"},
        {"name": "failure_category", "source": "failure_category"},
        {"name": "failure_description", "source": "failure_description"},
        {"name": "severity", "source": "severity"},
        {"name": "root_cause_category", "source": "root_cause_category"},
        {"name": "recommended_action", "source": "recommended_action"}
      ]
    }
  ],
  "facts": [
    {
      "name": "fact_purchase_order",
      "grain": "one row per purchase order line",
      "natural_key": "po_id",
      "source_table": "procurement_purchase_order",
      "partition_by": ["po_date_key"],
      "columns": [
        {"name": "po_id", "type": "string"},
        {"name": "vendor_sk", "type": "bigint"},
        {"name": "item_sk", "type": "bigint"},
        {"name": "asset_sk", "type": "bigint"},
        {"name": "po_date_key", "type": "int"},
        {"name": "expected_delivery_date_key", "type": "int"},
        {"name": "actual_delivery_date_key", "type": "int"},
        {"name": "qty", "type": "decimal(10,2)"},
        {"name": "unit_cost", "type": "decimal(12,2)"},
        {"name": "total_cost", "type": "decimal(14,2)"},
        {"name": "status", "type": "string"}
      ],
      "joins": [
        {"dim": "dim_vendor", "alias": "v", "src_col": "vendor_id", "dim_col": "vendor_id", "scd2": false},
        {"dim": "dim_item", "alias": "i", "src_col": "item_id", "dim_col": "item_id", "scd2": false},
        {"dim": "dim_asset", "alias": "a", "src_col": "asset_id", "dim_col": "asset_id", "scd2": true},
        {"dim": "dim_date", "alias": "d", "src_col": "po_date", "dim_col": "date", "scd2": false}
      ]
    },
    {
      "name": "fact_inventory_movement",
      "grain": "one row per stock movement",
      "natural_key": "movement_id",
      "source_table": "procurement_inventory_movement",
      "partition_by": ["movement_date_key"],
      "columns": [
        {"name": "movement_id", "type": "string"},
        {"name": "item_sk", "type": "bigint"},
        {"name": "location_sk", "type": "bigint"},
        {"name": "movement_date_key", "type": "int"},
        {"name": "movement_type", "type": "string"},
        {"name": "qty", "type": "decimal(12,2)"},
        {"name": "unit_cost", "type": "decimal(12,2)"},
        {"name": "reference_doc", "type": "string"}
      ],
      "joins": [
        {"dim": "dim_item", "alias": "i", "src_col": "item_id", "dim_col": "item_id", "scd2": false},
        {"dim": "dim_location", "alias": "l", "src_col": "location_id", "dim_col": "location_id", "scd2": false},
        {"dim": "dim_date", "alias": "d", "src_col": "movement_ts", "dim_col": "date", "scd2": false}
      ]
    }
  ]
}
```

Note: `dim_vendor`, `dim_item`, `dim_asset`, `dim_location`, `dim_date` are NOT in the
`dims[]` array — they already exist. They appear only in the new facts' `joins[]`. The
DDL emitted should `CREATE TABLE IF NOT EXISTS` for `dim_failure_code`,
`fact_purchase_order`, and `fact_inventory_movement` only.

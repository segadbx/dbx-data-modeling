"""
Pre-approval validation for proposal JSON.

Catches LLM contract violations that would otherwise crash `apply_ddl` against the
warehouse — missing natural keys in source_columns, unsourced columns referenced by
MERGE clauses, joins to undeclared dims, name collisions.

Pure functions only — no I/O. The caller passes silver/seed/gold table sets so the
module is trivially unit-testable. Backend wires it into the proposals router via
the `validate` + `report` helpers.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


_AUDIT_COLS = frozenset({"is_current", "scd_start_date", "scd_end_date"})


@dataclass
class ValidationIssue:
    level: str   # "error" | "warning"
    code: str    # short stable identifier (snake_case_upper)
    path: str    # JSON-pointer-ish path into the proposal, e.g. "dims[2].natural_key"
    message: str


def _src_names(item: dict[str, Any]) -> set[str]:
    return {c.get("name") for c in item.get("source_columns") or [] if c.get("name")}


def _is_sk(name: str) -> bool:
    return name.endswith("_sk")


def validate(
    proposal: dict[str, Any],
    silver_tables: set[str] | None = None,
    seed_dim_names: set[str] | None = None,
    existing_gold_tables: set[str] | None = None,
) -> list[ValidationIssue]:
    """Run all rules over a proposal. Returns the issue list (possibly empty).

    Callers that can introspect Unity Catalog pass `silver_tables` / `existing_gold_tables`
    to enable R6 / R7. Pass `None` (the default) to skip those checks.
    """
    issues: list[ValidationIssue] = []
    if not isinstance(proposal, dict) or proposal.get("error"):
        return issues

    dims = proposal.get("dims") or []
    facts = proposal.get("facts") or []
    seed_dim_names = seed_dim_names or set()
    existing_gold_tables = existing_gold_tables or set()

    # Dims declared in THIS proposal (regardless of reused_from_seed) — facts can
    # legitimately join to a dim defined alongside them in the same proposal.
    proposal_dim_names = {d.get("name") for d in dims if d.get("name")}

    # ---- Dim rules -----------------------------------------------------------
    for di, d in enumerate(dims):
        # Reused dims have no DDL → skip column-level rules.
        if d.get("reused_from_seed"):
            continue

        name = d.get("name") or f"<dims[{di}]>"
        nk = d.get("natural_key")
        src = _src_names(d)

        # R2 — natural_key must be sourced
        if not nk:
            issues.append(ValidationIssue(
                level="error", code="DIM_NATURAL_KEY_MISSING",
                path=f"dims[{di}].natural_key",
                message=f"Dim `{name}` has no `natural_key` declared.",
            ))
        elif nk not in src:
            issues.append(ValidationIssue(
                level="error", code="DIM_NATURAL_KEY_NOT_SOURCED",
                path=f"dims[{di}].natural_key",
                message=(
                    f"Dim `{name}`: natural_key `{nk}` is not in source_columns — "
                    f"MERGE `ON` clause cannot bind. Add it to source_columns "
                    f"(source: `{nk}`)."
                ),
            ))

        # R1 — every dim column must be SK, audit, or sourced (else warning)
        for ci, c in enumerate(d.get("columns") or []):
            cname = c.get("name")
            if not cname:
                continue
            if _is_sk(cname) or cname in _AUDIT_COLS or cname in src:
                continue
            issues.append(ValidationIssue(
                level="warning", code="DIM_COLUMN_UNSOURCED",
                path=f"dims[{di}].columns[{ci}].name",
                message=(
                    f"Dim `{name}`: column `{cname}` is not in source_columns; "
                    f"the renderer will fill it with NULL. Either add it to "
                    f"source_columns or remove it from columns."
                ),
            ))

        # R3 — SCD2 change cols must be sourced
        if d.get("scd") == "type2":
            for ci, cc in enumerate(d.get("scd2_change_cols") or []):
                if cc not in src:
                    issues.append(ValidationIssue(
                        level="error", code="DIM_SCD2_CHANGE_COL_NOT_SOURCED",
                        path=f"dims[{di}].scd2_change_cols[{ci}]",
                        message=(
                            f"Dim `{name}`: scd2_change_cols entry `{cc}` is not "
                            f"in source_columns. The change-detection clause "
                            f"would fail to bind."
                        ),
                    ))

        # R7 — silver source table exists (warning, optional)
        if silver_tables is not None and d.get("source_table"):
            st = d["source_table"]
            if st not in silver_tables:
                issues.append(ValidationIssue(
                    level="warning", code="DIM_SOURCE_TABLE_MISSING",
                    path=f"dims[{di}].source_table",
                    message=(
                        f"Dim `{name}`: source_table `{st}` not found in silver. "
                        f"Apply will fail unless this table is created first."
                    ),
                ))

    # ---- Fact rules ----------------------------------------------------------
    for fi, f in enumerate(facts):
        name = f.get("name") or f"<facts[{fi}]>"
        nk = f.get("natural_key")
        src = _src_names(f)

        # R5 — fact natural_key must be sourced
        if not nk:
            issues.append(ValidationIssue(
                level="error", code="FACT_NATURAL_KEY_MISSING",
                path=f"facts[{fi}].natural_key",
                message=f"Fact `{name}` has no `natural_key` declared.",
            ))
        elif nk not in src:
            issues.append(ValidationIssue(
                level="error", code="FACT_NATURAL_KEY_NOT_SOURCED",
                path=f"facts[{fi}].natural_key",
                message=(
                    f"Fact `{name}`: natural_key `{nk}` is not in source_columns — "
                    f"MERGE `ON` clause cannot bind."
                ),
            ))

        # R4 — every fact column must be sourced (fact MERGE uses wildcards)
        for ci, c in enumerate(f.get("columns") or []):
            cname = c.get("name")
            if not cname or cname in src:
                continue
            issues.append(ValidationIssue(
                level="error", code="FACT_COLUMN_UNSOURCED",
                path=f"facts[{fi}].columns[{ci}].name",
                message=(
                    f"Fact `{name}`: column `{cname}` is not in source_columns. "
                    f"The fact MERGE uses INSERT */UPDATE SET * wildcards — "
                    f"unsourced columns crash the apply."
                ),
            ))

        # R6 — fact join dim must be reachable
        for ji, j in enumerate(f.get("joins") or []):
            jdim = j.get("dim")
            if not jdim:
                continue
            if (
                jdim in proposal_dim_names
                or jdim in seed_dim_names
                or jdim in existing_gold_tables
            ):
                continue
            issues.append(ValidationIssue(
                level="error", code="FACT_JOIN_DIM_UNKNOWN",
                path=f"facts[{fi}].joins[{ji}].dim",
                message=(
                    f"Fact `{name}`: join references dim `{jdim}`, which is not in "
                    f"this proposal, not a known seed dim, and not deployed in gold."
                ),
            ))

        # R7 — silver source table exists (warning, optional)
        if silver_tables is not None and f.get("source_table"):
            st = f["source_table"]
            if st not in silver_tables:
                issues.append(ValidationIssue(
                    level="warning", code="FACT_SOURCE_TABLE_MISSING",
                    path=f"facts[{fi}].source_table",
                    message=(
                        f"Fact `{name}`: source_table `{st}` not found in silver."
                    ),
                ))

    # ---- Cross-cutting rules -------------------------------------------------
    # R8 — duplicate names within dims / facts
    for label, items in (("dims", dims), ("facts", facts)):
        seen: dict[str, int] = {}
        for i, x in enumerate(items):
            n = x.get("name")
            if not n:
                continue
            if n in seen:
                issues.append(ValidationIssue(
                    level="error", code="DUPLICATE_NAME",
                    path=f"{label}[{i}].name",
                    message=f"Duplicate name `{n}` (first at {label}[{seen[n]}]).",
                ))
            else:
                seen[n] = i

    return issues


def report(issues: list[ValidationIssue]) -> dict[str, Any]:
    """Wrap an issue list into the API-shaped report."""
    return {
        "ok": not any(i.level == "error" for i in issues),
        "issues": [asdict(i) for i in issues],
    }

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
export default function SchemaDiff({ diff }) {
    return (_jsxs("div", { className: "schema-diff", children: [_jsxs(Section, { title: "Dimensions", children: [diff.dims.added.map((d) => (_jsx(AddedRemovedRow, { role: "added", name: d.name, subline: `${d.columns?.length ?? 0} columns`, dim: d }, `a-dim-${d.name}`))), diff.dims.removed.map((d) => (_jsx(AddedRemovedRow, { role: "removed", name: d.name, subline: `${d.columns?.length ?? 0} columns`, dim: d }, `r-dim-${d.name}`))), diff.dims.modified.map((d) => (_jsx(DimModifiedRow, { diff: d }, `m-dim-${d.name}`))), diff.dims.unchanged.map((n) => (_jsx(UnchangedRow, { name: n }, `u-dim-${n}`))), isDimsEmpty(diff) && _jsx("p", { className: "schema-diff-empty", children: "No dimensions in either proposal." })] }), _jsxs(Section, { title: "Facts", children: [diff.facts.added.map((f) => (_jsx(AddedRemovedRow, { role: "added", name: f.name, subline: f.grain, fact: f }, `a-fact-${f.name}`))), diff.facts.removed.map((f) => (_jsx(AddedRemovedRow, { role: "removed", name: f.name, subline: f.grain, fact: f }, `r-fact-${f.name}`))), diff.facts.modified.map((f) => (_jsx(FactModifiedRow, { diff: f }, `m-fact-${f.name}`))), diff.facts.unchanged.map((n) => (_jsx(UnchangedRow, { name: n }, `u-fact-${n}`))), isFactsEmpty(diff) && _jsx("p", { className: "schema-diff-empty", children: "No facts in either proposal." })] })] }));
}
function Section({ title, children }) {
    return (_jsxs("div", { className: "schema-diff-section", children: [_jsx("h3", { className: "schema-diff-heading", children: title }), _jsx("ul", { className: "schema-diff-list", children: children })] }));
}
function Caret({ open }) {
    return (_jsx("span", { className: "schema-row-caret", "aria-hidden": true, children: open ? _jsx(ChevronDown, {}) : _jsx(ChevronRight, {}) }));
}
function AddedRemovedRow({ role, name, subline, dim, fact, }) {
    const [open, setOpen] = useState(false);
    const cols = dim?.columns ?? fact?.columns ?? [];
    return (_jsxs("li", { className: `schema-row schema-row-${role}`, children: [_jsxs("button", { className: "schema-row-header", onClick: () => setOpen((o) => !o), type: "button", children: [_jsx(RoleGlyph, { role: role }), _jsx("span", { className: "schema-row-name", children: name }), _jsx("span", { className: "schema-row-meta", children: subline }), _jsx(Caret, { open: open })] }), open && (_jsxs("div", { className: "schema-row-body", children: [cols.length > 0 && (_jsxs("div", { className: "schema-row-subsection", children: [_jsx("strong", { children: "Columns" }), _jsxs("table", { className: "schema-cols", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Column" }), _jsx("th", { children: "Type" })] }) }), _jsx("tbody", { children: cols.map((c) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("code", { children: c.name }) }), _jsx("td", { children: _jsx("code", { children: c.type }) })] }, c.name))) })] })] })), fact?.joins && fact.joins.length > 0 && (_jsxs("div", { className: "schema-row-subsection", children: [_jsx("strong", { children: "Joins" }), _jsx("ul", { style: { paddingLeft: 16, listStyle: "disc", fontSize: "var(--text-sm)" }, children: fact.joins.map((j) => (_jsxs("li", { children: [_jsx("code", { children: j.dim }), ": ", j.src_col, " \u2192 ", j.dim_col, j.scd2 ? " (SCD2)" : ""] }, j.dim))) })] }))] }))] }));
}
function DimModifiedRow({ diff }) {
    const [open, setOpen] = useState(true);
    return (_jsxs("li", { className: "schema-row schema-row-modified", children: [_jsxs("button", { className: "schema-row-header", onClick: () => setOpen((o) => !o), type: "button", children: [_jsx(RoleGlyph, { role: "modified" }), _jsx("span", { className: "schema-row-name", children: diff.name }), _jsx("span", { className: "schema-row-meta", children: summarizeDimChanges(diff) }), _jsx(Caret, { open: open })] }), open && (_jsxs("div", { className: "schema-row-body", children: [hasColumnChanges(diff.columns) && _jsx(ColumnDiffTable, { diff: diff.columns }), _jsx(FieldRows, { fields: [
                            ["scd", diff.scd],
                            ["reused_from_seed", diff.reused_from_seed],
                            ["natural_key", diff.natural_key],
                            ["source_table", diff.source_table],
                            ["comment", diff.comment],
                        ] })] }))] }));
}
function FactModifiedRow({ diff }) {
    const [open, setOpen] = useState(true);
    return (_jsxs("li", { className: "schema-row schema-row-modified", children: [_jsxs("button", { className: "schema-row-header", onClick: () => setOpen((o) => !o), type: "button", children: [_jsx(RoleGlyph, { role: "modified" }), _jsx("span", { className: "schema-row-name", children: diff.name }), _jsx("span", { className: "schema-row-meta", children: summarizeFactChanges(diff) }), _jsx(Caret, { open: open })] }), open && (_jsxs("div", { className: "schema-row-body", children: [hasColumnChanges(diff.columns) && _jsx(ColumnDiffTable, { diff: diff.columns }), hasJoinChanges(diff.joins) && _jsx(JoinDiffTable, { diff: diff.joins }), _jsx(FieldRows, { fields: [
                            ["grain", diff.grain],
                            ["natural_key", diff.natural_key],
                            ["source_table", diff.source_table],
                            ["comment", diff.comment],
                        ] })] }))] }));
}
function UnchangedRow({ name }) {
    return (_jsx("li", { className: "schema-row schema-row-unchanged", children: _jsxs("span", { className: "schema-row-header is-static", children: [_jsx(RoleGlyph, { role: "unchanged" }), _jsx("span", { className: "schema-row-name", children: name }), _jsx("span", { className: "schema-row-meta", children: "unchanged" })] }) }));
}
function ColumnDiffTable({ diff }) {
    return (_jsxs("div", { className: "schema-row-subsection", children: [_jsx("strong", { children: "Columns" }), _jsx("table", { className: "schema-cols", children: _jsxs("tbody", { children: [diff.added.map((c) => (_jsxs("tr", { className: "diff-row-added", children: [_jsx("td", { children: _jsx(RoleGlyph, { role: "added" }) }), _jsx("td", { children: _jsx("code", { children: c.name }) }), _jsx("td", { children: _jsx("code", { children: c.type }) })] }, `a-${c.name}`))), diff.removed.map((c) => (_jsxs("tr", { className: "diff-row-removed", children: [_jsx("td", { children: _jsx(RoleGlyph, { role: "removed" }) }), _jsx("td", { children: _jsx("code", { children: c.name }) }), _jsx("td", { children: _jsx("code", { children: c.type }) })] }, `r-${c.name}`))), diff.modified.map((c) => (_jsxs("tr", { className: "diff-row-modified", children: [_jsx("td", { children: _jsx(RoleGlyph, { role: "modified" }) }), _jsx("td", { children: _jsx("code", { children: c.name }) }), _jsxs("td", { children: [_jsx("code", { children: c.from }), " \u2192 ", _jsx("code", { children: c.to })] })] }, `m-${c.name}`)))] }) })] }));
}
function JoinDiffTable({ diff }) {
    return (_jsxs("div", { className: "schema-row-subsection", children: [_jsx("strong", { children: "Joins" }), _jsx("table", { className: "schema-cols", children: _jsxs("tbody", { children: [diff.added.map((j) => (_jsxs("tr", { className: "diff-row-added", children: [_jsx("td", { children: _jsx(RoleGlyph, { role: "added" }) }), _jsx("td", { children: _jsx("code", { children: j.dim }) }), _jsxs("td", { children: [j.src_col, " \u2192 ", j.dim_col, j.scd2 ? " (SCD2)" : ""] })] }, `a-${j.dim}`))), diff.removed.map((j) => (_jsxs("tr", { className: "diff-row-removed", children: [_jsx("td", { children: _jsx(RoleGlyph, { role: "removed" }) }), _jsx("td", { children: _jsx("code", { children: j.dim }) }), _jsxs("td", { children: [j.src_col, " \u2192 ", j.dim_col, j.scd2 ? " (SCD2)" : ""] })] }, `r-${j.dim}`))), diff.modified.map((m) => (_jsxs("tr", { className: "diff-row-modified", children: [_jsx("td", { children: _jsx(RoleGlyph, { role: "modified" }) }), _jsx("td", { children: _jsx("code", { children: m.dim }) }), _jsxs("td", { children: [_jsxs("code", { children: [m.before.src_col, " \u2192 ", m.before.dim_col] }), " ", "\u21D2 ", _jsxs("code", { children: [m.after.src_col, " \u2192 ", m.after.dim_col] })] })] }, `m-${m.dim}`)))] }) })] }));
}
function FieldRows({ fields, }) {
    const present = fields.filter(([, v]) => !!v);
    if (present.length === 0)
        return null;
    return (_jsxs("div", { className: "schema-row-subsection", children: [_jsx("strong", { children: "Fields" }), _jsx("table", { className: "schema-cols", children: _jsx("tbody", { children: present.map(([k, v]) => (_jsxs("tr", { className: "diff-row-modified", children: [_jsx("td", { children: k }), _jsxs("td", { children: [_jsx("code", { children: String(v.from ?? "—") }), " \u2192 ", _jsx("code", { children: String(v.to ?? "—") })] })] }, k))) }) })] }));
}
function RoleGlyph({ role }) {
    const map = {
        added: { ch: "+", cls: "glyph-added", title: "added in B" },
        removed: { ch: "−", cls: "glyph-removed", title: "removed (only in A)" },
        modified: { ch: "~", cls: "glyph-modified", title: "modified" },
        unchanged: { ch: "=", cls: "glyph-unchanged", title: "unchanged" },
    };
    const x = map[role];
    return _jsx("span", { className: `schema-glyph ${x.cls}`, title: x.title, children: x.ch });
}
function hasColumnChanges(c) {
    return c.added.length + c.removed.length + c.modified.length > 0;
}
function hasJoinChanges(j) {
    return j.added.length + j.removed.length + j.modified.length > 0;
}
function summarizeDimChanges(d) {
    const parts = [];
    if (d.columns.added.length)
        parts.push(`+${d.columns.added.length} col`);
    if (d.columns.removed.length)
        parts.push(`−${d.columns.removed.length} col`);
    if (d.columns.modified.length)
        parts.push(`~${d.columns.modified.length} col`);
    if (d.scd)
        parts.push("scd");
    if (d.reused_from_seed)
        parts.push("reused");
    if (d.natural_key)
        parts.push("nk");
    if (d.source_table)
        parts.push("src");
    if (d.comment)
        parts.push("comment");
    return parts.join(" · ");
}
function summarizeFactChanges(f) {
    const parts = [];
    if (f.columns.added.length)
        parts.push(`+${f.columns.added.length} col`);
    if (f.columns.removed.length)
        parts.push(`−${f.columns.removed.length} col`);
    if (f.columns.modified.length)
        parts.push(`~${f.columns.modified.length} col`);
    if (f.joins.added.length)
        parts.push(`+${f.joins.added.length} join`);
    if (f.joins.removed.length)
        parts.push(`−${f.joins.removed.length} join`);
    if (f.joins.modified.length)
        parts.push(`~${f.joins.modified.length} join`);
    if (f.grain)
        parts.push("grain");
    if (f.natural_key)
        parts.push("nk");
    if (f.source_table)
        parts.push("src");
    if (f.comment)
        parts.push("comment");
    return parts.join(" · ");
}
function isDimsEmpty(d) {
    const x = d.dims;
    return x.added.length + x.removed.length + x.modified.length + x.unchanged.length === 0;
}
function isFactsEmpty(d) {
    const x = d.facts;
    return x.added.length + x.removed.length + x.modified.length + x.unchanged.length === 0;
}

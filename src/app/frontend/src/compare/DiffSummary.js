import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Badge } from "../ui/Badge";
export default function DiffSummary({ diff }) {
    const d = diff.dims;
    const f = diff.facts;
    const noDiff = d.added.length + d.removed.length + d.modified.length +
        f.added.length + f.removed.length + f.modified.length === 0;
    return (_jsxs("div", { className: "diff-summary", children: [_jsx("span", { className: "diff-summary-label", children: "Summary" }), _jsxs(Group, { label: "Dimensions", children: [_jsx(Chip, { kind: "added", n: d.added.length }), _jsx(Chip, { kind: "removed", n: d.removed.length }), _jsx(Chip, { kind: "modified", n: d.modified.length }), _jsx(Chip, { kind: "unchanged", n: d.unchanged.length })] }), _jsxs(Group, { label: "Facts", children: [_jsx(Chip, { kind: "added", n: f.added.length }), _jsx(Chip, { kind: "removed", n: f.removed.length }), _jsx(Chip, { kind: "modified", n: f.modified.length }), _jsx(Chip, { kind: "unchanged", n: f.unchanged.length })] }), (diff.meta.catalog || diff.meta.schema) && (_jsxs(Group, { label: "Namespace", children: [diff.meta.catalog && (_jsxs("span", { className: "diff-meta", children: ["catalog: ", _jsx("code", { children: String(diff.meta.catalog.from ?? "—") }), " \u2192 ", _jsx("code", { children: String(diff.meta.catalog.to ?? "—") })] })), diff.meta.schema && (_jsxs("span", { className: "diff-meta", children: ["schema: ", _jsx("code", { children: String(diff.meta.schema.from ?? "—") }), " \u2192 ", _jsx("code", { children: String(diff.meta.schema.to ?? "—") })] }))] })), noDiff && _jsx("span", { className: "diff-summary-empty", children: "No structural differences" })] }));
}
function Group({ label, children }) {
    return (_jsxs("span", { className: "diff-summary-group", children: [_jsx("span", { className: "diff-summary-group-label", children: label }), children] }));
}
const TONE_MAP = {
    added: "success",
    removed: "danger",
    modified: "warning",
    unchanged: "neutral",
};
const PREFIX = { added: "+", removed: "−", modified: "~", unchanged: "=" };
function Chip({ kind, n }) {
    if (n === 0)
        return null;
    return (_jsxs(Badge, { tone: TONE_MAP[kind], square: true, children: [PREFIX[kind], n] }));
}

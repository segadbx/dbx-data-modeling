import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Handle, Position } from "reactflow";
// ── Custom React Flow node types ────────────────────────────────────────────
function roleClass(role) {
    if (!role || role === "unchanged")
        return "";
    return ` rf-node-role-${role}`;
}
function RoleGlyph({ role }) {
    if (!role || role === "unchanged")
        return null;
    const map = {
        added: { ch: "+", cls: "rf-node-glyph-added", title: "added" },
        removed: { ch: "−", cls: "rf-node-glyph-removed", title: "removed" },
        modified: { ch: "~", cls: "rf-node-glyph-modified", title: "modified" },
        ghost: { ch: "·", cls: "rf-node-glyph-ghost", title: "exists on the other side" },
        unchanged: { ch: "", cls: "", title: "" },
    };
    const x = map[role];
    if (!x.ch)
        return null;
    return (_jsx("span", { className: `rf-node-glyph ${x.cls}`, title: x.title, "aria-hidden": true, children: x.ch }));
}
export function FactRfNode({ data }) {
    return (_jsxs("div", { className: `rf-node rf-node-fact${roleClass(data.role)}`, children: [_jsx(Handle, { type: "source", position: Position.Left, style: { visibility: "hidden" } }), _jsx(Handle, { type: "source", position: Position.Right, style: { visibility: "hidden" } }), _jsxs("div", { className: "rf-node-head", children: [_jsx("span", { children: "FACT" }), _jsx(RoleGlyph, { role: data.role })] }), _jsxs("div", { className: "rf-node-body", children: [_jsx("div", { className: "rf-node-name", children: data.name }), _jsx("div", { className: "rf-node-sub", children: data.grain || "—" })] })] }));
}
export function DimRfNode({ data }) {
    const { dim, role } = data;
    const reused = !!dim.reused_from_seed;
    const variant = reused ? "rf-node-dim-reused" : "rf-node-dim-new";
    return (_jsxs("div", { className: `rf-node ${variant}${roleClass(role)}`, children: [_jsx(Handle, { type: "target", position: Position.Right, style: { visibility: "hidden" } }), _jsx(Handle, { type: "target", position: Position.Left, style: { visibility: "hidden" } }), _jsxs("div", { className: "rf-node-head", children: [_jsx("span", { children: reused ? "REUSED" : "NEW DIM" }), _jsx(RoleGlyph, { role: role })] }), _jsxs("div", { className: "rf-node-body", children: [_jsx("div", { className: "rf-node-name", children: dim.name }), dim.scd && _jsxs("div", { className: "rf-node-sub", children: ["SCD ", dim.scd] })] })] }));
}
export const nodeTypes = {
    fact: FactRfNode,
    dim: DimRfNode,
};
const FACT_X = 420;
const DIM_LEFT_X = 60;
const DIM_RIGHT_X = 780;
const ROW_H = 150;
const DIM_ROW_H = 130;
export function buildGraph({ proposal, roles, ghostFacts = [], ghostDims = [], }) {
    const nodes = [];
    const edges = [];
    const m = proposal.model;
    const facts = m.facts ?? [];
    const dims = m.dims ?? [];
    facts.forEach((f, idx) => {
        nodes.push({
            id: `fact:${f.name}`,
            type: "fact",
            position: { x: FACT_X, y: 60 + idx * ROW_H },
            data: { name: f.name, grain: f.grain, role: roles?.[`fact:${f.name}`], columnsCount: f.columns?.length ?? 0 },
        });
    });
    ghostFacts.forEach((f, idx) => {
        const id = `fact:${f.name}`;
        if (nodes.some((n) => n.id === id))
            return;
        nodes.push({
            id,
            type: "fact",
            position: { x: FACT_X, y: 60 + (facts.length + idx) * ROW_H },
            data: { name: f.name, grain: f.grain, role: "ghost", columnsCount: f.columns?.length ?? 0 },
        });
    });
    dims.forEach((d, idx) => {
        nodes.push({
            id: `dim:${d.name}`,
            type: "dim",
            position: {
                x: idx % 2 === 0 ? DIM_LEFT_X : DIM_RIGHT_X,
                y: 40 + Math.floor(idx / 2) * DIM_ROW_H,
            },
            data: { dim: d, role: roles?.[`dim:${d.name}`] },
        });
    });
    ghostDims.forEach((d, idx) => {
        const id = `dim:${d.name}`;
        if (nodes.some((n) => n.id === id))
            return;
        const startIdx = dims.length + idx;
        nodes.push({
            id,
            type: "dim",
            position: {
                x: startIdx % 2 === 0 ? DIM_LEFT_X : DIM_RIGHT_X,
                y: 40 + Math.floor(startIdx / 2) * DIM_ROW_H,
            },
            data: { dim: d, role: "ghost" },
        });
    });
    facts.forEach((f) => {
        (f.joins ?? []).forEach((j) => {
            const style = { stroke: "var(--text-quaternary)" };
            const reused = dims.find((d) => d.name === j.dim)?.reused_from_seed;
            if (reused)
                style.stroke = "var(--success)";
            edges.push({
                id: `${f.name}->${j.dim}`,
                source: `fact:${f.name}`,
                target: `dim:${j.dim}`,
                label: `${j.src_col} → ${j.dim_col}`,
                labelBgPadding: [6, 3],
                labelBgBorderRadius: 4,
                labelBgStyle: { fill: "#ffffff", stroke: "var(--border-default)" },
                style,
                animated: false,
            });
        });
    });
    return { nodes, edges };
}

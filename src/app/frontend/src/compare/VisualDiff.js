import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import ReactFlow, { Background, BackgroundVariant, Controls } from "reactflow";
import "reactflow/dist/style.css";
import { buildGraph, nodeTypes } from "./graph";
import { nodeRoles } from "./diff";
import { StatusPill } from "../ui/StatusPill";
export default function VisualDiff({ a, b, diff, }) {
    const left = useMemo(() => {
        const roles = nodeRoles(diff, "A");
        return buildGraph({
            proposal: a,
            roles,
            ghostFacts: diff.facts.added,
            ghostDims: diff.dims.added,
        });
    }, [a, diff]);
    const right = useMemo(() => {
        const roles = nodeRoles(diff, "B");
        return buildGraph({
            proposal: b,
            roles,
            ghostFacts: diff.facts.removed,
            ghostDims: diff.dims.removed,
        });
    }, [b, diff]);
    return (_jsxs("div", { className: "visual-diff", children: [_jsxs("div", { className: "visual-diff-pane", children: [_jsxs("div", { className: "visual-diff-header", children: [_jsx("span", { children: "A" }), _jsxs("span", { style: { color: "var(--text-tertiary)" }, children: ["\u00B7 v", a.version] }), _jsx(StatusPill, { status: a.status })] }), _jsx("div", { className: "visual-diff-canvas", children: _jsxs(ReactFlow, { nodes: left.nodes, edges: left.edges, nodeTypes: nodeTypes, fitView: true, fitViewOptions: { padding: 0.2 }, nodesDraggable: false, nodesConnectable: false, elementsSelectable: true, proOptions: { hideAttribution: true }, children: [_jsx(Background, { variant: BackgroundVariant.Dots, gap: 20, size: 1.2, color: "#dadde2" }), _jsx(Controls, { showInteractive: false })] }) })] }), _jsxs("div", { className: "visual-diff-pane", children: [_jsxs("div", { className: "visual-diff-header", children: [_jsx("span", { children: "B" }), _jsxs("span", { style: { color: "var(--text-tertiary)" }, children: ["\u00B7 v", b.version] }), _jsx(StatusPill, { status: b.status })] }), _jsx("div", { className: "visual-diff-canvas", children: _jsxs(ReactFlow, { nodes: right.nodes, edges: right.edges, nodeTypes: nodeTypes, fitView: true, fitViewOptions: { padding: 0.2 }, nodesDraggable: false, nodesConnectable: false, elementsSelectable: true, proOptions: { hideAttribution: true }, children: [_jsx(Background, { variant: BackgroundVariant.Dots, gap: 20, size: 1.2, color: "#dadde2" }), _jsx(Controls, { showInteractive: false })] }) })] }), _jsx(Legend, {})] }));
}
function Legend() {
    return (_jsxs("div", { className: "visual-diff-legend", children: [_jsx(LegendDot, { color: "#10b981", bg: "#dcfce7", label: "added (only in B)" }), _jsx(LegendDot, { color: "#ef4444", bg: "#fee2e2", label: "removed (only in A)" }), _jsx(LegendDot, { color: "#f59e0b", bg: "transparent", label: "modified" }), _jsx(LegendDot, { color: "#d1d5db", bg: "#f9fafb", label: "ghost (placeholder)" }), _jsx(LegendDot, { color: "#9ca3af", bg: "transparent", label: "unchanged" })] }));
}
function LegendDot({ color, bg, label }) {
    return (_jsxs("span", { className: "visual-diff-legend-item", children: [_jsx("span", { className: "visual-diff-legend-swatch", style: { borderColor: color, background: bg } }), label] }));
}

import type { CSSProperties } from "react";
import { Handle, Position, type Edge, type Node } from "reactflow";
import type { Proposal, ProposalDim, ProposalFact } from "../api/client";

export type DiffRole = "added" | "removed" | "modified" | "unchanged" | "ghost";

export type NodeRoles = Record<string, DiffRole>;

type FactNodeData = { name: string; grain: string; role?: DiffRole; columnsCount: number };
type DimNodeData = { dim: ProposalDim; role?: DiffRole };

// ── Custom React Flow node types ────────────────────────────────────────────
function roleClass(role?: DiffRole): string {
  if (!role || role === "unchanged") return "";
  return ` rf-node-role-${role}`;
}

function RoleGlyph({ role }: { role?: DiffRole }) {
  if (!role || role === "unchanged") return null;
  const map: Record<DiffRole, { ch: string; cls: string; title: string }> = {
    added:    { ch: "+", cls: "rf-node-glyph-added",    title: "added" },
    removed:  { ch: "−", cls: "rf-node-glyph-removed",  title: "removed" },
    modified: { ch: "~", cls: "rf-node-glyph-modified", title: "modified" },
    ghost:    { ch: "·", cls: "rf-node-glyph-ghost",    title: "exists on the other side" },
    unchanged:{ ch: "",  cls: "",                       title: "" },
  };
  const x = map[role];
  if (!x.ch) return null;
  return (
    <span className={`rf-node-glyph ${x.cls}`} title={x.title} aria-hidden>
      {x.ch}
    </span>
  );
}

export function FactRfNode({ data }: { data: FactNodeData }) {
  return (
    <div className={`rf-node rf-node-fact${roleClass(data.role)}`}>
      <Handle type="source" position={Position.Left} style={{ visibility: "hidden" }} />
      <Handle type="source" position={Position.Right} style={{ visibility: "hidden" }} />
      <div className="rf-node-head">
        <span>FACT</span>
        <RoleGlyph role={data.role} />
      </div>
      <div className="rf-node-body">
        <div className="rf-node-name">{data.name}</div>
        <div className="rf-node-sub">{data.grain || "—"}</div>
      </div>
    </div>
  );
}

export function DimRfNode({ data }: { data: DimNodeData }) {
  const { dim, role } = data;
  const reused = !!dim.reused_from_seed;
  const variant = reused ? "rf-node-dim-reused" : "rf-node-dim-new";
  return (
    <div className={`rf-node ${variant}${roleClass(role)}`}>
      <Handle type="target" position={Position.Right} style={{ visibility: "hidden" }} />
      <Handle type="target" position={Position.Left} style={{ visibility: "hidden" }} />
      <div className="rf-node-head">
        <span>{reused ? "REUSED" : "NEW DIM"}</span>
        <RoleGlyph role={role} />
      </div>
      <div className="rf-node-body">
        <div className="rf-node-name">{dim.name}</div>
        {dim.scd && <div className="rf-node-sub">SCD {dim.scd}</div>}
      </div>
    </div>
  );
}

export const nodeTypes = {
  fact: FactRfNode,
  dim: DimRfNode,
};

// ── Graph builder ───────────────────────────────────────────────────────────
export type GraphInputs = {
  proposal: Proposal;
  roles?: NodeRoles;
  ghostFacts?: ProposalFact[];
  ghostDims?: ProposalDim[];
};

const FACT_X = 420;
const DIM_LEFT_X = 60;
const DIM_RIGHT_X = 780;
const ROW_H = 150;
const DIM_ROW_H = 130;

export function buildGraph({
  proposal,
  roles,
  ghostFacts = [],
  ghostDims = [],
}: GraphInputs): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
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
    if (nodes.some((n) => n.id === id)) return;
    nodes.push({
      id,
      type: "fact",
      position: { x: FACT_X, y: 60 + (facts.length + idx) * ROW_H },
      data: { name: f.name, grain: f.grain, role: "ghost" as DiffRole, columnsCount: f.columns?.length ?? 0 },
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
    if (nodes.some((n) => n.id === id)) return;
    const startIdx = dims.length + idx;
    nodes.push({
      id,
      type: "dim",
      position: {
        x: startIdx % 2 === 0 ? DIM_LEFT_X : DIM_RIGHT_X,
        y: 40 + Math.floor(startIdx / 2) * DIM_ROW_H,
      },
      data: { dim: d, role: "ghost" as DiffRole },
    });
  });

  facts.forEach((f) => {
    (f.joins ?? []).forEach((j) => {
      const style: CSSProperties = { stroke: "var(--text-quaternary)" };
      const reused = dims.find((d) => d.name === j.dim)?.reused_from_seed;
      if (reused) style.stroke = "var(--success)";
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

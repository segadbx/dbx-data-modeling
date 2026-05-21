import { useMemo } from "react";
import ReactFlow, { Background, BackgroundVariant, Controls } from "reactflow";
import "reactflow/dist/style.css";
import type { Proposal } from "../api/client";
import { buildGraph, nodeTypes } from "./graph";
import { nodeRoles, type ProposalDiff } from "./diff";
import { StatusPill } from "../ui/StatusPill";

export default function VisualDiff({
  a,
  b,
  diff,
}: {
  a: Proposal;
  b: Proposal;
  diff: ProposalDiff;
}) {
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

  return (
    <div className="visual-diff">
      <div className="visual-diff-pane">
        <div className="visual-diff-header">
          <span>A</span>
          <span style={{ color: "var(--text-tertiary)" }}>· v{a.version}</span>
          <StatusPill status={a.status} />
        </div>
        <div className="visual-diff-canvas">
          <ReactFlow
            nodes={left.nodes}
            edges={left.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#dadde2" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
      <div className="visual-diff-pane">
        <div className="visual-diff-header">
          <span>B</span>
          <span style={{ color: "var(--text-tertiary)" }}>· v{b.version}</span>
          <StatusPill status={b.status} />
        </div>
        <div className="visual-diff-canvas">
          <ReactFlow
            nodes={right.nodes}
            edges={right.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#dadde2" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="visual-diff-legend">
      <LegendDot color="#10b981" bg="#dcfce7" label="added (only in B)" />
      <LegendDot color="#ef4444" bg="#fee2e2" label="removed (only in A)" />
      <LegendDot color="#f59e0b" bg="transparent" label="modified" />
      <LegendDot color="#d1d5db" bg="#f9fafb" label="ghost (placeholder)" />
      <LegendDot color="#9ca3af" bg="transparent" label="unchanged" />
    </div>
  );
}

function LegendDot({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span className="visual-diff-legend-item">
      <span
        className="visual-diff-legend-swatch"
        style={{ borderColor: color, background: bg }}
      />
      {label}
    </span>
  );
}

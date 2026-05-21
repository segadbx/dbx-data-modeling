import { Badge } from "../ui/Badge";
import type { ProposalDiff } from "./diff";

export default function DiffSummary({ diff }: { diff: ProposalDiff }) {
  const d = diff.dims;
  const f = diff.facts;
  const noDiff =
    d.added.length + d.removed.length + d.modified.length +
    f.added.length + f.removed.length + f.modified.length === 0;

  return (
    <div className="diff-summary">
      <span className="diff-summary-label">Summary</span>
      <Group label="Dimensions">
        <Chip kind="added" n={d.added.length} />
        <Chip kind="removed" n={d.removed.length} />
        <Chip kind="modified" n={d.modified.length} />
        <Chip kind="unchanged" n={d.unchanged.length} />
      </Group>
      <Group label="Facts">
        <Chip kind="added" n={f.added.length} />
        <Chip kind="removed" n={f.removed.length} />
        <Chip kind="modified" n={f.modified.length} />
        <Chip kind="unchanged" n={f.unchanged.length} />
      </Group>
      {(diff.meta.catalog || diff.meta.schema) && (
        <Group label="Namespace">
          {diff.meta.catalog && (
            <span className="diff-meta">
              catalog: <code>{String(diff.meta.catalog.from ?? "—")}</code> → <code>{String(diff.meta.catalog.to ?? "—")}</code>
            </span>
          )}
          {diff.meta.schema && (
            <span className="diff-meta">
              schema: <code>{String(diff.meta.schema.from ?? "—")}</code> → <code>{String(diff.meta.schema.to ?? "—")}</code>
            </span>
          )}
        </Group>
      )}
      {noDiff && <span className="diff-summary-empty">No structural differences</span>}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="diff-summary-group">
      <span className="diff-summary-group-label">{label}</span>
      {children}
    </span>
  );
}

const TONE_MAP = {
  added: "success",
  removed: "danger",
  modified: "warning",
  unchanged: "neutral",
} as const;

const PREFIX = { added: "+", removed: "−", modified: "~", unchanged: "=" } as const;

function Chip({ kind, n }: { kind: "added" | "removed" | "modified" | "unchanged"; n: number }) {
  if (n === 0) return null;
  return (
    <Badge tone={TONE_MAP[kind]} square>
      {PREFIX[kind]}{n}
    </Badge>
  );
}

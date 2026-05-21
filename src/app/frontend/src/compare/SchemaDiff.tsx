import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  ColumnDiff,
  DimDiff,
  FactDiff,
  JoinDiff,
  ProposalDiff,
} from "./diff";
import type { ProposalDim, ProposalFact } from "../api/client";

type Role = "added" | "removed" | "modified" | "unchanged";

export default function SchemaDiff({ diff }: { diff: ProposalDiff }) {
  return (
    <div className="schema-diff">
      <Section title="Dimensions">
        {diff.dims.added.map((d) => (
          <AddedRemovedRow key={`a-dim-${d.name}`} role="added" name={d.name} subline={`${d.columns?.length ?? 0} columns`} dim={d} />
        ))}
        {diff.dims.removed.map((d) => (
          <AddedRemovedRow key={`r-dim-${d.name}`} role="removed" name={d.name} subline={`${d.columns?.length ?? 0} columns`} dim={d} />
        ))}
        {diff.dims.modified.map((d) => (
          <DimModifiedRow key={`m-dim-${d.name}`} diff={d} />
        ))}
        {diff.dims.unchanged.map((n) => (
          <UnchangedRow key={`u-dim-${n}`} name={n} />
        ))}
        {isDimsEmpty(diff) && <p className="schema-diff-empty">No dimensions in either proposal.</p>}
      </Section>

      <Section title="Facts">
        {diff.facts.added.map((f) => (
          <AddedRemovedRow key={`a-fact-${f.name}`} role="added" name={f.name} subline={f.grain} fact={f} />
        ))}
        {diff.facts.removed.map((f) => (
          <AddedRemovedRow key={`r-fact-${f.name}`} role="removed" name={f.name} subline={f.grain} fact={f} />
        ))}
        {diff.facts.modified.map((f) => (
          <FactModifiedRow key={`m-fact-${f.name}`} diff={f} />
        ))}
        {diff.facts.unchanged.map((n) => (
          <UnchangedRow key={`u-fact-${n}`} name={n} />
        ))}
        {isFactsEmpty(diff) && <p className="schema-diff-empty">No facts in either proposal.</p>}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="schema-diff-section">
      <h3 className="schema-diff-heading">{title}</h3>
      <ul className="schema-diff-list">{children}</ul>
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <span className="schema-row-caret" aria-hidden>
      {open ? <ChevronDown /> : <ChevronRight />}
    </span>
  );
}

function AddedRemovedRow({
  role,
  name,
  subline,
  dim,
  fact,
}: {
  role: Role;
  name: string;
  subline: string | undefined;
  dim?: ProposalDim;
  fact?: ProposalFact;
}) {
  const [open, setOpen] = useState(false);
  const cols = dim?.columns ?? fact?.columns ?? [];
  return (
    <li className={`schema-row schema-row-${role}`}>
      <button className="schema-row-header" onClick={() => setOpen((o) => !o)} type="button">
        <RoleGlyph role={role} />
        <span className="schema-row-name">{name}</span>
        <span className="schema-row-meta">{subline}</span>
        <Caret open={open} />
      </button>
      {open && (
        <div className="schema-row-body">
          {cols.length > 0 && (
            <div className="schema-row-subsection">
              <strong>Columns</strong>
              <table className="schema-cols">
                <thead><tr><th>Column</th><th>Type</th></tr></thead>
                <tbody>
                  {cols.map((c) => (
                    <tr key={c.name}>
                      <td><code>{c.name}</code></td>
                      <td><code>{c.type}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {fact?.joins && fact.joins.length > 0 && (
            <div className="schema-row-subsection">
              <strong>Joins</strong>
              <ul style={{ paddingLeft: 16, listStyle: "disc", fontSize: "var(--text-sm)" }}>
                {fact.joins.map((j) => (
                  <li key={j.dim}><code>{j.dim}</code>: {j.src_col} → {j.dim_col}{j.scd2 ? " (SCD2)" : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function DimModifiedRow({ diff }: { diff: DimDiff }) {
  const [open, setOpen] = useState(true);
  return (
    <li className="schema-row schema-row-modified">
      <button className="schema-row-header" onClick={() => setOpen((o) => !o)} type="button">
        <RoleGlyph role="modified" />
        <span className="schema-row-name">{diff.name}</span>
        <span className="schema-row-meta">{summarizeDimChanges(diff)}</span>
        <Caret open={open} />
      </button>
      {open && (
        <div className="schema-row-body">
          {hasColumnChanges(diff.columns) && <ColumnDiffTable diff={diff.columns} />}
          <FieldRows
            fields={[
              ["scd", diff.scd],
              ["reused_from_seed", diff.reused_from_seed],
              ["natural_key", diff.natural_key],
              ["source_table", diff.source_table],
              ["comment", diff.comment],
            ]}
          />
        </div>
      )}
    </li>
  );
}

function FactModifiedRow({ diff }: { diff: FactDiff }) {
  const [open, setOpen] = useState(true);
  return (
    <li className="schema-row schema-row-modified">
      <button className="schema-row-header" onClick={() => setOpen((o) => !o)} type="button">
        <RoleGlyph role="modified" />
        <span className="schema-row-name">{diff.name}</span>
        <span className="schema-row-meta">{summarizeFactChanges(diff)}</span>
        <Caret open={open} />
      </button>
      {open && (
        <div className="schema-row-body">
          {hasColumnChanges(diff.columns) && <ColumnDiffTable diff={diff.columns} />}
          {hasJoinChanges(diff.joins) && <JoinDiffTable diff={diff.joins} />}
          <FieldRows
            fields={[
              ["grain", diff.grain],
              ["natural_key", diff.natural_key],
              ["source_table", diff.source_table],
              ["comment", diff.comment],
            ]}
          />
        </div>
      )}
    </li>
  );
}

function UnchangedRow({ name }: { name: string }) {
  return (
    <li className="schema-row schema-row-unchanged">
      <span className="schema-row-header is-static">
        <RoleGlyph role="unchanged" />
        <span className="schema-row-name">{name}</span>
        <span className="schema-row-meta">unchanged</span>
      </span>
    </li>
  );
}

function ColumnDiffTable({ diff }: { diff: ColumnDiff }) {
  return (
    <div className="schema-row-subsection">
      <strong>Columns</strong>
      <table className="schema-cols">
        <tbody>
          {diff.added.map((c) => (
            <tr key={`a-${c.name}`} className="diff-row-added">
              <td><RoleGlyph role="added" /></td>
              <td><code>{c.name}</code></td>
              <td><code>{c.type}</code></td>
            </tr>
          ))}
          {diff.removed.map((c) => (
            <tr key={`r-${c.name}`} className="diff-row-removed">
              <td><RoleGlyph role="removed" /></td>
              <td><code>{c.name}</code></td>
              <td><code>{c.type}</code></td>
            </tr>
          ))}
          {diff.modified.map((c) => (
            <tr key={`m-${c.name}`} className="diff-row-modified">
              <td><RoleGlyph role="modified" /></td>
              <td><code>{c.name}</code></td>
              <td><code>{c.from}</code> → <code>{c.to}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JoinDiffTable({ diff }: { diff: JoinDiff }) {
  return (
    <div className="schema-row-subsection">
      <strong>Joins</strong>
      <table className="schema-cols">
        <tbody>
          {diff.added.map((j) => (
            <tr key={`a-${j.dim}`} className="diff-row-added">
              <td><RoleGlyph role="added" /></td>
              <td><code>{j.dim}</code></td>
              <td>{j.src_col} → {j.dim_col}{j.scd2 ? " (SCD2)" : ""}</td>
            </tr>
          ))}
          {diff.removed.map((j) => (
            <tr key={`r-${j.dim}`} className="diff-row-removed">
              <td><RoleGlyph role="removed" /></td>
              <td><code>{j.dim}</code></td>
              <td>{j.src_col} → {j.dim_col}{j.scd2 ? " (SCD2)" : ""}</td>
            </tr>
          ))}
          {diff.modified.map((m) => (
            <tr key={`m-${m.dim}`} className="diff-row-modified">
              <td><RoleGlyph role="modified" /></td>
              <td><code>{m.dim}</code></td>
              <td>
                <code>{m.before.src_col} → {m.before.dim_col}</code>{" "}
                ⇒ <code>{m.after.src_col} → {m.after.dim_col}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldRows({
  fields,
}: {
  fields: [string, { from: unknown; to: unknown } | undefined][];
}) {
  const present = fields.filter(([, v]) => !!v);
  if (present.length === 0) return null;
  return (
    <div className="schema-row-subsection">
      <strong>Fields</strong>
      <table className="schema-cols">
        <tbody>
          {present.map(([k, v]) => (
            <tr key={k} className="diff-row-modified">
              <td>{k}</td>
              <td>
                <code>{String(v!.from ?? "—")}</code> → <code>{String(v!.to ?? "—")}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleGlyph({ role }: { role: Role }) {
  const map: Record<Role, { ch: string; cls: string; title: string }> = {
    added: { ch: "+", cls: "glyph-added", title: "added in B" },
    removed: { ch: "−", cls: "glyph-removed", title: "removed (only in A)" },
    modified: { ch: "~", cls: "glyph-modified", title: "modified" },
    unchanged: { ch: "=", cls: "glyph-unchanged", title: "unchanged" },
  };
  const x = map[role];
  return <span className={`schema-glyph ${x.cls}`} title={x.title}>{x.ch}</span>;
}

function hasColumnChanges(c: ColumnDiff) {
  return c.added.length + c.removed.length + c.modified.length > 0;
}
function hasJoinChanges(j: JoinDiff) {
  return j.added.length + j.removed.length + j.modified.length > 0;
}

function summarizeDimChanges(d: DimDiff): string {
  const parts: string[] = [];
  if (d.columns.added.length) parts.push(`+${d.columns.added.length} col`);
  if (d.columns.removed.length) parts.push(`−${d.columns.removed.length} col`);
  if (d.columns.modified.length) parts.push(`~${d.columns.modified.length} col`);
  if (d.scd) parts.push("scd");
  if (d.reused_from_seed) parts.push("reused");
  if (d.natural_key) parts.push("nk");
  if (d.source_table) parts.push("src");
  if (d.comment) parts.push("comment");
  return parts.join(" · ");
}

function summarizeFactChanges(f: FactDiff): string {
  const parts: string[] = [];
  if (f.columns.added.length) parts.push(`+${f.columns.added.length} col`);
  if (f.columns.removed.length) parts.push(`−${f.columns.removed.length} col`);
  if (f.columns.modified.length) parts.push(`~${f.columns.modified.length} col`);
  if (f.joins.added.length) parts.push(`+${f.joins.added.length} join`);
  if (f.joins.removed.length) parts.push(`−${f.joins.removed.length} join`);
  if (f.joins.modified.length) parts.push(`~${f.joins.modified.length} join`);
  if (f.grain) parts.push("grain");
  if (f.natural_key) parts.push("nk");
  if (f.source_table) parts.push("src");
  if (f.comment) parts.push("comment");
  return parts.join(" · ");
}

function isDimsEmpty(d: ProposalDiff) {
  const x = d.dims;
  return x.added.length + x.removed.length + x.modified.length + x.unchanged.length === 0;
}
function isFactsEmpty(d: ProposalDiff) {
  const x = d.facts;
  return x.added.length + x.removed.length + x.modified.length + x.unchanged.length === 0;
}

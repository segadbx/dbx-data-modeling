import type {
  Proposal,
  ProposalDim,
  ProposalFact,
  ProposalModel,
} from "../api/client";

export type ColumnDiff = {
  added: { name: string; type: string; comment?: string }[];
  removed: { name: string; type: string; comment?: string }[];
  modified: { name: string; from: string; to: string }[];
};

export type JoinSpec = ProposalFact["joins"][number];

export type JoinDiff = {
  added: JoinSpec[];
  removed: JoinSpec[];
  modified: { dim: string; before: JoinSpec; after: JoinSpec }[];
};

type FieldChange<T> = { from: T | undefined; to: T | undefined };

export type DimDiff = {
  name: string;
  columns: ColumnDiff;
  scd?: FieldChange<string>;
  reused_from_seed?: FieldChange<boolean>;
  natural_key?: FieldChange<string>;
  source_table?: FieldChange<string>;
  comment?: FieldChange<string>;
};

export type FactDiff = {
  name: string;
  columns: ColumnDiff;
  joins: JoinDiff;
  grain?: FieldChange<string>;
  natural_key?: FieldChange<string>;
  source_table?: FieldChange<string>;
  comment?: FieldChange<string>;
};

export type ProposalDiff = {
  meta: {
    catalog?: FieldChange<string>;
    schema?: FieldChange<string>;
  };
  dims: {
    added: ProposalDim[];
    removed: ProposalDim[];
    modified: DimDiff[];
    unchanged: string[];
  };
  facts: {
    added: ProposalFact[];
    removed: ProposalFact[];
    modified: FactDiff[];
    unchanged: string[];
  };
};

function byName<T extends { name: string }>(xs: T[] | undefined): Map<string, T> {
  const m = new Map<string, T>();
  (xs ?? []).forEach((x) => m.set(x.name, x));
  return m;
}

function fieldChange<T>(a: T | undefined, b: T | undefined): FieldChange<T> | undefined {
  if (a === b) return undefined;
  return { from: a, to: b };
}

function diffColumns(
  a: { name: string; type: string; comment?: string }[] | undefined,
  b: { name: string; type: string; comment?: string }[] | undefined,
): ColumnDiff {
  const A = byName(a);
  const B = byName(b);
  const added: ColumnDiff["added"] = [];
  const removed: ColumnDiff["removed"] = [];
  const modified: ColumnDiff["modified"] = [];
  B.forEach((col, name) => {
    const prev = A.get(name);
    if (!prev) added.push(col);
    else if (prev.type !== col.type) modified.push({ name, from: prev.type, to: col.type });
  });
  A.forEach((col, name) => {
    if (!B.has(name)) removed.push(col);
  });
  return { added, removed, modified };
}

function diffJoins(a: ProposalFact["joins"] | undefined, b: ProposalFact["joins"] | undefined): JoinDiff {
  const aMap = new Map<string, JoinSpec>();
  const bMap = new Map<string, JoinSpec>();
  (a ?? []).forEach((j) => aMap.set(j.dim, j));
  (b ?? []).forEach((j) => bMap.set(j.dim, j));
  const added: JoinSpec[] = [];
  const removed: JoinSpec[] = [];
  const modified: JoinDiff["modified"] = [];
  bMap.forEach((j, dim) => {
    const prev = aMap.get(dim);
    if (!prev) added.push(j);
    else if (joinSig(prev) !== joinSig(j)) modified.push({ dim, before: prev, after: j });
  });
  aMap.forEach((j, dim) => {
    if (!bMap.has(dim)) removed.push(j);
  });
  return { added, removed, modified };
}

function joinSig(j: JoinSpec): string {
  return `${j.alias}|${j.src_col}|${j.dim_col}|${j.scd2 ? "1" : "0"}`;
}

function diffDim(a: ProposalDim, b: ProposalDim): DimDiff | null {
  const columns = diffColumns(a.columns, b.columns);
  const scd = fieldChange(a.scd, b.scd);
  const reused_from_seed = fieldChange(a.reused_from_seed, b.reused_from_seed);
  const natural_key = fieldChange(a.natural_key, b.natural_key);
  const source_table = fieldChange(a.source_table, b.source_table);
  const comment = fieldChange(a.comment, b.comment);
  const changed =
    columns.added.length > 0 ||
    columns.removed.length > 0 ||
    columns.modified.length > 0 ||
    !!scd ||
    !!reused_from_seed ||
    !!natural_key ||
    !!source_table ||
    !!comment;
  if (!changed) return null;
  return { name: a.name, columns, scd, reused_from_seed, natural_key, source_table, comment };
}

function diffFact(a: ProposalFact, b: ProposalFact): FactDiff | null {
  const columns = diffColumns(a.columns, b.columns);
  const joins = diffJoins(a.joins, b.joins);
  const grain = fieldChange(a.grain, b.grain);
  const natural_key = fieldChange(a.natural_key, b.natural_key);
  const source_table = fieldChange(a.source_table, b.source_table);
  const comment = fieldChange(a.comment, b.comment);
  const changed =
    columns.added.length > 0 ||
    columns.removed.length > 0 ||
    columns.modified.length > 0 ||
    joins.added.length > 0 ||
    joins.removed.length > 0 ||
    joins.modified.length > 0 ||
    !!grain ||
    !!natural_key ||
    !!source_table ||
    !!comment;
  if (!changed) return null;
  return { name: a.name, columns, joins, grain, natural_key, source_table, comment };
}

export function diffProposals(a: Proposal, b: Proposal): ProposalDiff {
  return diffModels(a.model, b.model);
}

export function diffModels(a: ProposalModel, b: ProposalModel): ProposalDiff {
  const aDims = byName(a.dims);
  const bDims = byName(b.dims);
  const aFacts = byName(a.facts);
  const bFacts = byName(b.facts);

  const addedDims: ProposalDim[] = [];
  const removedDims: ProposalDim[] = [];
  const modifiedDims: DimDiff[] = [];
  const unchangedDims: string[] = [];
  bDims.forEach((d, name) => {
    const prev = aDims.get(name);
    if (!prev) addedDims.push(d);
    else {
      const dd = diffDim(prev, d);
      if (dd) modifiedDims.push(dd);
      else unchangedDims.push(name);
    }
  });
  aDims.forEach((d, name) => {
    if (!bDims.has(name)) removedDims.push(d);
  });

  const addedFacts: ProposalFact[] = [];
  const removedFacts: ProposalFact[] = [];
  const modifiedFacts: FactDiff[] = [];
  const unchangedFacts: string[] = [];
  bFacts.forEach((f, name) => {
    const prev = aFacts.get(name);
    if (!prev) addedFacts.push(f);
    else {
      const fd = diffFact(prev, f);
      if (fd) modifiedFacts.push(fd);
      else unchangedFacts.push(name);
    }
  });
  aFacts.forEach((f, name) => {
    if (!bFacts.has(name)) removedFacts.push(f);
  });

  return {
    meta: {
      catalog: fieldChange(a.catalog, b.catalog),
      schema: fieldChange(a.schema, b.schema),
    },
    dims: { added: addedDims, removed: removedDims, modified: modifiedDims, unchanged: unchangedDims },
    facts: { added: addedFacts, removed: removedFacts, modified: modifiedFacts, unchanged: unchangedFacts },
  };
}

/** Build the node-id → diff role map used by the visual graph. Pass `side: "A"` for
 *  the left canvas so removed shows red and added shows ghost; pass `"B"` for the
 *  right canvas to flip. */
export function nodeRoles(
  diff: ProposalDiff,
  side: "A" | "B",
): Record<string, "added" | "removed" | "modified" | "unchanged" | "ghost"> {
  const out: Record<string, "added" | "removed" | "modified" | "unchanged" | "ghost"> = {};
  diff.dims.unchanged.forEach((n) => (out[`dim:${n}`] = "unchanged"));
  diff.facts.unchanged.forEach((n) => (out[`fact:${n}`] = "unchanged"));
  diff.dims.modified.forEach((d) => (out[`dim:${d.name}`] = "modified"));
  diff.facts.modified.forEach((f) => (out[`fact:${f.name}`] = "modified"));
  if (side === "A") {
    diff.dims.removed.forEach((d) => (out[`dim:${d.name}`] = "removed"));
    diff.facts.removed.forEach((f) => (out[`fact:${f.name}`] = "removed"));
    // added are ghosted on the A side
    diff.dims.added.forEach((d) => (out[`dim:${d.name}`] = "ghost"));
    diff.facts.added.forEach((f) => (out[`fact:${f.name}`] = "ghost"));
  } else {
    diff.dims.added.forEach((d) => (out[`dim:${d.name}`] = "added"));
    diff.facts.added.forEach((f) => (out[`fact:${f.name}`] = "added"));
    diff.dims.removed.forEach((d) => (out[`dim:${d.name}`] = "ghost"));
    diff.facts.removed.forEach((f) => (out[`fact:${f.name}`] = "ghost"));
  }
  return out;
}

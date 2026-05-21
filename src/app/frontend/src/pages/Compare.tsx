import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, ArrowLeft, GitCompare } from "lucide-react";
import { getProposal, type Proposal } from "../api/client";
import { diffProposals } from "../compare/diff";
import DiffSummary from "../compare/DiffSummary";
import VisualDiff from "../compare/VisualDiff";
import SchemaDiff from "../compare/SchemaDiff";
import DdlDiff from "../compare/DdlDiff";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import { LinkButton } from "../ui/LinkButton";
import { StatusPill } from "../ui/StatusPill";
import { CopyChip } from "../ui/CopyChip";
import { Skeleton } from "../ui/Skeleton";
import { Empty } from "../ui/Empty";
import { Card } from "../ui/Card";
import { useToast } from "../ui/Toast";

type Tab = "visual" | "schema" | "ddl";

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const idA = params.get("a");
  const idB = params.get("b");
  const [a, setA] = useState<Proposal | null>(null);
  const [b, setB] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("visual");
  const { toast } = useToast();

  const argError = useMemo(() => {
    if (!idA || !idB) return "Compare requires two proposal ids: /compare?a=<id>&b=<id>";
    if (idA === idB) return "Pick two different proposals.";
    return null;
  }, [idA, idB]);

  useEffect(() => {
    if (argError) return;
    setLoading(true);
    setA(null);
    setB(null);
    Promise.all([getProposal(idA!), getProposal(idB!)])
      .then(([pa, pb]) => {
        setA(pa);
        setB(pb);
      })
      .catch((e) => toast({ tone: "danger", title: "Failed to load proposals", description: e instanceof Error ? e.message : String(e) }))
      .finally(() => setLoading(false));
  }, [idA, idB, argError, toast]);

  const diff = useMemo(() => (a && b ? diffProposals(a, b) : null), [a, b]);

  function swap() {
    if (!idA || !idB) return;
    const next = new URLSearchParams(params);
    next.set("a", idB);
    next.set("b", idA);
    setParams(next, { replace: true });
  }

  if (argError) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={<><GitCompare size={12} /> Diff</>}
          title="Compare proposals"
        />
        <Card>
          <Empty
            icon={<GitCompare aria-hidden size={22} />}
            title="Select two proposals to compare"
            description={argError}
            action={
              <LinkButton to="/approvals" leadingIcon={<ArrowLeft aria-hidden />}>
                Go to Approvals
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  if (loading || !a || !b || !diff) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={<><GitCompare size={12} /> Diff</>}
          title="Compare proposals"
        />
        <Skeleton shape="line" width="40%" height={20} />
        <Skeleton shape="block" height={120} />
        <Skeleton shape="block" height={420} />
      </div>
    );
  }

  return (
    <div className="page compare-page">
      <PageHeader
        eyebrow={<><GitCompare size={12} /> Diff</>}
        title="Compare proposals"
        description="Side-by-side view of two model versions. Use the tabs to switch between visual, schema, and DDL comparison."
        actions={
          <>
            <LinkButton
              to="/approvals"
              variant="ghost"
              leadingIcon={<ArrowLeft aria-hidden />}
            >
              Approvals
            </LinkButton>
            <Button
              variant="secondary"
              onClick={swap}
              leadingIcon={<ArrowLeftRight aria-hidden />}
            >
              Swap A ↔ B
            </Button>
          </>
        }
      />

      <div className="compare-pair">
        <ProposalCard label="A" p={a} />
        <ProposalCard label="B" p={b} />
      </div>

      <DiffSummary diff={diff} />

      <div className="compare-tabs-row">
        <div className="segmented" role="tablist">
          <TabBtn cur={tab} me="visual" onClick={setTab}>Visual</TabBtn>
          <TabBtn cur={tab} me="schema" onClick={setTab}>Schema</TabBtn>
          <TabBtn cur={tab} me="ddl" onClick={setTab}>DDL</TabBtn>
        </div>
      </div>

      <div className="compare-tab-body">
        {tab === "visual" && <VisualDiff a={a} b={b} diff={diff} />}
        {tab === "schema" && <SchemaDiff diff={diff} />}
        {tab === "ddl" && (
          <DdlDiff
            a={a.ddl_text}
            b={b.ddl_text}
            titleA={`A — v${a.version} (${a.status})`}
            titleB={`B — v${b.version} (${b.status})`}
          />
        )}
      </div>
    </div>
  );
}

function ProposalCard({ label, p }: { label: string; p: Proposal }) {
  return (
    <div className="compare-proposal-card">
      <div className="compare-proposal-card-head">
        <span className="compare-proposal-card-label">Proposal {label}</span>
        <StatusPill status={p.status} />
      </div>
      <div className="compare-proposal-card-id">
        <CopyChip value={p.id} display={p.id.slice(0, 8)} title="Copy proposal id" />
        <span className="compare-proposal-card-meta">v{p.version}</span>
      </div>
      <div className="compare-proposal-card-namespace">
        {p.model.catalog ?? "?"}.{p.model.schema ?? "?"}
      </div>
      <div className="compare-proposal-card-by">by {p.created_by}</div>
    </div>
  );
}

function TabBtn({
  cur,
  me,
  onClick,
  children,
}: {
  cur: Tab;
  me: Tab;
  onClick: (t: Tab) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={cur === me}
      className={cur === me ? "is-active" : ""}
      onClick={() => onClick(me)}
    >
      {children}
    </button>
  );
}

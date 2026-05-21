import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  CheckCircle2,
  GitBranch,
  MessageSquare,
  PlayCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  applyProposal,
  approve,
  listProposals,
  validateProposal,
  ApiError,
  type Proposal,
  type ValidationReport,
} from "../api/client";
import { Button } from "../ui/Button";
import { LinkButton } from "../ui/LinkButton";
import { Card, CardBody } from "../ui/Card";
import { CopyChip } from "../ui/CopyChip";
import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { Empty } from "../ui/Empty";
import { PageHeader } from "../ui/PageHeader";
import { StatusPill } from "../ui/StatusPill";
import { Badge } from "../ui/Badge";
import { useToast } from "../ui/Toast";

export default function Approvals() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]); // 0..2 proposal ids, oldest-first
  const [single, setSingle] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const refresh = () => listProposals().then(setProposals);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!proposals) return;
    if (picked.length === 1) {
      const p = proposals.find((x) => x.id === picked[0]) ?? null;
      setSingle(p);
    } else {
      setSingle(null);
    }
  }, [picked, proposals]);

  // Auto-validate when the selected (non-approved) proposal changes.
  useEffect(() => {
    setValidation(null);
    if (!single || single.status === "approved") return;
    let cancelled = false;
    setValidating(true);
    validateProposal(single.id)
      .then((r) => { if (!cancelled) setValidation(r); })
      .catch(() => { /* user can hit Validate to retry */ })
      .finally(() => { if (!cancelled) setValidating(false); });
    return () => { cancelled = true; };
  }, [single?.id, single?.status]);

  async function onValidate() {
    if (!single) return;
    setValidating(true);
    try {
      setValidation(await validateProposal(single.id));
    } catch (e) {
      toast({
        tone: "danger",
        title: "Validate failed",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setValidating(false);
    }
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length < 2) return [...prev, id];
      return [prev[1], id];
    });
  }

  function clearPicks() {
    setPicked([]);
  }

  function compare() {
    if (picked.length !== 2) return;
    navigate(`/compare?a=${picked[0]}&b=${picked[1]}`);
  }

  async function onApprove() {
    if (!single) return;
    setBusy(true);
    try {
      await approve(single.id);
      toast({ tone: "success", title: "Proposal approved", description: `${single.id.slice(0, 8)} is ready to apply.` });
      await refresh();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 422 &&
        e.body &&
        typeof e.body === "object" &&
        "issues" in (e.body as Record<string, unknown>)
      ) {
        setValidation(e.body as ValidationReport);
        toast({
          tone: "danger",
          title: "Approval blocked by validation",
          description: "See the validation panel for details.",
        });
      } else {
        toast({ tone: "danger", title: "Approve failed", description: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    if (!single) return;
    setBusy(true);
    try {
      const r = await applyProposal(single.id);
      toast({
        tone: "success",
        title: "Apply DDL job triggered",
        description: `run_id ${r.run_id}`,
      });
    } catch (e) {
      toast({ tone: "danger", title: "Apply failed", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const pickedProposals = useMemo(
    () => picked.map((id) => proposals?.find((p) => p.id === id)).filter(Boolean) as Proposal[],
    [picked, proposals],
  );

  const columns: DataTableColumn<Proposal>[] = [
    {
      key: "pick",
      header: <span className="sr-only">Pick</span>,
      width: 36,
      render: (p) => (
        <label className="approvals-row-checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={picked.includes(p.id)}
            onChange={() => togglePick(p.id)}
            aria-label={`Pick proposal ${p.id.slice(0, 8)}`}
          />
        </label>
      ),
    },
    {
      key: "id",
      header: "Proposal",
      render: (p) => {
        const idx = picked.indexOf(p.id);
        const role = idx === 0 ? "A" : idx === 1 ? "B" : null;
        return (
          <div className="approvals-id-cell">
            <CopyChip value={p.id} display={p.id.slice(0, 8)} title="Copy proposal id" />
            {role && <span className="approvals-id-cell-pick">{role}</span>}
          </div>
        );
      },
    },
    {
      key: "version",
      header: "Version",
      width: 80,
      render: (p) => <span style={{ color: "var(--text-tertiary)" }}>v{p.version}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: 120,
      render: (p) => <StatusPill status={p.status} />,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow={<><ShieldCheck size={12} /> Governance</>}
        title="Approvals"
        description="Review proposed gold-layer models, approve, and trigger the Apply-DDL job to materialize tables in Unity Catalog."
        actions={
          <Badge tone="neutral">
            {proposals ? `${proposals.length} proposals` : "loading…"}
          </Badge>
        }
      />

      {picked.length > 0 && (
        <ActionBar picked={pickedProposals} onCompare={compare} onClear={clearPicks} />
      )}

      <div className="two-pane two-pane-narrow-left">
        <Card flush>
          <DataTable
            className="approvals-table"
            columns={columns}
            rows={proposals ?? []}
            rowKey={(p) => p.id}
            onRowClick={(p) => togglePick(p.id)}
            isRowSelected={(p) => picked.includes(p.id)}
            loading={proposals === null}
            emptyState={
              <Empty
                icon={<ShieldCheck aria-hidden size={22} />}
                title="No proposals yet"
                description="Start a chat with the modeling agent to create your first proposal."
                action={
                  <LinkButton
                    to="/chat"
                    variant="primary"
                    leadingIcon={<MessageSquare aria-hidden />}
                  >
                    Start a chat
                  </LinkButton>
                }
              />
            }
          />
        </Card>

        <Card>
          {picked.length === 2 && (
            <div className="approvals-compare-prompt">
              <ArrowLeftRight aria-hidden />
              <span>Two proposals selected. Compare them side-by-side.</span>
              <Button
                size="sm"
                variant="success"
                onClick={compare}
                style={{ marginLeft: "auto" }}
                trailingIcon={<ArrowLeftRight aria-hidden />}
              >
                Compare
              </Button>
            </div>
          )}
          <CardBody>
            {single ? (
              <ProposalDetail
                proposal={single}
                busy={busy}
                validation={validation}
                validating={validating}
                onValidate={onValidate}
                onApprove={onApprove}
                onApply={onApply}
              />
            ) : picked.length === 2 ? (
              <Empty
                icon={<ArrowLeftRight aria-hidden size={22} />}
                title="Comparing two proposals"
                description="Click Compare to see a side-by-side visual, schema, and DDL diff."
              />
            ) : (
              <Empty
                icon={<ShieldCheck aria-hidden size={22} />}
                title="Pick a proposal to review"
                description="Select one to inspect its DDL and run approvals, or check two to compare."
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ProposalDetail({
  proposal,
  busy,
  validation,
  validating,
  onValidate,
  onApprove,
  onApply,
}: {
  proposal: Proposal;
  busy: boolean;
  validation: ValidationReport | null;
  validating: boolean;
  onValidate: () => void;
  onApprove: () => void;
  onApply: () => void;
}) {
  const errorCount = validation?.issues.filter((i) => i.level === "error").length ?? 0;
  const warningCount = validation?.issues.filter((i) => i.level === "warning").length ?? 0;
  const approveBlocked =
    proposal.status !== "approved" && validation !== null && !validation.ok;
  const ns =
    proposal.model.catalog && proposal.model.schema
      ? `${proposal.model.catalog}.${proposal.model.schema}`
      : null;

  function copyDdl() {
    if (!proposal.ddl_text) return;
    navigator.clipboard?.writeText(proposal.ddl_text);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <CopyChip value={proposal.id} display={proposal.id.slice(0, 8)} title="Copy id" />
        <StatusPill status={proposal.status} />
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
          v{proposal.version}
        </span>
      </div>

      <div className="approvals-detail-meta">
        <div className="approvals-detail-meta-item">
          <span className="approvals-detail-meta-label">Namespace</span>
          {ns ? (
            <code style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{ns}</code>
          ) : (
            <span style={{ color: "var(--text-quaternary)" }}>—</span>
          )}
        </div>
        <div className="approvals-detail-meta-item">
          <span className="approvals-detail-meta-label">Created by</span>
          <span>{proposal.created_by || "—"}</span>
        </div>
        <div className="approvals-detail-meta-item" style={{ marginLeft: "auto" }}>
          <LinkButton
            to={`/canvas?proposal_id=${proposal.id}`}
            size="sm"
            variant="ghost"
            leadingIcon={<GitBranch aria-hidden />}
          >
            View canvas
          </LinkButton>
          <LinkButton
            to={`/chat?proposal_id=${proposal.id}`}
            size="sm"
            variant="ghost"
            leadingIcon={<MessageSquare aria-hidden />}
          >
            Refine in chat
          </LinkButton>
        </div>
      </div>

      <div className="approvals-detail-actions">
        <Button
          variant="ghost"
          onClick={onValidate}
          disabled={validating || proposal.status === "approved"}
          loading={validating}
          leadingIcon={<ShieldCheck aria-hidden />}
        >
          Validate
        </Button>
        <Button
          variant="success"
          onClick={onApprove}
          disabled={proposal.status === "approved" || busy || approveBlocked}
          loading={busy && proposal.status !== "approved"}
          leadingIcon={<CheckCircle2 aria-hidden />}
          title={
            approveBlocked
              ? `Resolve ${errorCount} validation error${errorCount === 1 ? "" : "s"} before approving.`
              : undefined
          }
        >
          {proposal.status === "approved" ? "Approved" : "Approve"}
        </Button>
        <Button
          variant="primary"
          onClick={onApply}
          disabled={proposal.status !== "approved" || busy}
          leadingIcon={<PlayCircle aria-hidden />}
        >
          Apply DDL
        </Button>
      </div>

      {validation && proposal.status !== "approved" && (
        <ValidationPanel
          validation={validation}
          errorCount={errorCount}
          warningCount={warningCount}
        />
      )}

      <div className="approvals-ddl-head">
        <span className="approvals-ddl-head-title">Generated DDL</span>
        <Button size="sm" variant="ghost" onClick={copyDdl} disabled={!proposal.ddl_text}>
          Copy
        </Button>
      </div>
      <pre className={proposal.ddl_text ? "code-block" : "code-block code-block-light"}>
        {proposal.ddl_text ?? "(no DDL yet)"}
      </pre>
    </>
  );
}

function ActionBar({
  picked,
  onCompare,
  onClear,
}: {
  picked: Proposal[];
  onCompare: () => void;
  onClear: () => void;
}) {
  return (
    <div className="approvals-actionbar" role="region" aria-label="Selected proposals">
      {picked.length === 1 && (
        <>
          <span className="approvals-actionbar-hint">Select one more to compare</span>
          <PickedChip label="A" p={picked[0]} />
        </>
      )}
      {picked.length === 2 && (
        <>
          <PickedChip label="A" p={picked[0]} />
          <span className="approvals-actionbar-vs">↔</span>
          <PickedChip label="B" p={picked[1]} />
          <Button
            variant="success"
            size="sm"
            onClick={onCompare}
            trailingIcon={<ArrowLeftRight aria-hidden />}
          >
            Compare
          </Button>
        </>
      )}
      <div className="approvals-actionbar-spacer" />
      <Button size="sm" variant="ghost" leadingIcon={<X aria-hidden />} onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

function ValidationPanel({
  validation,
  errorCount,
  warningCount,
}: {
  validation: ValidationReport;
  errorCount: number;
  warningCount: number;
}) {
  if (validation.ok && warningCount === 0) {
    return (
      <div className="approvals-validation approvals-validation-ok">
        <CheckCircle2 size={14} aria-hidden /> Validation passed — no issues.
      </div>
    );
  }
  return (
    <div className="approvals-validation">
      <div className="approvals-validation-summary">
        <ShieldCheck size={14} aria-hidden />
        <span>
          {errorCount > 0 && (
            <Badge tone="danger">{errorCount} error{errorCount === 1 ? "" : "s"}</Badge>
          )}
          {warningCount > 0 && (
            <Badge tone="warning">{warningCount} warning{warningCount === 1 ? "" : "s"}</Badge>
          )}
          {validation.ok && errorCount === 0 && (
            <span style={{ marginLeft: 8, color: "var(--text-tertiary)" }}>
              Approve is allowed — warnings are informational.
            </span>
          )}
        </span>
      </div>
      <ul className="approvals-validation-list">
        {validation.issues.map((it, i) => (
          <li key={i} className={`approvals-validation-item approvals-validation-${it.level}`}>
            <Badge tone={it.level === "error" ? "danger" : "warning"}>{it.level}</Badge>
            <code style={{ fontFamily: "var(--font-mono)" }}>{it.path}</code>
            <span>{it.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PickedChip({ label, p }: { label: string; p: Proposal }) {
  return (
    <span className="approvals-actionbar-chip" title={p.id}>
      <strong>{label}:</strong> <code>{p.id.slice(0, 8)}</code> · v{p.version}
    </span>
  );
}

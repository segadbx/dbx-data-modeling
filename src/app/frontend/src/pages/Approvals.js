import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, CheckCircle2, GitBranch, MessageSquare, PlayCircle, ShieldCheck, X, } from "lucide-react";
import { applyProposal, approve, listProposals, validateProposal, ApiError, } from "../api/client";
import { Button } from "../ui/Button";
import { LinkButton } from "../ui/LinkButton";
import { Card, CardBody } from "../ui/Card";
import { CopyChip } from "../ui/CopyChip";
import { DataTable } from "../ui/DataTable";
import { Empty } from "../ui/Empty";
import { PageHeader } from "../ui/PageHeader";
import { StatusPill } from "../ui/StatusPill";
import { Badge } from "../ui/Badge";
import { useToast } from "../ui/Toast";
export default function Approvals() {
    const [proposals, setProposals] = useState(null);
    const [picked, setPicked] = useState([]); // 0..2 proposal ids, oldest-first
    const [single, setSingle] = useState(null);
    const [busy, setBusy] = useState(false);
    const [validation, setValidation] = useState(null);
    const [validating, setValidating] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const refresh = () => listProposals().then(setProposals);
    useEffect(() => {
        refresh();
    }, []);
    useEffect(() => {
        if (!proposals)
            return;
        if (picked.length === 1) {
            const p = proposals.find((x) => x.id === picked[0]) ?? null;
            setSingle(p);
        }
        else {
            setSingle(null);
        }
    }, [picked, proposals]);
    // Auto-validate when the selected (non-approved) proposal changes.
    useEffect(() => {
        setValidation(null);
        if (!single || single.status === "approved")
            return;
        let cancelled = false;
        setValidating(true);
        validateProposal(single.id)
            .then((r) => { if (!cancelled)
            setValidation(r); })
            .catch(() => { })
            .finally(() => { if (!cancelled)
            setValidating(false); });
        return () => { cancelled = true; };
    }, [single?.id, single?.status]);
    async function onValidate() {
        if (!single)
            return;
        setValidating(true);
        try {
            setValidation(await validateProposal(single.id));
        }
        catch (e) {
            toast({
                tone: "danger",
                title: "Validate failed",
                description: e instanceof Error ? e.message : String(e),
            });
        }
        finally {
            setValidating(false);
        }
    }
    function togglePick(id) {
        setPicked((prev) => {
            if (prev.includes(id))
                return prev.filter((x) => x !== id);
            if (prev.length < 2)
                return [...prev, id];
            return [prev[1], id];
        });
    }
    function clearPicks() {
        setPicked([]);
    }
    function compare() {
        if (picked.length !== 2)
            return;
        navigate(`/compare?a=${picked[0]}&b=${picked[1]}`);
    }
    async function onApprove() {
        if (!single)
            return;
        setBusy(true);
        try {
            await approve(single.id);
            toast({ tone: "success", title: "Proposal approved", description: `${single.id.slice(0, 8)} is ready to apply.` });
            await refresh();
        }
        catch (e) {
            if (e instanceof ApiError &&
                e.status === 422 &&
                e.body &&
                typeof e.body === "object" &&
                "issues" in e.body) {
                setValidation(e.body);
                toast({
                    tone: "danger",
                    title: "Approval blocked by validation",
                    description: "See the validation panel for details.",
                });
            }
            else {
                toast({ tone: "danger", title: "Approve failed", description: e instanceof Error ? e.message : String(e) });
            }
        }
        finally {
            setBusy(false);
        }
    }
    async function onApply() {
        if (!single)
            return;
        setBusy(true);
        try {
            const r = await applyProposal(single.id);
            toast({
                tone: "success",
                title: "Apply DDL job triggered",
                description: `run_id ${r.run_id}`,
            });
        }
        catch (e) {
            toast({ tone: "danger", title: "Apply failed", description: e instanceof Error ? e.message : String(e) });
        }
        finally {
            setBusy(false);
        }
    }
    const pickedProposals = useMemo(() => picked.map((id) => proposals?.find((p) => p.id === id)).filter(Boolean), [picked, proposals]);
    const columns = [
        {
            key: "pick",
            header: _jsx("span", { className: "sr-only", children: "Pick" }),
            width: 36,
            render: (p) => (_jsx("label", { className: "approvals-row-checkbox", onClick: (e) => e.stopPropagation(), children: _jsx("input", { type: "checkbox", checked: picked.includes(p.id), onChange: () => togglePick(p.id), "aria-label": `Pick proposal ${p.id.slice(0, 8)}` }) })),
        },
        {
            key: "id",
            header: "Proposal",
            render: (p) => {
                const idx = picked.indexOf(p.id);
                const role = idx === 0 ? "A" : idx === 1 ? "B" : null;
                return (_jsxs("div", { className: "approvals-id-cell", children: [_jsx(CopyChip, { value: p.id, display: p.id.slice(0, 8), title: "Copy proposal id" }), role && _jsx("span", { className: "approvals-id-cell-pick", children: role })] }));
            },
        },
        {
            key: "version",
            header: "Version",
            width: 80,
            render: (p) => _jsxs("span", { style: { color: "var(--text-tertiary)" }, children: ["v", p.version] }),
        },
        {
            key: "status",
            header: "Status",
            width: 120,
            render: (p) => _jsx(StatusPill, { status: p.status }),
        },
    ];
    return (_jsxs("div", { className: "page", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(ShieldCheck, { size: 12 }), " Governance"] }), title: "Approvals", description: "Review proposed gold-layer models, approve, and trigger the Apply-DDL job to materialize tables in Unity Catalog.", actions: _jsx(Badge, { tone: "neutral", children: proposals ? `${proposals.length} proposals` : "loading…" }) }), picked.length > 0 && (_jsx(ActionBar, { picked: pickedProposals, onCompare: compare, onClear: clearPicks })), _jsxs("div", { className: "two-pane two-pane-narrow-left", children: [_jsx(Card, { flush: true, children: _jsx(DataTable, { className: "approvals-table", columns: columns, rows: proposals ?? [], rowKey: (p) => p.id, onRowClick: (p) => togglePick(p.id), isRowSelected: (p) => picked.includes(p.id), loading: proposals === null, emptyState: _jsx(Empty, { icon: _jsx(ShieldCheck, { "aria-hidden": true, size: 22 }), title: "No proposals yet", description: "Start a chat with the modeling agent to create your first proposal.", action: _jsx(LinkButton, { to: "/chat", variant: "primary", leadingIcon: _jsx(MessageSquare, { "aria-hidden": true }), children: "Start a chat" }) }) }) }), _jsxs(Card, { children: [picked.length === 2 && (_jsxs("div", { className: "approvals-compare-prompt", children: [_jsx(ArrowLeftRight, { "aria-hidden": true }), _jsx("span", { children: "Two proposals selected. Compare them side-by-side." }), _jsx(Button, { size: "sm", variant: "success", onClick: compare, style: { marginLeft: "auto" }, trailingIcon: _jsx(ArrowLeftRight, { "aria-hidden": true }), children: "Compare" })] })), _jsx(CardBody, { children: single ? (_jsx(ProposalDetail, { proposal: single, busy: busy, validation: validation, validating: validating, onValidate: onValidate, onApprove: onApprove, onApply: onApply })) : picked.length === 2 ? (_jsx(Empty, { icon: _jsx(ArrowLeftRight, { "aria-hidden": true, size: 22 }), title: "Comparing two proposals", description: "Click Compare to see a side-by-side visual, schema, and DDL diff." })) : (_jsx(Empty, { icon: _jsx(ShieldCheck, { "aria-hidden": true, size: 22 }), title: "Pick a proposal to review", description: "Select one to inspect its DDL and run approvals, or check two to compare." })) })] })] })] }));
}
function ProposalDetail({ proposal, busy, validation, validating, onValidate, onApprove, onApply, }) {
    const errorCount = validation?.issues.filter((i) => i.level === "error").length ?? 0;
    const warningCount = validation?.issues.filter((i) => i.level === "warning").length ?? 0;
    const approveBlocked = proposal.status !== "approved" && validation !== null && !validation.ok;
    const ns = proposal.model.catalog && proposal.model.schema
        ? `${proposal.model.catalog}.${proposal.model.schema}`
        : null;
    function copyDdl() {
        if (!proposal.ddl_text)
            return;
        navigator.clipboard?.writeText(proposal.ddl_text);
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }, children: [_jsx(CopyChip, { value: proposal.id, display: proposal.id.slice(0, 8), title: "Copy id" }), _jsx(StatusPill, { status: proposal.status }), _jsxs("span", { style: { fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }, children: ["v", proposal.version] })] }), _jsxs("div", { className: "approvals-detail-meta", children: [_jsxs("div", { className: "approvals-detail-meta-item", children: [_jsx("span", { className: "approvals-detail-meta-label", children: "Namespace" }), ns ? (_jsx("code", { style: { fontFamily: "var(--font-mono)", color: "var(--text-primary)" }, children: ns })) : (_jsx("span", { style: { color: "var(--text-quaternary)" }, children: "\u2014" }))] }), _jsxs("div", { className: "approvals-detail-meta-item", children: [_jsx("span", { className: "approvals-detail-meta-label", children: "Created by" }), _jsx("span", { children: proposal.created_by || "—" })] }), _jsxs("div", { className: "approvals-detail-meta-item", style: { marginLeft: "auto" }, children: [_jsx(LinkButton, { to: `/canvas?proposal_id=${proposal.id}`, size: "sm", variant: "ghost", leadingIcon: _jsx(GitBranch, { "aria-hidden": true }), children: "View canvas" }), _jsx(LinkButton, { to: `/chat?proposal_id=${proposal.id}`, size: "sm", variant: "ghost", leadingIcon: _jsx(MessageSquare, { "aria-hidden": true }), children: "Refine in chat" })] })] }), _jsxs("div", { className: "approvals-detail-actions", children: [_jsx(Button, { variant: "ghost", onClick: onValidate, disabled: validating || proposal.status === "approved", loading: validating, leadingIcon: _jsx(ShieldCheck, { "aria-hidden": true }), children: "Validate" }), _jsx(Button, { variant: "success", onClick: onApprove, disabled: proposal.status === "approved" || busy || approveBlocked, loading: busy && proposal.status !== "approved", leadingIcon: _jsx(CheckCircle2, { "aria-hidden": true }), title: approveBlocked
                            ? `Resolve ${errorCount} validation error${errorCount === 1 ? "" : "s"} before approving.`
                            : undefined, children: proposal.status === "approved" ? "Approved" : "Approve" }), _jsx(Button, { variant: "primary", onClick: onApply, disabled: proposal.status !== "approved" || busy, leadingIcon: _jsx(PlayCircle, { "aria-hidden": true }), children: "Apply DDL" })] }), validation && proposal.status !== "approved" && (_jsx(ValidationPanel, { validation: validation, errorCount: errorCount, warningCount: warningCount })), _jsxs("div", { className: "approvals-ddl-head", children: [_jsx("span", { className: "approvals-ddl-head-title", children: "Generated DDL" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: copyDdl, disabled: !proposal.ddl_text, children: "Copy" })] }), _jsx("pre", { className: proposal.ddl_text ? "code-block" : "code-block code-block-light", children: proposal.ddl_text ?? "(no DDL yet)" })] }));
}
function ActionBar({ picked, onCompare, onClear, }) {
    return (_jsxs("div", { className: "approvals-actionbar", role: "region", "aria-label": "Selected proposals", children: [picked.length === 1 && (_jsxs(_Fragment, { children: [_jsx("span", { className: "approvals-actionbar-hint", children: "Select one more to compare" }), _jsx(PickedChip, { label: "A", p: picked[0] })] })), picked.length === 2 && (_jsxs(_Fragment, { children: [_jsx(PickedChip, { label: "A", p: picked[0] }), _jsx("span", { className: "approvals-actionbar-vs", children: "\u2194" }), _jsx(PickedChip, { label: "B", p: picked[1] }), _jsx(Button, { variant: "success", size: "sm", onClick: onCompare, trailingIcon: _jsx(ArrowLeftRight, { "aria-hidden": true }), children: "Compare" })] })), _jsx("div", { className: "approvals-actionbar-spacer" }), _jsx(Button, { size: "sm", variant: "ghost", leadingIcon: _jsx(X, { "aria-hidden": true }), onClick: onClear, children: "Clear" })] }));
}
function ValidationPanel({ validation, errorCount, warningCount, }) {
    if (validation.ok && warningCount === 0) {
        return (_jsxs("div", { className: "approvals-validation approvals-validation-ok", children: [_jsx(CheckCircle2, { size: 14, "aria-hidden": true }), " Validation passed \u2014 no issues."] }));
    }
    return (_jsxs("div", { className: "approvals-validation", children: [_jsxs("div", { className: "approvals-validation-summary", children: [_jsx(ShieldCheck, { size: 14, "aria-hidden": true }), _jsxs("span", { children: [errorCount > 0 && (_jsxs(Badge, { tone: "danger", children: [errorCount, " error", errorCount === 1 ? "" : "s"] })), warningCount > 0 && (_jsxs(Badge, { tone: "warning", children: [warningCount, " warning", warningCount === 1 ? "" : "s"] })), validation.ok && errorCount === 0 && (_jsx("span", { style: { marginLeft: 8, color: "var(--text-tertiary)" }, children: "Approve is allowed \u2014 warnings are informational." }))] })] }), _jsx("ul", { className: "approvals-validation-list", children: validation.issues.map((it, i) => (_jsxs("li", { className: `approvals-validation-item approvals-validation-${it.level}`, children: [_jsx(Badge, { tone: it.level === "error" ? "danger" : "warning", children: it.level }), _jsx("code", { style: { fontFamily: "var(--font-mono)" }, children: it.path }), _jsx("span", { children: it.message })] }, i))) })] }));
}
function PickedChip({ label, p }) {
    return (_jsxs("span", { className: "approvals-actionbar-chip", title: p.id, children: [_jsxs("strong", { children: [label, ":"] }), " ", _jsx("code", { children: p.id.slice(0, 8) }), " \u00B7 v", p.version] }));
}

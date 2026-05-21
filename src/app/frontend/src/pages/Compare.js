import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, ArrowLeft, GitCompare } from "lucide-react";
import { getProposal } from "../api/client";
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
export default function Compare() {
    const [params, setParams] = useSearchParams();
    const idA = params.get("a");
    const idB = params.get("b");
    const [a, setA] = useState(null);
    const [b, setB] = useState(null);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState("visual");
    const { toast } = useToast();
    const argError = useMemo(() => {
        if (!idA || !idB)
            return "Compare requires two proposal ids: /compare?a=<id>&b=<id>";
        if (idA === idB)
            return "Pick two different proposals.";
        return null;
    }, [idA, idB]);
    useEffect(() => {
        if (argError)
            return;
        setLoading(true);
        setA(null);
        setB(null);
        Promise.all([getProposal(idA), getProposal(idB)])
            .then(([pa, pb]) => {
            setA(pa);
            setB(pb);
        })
            .catch((e) => toast({ tone: "danger", title: "Failed to load proposals", description: e instanceof Error ? e.message : String(e) }))
            .finally(() => setLoading(false));
    }, [idA, idB, argError, toast]);
    const diff = useMemo(() => (a && b ? diffProposals(a, b) : null), [a, b]);
    function swap() {
        if (!idA || !idB)
            return;
        const next = new URLSearchParams(params);
        next.set("a", idB);
        next.set("b", idA);
        setParams(next, { replace: true });
    }
    if (argError) {
        return (_jsxs("div", { className: "page", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(GitCompare, { size: 12 }), " Diff"] }), title: "Compare proposals" }), _jsx(Card, { children: _jsx(Empty, { icon: _jsx(GitCompare, { "aria-hidden": true, size: 22 }), title: "Select two proposals to compare", description: argError, action: _jsx(LinkButton, { to: "/approvals", leadingIcon: _jsx(ArrowLeft, { "aria-hidden": true }), children: "Go to Approvals" }) }) })] }));
    }
    if (loading || !a || !b || !diff) {
        return (_jsxs("div", { className: "page", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(GitCompare, { size: 12 }), " Diff"] }), title: "Compare proposals" }), _jsx(Skeleton, { shape: "line", width: "40%", height: 20 }), _jsx(Skeleton, { shape: "block", height: 120 }), _jsx(Skeleton, { shape: "block", height: 420 })] }));
    }
    return (_jsxs("div", { className: "page compare-page", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(GitCompare, { size: 12 }), " Diff"] }), title: "Compare proposals", description: "Side-by-side view of two model versions. Use the tabs to switch between visual, schema, and DDL comparison.", actions: _jsxs(_Fragment, { children: [_jsx(LinkButton, { to: "/approvals", variant: "ghost", leadingIcon: _jsx(ArrowLeft, { "aria-hidden": true }), children: "Approvals" }), _jsx(Button, { variant: "secondary", onClick: swap, leadingIcon: _jsx(ArrowLeftRight, { "aria-hidden": true }), children: "Swap A \u2194 B" })] }) }), _jsxs("div", { className: "compare-pair", children: [_jsx(ProposalCard, { label: "A", p: a }), _jsx(ProposalCard, { label: "B", p: b })] }), _jsx(DiffSummary, { diff: diff }), _jsx("div", { className: "compare-tabs-row", children: _jsxs("div", { className: "segmented", role: "tablist", children: [_jsx(TabBtn, { cur: tab, me: "visual", onClick: setTab, children: "Visual" }), _jsx(TabBtn, { cur: tab, me: "schema", onClick: setTab, children: "Schema" }), _jsx(TabBtn, { cur: tab, me: "ddl", onClick: setTab, children: "DDL" })] }) }), _jsxs("div", { className: "compare-tab-body", children: [tab === "visual" && _jsx(VisualDiff, { a: a, b: b, diff: diff }), tab === "schema" && _jsx(SchemaDiff, { diff: diff }), tab === "ddl" && (_jsx(DdlDiff, { a: a.ddl_text, b: b.ddl_text, titleA: `A — v${a.version} (${a.status})`, titleB: `B — v${b.version} (${b.status})` }))] })] }));
}
function ProposalCard({ label, p }) {
    return (_jsxs("div", { className: "compare-proposal-card", children: [_jsxs("div", { className: "compare-proposal-card-head", children: [_jsxs("span", { className: "compare-proposal-card-label", children: ["Proposal ", label] }), _jsx(StatusPill, { status: p.status })] }), _jsxs("div", { className: "compare-proposal-card-id", children: [_jsx(CopyChip, { value: p.id, display: p.id.slice(0, 8), title: "Copy proposal id" }), _jsxs("span", { className: "compare-proposal-card-meta", children: ["v", p.version] })] }), _jsxs("div", { className: "compare-proposal-card-namespace", children: [p.model.catalog ?? "?", ".", p.model.schema ?? "?"] }), _jsxs("div", { className: "compare-proposal-card-by", children: ["by ", p.created_by] })] }));
}
function TabBtn({ cur, me, onClick, children, }) {
    return (_jsx("button", { type: "button", role: "tab", "aria-selected": cur === me, className: cur === me ? "is-active" : "", onClick: () => onClick(me), children: children }));
}

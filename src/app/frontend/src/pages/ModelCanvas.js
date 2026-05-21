import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactFlow, { Background, BackgroundVariant, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";
import { AlertTriangle, GitBranch, MessageSquare, RefreshCw, ShieldCheck, } from "lucide-react";
import { getProposal } from "../api/client";
import { buildGraph, nodeTypes } from "../compare/graph";
import { PageHeader } from "../ui/PageHeader";
import { Empty } from "../ui/Empty";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { StatusPill } from "../ui/StatusPill";
import { Button } from "../ui/Button";
import { LinkButton } from "../ui/LinkButton";
import { CopyChip } from "../ui/CopyChip";
import { useToast } from "../ui/Toast";
export default function ModelCanvas() {
    const [params] = useSearchParams();
    const proposalId = params.get("proposal_id");
    const [proposal, setProposal] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errMsg, setErrMsg] = useState(null);
    const { toast } = useToast();
    const fetchProposal = useCallback(() => {
        if (!proposalId)
            return;
        setLoading(true);
        setErrMsg(null);
        getProposal(proposalId)
            .then((p) => {
            setProposal(p);
            setErrMsg(null);
        })
            .catch((e) => {
            const msg = e instanceof Error ? e.message : String(e);
            setErrMsg(msg);
            setProposal(null);
            toast({ tone: "danger", title: "Failed to load proposal", description: msg });
        })
            .finally(() => setLoading(false));
    }, [proposalId, toast]);
    useEffect(() => {
        fetchProposal();
    }, [fetchProposal]);
    // No proposal id at all
    if (!proposalId) {
        return (_jsxs("div", { className: "page", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(GitBranch, { size: 12 }), " Model"] }), title: "Model Canvas", description: "Visualize a proposal as a star schema with facts, dimensions, and joins." }), _jsx(Card, { children: _jsx(Empty, { icon: _jsx(GitBranch, { "aria-hidden": true, size: 22 }), title: "No proposal selected", description: "Pick a proposal from Approvals, or start a new one from Chat.", action: _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx(LinkButton, { to: "/approvals", leadingIcon: _jsx(ShieldCheck, { "aria-hidden": true }), children: "Open Approvals" }), _jsx(LinkButton, { to: "/chat", variant: "primary", leadingIcon: _jsx(MessageSquare, { "aria-hidden": true }), children: "Start a chat" })] }) }) })] }));
    }
    // Fetch failed
    if (!loading && errMsg && !proposal) {
        return (_jsxs("div", { className: "page", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(GitBranch, { size: 12 }), " Model"] }), title: "Model Canvas" }), _jsx(Card, { children: _jsx(Empty, { icon: _jsx(AlertTriangle, { "aria-hidden": true, size: 22 }), title: "Couldn't load this proposal", description: errMsg, action: _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx(Button, { onClick: fetchProposal, leadingIcon: _jsx(RefreshCw, { "aria-hidden": true }), children: "Retry" }), _jsx(LinkButton, { to: "/approvals", variant: "ghost", children: "Back to Approvals" })] }) }) })] }));
    }
    // Loading
    if (loading || !proposal) {
        return (_jsxs("div", { className: "page page-fullheight", children: [_jsx(Skeleton, { shape: "line", width: "40%", height: 28 }), _jsx(Skeleton, { shape: "block", height: 480 })] }));
    }
    const { nodes, edges } = buildGraph({ proposal });
    const ns = proposal.model.catalog && proposal.model.schema
        ? `${proposal.model.catalog}.${proposal.model.schema}`
        : "—";
    const empty = nodes.length === 0;
    return (_jsxs("div", { className: "page page-fullheight canvas-page", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(GitBranch, { size: 12 }), " Proposal"] }), title: _jsxs(_Fragment, { children: [_jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: ns }), _jsx(StatusPill, { status: proposal.status })] }), description: _jsxs(_Fragment, { children: ["Version ", proposal.version, " \u00B7 by ", proposal.created_by] }), actions: _jsxs(_Fragment, { children: [_jsx(CopyChip, { value: proposal.id, display: proposal.id.slice(0, 8), title: "Copy proposal id" }), _jsx(LinkButton, { to: `/chat?proposal_id=${proposal.id}`, variant: "ghost", leadingIcon: _jsx(MessageSquare, { "aria-hidden": true }), children: "Refine in chat" }), _jsx(LinkButton, { to: "/approvals", variant: "primary", leadingIcon: _jsx(ShieldCheck, { "aria-hidden": true }), children: "Approvals" })] }) }), _jsx("div", { className: "canvas-wrap", children: empty ? (_jsx(Empty, { icon: _jsx(GitBranch, { "aria-hidden": true, size: 22 }), title: "This proposal has no facts or dimensions yet", description: "Open it in chat and ask the agent to design a model.", action: _jsx(LinkButton, { to: `/chat?proposal_id=${proposal.id}`, variant: "primary", leadingIcon: _jsx(MessageSquare, { "aria-hidden": true }), children: "Open in chat" }) })) : (_jsxs(ReactFlow, { nodes: nodes, edges: edges, nodeTypes: nodeTypes, fitView: true, fitViewOptions: { padding: 0.2 }, minZoom: 0.2, maxZoom: 1.5, proOptions: { hideAttribution: true }, children: [_jsx(Background, { variant: BackgroundVariant.Dots, gap: 20, size: 1.2, color: "#dadde2" }), _jsx(Controls, { showInteractive: false }), _jsx(MiniMap, { pannable: true, zoomable: true, maskColor: "rgba(15,23,42,0.06)", nodeColor: (n) => {
                                if (n.type === "fact")
                                    return "#fef3c7";
                                const reused = n.data.dim?.reused_from_seed;
                                return reused ? "#d1fae5" : "#dbeafe";
                            } })] })) })] }));
}

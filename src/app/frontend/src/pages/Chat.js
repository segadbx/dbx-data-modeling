import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Bot, Check, GitBranch, Loader2, MessageSquare, Send, Sparkles, User, } from "lucide-react";
import { useChat } from "../state/ChatContext";
import { Button } from "../ui/Button";
import { TextArea } from "../ui/Input";
import { PageHeader } from "../ui/PageHeader";
import { Badge } from "../ui/Badge";
import { CopyChip } from "../ui/CopyChip";
import SessionsSidebar from "./SessionsSidebar";
const STORAGE_KEY = "modeler.showReasoning";
const SUGGESTED = [
    "Propose a dimensional model for fact_workorder. Reuse seed dims where applicable.",
    "We have new procurement and reliability data in silver. Incorporate it into the existing gold model.",
    "Add an SCD2 dim for employees. Explain why it should be type 2.",
    "Use dim_employee instead of creating a new labor dim.",
];
export default function Chat() {
    const [params, setParams] = useSearchParams();
    const urlSessionId = params.get("session_id");
    const urlProposalId = params.get("proposal_id");
    const { sessionId, proposalId, messages, reasoning, busy, err, input, setInput, send, loadSession, } = useChat();
    const [showReasoning, setShowReasoning] = useState(() => localStorage.getItem(STORAGE_KEY) !== "false");
    const messagesRef = useRef(null);
    function toggleReasoning() {
        setShowReasoning((prev) => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    }
    // Hydrate from URL only when the URL itself changes (back/forward, refresh,
    // deep link). Reading `sessionId` via a ref keeps in-memory state changes
    // (e.g. clicking a chat in the sidebar) from re-firing this effect and
    // racing against the state→URL effect below — that race caused the chat
    // view to oscillate between sessions.
    const sessionIdRef = useRef(sessionId);
    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);
    useEffect(() => {
        if (urlSessionId && urlSessionId !== sessionIdRef.current) {
            loadSession(urlSessionId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlSessionId]);
    useEffect(() => {
        const next = new URLSearchParams(params);
        let dirty = false;
        if (sessionId && sessionId !== next.get("session_id")) {
            next.set("session_id", sessionId);
            dirty = true;
        }
        if (proposalId && proposalId !== next.get("proposal_id")) {
            next.set("proposal_id", proposalId);
            dirty = true;
        }
        if (dirty)
            setParams(next, { replace: true });
    }, [sessionId, proposalId, params, setParams, urlProposalId]);
    useEffect(() => {
        messagesRef.current?.scrollTo({
            top: messagesRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [messages.length, reasoning.length]);
    const summaryStepCount = useMemo(() => reasoning.length, [reasoning]);
    const showEmpty = messages.length === 0 && !busy && reasoning.length === 0;
    function onKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!busy)
                send();
        }
    }
    return (_jsxs("div", { className: "page page-fullheight", children: [_jsx(PageHeader, { eyebrow: _jsxs(_Fragment, { children: [_jsx(Sparkles, { size: 12 }), " AI agent"] }), title: "Modeling chat", description: "Converse with the modeling agent to design, refine, and approve a gold-layer star schema.", actions: proposalId && (_jsxs(Badge, { tone: "brand", icon: _jsx(GitBranch, { size: 12 }), children: ["Working on ", _jsx("code", { children: proposalId.slice(0, 8) })] })) }), _jsxs("div", { className: "chat-layout", children: [_jsx(SessionsSidebar, {}), _jsxs("div", { className: "chat-main", children: [proposalId && (_jsxs("div", { className: "chat-banner", children: [_jsx(GitBranch, { "aria-hidden": true }), _jsx("span", { children: "Linked to proposal" }), _jsx(CopyChip, { value: proposalId, display: proposalId.slice(0, 8), title: "Copy proposal id" }), _jsxs("div", { className: "chat-banner-links", children: [_jsx("a", { href: `/canvas?proposal_id=${proposalId}`, children: "view canvas \u2192" }), _jsx("a", { href: `/approvals`, children: "approvals \u2192" })] })] })), _jsx("div", { className: "chat-messages", ref: messagesRef, children: showEmpty ? (_jsxs("div", { className: "chat-empty", children: [_jsx("div", { className: "chat-empty-icon", children: _jsx(Sparkles, { "aria-hidden": true }) }), _jsx("div", { className: "chat-empty-title", children: "Design a star schema with AI" }), _jsx("div", { className: "chat-empty-desc", children: "Describe the model you need and the agent will propose facts, dimensions, joins, and DDL. Refine with follow-ups; approvals and DDL apply happen in the Approvals tab." }), _jsx("div", { className: "chat-prompts", children: SUGGESTED.map((p) => (_jsx("button", { type: "button", className: "chat-prompt-btn", onClick: () => setInput(p), children: p }, p))) })] })) : (messages.map((m, i) => (_jsxs("div", { className: `chat-msg ${m.role}`, children: [_jsx("div", { className: "chat-msg-avatar", "aria-hidden": true, children: m.role === "user" ? _jsx(User, {}) : _jsx(Bot, {}) }), _jsx("div", { className: "chat-msg-bubble", children: _jsx("pre", { children: m.content }) })] }, i)))) }), (busy || reasoning.length > 0) && (_jsx(ReasoningPanel, { rows: reasoning, expanded: showReasoning, onToggle: toggleReasoning, stepCount: summaryStepCount, busy: busy })), err && (_jsxs("div", { className: "chat-error", role: "alert", children: [_jsx(AlertTriangle, { "aria-hidden": true }), " ", err] })), _jsxs("div", { className: "chat-composer", children: [_jsxs("div", { className: "chat-composer-row", children: [_jsx(TextArea, { value: input, onChange: (e) => setInput(e.target.value), onKeyDown: onKeyDown, placeholder: "Ask the agent to propose, refine, or extend a model\u2026", rows: 1, "aria-label": "Message" }), _jsx(Button, { variant: "primary", onClick: send, disabled: busy || !input.trim(), loading: busy, leadingIcon: !busy ? _jsx(Send, { "aria-hidden": true }) : undefined, children: busy ? "Thinking" : "Send" })] }), _jsxs("div", { className: "chat-composer-hint", children: [_jsxs("span", { children: [_jsx(MessageSquare, { size: 12, style: { verticalAlign: "-2px", marginRight: 4, opacity: 0.7 }, "aria-hidden": true }), "Streaming responses from the modeling agent"] }), _jsxs("span", { className: "chat-composer-hint-keys", children: [_jsx("span", { className: "kbd", children: "Enter" }), " to send \u00B7 ", _jsx("span", { className: "kbd", children: "Shift" }), "+", _jsx("span", { className: "kbd", children: "Enter" }), " for newline"] })] })] })] })] })] }));
}
function ReasoningPanel({ rows, expanded, onToggle, stepCount, busy, }) {
    return (_jsxs("div", { className: "reasoning-card", children: [_jsxs("div", { className: "reasoning-card-head", children: [_jsxs("span", { className: "reasoning-card-title", children: [_jsx(Sparkles, { "aria-hidden": true }), " Agent reasoning", _jsxs(Badge, { tone: "neutral", children: [stepCount, " step", stepCount === 1 ? "" : "s"] })] }), _jsx(Button, { size: "sm", variant: "ghost", onClick: onToggle, children: expanded ? "Hide" : "Show" })] }), expanded && (_jsx("div", { className: "reasoning-card-body", children: _jsxs("ul", { className: "reasoning-list", children: [rows.map((row, i) => {
                            const done = row.summary !== null;
                            return (_jsxs("li", { className: `reasoning-event ${done ? "is-done" : "is-active"}`, children: [_jsx("span", { className: "reasoning-glyph", "aria-hidden": true, children: done ? _jsx(Check, {}) : _jsx(Loader2, {}) }), _jsx("span", { className: "reasoning-label", children: done
                                            ? `${row.label.replace(/…$/, "")} — ${row.summary}`
                                            : row.label }), row.llm && _jsx("pre", { className: "reasoning-llm-stream", children: row.llm })] }, i));
                        }), busy && rows.length === 0 && (_jsxs("li", { className: "reasoning-event is-active", children: [_jsx("span", { className: "reasoning-glyph", "aria-hidden": true, children: _jsx(Loader2, {}) }), _jsx("span", { className: "reasoning-label", children: "Starting agent\u2026" })] }))] }) }))] }));
}

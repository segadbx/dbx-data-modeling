import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, Search, MessagesSquare, MoreVertical, Pencil } from "lucide-react";
import { useChat } from "../state/ChatContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
function formatRelative(iso) {
    if (!iso)
        return "";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t))
        return "";
    const diff = Date.now() - t;
    const min = Math.floor(diff / 60_000);
    if (min < 1)
        return "just now";
    if (min < 60)
        return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24)
        return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7)
        return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
}
function bucketize(s) {
    if (!s.last_message_at)
        return "earlier";
    const ts = new Date(s.last_message_at);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    if (ts.getTime() >= startOfToday)
        return "today";
    if (ts.getTime() >= startOfYesterday)
        return "yesterday";
    return "earlier";
}
const BUCKET_LABELS = {
    today: "Today",
    yesterday: "Yesterday",
    earlier: "Earlier",
};
export default function SessionsSidebar() {
    const { sessions, sessionId, newChat, loadSession, renameSession, busy } = useChat();
    const [query, setQuery] = useState("");
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState("");
    const menuRef = useRef(null);
    // Close an open kebab menu when clicking anywhere outside it.
    useEffect(() => {
        if (!menuOpenId)
            return;
        const onDown = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [menuOpenId]);
    const startEdit = (s) => {
        setMenuOpenId(null);
        setDraft(s.title ?? "");
        setEditingId(s.id);
    };
    const commitEdit = (s) => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== (s.title ?? "")) {
            renameSession(s.id, trimmed);
        }
        setEditingId(null);
    };
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q)
            return sessions;
        return sessions.filter((s) => (s.title ?? "").toLowerCase().includes(q));
    }, [sessions, query]);
    const grouped = useMemo(() => {
        const buckets = { today: [], yesterday: [], earlier: [] };
        for (const s of filtered)
            buckets[bucketize(s)].push(s);
        return buckets;
    }, [filtered]);
    return (_jsxs("div", { className: "chat-sessions", children: [_jsxs("div", { className: "chat-sessions-head", children: [_jsx(Button, { variant: "primary", onClick: () => newChat(), disabled: busy, leadingIcon: _jsx(MessageSquarePlus, { "aria-hidden": true }), title: busy ? "Wait for the current response to finish" : "Start a new chat", children: "New chat" }), _jsx(Input, { leadingIcon: _jsx(Search, { "aria-hidden": true }), placeholder: "Search chats\u2026", value: query, onChange: (e) => setQuery(e.target.value), "aria-label": "Search chats" })] }), _jsxs("div", { className: "chat-sessions-list", children: [sessions.length === 0 && (_jsxs("div", { className: "chat-sessions-empty", children: [_jsx(MessagesSquare, { size: 18, style: { display: "block", margin: "0 auto 6px", opacity: 0.5 }, "aria-hidden": true }), "No saved chats yet."] })), ["today", "yesterday", "earlier"].map((bucket) => grouped[bucket].length > 0 ? (_jsxs("div", { children: [_jsx("div", { className: "chat-sessions-group-label", children: BUCKET_LABELS[bucket] }), grouped[bucket].map((s) => {
                                const active = s.id === sessionId;
                                const editing = s.id === editingId;
                                return (_jsx("div", { className: `chat-session-item${active ? " is-active" : ""}`, children: editing ? (_jsx("input", { className: "chat-session-item-edit", value: draft, autoFocus: true, onFocus: (e) => e.target.select(), onChange: (e) => setDraft(e.target.value), onBlur: () => commitEdit(s), onKeyDown: (e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                commitEdit(s);
                                            }
                                            else if (e.key === "Escape") {
                                                e.preventDefault();
                                                setEditingId(null);
                                            }
                                        }, "aria-label": "Rename chat" })) : (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: "chat-session-item-main", onClick: () => loadSession(s.id), children: [_jsx("span", { className: "chat-session-item-title", children: s.title?.trim() ? s.title : "Untitled chat" }), _jsxs("span", { className: "chat-session-item-meta", children: [_jsx("span", { children: formatRelative(s.last_message_at) }), s.proposal_id && (_jsxs("span", { style: { color: "var(--brand-600)" }, children: ["\u00B7 ", _jsx("code", { children: s.proposal_id.slice(0, 6) })] }))] })] }), _jsx("button", { type: "button", className: "chat-session-item-menu-btn", onClick: (e) => {
                                                    e.stopPropagation();
                                                    setMenuOpenId((cur) => (cur === s.id ? null : s.id));
                                                }, "aria-label": "Chat options", "aria-haspopup": "menu", "aria-expanded": menuOpenId === s.id, children: _jsx(MoreVertical, { size: 16, "aria-hidden": true }) }), menuOpenId === s.id && (_jsx("div", { className: "chat-session-menu", role: "menu", ref: menuRef, children: _jsxs("button", { type: "button", role: "menuitem", onClick: () => startEdit(s), children: [_jsx(Pencil, { size: 14, "aria-hidden": true }), " Rename"] }) }))] })) }, s.id));
                            })] }, bucket)) : null)] })] }));
}

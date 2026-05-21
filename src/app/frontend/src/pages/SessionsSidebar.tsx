import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, Search, MessagesSquare, MoreVertical, Pencil } from "lucide-react";
import { useChat } from "../state/ChatContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { SessionSummary } from "../api/client";

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function bucketize(s: SessionSummary): "today" | "yesterday" | "earlier" {
  if (!s.last_message_at) return "earlier";
  const ts = new Date(s.last_message_at);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  if (ts.getTime() >= startOfToday) return "today";
  if (ts.getTime() >= startOfYesterday) return "yesterday";
  return "earlier";
}

const BUCKET_LABELS: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

export default function SessionsSidebar() {
  const { sessions, sessionId, newChat, loadSession, renameSession, busy } = useChat();
  const [query, setQuery] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close an open kebab menu when clicking anywhere outside it.
  useEffect(() => {
    if (!menuOpenId) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpenId]);

  const startEdit = (s: SessionSummary) => {
    setMenuOpenId(null);
    setDraft(s.title ?? "");
    setEditingId(s.id);
  };

  const commitEdit = (s: SessionSummary) => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== (s.title ?? "")) {
      renameSession(s.id, trimmed);
    }
    setEditingId(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => (s.title ?? "").toLowerCase().includes(q));
  }, [sessions, query]);

  const grouped = useMemo(() => {
    const buckets: Record<string, SessionSummary[]> = { today: [], yesterday: [], earlier: [] };
    for (const s of filtered) buckets[bucketize(s)].push(s);
    return buckets;
  }, [filtered]);

  return (
    <div className="chat-sessions">
      <div className="chat-sessions-head">
        <Button
          variant="primary"
          onClick={() => newChat()}
          disabled={busy}
          leadingIcon={<MessageSquarePlus aria-hidden />}
          title={busy ? "Wait for the current response to finish" : "Start a new chat"}
        >
          New chat
        </Button>
        <Input
          leadingIcon={<Search aria-hidden />}
          placeholder="Search chats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search chats"
        />
      </div>
      <div className="chat-sessions-list">
        {sessions.length === 0 && (
          <div className="chat-sessions-empty">
            <MessagesSquare
              size={18}
              style={{ display: "block", margin: "0 auto 6px", opacity: 0.5 }}
              aria-hidden
            />
            No saved chats yet.
          </div>
        )}
        {(["today", "yesterday", "earlier"] as const).map((bucket) =>
          grouped[bucket].length > 0 ? (
            <div key={bucket}>
              <div className="chat-sessions-group-label">{BUCKET_LABELS[bucket]}</div>
              {grouped[bucket].map((s) => {
                const active = s.id === sessionId;
                const editing = s.id === editingId;
                return (
                  <div
                    key={s.id}
                    className={`chat-session-item${active ? " is-active" : ""}`}
                  >
                    {editing ? (
                      <input
                        className="chat-session-item-edit"
                        value={draft}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => commitEdit(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit(s);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingId(null);
                          }
                        }}
                        aria-label="Rename chat"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="chat-session-item-main"
                          onClick={() => loadSession(s.id)}
                        >
                          <span className="chat-session-item-title">
                            {s.title?.trim() ? s.title : "Untitled chat"}
                          </span>
                          <span className="chat-session-item-meta">
                            <span>{formatRelative(s.last_message_at)}</span>
                            {s.proposal_id && (
                              <span style={{ color: "var(--brand-600)" }}>
                                · <code>{s.proposal_id.slice(0, 6)}</code>
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="chat-session-item-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId((cur) => (cur === s.id ? null : s.id));
                          }}
                          aria-label="Chat options"
                          aria-haspopup="menu"
                          aria-expanded={menuOpenId === s.id}
                        >
                          <MoreVertical size={16} aria-hidden />
                        </button>
                        {menuOpenId === s.id && (
                          <div className="chat-session-menu" role="menu" ref={menuRef}>
                            <button type="button" role="menuitem" onClick={() => startEdit(s)}>
                              <Pencil size={14} aria-hidden /> Rename
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

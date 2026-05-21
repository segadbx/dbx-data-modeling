import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  Check,
  GitBranch,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { useChat, type ReasoningRow } from "../state/ChatContext";
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
  const {
    sessionId,
    proposalId,
    messages,
    reasoning,
    busy,
    err,
    input,
    setInput,
    send,
    loadSession,
  } = useChat();

  const [showReasoning, setShowReasoning] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) !== "false",
  );
  const messagesRef = useRef<HTMLDivElement | null>(null);

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
    if (dirty) setParams(next, { replace: true });
  }, [sessionId, proposalId, params, setParams, urlProposalId]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, reasoning.length]);

  const summaryStepCount = useMemo(() => reasoning.length, [reasoning]);
  const showEmpty = messages.length === 0 && !busy && reasoning.length === 0;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy) send();
    }
  }

  return (
    <div className="page page-fullheight">
      <PageHeader
        eyebrow={
          <>
            <Sparkles size={12} /> AI agent
          </>
        }
        title="Modeling chat"
        description="Converse with the modeling agent to design, refine, and approve a gold-layer star schema."
        actions={
          proposalId && (
            <Badge tone="brand" icon={<GitBranch size={12} />}>
              Working on <code>{proposalId.slice(0, 8)}</code>
            </Badge>
          )
        }
      />

      <div className="chat-layout">
        <SessionsSidebar />
        <div className="chat-main">
          {proposalId && (
            <div className="chat-banner">
              <GitBranch aria-hidden />
              <span>Linked to proposal</span>
              <CopyChip value={proposalId} display={proposalId.slice(0, 8)} title="Copy proposal id" />
              <div className="chat-banner-links">
                <a href={`/canvas?proposal_id=${proposalId}`}>view canvas →</a>
                <a href={`/approvals`}>approvals →</a>
              </div>
            </div>
          )}

          <div className="chat-messages" ref={messagesRef}>
            {showEmpty ? (
              <div className="chat-empty">
                <div className="chat-empty-icon">
                  <Sparkles aria-hidden />
                </div>
                <div className="chat-empty-title">Design a star schema with AI</div>
                <div className="chat-empty-desc">
                  Describe the model you need and the agent will propose facts, dimensions, joins, and DDL.
                  Refine with follow-ups; approvals and DDL apply happen in the Approvals tab.
                </div>
                <div className="chat-prompts">
                  {SUGGESTED.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="chat-prompt-btn"
                      onClick={() => setInput(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  <div className="chat-msg-avatar" aria-hidden>
                    {m.role === "user" ? <User /> : <Bot />}
                  </div>
                  <div className="chat-msg-bubble">
                    <pre>{m.content}</pre>
                  </div>
                </div>
              ))
            )}
          </div>

          {(busy || reasoning.length > 0) && (
            <ReasoningPanel
              rows={reasoning}
              expanded={showReasoning}
              onToggle={toggleReasoning}
              stepCount={summaryStepCount}
              busy={busy}
            />
          )}

          {err && (
            <div className="chat-error" role="alert">
              <AlertTriangle aria-hidden /> {err}
            </div>
          )}

          <div className="chat-composer">
            <div className="chat-composer-row">
              <TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask the agent to propose, refine, or extend a model…"
                rows={1}
                aria-label="Message"
              />
              <Button
                variant="primary"
                onClick={send}
                disabled={busy || !input.trim()}
                loading={busy}
                leadingIcon={!busy ? <Send aria-hidden /> : undefined}
              >
                {busy ? "Thinking" : "Send"}
              </Button>
            </div>
            <div className="chat-composer-hint">
              <span>
                <MessageSquare
                  size={12}
                  style={{ verticalAlign: "-2px", marginRight: 4, opacity: 0.7 }}
                  aria-hidden
                />
                Streaming responses from the modeling agent
              </span>
              <span className="chat-composer-hint-keys">
                <span className="kbd">Enter</span> to send · <span className="kbd">Shift</span>+<span className="kbd">Enter</span> for newline
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReasoningPanel({
  rows,
  expanded,
  onToggle,
  stepCount,
  busy,
}: {
  rows: ReasoningRow[];
  expanded: boolean;
  onToggle: () => void;
  stepCount: number;
  busy: boolean;
}) {
  return (
    <div className="reasoning-card">
      <div className="reasoning-card-head">
        <span className="reasoning-card-title">
          <Sparkles aria-hidden /> Agent reasoning
          <Badge tone="neutral">
            {stepCount} step{stepCount === 1 ? "" : "s"}
          </Badge>
        </span>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {expanded ? "Hide" : "Show"}
        </Button>
      </div>
      {expanded && (
        <div className="reasoning-card-body">
          <ul className="reasoning-list">
            {rows.map((row, i) => {
              const done = row.summary !== null;
              return (
                <li
                  key={i}
                  className={`reasoning-event ${done ? "is-done" : "is-active"}`}
                >
                  <span className="reasoning-glyph" aria-hidden>
                    {done ? <Check /> : <Loader2 />}
                  </span>
                  <span className="reasoning-label">
                    {done
                      ? `${row.label.replace(/…$/, "")} — ${row.summary}`
                      : row.label}
                  </span>
                  {row.llm && <pre className="reasoning-llm-stream">{row.llm}</pre>}
                </li>
              );
            })}
            {busy && rows.length === 0 && (
              <li className="reasoning-event is-active">
                <span className="reasoning-glyph" aria-hidden>
                  <Loader2 />
                </span>
                <span className="reasoning-label">Starting agent…</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

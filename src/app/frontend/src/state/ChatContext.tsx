import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  chatStream,
  createSession as apiCreateSession,
  getSession,
  listSessions,
  updateSessionTitle,
  type ChatTurn,
  type ReasoningEvent,
  type SessionSummary,
} from "../api/client";

export type ReasoningRow = {
  name: string;
  label: string;
  summary: string | null;
  llm: string;
};

type ChatContextValue = {
  sessionId: string | null;
  proposalId: string | null;
  messages: ChatTurn[];
  reasoning: ReasoningRow[];
  busy: boolean;
  err: string | null;
  input: string;
  sessions: SessionSummary[];
  setInput: (v: string) => void;
  send: () => Promise<void>;
  newChat: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}

const DEFAULT_INPUT =
  "Propose a dimensional model for the silver source tables. Reuse seed dims where applicable.";

export function ChatProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [reasoning, setReasoning] = useState<ReasoningRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [input, setInput] = useState<string>(DEFAULT_INPUT);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  // Mirror `sessionId` in a ref so `loadSession` can stay a stable callback
  // (deps: []). Without this, every sessionId change would mint a new
  // loadSession identity and re-trigger any effect that depends on it —
  // causing the Chat page's URL↔state sync to oscillate when the user clicks
  // a different chat in the sidebar.
  const sessionIdRef = useRef<string | null>(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions();
      setSessions(list);
    } catch (e: unknown) {
      // Sidebar refresh failure shouldn't break the chat experience.
      console.warn("listSessions failed", e);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  function handleEvent(ev: ReasoningEvent) {
    if (ev.type === "node_start") {
      setReasoning((rows) => [
        ...rows,
        { name: ev.name, label: ev.label, summary: null, llm: "" },
      ]);
    } else if (ev.type === "node_end") {
      setReasoning((rows) => {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].name === ev.name && rows[i].summary === null) {
            const next = rows.slice();
            next[i] = { ...rows[i], summary: ev.summary };
            return next;
          }
        }
        return rows;
      });
    } else if (ev.type === "llm_token") {
      setReasoning((rows) => {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].summary === null) {
            const next = rows.slice();
            next[i] = { ...rows[i], llm: rows[i].llm + ev.content };
            return next;
          }
        }
        return rows;
      });
    } else if (ev.type === "final") {
      const reply = ev.messages?.[0];
      if (reply) setMessages((prev) => [...prev, reply]);
      const pid = ev.custom_outputs?.proposal_id;
      if (pid) setProposalId(pid);
      const sid = ev.custom_outputs?.session_id;
      if (sid) setSessionId(sid);
    } else if (ev.type === "error") {
      setErr(ev.message);
    }
  }

  const send = useCallback(async () => {
    if (!input.trim() || busy) return;
    setErr(null);
    setReasoning([]);
    const next: ChatTurn[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      await chatStream(next, proposalId, sessionId, handleEvent, abortRef.current.signal);
      // Refresh sidebar so the just-active session bubbles up + title is current.
      refreshSessions();
    } catch (e: unknown) {
      if ((e as { name?: string }).name === "AbortError") {
        // newChat() aborted us — silent.
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, input, messages, proposalId, sessionId, refreshSessions]);

  const newChat = useCallback(async () => {
    abortRef.current?.abort();
    setBusy(false);
    setErr(null);
    setReasoning([]);
    setMessages([]);
    setProposalId(null);
    setInput(DEFAULT_INPUT);
    try {
      const s = await apiCreateSession(null);
      setSessionId(s.id);
      refreshSessions();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [refreshSessions]);

  const renameSession = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      // Optimistically reflect the new title so the rename feels instant.
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s)));
      try {
        await updateSessionTitle(id, trimmed);
        await refreshSessions();
      } catch (e: unknown) {
        // Roll back the optimistic title by re-fetching the source of truth.
        refreshSessions();
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [refreshSessions],
  );

  const loadSession = useCallback(async (id: string) => {
    if (id === sessionIdRef.current) return;
    abortRef.current?.abort();
    setBusy(false);
    setErr(null);
    setReasoning([]);
    try {
      const detail = await getSession(id);
      setSessionId(detail.id);
      setProposalId(detail.proposal_id);
      setMessages(detail.messages);
      setInput("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const value: ChatContextValue = {
    sessionId,
    proposalId,
    messages,
    reasoning,
    busy,
    err,
    input,
    sessions,
    setInput,
    send,
    newChat,
    loadSession,
    refreshSessions,
    renameSession,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

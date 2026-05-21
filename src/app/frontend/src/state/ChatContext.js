import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useRef, useState, } from "react";
import { chatStream, createSession as apiCreateSession, getSession, listSessions, updateSessionTitle, } from "../api/client";
const ChatContext = createContext(null);
export function useChat() {
    const ctx = useContext(ChatContext);
    if (!ctx)
        throw new Error("useChat must be used inside <ChatProvider>");
    return ctx;
}
const DEFAULT_INPUT = "Propose a dimensional model for the silver source tables. Reuse seed dims where applicable.";
export function ChatProvider({ children }) {
    const [sessionId, setSessionId] = useState(null);
    const [proposalId, setProposalId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [reasoning, setReasoning] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [input, setInput] = useState(DEFAULT_INPUT);
    const [sessions, setSessions] = useState([]);
    const abortRef = useRef(null);
    // Mirror `sessionId` in a ref so `loadSession` can stay a stable callback
    // (deps: []). Without this, every sessionId change would mint a new
    // loadSession identity and re-trigger any effect that depends on it —
    // causing the Chat page's URL↔state sync to oscillate when the user clicks
    // a different chat in the sidebar.
    const sessionIdRef = useRef(sessionId);
    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);
    const refreshSessions = useCallback(async () => {
        try {
            const list = await listSessions();
            setSessions(list);
        }
        catch (e) {
            // Sidebar refresh failure shouldn't break the chat experience.
            console.warn("listSessions failed", e);
        }
    }, []);
    useEffect(() => {
        refreshSessions();
    }, [refreshSessions]);
    function handleEvent(ev) {
        if (ev.type === "node_start") {
            setReasoning((rows) => [
                ...rows,
                { name: ev.name, label: ev.label, summary: null, llm: "" },
            ]);
        }
        else if (ev.type === "node_end") {
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
        }
        else if (ev.type === "llm_token") {
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
        }
        else if (ev.type === "final") {
            const reply = ev.messages?.[0];
            if (reply)
                setMessages((prev) => [...prev, reply]);
            const pid = ev.custom_outputs?.proposal_id;
            if (pid)
                setProposalId(pid);
            const sid = ev.custom_outputs?.session_id;
            if (sid)
                setSessionId(sid);
        }
        else if (ev.type === "error") {
            setErr(ev.message);
        }
    }
    const send = useCallback(async () => {
        if (!input.trim() || busy)
            return;
        setErr(null);
        setReasoning([]);
        const next = [...messages, { role: "user", content: input }];
        setMessages(next);
        setInput("");
        setBusy(true);
        abortRef.current = new AbortController();
        try {
            await chatStream(next, proposalId, sessionId, handleEvent, abortRef.current.signal);
            // Refresh sidebar so the just-active session bubbles up + title is current.
            refreshSessions();
        }
        catch (e) {
            if (e.name === "AbortError") {
                // newChat() aborted us — silent.
            }
            else {
                setErr(e instanceof Error ? e.message : String(e));
            }
        }
        finally {
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
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        }
    }, [refreshSessions]);
    const renameSession = useCallback(async (id, title) => {
        const trimmed = title.trim();
        if (!trimmed)
            return;
        // Optimistically reflect the new title so the rename feels instant.
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s)));
        try {
            await updateSessionTitle(id, trimmed);
            await refreshSessions();
        }
        catch (e) {
            // Roll back the optimistic title by re-fetching the source of truth.
            refreshSessions();
            setErr(e instanceof Error ? e.message : String(e));
        }
    }, [refreshSessions]);
    const loadSession = useCallback(async (id) => {
        if (id === sessionIdRef.current)
            return;
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
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        }
    }, []);
    const value = {
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
    return _jsx(ChatContext.Provider, { value: value, children: children });
}

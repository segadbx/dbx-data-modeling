// Tiny fetch wrapper. Lives on the same origin in production (apx serves both).
export class ApiError extends Error {
    status;
    body;
    constructor(status, message, body) {
        super(message);
        this.status = status;
        this.body = body;
    }
}
export async function api(path, init) {
    const r = await fetch(`/api${path}`, init);
    if (!r.ok) {
        const text = await r.text();
        let body = text;
        try {
            body = JSON.parse(text);
        }
        catch { /* keep as text */ }
        throw new ApiError(r.status, `${r.status} ${text}`, body);
    }
    return r.json();
}
export const listSessions = () => api("/chat/sessions");
export const createSession = (title) => api("/chat/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: title ?? null }),
});
export const getSession = (id) => api(`/chat/sessions/${id}`);
export const updateSessionTitle = (id, title) => api(`/chat/sessions/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
});
export const deleteSession = (id) => api(`/chat/sessions/${id}`, { method: "DELETE" });
export const listTables = () => api("/catalog/tables");
export const describeTable = (name) => api(`/catalog/tables/${name}`);
export const listProposals = () => api("/proposals");
export const getProposal = (id) => api(`/proposals/${id}`);
export const approve = (id) => api(`/proposals/${id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
});
export const validateProposal = (id) => api(`/proposals/${id}/validate`, { method: "POST" });
export const chat = (messages, proposal_id, session_id) => api("/agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, proposal_id, session_id }),
});
export async function chatStream(messages, proposal_id, session_id, onEvent, signal) {
    const r = await fetch("/api/agent/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages, proposal_id, session_id }),
        signal,
    });
    if (!r.ok || !r.body)
        throw new Error(`${r.status} ${await r.text()}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by blank lines (\n\n).
        let sep;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            if (!frame.startsWith("data: "))
                continue;
            try {
                onEvent(JSON.parse(frame.slice(6)));
            }
            catch {
                // ignore malformed frame, keep streaming
            }
        }
    }
}
export const applyProposal = (proposal_id) => api("/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposal_id }),
});

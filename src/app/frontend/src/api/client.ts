// Tiny fetch wrapper. Lives on the same origin in production (apx serves both).
export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, init);
  if (!r.ok) {
    const text = await r.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep as text */ }
    throw new ApiError(r.status, `${r.status} ${text}`, body);
  }
  return r.json() as Promise<T>;
}

export type Table = { name: string; full_name: string; comment: string; table_type: string };
export type Column = { name: string; type: string; comment: string; position: number };
export type TableDetail = Table & { columns: Column[] };

export type ProposalDim = {
  name: string;
  comment?: string;
  scd?: "type1" | "type2";
  natural_key?: string;
  source_table?: string;
  columns?: { name: string; type: string; comment?: string }[];
  reused_from_seed?: boolean;
};
export type ProposalFact = {
  name: string;
  grain: string;
  comment?: string;
  natural_key: string;
  source_table: string;
  columns: { name: string; type: string; comment?: string }[];
  joins: { dim: string; alias: string; src_col: string; dim_col: string; scd2?: boolean }[];
};
export type ProposalModel = {
  catalog?: string;
  schema?: string;
  dims: ProposalDim[];
  facts: ProposalFact[];
};
export type Proposal = {
  id: string;
  version: number;
  status: string;
  created_by: string;
  model: ProposalModel;
  ddl_text: string | null;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type SessionSummary = {
  id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_message_at: string | null;
  proposal_id: string | null;
};
export type SessionDetail = SessionSummary & { messages: ChatTurn[] };

export const listSessions = () => api<SessionSummary[]>("/chat/sessions");
export const createSession = (title?: string | null) =>
  api<SessionSummary>("/chat/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: title ?? null }),
  });
export const getSession = (id: string) => api<SessionDetail>(`/chat/sessions/${id}`);
export const updateSessionTitle = (id: string, title: string) =>
  api<SessionSummary>(`/chat/sessions/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
export const deleteSession = (id: string) =>
  api<{ status: string }>(`/chat/sessions/${id}`, { method: "DELETE" });

export const listTables = () => api<Table[]>("/catalog/tables");
export const describeTable = (name: string) => api<TableDetail>(`/catalog/tables/${name}`);
export const listProposals = () => api<Proposal[]>("/proposals");
export const getProposal = (id: string) => api<Proposal>(`/proposals/${id}`);
export const approve = (id: string) =>
  api<{ status: string }>(`/proposals/${id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

export type ValidationIssue = {
  level: "error" | "warning";
  code: string;
  path: string;
  message: string;
};
export type ValidationReport = { ok: boolean; issues: ValidationIssue[] };
export const validateProposal = (id: string) =>
  api<ValidationReport>(`/proposals/${id}/validate`, { method: "POST" });
export const chat = (
  messages: ChatTurn[],
  proposal_id: string | null,
  session_id: string | null,
) =>
  api<{
    messages: ChatTurn[];
    custom_outputs: {
      proposal_id: string;
      proposal: ProposalModel;
      ddl: string;
      session_id: string;
    };
  }>(
    "/agent/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, proposal_id, session_id }),
    }
  );

// Streaming counterpart of /agent/chat. The backend emits a tagged-union of events
// (see backend/routers/agent.py:chat_stream). Use this when you want to show the
// agent's reasoning progress incrementally.
export type ReasoningEvent =
  | { type: "node_start"; name: string; label: string }
  | { type: "node_end"; name: string; summary: string }
  | { type: "llm_token"; content: string }
  | {
      type: "final";
      messages: ChatTurn[];
      custom_outputs: {
        proposal_id: string;
        proposal: ProposalModel;
        ddl: string;
        session_id: string;
      };
    }
  | { type: "error"; message: string };

export async function chatStream(
  messages: ChatTurn[],
  proposal_id: string | null,
  session_id: string | null,
  onEvent: (ev: ReasoningEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const r = await fetch("/api/agent/chat/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, proposal_id, session_id }),
    signal,
  });
  if (!r.ok || !r.body) throw new Error(`${r.status} ${await r.text()}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are separated by blank lines (\n\n).
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      if (!frame.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(frame.slice(6)) as ReasoningEvent);
      } catch {
        // ignore malformed frame, keep streaming
      }
    }
  }
}
export const applyProposal = (proposal_id: string) =>
  api<{ run_id: number; proposal_id: string }>("/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposal_id }),
  });

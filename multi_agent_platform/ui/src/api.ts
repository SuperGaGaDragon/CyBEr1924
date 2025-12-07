export type SessionSummary = {
  session_id: string;
  topic: string | null;
  created_at: string | null;
  last_updated: string | null;
};

export type Command =
  | "plan"
  | "next"
  | "all"
  | "ask"
  | "set_current_subtask"
  | "update_subtask"
  | "insert_subtask"
  | "append_subtask"
  | "skip_subtask";

export type Subtask = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  notes?: string;
  index: number;
};

export type WorkerOutput = {
  subtask_id: string;
  preview?: string;
  content?: string;
  timestamp: string;
};

export type ChatMessage = {
  role: string;
  payload?: Record<string, unknown>;
  timestamp: string;
};

export type SessionSnapshot = {
  session_id: string;
  topic: string;
  plan: Record<string, any>;
  subtasks: Subtask[];
  current_subtask_id: string | null;
  orchestrator_state: Record<string, any>;
  worker_outputs: WorkerOutput[];
  coord_decisions: Record<string, any>[];
  chat_history: ChatMessage[];
  message: string;
  ok: boolean;
  command?: string | null;
  mode?: string | null;
  context?: Record<string, any> | null;
  state: Record<string, any>;
};

// Use environment variable for API base URL, fallback to localhost for local development
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error("Failed to load sessions");
  return res.json();
}

export async function createSession(topic: string): Promise<SessionSnapshot> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

export async function getSession(id: string): Promise<SessionSnapshot> {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  if (!res.ok) throw new Error("Failed to load session");
  return res.json();
}

export async function sendCommand(
  id: string,
  command: Command,
  payload: Record<string, unknown> = {},
): Promise<SessionSnapshot> {
  const res = await fetch(`${API_BASE}/sessions/${id}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, payload }),
  });
  if (!res.ok) throw new Error("Failed to send command");
  return res.json();
}

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
  | "confirm_plan"
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
  needs_redo?: boolean;
  output?: string;
  description?: string;
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

export type OrchestratorMessage = {
  role: "user" | "orchestrator";
  content: string;
  ts: string;
};

export type OrchestratorEvent = {
  from_role: "orchestrator";
  to_role: "planner" | "reviewer" | "worker";
  kind: string;
  payload: Record<string, any>;
  ts: string;
};

export type PlannerChatMessage = {
  role: "user" | "planner";
  content: string;
  ts: string;
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
  plan_locked: boolean;
  session_mode: "planning" | "execution";
  orchestrator_messages: OrchestratorMessage[];
  orch_events: OrchestratorEvent[];
  planner_chat: PlannerChatMessage[];
  message: string;
  ok: boolean;
  command?: string | null;
  mode?: string | null;
  context?: Record<string, any> | null;
  state: Record<string, any>;
};

// Use environment variable for API base URL, fallback to localhost for local development
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

let accessToken: string | null = null;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const optionHeaders = options.headers;
  if (optionHeaders instanceof Headers) {
    optionHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(optionHeaders)) {
    for (const [key, value] of optionHeaders) {
      headers[key] = value;
    }
  } else if (optionHeaders) {
    Object.assign(headers, optionHeaders);
  }

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!resp.ok) {
    let text: string;
    try {
      text = await resp.text();
    } catch {
      text = resp.statusText;
    }
    throw new ApiError(resp.status, text || resp.statusText);
  }

  if (resp.status === 204) {
    return undefined as unknown as T;
  }

  return (await resp.json()) as T;
}

export async function listSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>("/sessions");
}

export async function createSession(topic: string): Promise<SessionSnapshot> {
  return request<SessionSnapshot>("/sessions", {
    method: "POST",
    body: JSON.stringify({ topic }),
  });
}

export async function getSession(id: string): Promise<SessionSnapshot> {
  return request<SessionSnapshot>(`/sessions/${id}`);
}

export async function sendCommand(
  id: string,
  command: Command,
  payload: Record<string, unknown> = {},
): Promise<SessionSnapshot> {
  return request<SessionSnapshot>(`/sessions/${id}/command`, {
    method: "POST",
    body: JSON.stringify({ command, payload }),
  });
}

export type AuthResponse = {
  message: string;
  access_token?: string | null;
  token_type?: string | null;
};

export async function register(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function verifyEmail(email: string, code: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function deleteSession(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/sessions/${id}`, {
    method: "DELETE",
  });
}

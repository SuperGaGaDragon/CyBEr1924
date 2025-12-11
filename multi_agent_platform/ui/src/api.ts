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
  | "skip_subtask"
  | "apply_reviewer_revision";

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

export type SubtaskProgressEvent = {
  agent: "worker" | "reviewer" | "planner";
  subtask_id: string;
  stage: "start" | "finish";
  status: "in_progress" | "completed";
  payload?: Record<string, any>;
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
  is_running?: boolean;
  last_progress_event_ts?: string | null;
  orchestrator_state: Record<string, any>;
  worker_outputs: WorkerOutput[];
  coord_decisions: Record<string, any>[];
  chat_history: ChatMessage[];
  plan_locked: boolean;
  session_mode: "planning" | "execution";
  progress_events: SubtaskProgressEvent[];
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

// Use environment variable for API base URL, fallback to intelligent detection
// If running on localhost/127.0.0.1 -> use local backend
// Otherwise (production) -> use Railway backend
const API_BASE = import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' &&
   (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:8000"
    : "https://cyber1924-production.up.railway.app");

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

export type CreateSessionOptions = {
  novel_mode?: boolean;
  novel_profile?: Record<string, unknown> | null;
};

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
    let errorMessage: string;
    try {
      const text = await resp.text();
      // Try to parse as JSON to extract the detail field
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorData.message || text;
      } catch {
        // If not JSON, use the text as-is
        errorMessage = text;
      }
    } catch {
      errorMessage = resp.statusText;
    }
    throw new ApiError(resp.status, errorMessage || resp.statusText);
  }

  if (resp.status === 204) {
    return undefined as unknown as T;
  }

  return (await resp.json()) as T;
}

export async function listSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>("/sessions");
}

export async function createSession(topic: string, options: CreateSessionOptions = {}): Promise<SessionSnapshot> {
  const payload: Record<string, unknown> = { topic };
  if (typeof options.novel_mode === "boolean") {
    payload.novel_mode = options.novel_mode;
  }
  if (options.novel_profile !== undefined) {
    payload.novel_profile = options.novel_profile;
  }

  return request<SessionSnapshot>("/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSession(id: string): Promise<SessionSnapshot> {
  return request<SessionSnapshot>(`/sessions/${id}`);
}

export type EventsResponse = {
  progress_events: SubtaskProgressEvent[];
  worker_outputs: WorkerOutput[];
  since?: string | null;
};

export async function getSessionEvents(
  id: string,
  since?: string | null,
): Promise<EventsResponse> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  return request<EventsResponse>(`/sessions/${id}/events${qs}`);
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

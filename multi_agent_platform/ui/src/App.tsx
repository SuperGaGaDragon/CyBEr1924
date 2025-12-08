import { type FormEvent, useEffect, useState, useRef } from "react";
import type { SessionSummary, SessionSnapshot } from "./api";
import {
  listSessions,
  createSession,
  getSession,
  sendCommand,
  login,
  register,
  verifyEmail,
  setAccessToken,
  deleteSession,
  ApiError,
} from "./api";
import "./App.css";
import AboutPage from "./AboutPage";

type PlanningViewProps = {
  session: SessionSnapshot;
  onSendPlanningMessage: (text: string) => void;
  onConfirmPlan: () => void;
};

function PlanningView({ session, onSendPlanningMessage, onConfirmPlan }: PlanningViewProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSendPlanningMessage(text);
    setInput("");
  };

  return (
    <div className="planning-view" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Planning Phase</h2>
          <p style={{ margin: "4px 0 0 0", color: "#4b5563", fontSize: "14px" }}>
            Chat with the Planner to refine the outline before execution starts.
          </p>
        </div>
        <button
          onClick={onConfirmPlan}
          disabled={session.plan_locked}
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
            background: session.plan_locked ? "#f3f4f6" : "#000000",
            color: session.plan_locked ? "#6b7280" : "#ffffff",
            cursor: session.plan_locked ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {session.plan_locked ? "Plan already confirmed" : "Confirm Plan & Start Execution"}
        </button>
      </div>

      <div style={{
        flex: 1,
        overflowY: "auto",
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}>
        {session.planner_chat.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: "14px" }}>
            No planning messages yet. Share all requirements and context with the Planner here.
          </div>
        ) : (
          session.planner_chat.map((msg, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "70%",
                padding: "12px 14px",
                borderRadius: "12px",
                background: msg.role === "user" ? "#000000" : "#ffffff",
                color: msg.role === "user" ? "#ffffff" : "#111827",
                border: msg.role === "user" ? "none" : "1px solid #e5e7eb",
                boxShadow: msg.role === "user" ? "0 8px 20px rgba(0,0,0,0.18)" : "0 8px 20px rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ fontSize: "11px", letterSpacing: "0.5px", textTransform: "uppercase", opacity: 0.6, marginBottom: "4px" }}>
                {msg.role === "user" ? "You" : "Planner"}
              </div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6", fontSize: "14px" }}>{msg.content}</div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          placeholder="Describe requirements for the Planner to shape the plan..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1,
            padding: "14px 16px",
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
            outline: "none",
            fontSize: "14px",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "14px 18px",
            borderRadius: "10px",
            border: "none",
            background: "#000000",
            color: "#ffffff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

type ExecutionViewProps = {
  session: SessionSnapshot;
  onSendExecutionMessage: (text: string) => void;
};

function ExecutionView({ session, onSendExecutionMessage }: ExecutionViewProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSendExecutionMessage(text);
    setInput("");
  };

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "24px",
      background: "#f9fafb",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Execution Chat</h2>
          <p style={{ margin: "4px 0 0 0", color: "#4b5563", fontSize: "14px" }}>
            Talk directly with the Orchestrator; all agent work happens behind the scenes.
          </p>
        </div>
      </div>

      <div style={{
        flex: 1,
        overflowY: "auto",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}>
        {session.orchestrator_messages.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: "14px" }}>
            No orchestrator messages yet. Ask for changes or new instructions to get started.
          </div>
        ) : (
          session.orchestrator_messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "70%",
                padding: "12px 14px",
                borderRadius: "12px",
                background: msg.role === "user" ? "#111827" : "#f3f4f6",
                color: msg.role === "user" ? "#ffffff" : "#111827",
                border: msg.role === "user" ? "none" : "1px solid #e5e7eb",
                boxShadow: msg.role === "user" ? "0 8px 20px rgba(0,0,0,0.2)" : "0 8px 20px rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ fontSize: "11px", letterSpacing: "0.5px", textTransform: "uppercase", opacity: 0.6, marginBottom: "4px" }}>
                {msg.role === "user" ? "You" : "Orchestrator"}
              </div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6", fontSize: "14px" }}>{msg.content}</div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          placeholder="Tell the orchestrator what to change or ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1,
            padding: "14px 16px",
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
            outline: "none",
            fontSize: "14px",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "14px 18px",
            borderRadius: "10px",
            border: "none",
            background: "#000000",
            color: "#ffffff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

type PlanPanelProps = {
  snapshot: SessionSnapshot;
  onPlanCommand: (
    command: PlanEditCommand,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
};

function PlanAdvancedPanel({ snapshot, onPlanCommand }: PlanPanelProps) {
  const planLocked = snapshot.plan_locked;

  const promptForSubtask = (
    defaultTitle = "",
    defaultNotes = "",
  ): { title: string; notes?: string } | null => {
    const rawTitle = window.prompt("Subtask title", defaultTitle);
    if (rawTitle === null) return null;
    const title = rawTitle.trim();
    if (!title) return null;
    const rawNotes = window.prompt("Description (optional)", defaultNotes);
    const notes =
      rawNotes === null || !rawNotes.trim() ? undefined : rawNotes.trim();
    return { title, notes };
  };

  const handleAppend = () => {
    const details = promptForSubtask();
    if (!details) return;
    const payload: Record<string, unknown> = { title: details.title };
    if (details.notes) payload.notes = details.notes;
    void onPlanCommand("append_subtask", payload);
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "20px" }}>
      <h4 style={{
        margin: "0 0 16px 0",
        fontSize: "14px",
        fontWeight: 700,
        letterSpacing: "0.6px",
        textTransform: "uppercase",
        color: "#111827",
      }}>
        Advanced Settings
      </h4>
      {planLocked && (
        <div style={{
          padding: "10px 12px",
          borderRadius: "8px",
          background: "#fef3c7",
          border: "1px solid #fcd34d",
          color: "#92400e",
          fontSize: "12px",
          marginBottom: "12px",
        }}>
          Plan is locked; edits will be blocked.
        </div>
      )}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        marginBottom: "14px",
      }}>
        <div style={{ fontWeight: 600, fontSize: "13px", color: "#111827" }}>
          {snapshot.plan?.title || snapshot.topic}
        </div>
        <button
          onClick={handleAppend}
          disabled={planLocked}
          style={{
            padding: "8px 12px",
            background: planLocked ? "#e5e7eb" : "#111827",
            color: planLocked ? "#6b7280" : "#ffffff",
            border: "none",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: planLocked ? "not-allowed" : "pointer",
          }}
        >
          ＋ Add
        </button>
      </div>
      <ol style={{ paddingLeft: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
        {snapshot.subtasks.map((subtask, idx) => {
          const isCurrent = snapshot.current_subtask_id === subtask.id;

          const handleSetCurrent = () => {
            void onPlanCommand("set_current_subtask", { subtask_id: subtask.id });
          };
          const handleUpdate = () => {
            const titleInput = window.prompt("Edit title", subtask.title);
            if (titleInput === null) return;
            const notesInput = window.prompt("Edit description (optional)", subtask.notes ?? "");
            const patch: Record<string, unknown> = {};
            const trimmedTitle = titleInput.trim();
            if (trimmedTitle) {
              patch.title = trimmedTitle;
            }
            if (notesInput !== null) {
              patch.notes = notesInput.trim();
            }
            if (!Object.keys(patch).length) return;
            void onPlanCommand("update_subtask", { subtask_id: subtask.id, patch });
          };
          const handleInsertBelow = () => {
            const details = promptForSubtask();
            if (!details) return;
            const payload: Record<string, unknown> = {
              title: details.title,
              after_id: subtask.id,
            };
            if (details.notes) payload.notes = details.notes;
            void onPlanCommand("insert_subtask", payload);
          };
          const handleSkip = () => {
            const confirmSkip = window.confirm(`Skip "${subtask.title}"?`);
            if (!confirmSkip) return;
            const reasonInput = window.prompt("Reason (optional)");
            const payload: Record<string, unknown> = {
              subtask_id: subtask.id,
            };
            if (reasonInput !== null && reasonInput.trim()) {
              payload.reason = reasonInput.trim();
            }
            void onPlanCommand("skip_subtask", payload);
          };

          return (
            <li
              key={subtask.id}
              style={{
                padding: "12px 12px",
                borderRadius: "10px",
                border: isCurrent ? "2px solid #111827" : "1px solid #e5e7eb",
                background: "#ffffff",
                boxShadow: isCurrent ? "0 8px 20px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "#f3f4f6",
                    color: "#111827",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}>
                    #{idx + 1}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600,
                      color: "#111827",
                      fontSize: "13px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {subtask.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {subtask.status}
                    </div>
                  </div>
                </div>
                {subtask.status === "in_progress" && (
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "999px",
                    background: "#eef2ff",
                    color: "#4338ca",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                  }}>
                    current
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={handleSetCurrent}
                  disabled={planLocked}
                  style={buttonStyle(planLocked)}
                >
                  Set current
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={planLocked}
                  style={buttonStyle(planLocked)}
                >
                  Update
                </button>
                <button
                  onClick={handleInsertBelow}
                  disabled={planLocked}
                  style={buttonStyle(planLocked)}
                >
                  Insert below
                </button>
                <button
                  onClick={handleSkip}
                  disabled={planLocked}
                  style={buttonStyle(planLocked)}
                >
                  Skip
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const buttonStyle = (disabled: boolean) => ({
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  background: disabled ? "#f3f4f6" : "#ffffff",
  color: disabled ? "#9ca3af" : "#111827",
  fontSize: "12px",
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
});

const SESSION_TOKEN_KEY = "cyber1924_last_session_id";
const LOGIN_REQUIRED_MESSAGE = "登录状态已过期，请重新登录";

// 支持两种写法：1) ?session=<id> 2) /c/<id>
function getSessionIdFromLocation(): string | null {
  const url = new URL(window.location.href);

  const fromQuery = url.searchParams.get("session");
  if (fromQuery) return fromQuery;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "c") {
    return parts[1];
  }
  return null;
}

// Push /c/<id> into the URL and remember it locally
function navigateToSession(sessionId: string) {
  const url = new URL(window.location.href);
  url.pathname = `/c/${sessionId}`;
  url.searchParams.delete("session");
  window.history.pushState(null, "", url.toString());
  localStorage.setItem(SESSION_TOKEN_KEY, sessionId);
}

type UIState = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  snapshot: SessionSnapshot | null;
  loading: boolean;
  error: string | null;
};

type AuthState = {
  email: string;
  password: string;
  confirmPassword: string;
  verificationCode: string;
  accessToken: string | null;
  isLoggedIn: boolean;
  authError: string | null;
  showVerification: boolean;
  showRegister: boolean;
};

type PlanEditCommand =
  | "set_current_subtask"
  | "update_subtask"
  | "insert_subtask"
  | "append_subtask"
  | "skip_subtask";

function App() {
  const isAboutPage = window.location.pathname.startsWith("/about");
  if (isAboutPage) {
    return <AboutPage />;
  }

  const [state, setState] = useState<UIState>({
    sessions: [],
    activeSessionId: null,
    snapshot: null,
    loading: false,
    error: null,
  });

  const [auth, setAuth] = useState<AuthState>({
    email: "",
    password: "",
    confirmPassword: "",
    verificationCode: "",
    accessToken: null,
    isLoggedIn: false,
    authError: null,
    showVerification: false,
    showRegister: false,
  });

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [layoutWidths, setLayoutWidths] = useState<[number, number, number]>([32, 36, 32]);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const layoutDrag = useRef<"left" | "right" | null>(null);
  const [orchChatOpen, setOrchChatOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    sessionId: string | null;
    sessionTopic: string | null;
  }>({ show: false, sessionId: null, sessionTopic: null });

  const isDraggingSidebar = useRef(false);
  const clearActiveSession = async (message: string) => {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setState((prev) => ({
      ...prev,
      loading: false,
      activeSessionId: null,
      snapshot: null,
      error: message,
    }));
    try {
      const sessions = await listSessions();
      setState((prev) => ({ ...prev, sessions }));
    } catch {
      /* ignore refresh errors */
    }
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.search = "";
    window.history.replaceState(null, "", url.toString());
  };

  const resetToLoggedOut = (authMessage?: string, clearEmail = false) => {
    localStorage.removeItem("cyber1924_token");
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setAccessToken(null);
    setAuth((prev) => ({
      email: clearEmail ? "" : prev.email,
      password: "",
      confirmPassword: "",
      verificationCode: "",
      accessToken: null,
      isLoggedIn: false,
      authError: authMessage ?? null,
      showVerification: false,
      showRegister: false,
    }));
    setState({
      sessions: [],
      activeSessionId: null,
      snapshot: null,
      loading: false,
      error: null,
    });

    const url = new URL(window.location.href);
    url.pathname = "/";
    url.search = "";
    window.history.replaceState(null, "", url.toString());
  };

  const handleAuthError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      resetToLoggedOut(LOGIN_REQUIRED_MESSAGE);
      return true;
    }
    return false;
  };

  // Initialize token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("cyber1924_token");
    if (savedToken) {
      setAccessToken(savedToken);
      setAuth((prev) => ({
        ...prev,
        accessToken: savedToken,
        isLoggedIn: true,
      }));
    }
  }, []);

  // Handle mouse events for resizing panels
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar.current) {
        const newWidth = Math.max(260, Math.min(520, e.clientX));
        setSidebarWidth(newWidth);
        return;
      }

      if (layoutDrag.current && layoutRef.current) {
        const rect = layoutRef.current.getBoundingClientRect();
        if (rect.width <= 0) return;
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        const MIN = 18;
        setLayoutWidths((prev) => {
          let [plan, worker, reviewer] = prev;
          if (layoutDrag.current === "left") {
            const safePlan = Math.max(MIN, Math.min(pct, 100 - reviewer - MIN));
            const safeWorker = Math.max(MIN, 100 - reviewer - safePlan);
            plan = safePlan;
            worker = safeWorker;
          } else if (layoutDrag.current === "right") {
            const safeReviewer = Math.max(MIN, Math.min(100 - plan - MIN, 100 - pct));
            const safeWorker = Math.max(MIN, 100 - plan - safeReviewer);
            reviewer = safeReviewer;
            worker = safeWorker;
          }
          const total = plan + worker + reviewer;
          return total > 0 ? [plan, worker, reviewer] : prev;
        });
      }
    };

    const handleMouseUp = () => {
      isDraggingSidebar.current = false;
      layoutDrag.current = null;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!auth.isLoggedIn || !auth.accessToken) return;

    (async () => {
      try {
        const sessions = await listSessions();
        setState((prev) => ({ ...prev, sessions }));

        if (sessions.length === 0) {
          return;
        }

        const urlSessionId = getSessionIdFromLocation();
        const storedId = localStorage.getItem(SESSION_TOKEN_KEY);
        const candidates = [urlSessionId, storedId].filter(Boolean) as string[];

        for (const id of candidates) {
          try {
            const snapshot = await getSession(id);
            navigateToSession(id);
            setState((prev) => ({
              ...prev,
              activeSessionId: id,
              snapshot,
            }));
            return;
          } catch {
            if (storedId === id) {
              localStorage.removeItem(SESSION_TOKEN_KEY);
            }
          }
        }

        const fallbackId = sessions[0].session_id;
        try {
          const snapshot = await getSession(fallbackId);
          navigateToSession(fallbackId);
          localStorage.setItem(SESSION_TOKEN_KEY, fallbackId);
          setState((prev) => ({
            ...prev,
            activeSessionId: fallbackId,
            snapshot,
          }));
        } catch (err: any) {
          if (handleAuthError(err)) return;
          console.error("Failed to restore fallback session", err);
        }
      } catch (err: any) {
        if (handleAuthError(err)) return;
        setState((prev) => ({
          ...prev,
          error: err.message ?? "Failed to load sessions",
        }));
      }
    })();
  }, [auth.isLoggedIn, auth.accessToken]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setAuth((prev) => ({ ...prev, authError: null }));

    try {
      const resp = await login(auth.email, auth.password);
      if (!resp.access_token) {
        throw new Error("No access token returned");
      }

      // Save token to localStorage
      localStorage.setItem("cyber1924_token", resp.access_token);

      setAccessToken(resp.access_token);

      setAuth((prev) => ({
        ...prev,
        accessToken: resp.access_token || null,
        isLoggedIn: true,
        authError: null,
      }));

      const sessions = await listSessions();
      setState((prev) => ({ ...prev, sessions }));
    } catch (err: any) {
      localStorage.removeItem("cyber1924_token");
      setAuth((prev) => ({
        ...prev,
        authError: err.message ?? "Login failed",
        isLoggedIn: false,
        accessToken: null,
      }));
      setAccessToken(null);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setAuth((prev) => ({ ...prev, authError: null }));

    // Check if passwords match
    if (auth.password !== auth.confirmPassword) {
      setAuth((prev) => ({
        ...prev,
        authError: "Passwords do not match",
      }));
      return;
    }

    try {
      await register(auth.email, auth.password);
      setAuth((prev) => ({
        ...prev,
        showVerification: true,
        showRegister: false,
        authError: null,
      }));
    } catch (err: any) {
      setAuth((prev) => ({
        ...prev,
        authError: err.message ?? "Registration failed",
      }));
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setAuth((prev) => ({ ...prev, authError: null }));

    try {
      await verifyEmail(auth.email, auth.verificationCode);
      setAuth((prev) => ({
        ...prev,
        showVerification: false,
        verificationCode: "",
        authError: null,
      }));
      alert("Email verified! You can now log in.");
    } catch (err: any) {
      setAuth((prev) => ({
        ...prev,
        authError: err.message ?? "Verification failed",
      }));
    }
  }

  async function handleCreateSession() {
    const topic = window.prompt("Project name (requirements go to Planner chat)");
    if (!topic) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await createSession(topic);
      const sessions = await listSessions();
      const id = snapshot.session_id;

      localStorage.setItem(SESSION_TOKEN_KEY, id);
      navigateToSession(id);

      setState((prev) => ({
        ...prev,
        loading: false,
        sessions,
        activeSessionId: id,
        snapshot,
      }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Failed to create session",
      }));
    }
  }

  async function handleSelectSession(id: string, shouldNavigate = true) {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await getSession(id);

      localStorage.setItem(SESSION_TOKEN_KEY, id);
      if (shouldNavigate) {
        navigateToSession(id);
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        activeSessionId: id,
        snapshot,
      }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      if (err instanceof ApiError && err.status === 404) {
        await clearActiveSession("Session not found; please pick or create a new one.");
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Failed to load session",
      }));
    }
  }

  async function handleCommand(command: "plan" | "next" | "all") {
    if (!state.activeSessionId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(state.activeSessionId, command);
      setState((prev) => ({ ...prev, loading: false, snapshot }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      if (err instanceof ApiError && err.status === 404) {
        await clearActiveSession("Session not found; please re-open or create a session.");
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Command failed",
      }));
    }
  }

  async function sendPlanningMessage(text: string) {
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(sessionId, "ask", { question: text });
      setState((prev) => ({ ...prev, loading: false, snapshot }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      if (err instanceof ApiError && err.status === 404) {
        await clearActiveSession("Session not found; please re-open or create a session.");
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Send planning message failed",
      }));
    }
  }

  async function sendExecutionMessage(text: string) {
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(sessionId, "ask", { question: text });
      setState((prev) => ({ ...prev, loading: false, snapshot }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      if (err instanceof ApiError && err.status === 404) {
        await clearActiveSession("Session not found; please re-open or create a session.");
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Send message failed",
      }));
    }
  }

  async function handlePlanCommand(
    command: PlanEditCommand,
    payload: Record<string, unknown> = {},
  ) {
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(sessionId, command, payload);
      setState((prev) => ({ ...prev, loading: false, snapshot }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      if (err instanceof ApiError && err.status === 404) {
        await clearActiveSession("Session not found; please re-open or create a session.");
        return;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Plan edit command failed",
      }));
    }
  }

  async function confirmCurrentPlan() {
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(sessionId, "confirm_plan");
      setState((prev) => ({ ...prev, loading: false, snapshot }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Confirm plan failed",
      }));
    }
  }

  function handleDeleteClick(sessionId: string, sessionTopic: string | null) {
    setDeleteConfirm({
      show: true,
      sessionId,
      sessionTopic,
    });
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm.sessionId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const deletedId = deleteConfirm.sessionId;
      await deleteSession(deletedId);

      // Refresh sessions list
      const sessions = await listSessions();

      // If we deleted the active session, clear it or move to the next available one
      let newActiveSessionId = state.activeSessionId;
      let newSnapshot = state.snapshot;
      const deletedActive = state.activeSessionId === deletedId;

      if (deletedActive) {
        newActiveSessionId = null;
        newSnapshot = null;
        localStorage.removeItem(SESSION_TOKEN_KEY);

        if (sessions.length > 0) {
          const fallbackId = sessions[0].session_id;
          try {
            const fallbackSnapshot = await getSession(fallbackId);
            navigateToSession(fallbackId);
            localStorage.setItem(SESSION_TOKEN_KEY, fallbackId);
            newActiveSessionId = fallbackId;
            newSnapshot = fallbackSnapshot;
          } catch (fallbackError) {
            console.error("Failed to load fallback session after delete", fallbackError);
          }
        } else {
          // No sessions left
          const url = new URL(window.location.href);
          url.pathname = "/";
          window.history.pushState(null, "", url.toString());
        }
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        sessions,
        activeSessionId: newActiveSessionId,
        snapshot: newSnapshot,
      }));

      setDeleteConfirm({ show: false, sessionId: null, sessionTopic: null });
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Failed to delete session",
      }));
      setDeleteConfirm({ show: false, sessionId: null, sessionTopic: null });
    }
  }

  function handleDeleteCancel() {
    setDeleteConfirm({ show: false, sessionId: null, sessionTopic: null });
  }

  function handleLogout() {
    resetToLoggedOut(undefined, true);
  }

  useEffect(() => {
    function handlePopState() {
      if (!auth.isLoggedIn || !auth.accessToken) return;
      const id = getSessionIdFromLocation();
      if (!id) {
        setState((prev) => ({
          ...prev,
          activeSessionId: null,
          snapshot: null,
        }));
        return;
      }
      handleSelectSession(id, false);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [auth.isLoggedIn, auth.accessToken]);

  const { sessions, snapshot, loading, error, activeSessionId } = state;
  const aboutButton = (
    <button
      onClick={() => window.location.assign("/about")}
      aria-label="About CyBEr1924"
      style={{
        position: "fixed",
        left: 22,
        bottom: 26,
        width: 58,
        height: 58,
        borderRadius: "999px",
        border: "1px solid #d9d9d9",
        background: "linear-gradient(145deg, #0f0f0f 0%, #1c1c1c 100%)",
        color: "#ffffff",
        fontSize: "20px",
        fontWeight: 800,
        cursor: "pointer",
        zIndex: 2000,
        boxShadow: "0 16px 36px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 20px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)";
        e.currentTarget.style.background = "linear-gradient(145deg, #1a1a1a 0%, #2a2a2a 100%)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 16px 36px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)";
        e.currentTarget.style.background = "linear-gradient(145deg, #0f0f0f 0%, #1c1c1c 100%)";
      }}
    >
      ?
    </button>
  );

  // Login screen
  if (!auth.isLoggedIn) {
    if (auth.showVerification) {
      return (
        <>
          {aboutButton}
          <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #000000 0%, #1a1a1a 100%)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}>
            <div style={{
              width: "100%",
              maxWidth: "420px",
              padding: "48px 32px",
              margin: "0 16px",
              background: "#ffffff",
              borderRadius: "24px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}>
              <div style={{
                textAlign: "center",
                marginBottom: "32px",
              }}>
                <h1 style={{
                  fontSize: "42px",
                  fontWeight: "800",
                  margin: "0 0 8px 0",
                  letterSpacing: "-0.5px",
                }}>
                  CyBEr<span style={{ fontWeight: "300" }}>1924</span>
                </h1>
                <p style={{
                  fontSize: "16px",
                  color: "#666",
                  margin: 0,
                }}>Verify Your Email</p>
              </div>

              <div style={{
                padding: "16px",
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: "12px",
                marginBottom: "24px",
                fontSize: "14px",
                color: "#0369a1",
                lineHeight: "1.6",
              }}>
                A verification code has been sent to your email address. Please check your inbox and spam folder.
              </div>

              <form onSubmit={handleVerify} style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#333",
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={auth.email}
                    disabled
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      border: "2px solid #e0e0e0",
                      borderRadius: "12px",
                      boxSizing: "border-box",
                      background: "#f5f5f5",
                      color: "#666",
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#333",
                  }}>
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={auth.verificationCode}
                    onChange={(e) => setAuth((prev) => ({ ...prev, verificationCode: e.target.value }))}
                    placeholder="Enter 6-digit code"
                    required
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      border: "2px solid #e0e0e0",
                      borderRadius: "12px",
                      boxSizing: "border-box",
                      transition: "all 0.2s",
                      outline: "none",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#000"}
                    onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
                  />
                </div>

                {auth.authError && (
                  <div style={{
                    padding: "12px 16px",
                    background: "#fee",
                    border: "1px solid #fcc",
                    borderRadius: "8px",
                    color: "#c33",
                    fontSize: "14px",
                  }}>
                    {auth.authError}
                  </div>
                )}

                <button type="submit" style={{
                  width: "100%",
                  padding: "16px",
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#fff",
                  background: "#000",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  marginTop: "8px",
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "#333"}
                onMouseOut={(e) => e.currentTarget.style.background = "#000"}>
                  Verify Email
                </button>

                <button
                  type="button"
                  onClick={() => setAuth((prev) => ({ ...prev, showVerification: false, authError: null }))}
                  style={{
                    width: "100%",
                    padding: "14px",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#666",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ← Back to Login
                </button>
              </form>
            </div>
          </div>
        </>
      );
    }

    if (auth.showRegister) {
      return (
        <>
          {aboutButton}
          <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #000000 0%, #1a1a1a 100%)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}>
            <div style={{
              width: "100%",
              maxWidth: "420px",
              padding: "48px 32px",
              margin: "0 16px",
              background: "#ffffff",
              borderRadius: "24px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}>
              <div style={{
                textAlign: "center",
                marginBottom: "32px",
              }}>
                <h1 style={{
                  fontSize: "42px",
                  fontWeight: "800",
                  margin: "0 0 8px 0",
                  letterSpacing: "-0.5px",
                }}>
                  CyBEr<span style={{ fontWeight: "300" }}>1924</span>
                </h1>
                <p style={{
                  fontSize: "16px",
                  color: "#666",
                  margin: 0,
                }}>Create Your Account</p>
              </div>

              <form onSubmit={handleRegister} style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#333",
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={auth.email}
                    onChange={(e) => setAuth((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      border: "2px solid #e0e0e0",
                      borderRadius: "12px",
                      boxSizing: "border-box",
                      transition: "all 0.2s",
                      outline: "none",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#000"}
                    onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
                  />
                </div>

                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#333",
                  }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={auth.password}
                    onChange={(e) => setAuth((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••"
                    required
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      border: "2px solid #e0e0e0",
                      borderRadius: "12px",
                      boxSizing: "border-box",
                      transition: "all 0.2s",
                      outline: "none",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#000"}
                    onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
                  />
                </div>

                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#333",
                  }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={auth.confirmPassword}
                    onChange={(e) => setAuth((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="••••••••"
                    required
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      border: "2px solid #e0e0e0",
                      borderRadius: "12px",
                      boxSizing: "border-box",
                      transition: "all 0.2s",
                      outline: "none",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#000"}
                    onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
                  />
                </div>

                {auth.authError && (
                  <div style={{
                    padding: "12px 16px",
                    background: "#fee",
                    border: "1px solid #fcc",
                    borderRadius: "8px",
                    color: "#c33",
                    fontSize: "14px",
                  }}>
                    {auth.authError}
                  </div>
                )}

                <button type="submit" style={{
                  width: "100%",
                  padding: "16px",
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#fff",
                  background: "#000",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  marginTop: "8px",
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "#333"}
                onMouseOut={(e) => e.currentTarget.style.background = "#000"}>
                  Sign Up
                </button>

                <button
                  type="button"
                  onClick={() => setAuth((prev) => ({ ...prev, showRegister: false, authError: null }))}
                  style={{
                    width: "100%",
                    padding: "14px",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#666",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ← Back to Login
                </button>
              </form>

              <p style={{
                marginTop: "24px",
                fontSize: "12px",
                color: "#999",
                textAlign: "center",
                lineHeight: "1.6",
              }}>
                You'll receive a verification code after registration.
              </p>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        {aboutButton}
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #000000 0%, #1a1a1a 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          <div style={{
            width: "100%",
            maxWidth: "420px",
            padding: "48px 32px",
            margin: "0 16px",
            background: "#ffffff",
            borderRadius: "24px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{
              textAlign: "center",
              marginBottom: "40px",
            }}>
              <h1 style={{
                fontSize: "48px",
                fontWeight: "800",
                margin: "0 0 12px 0",
                letterSpacing: "-0.5px",
              }}>
                CyBEr<span style={{ fontWeight: "300" }}>1924</span>
              </h1>
              <p style={{
                fontSize: "16px",
                color: "#666",
                margin: 0,
              }}>Multi-Agent Platform</p>
            </div>

            <form onSubmit={handleLogin} style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "8px",
                  color: "#333",
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={auth.email}
                  onChange={(e) => setAuth((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    fontSize: "15px",
                    border: "2px solid #e0e0e0",
                    borderRadius: "12px",
                    boxSizing: "border-box",
                    transition: "all 0.2s",
                    outline: "none",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#000"}
                  onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
                />
              </div>

              <div>
                <label style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "8px",
                  color: "#333",
                }}>
                  Password
                </label>
                <input
                  type="password"
                  value={auth.password}
                  onChange={(e) => setAuth((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    fontSize: "15px",
                    border: "2px solid #e0e0e0",
                    borderRadius: "12px",
                    boxSizing: "border-box",
                    transition: "all 0.2s",
                    outline: "none",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#000"}
                  onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
                />
              </div>

              {auth.authError && (
                <div style={{
                  padding: "12px 16px",
                  background: "#fee",
                  border: "1px solid #fcc",
                  borderRadius: "8px",
                  color: "#c33",
                  fontSize: "14px",
                }}>
                  {auth.authError}
                </div>
              )}

              <button type="submit" style={{
                width: "100%",
                padding: "16px",
                fontSize: "16px",
                fontWeight: "700",
                color: "#fff",
                background: "#000",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                transition: "all 0.2s",
                marginTop: "8px",
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "#333"}
              onMouseOut={(e) => e.currentTarget.style.background = "#000"}>
                Log In
              </button>

              <div style={{
                textAlign: "center",
                marginTop: "8px",
              }}>
                <button
                  type="button"
                  onClick={() => setAuth((prev) => ({ ...prev, showRegister: true, authError: null }))}
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#666",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Don't have an account? Sign up
                </button>
              </div>
            </form>

            <div style={{
              marginTop: "32px",
              padding: "16px",
              background: "#f8f8f8",
              borderRadius: "12px",
              fontSize: "12px",
              color: "#666",
              lineHeight: "1.6",
            }}>
              <strong>Internal Beta:</strong> After signing up, check your server logs for the verification code, then verify your email before logging in.
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {aboutButton}
      <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", background: "#ffffff" }}>
      <aside
        style={{
          width: sidebarWidth,
          minWidth: 260,
          maxWidth: 520,
          background: "linear-gradient(180deg, #ffffff 0%, #f6f7fb 100%)",
          padding: "24px 20px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          borderRight: "1px solid #e5e7eb",
          boxShadow: "8px 0 30px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div>
          <h3 style={{
            margin: "0 0 4px 0",
            fontSize: "18px",
            fontWeight: "600",
            color: "#000000"
          }}>Sessions</h3>
          <div style={{
            fontSize: "11px",
            color: "#666666",
            marginBottom: "20px",
            fontWeight: "500"
          }}>v1.0 - Auto Deploy</div>
          <button
            onClick={handleCreateSession}
            style={{
              width: "100%",
              marginBottom: "8px",
              padding: "12px",
              background: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => e.currentTarget.style.background = "#333333"}
            onMouseOut={(e) => e.currentTarget.style.background = "#000000"}
          >＋ New Session</button>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              marginBottom: "20px",
              padding: "12px",
              background: "#ffffff",
              color: "#000000",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#000000";
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#ffffff";
              e.currentTarget.style.color = "#000000";
            }}
          >Logout</button>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, overflowY: "auto" }}>
          {sessions.map((session) => (
            <li
              key={session.session_id}
              style={{
                padding: "14px 14px",
                marginBottom: "10px",
                borderRadius: "12px",
                background: activeSessionId === session.session_id ? "#0f1115" : "#f5f7fb",
                color: activeSessionId === session.session_id ? "#ffffff" : "#0f172a",
                border: activeSessionId === session.session_id ? "1px solid #0f1115" : "1px solid #e5e7eb",
                boxShadow: activeSessionId === session.session_id
                  ? "0 12px 30px rgba(0, 0, 0, 0.18)"
                  : "0 6px 16px rgba(0, 0, 0, 0.06)",
                transition: "all 0.2s ease",
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
              onMouseOver={(e) => {
                if (activeSessionId !== session.session_id) {
                  e.currentTarget.style.background = "#eef2f8";
                }
              }}
              onMouseOut={(e) => {
                if (activeSessionId !== session.session_id) {
                  e.currentTarget.style.background = "#f5f7fb";
                }
              }}
            >
              <div
                onClick={() => handleSelectSession(session.session_id)}
                style={{
                  flex: 1,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>{session.topic ?? "Untitled"}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  {session.last_updated}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(session.session_id, session.topic);
                }}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  border: "1px solid " + (activeSessionId === session.session_id ? "#ffffff40" : "#e0e0e0"),
                  background: "transparent",
                  color: activeSessionId === session.session_id ? "#ffffff" : "#666666",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#ff4444";
                  e.currentTarget.style.color = "#ffffff";
                  e.currentTarget.style.borderColor = "#ff4444";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = activeSessionId === session.session_id ? "#ffffff" : "#666666";
                  e.currentTarget.style.borderColor = activeSessionId === session.session_id ? "#ffffff40" : "#e0e0e0";
                }}
                title="Delete session"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div
          onMouseDown={() => {
            isDraggingSidebar.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          style={{
            position: "absolute",
            right: -2,
            top: 0,
            bottom: 0,
            width: "10px",
            cursor: "col-resize",
            background: "linear-gradient(90deg, transparent 0%, #d7dbe4 50%, transparent 100%)",
            transition: "background 0.2s ease, opacity 0.2s ease",
            opacity: 0.7,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#d0d6e4";
            e.currentTarget.style.opacity = "1";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "linear-gradient(90deg, transparent 0%, #d7dbe4 50%, transparent 100%)";
            e.currentTarget.style.opacity = "0.7";
          }}
        />
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", background: "#ffffff" }}>
        <header
          style={{
            padding: "16px 24px",
            background: "#ffffff",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: "16px", color: "#000000" }}>
              {snapshot ? snapshot.topic : "No session selected"}
            </div>
            {loading && <span style={{ fontSize: 13, color: "#666666", marginTop: "4px", display: "block" }}>Thinking…</span>}
            {error && (
              <span style={{ fontSize: 13, color: "#000000", marginTop: "4px", display: "block" }}>
                ⚠ {error}
              </span>
            )}
          </div>
          {snapshot && snapshot.session_mode === "execution" && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => handleCommand("next")}
                style={{
                  padding: "10px 20px",
                  background: "#ffffff",
                  color: "#000000",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#000000";
                  e.currentTarget.style.color = "#ffffff";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#ffffff";
                  e.currentTarget.style.color = "#000000";
                }}
              >
                Next Step
              </button>
              <button
                onClick={() => handleCommand("all")}
                style={{
                  padding: "10px 20px",
                  background: "#000000",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "#333333"}
                onMouseOut={(e) => e.currentTarget.style.background = "#000000"}
              >
                Run All
              </button>
            </div>
          )}
        </header>

        {snapshot && snapshot.session_mode === "planning" ? (
          <section id="main-content" style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
            <div style={{ flex: 2, minWidth: 0, borderRight: "1px solid #e5e7eb" }}>
              <PlanningView
                session={snapshot}
                onSendPlanningMessage={sendPlanningMessage}
                onConfirmPlan={confirmCurrentPlan}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, background: "#ffffff" }}>
              <PlanAdvancedPanel
                snapshot={snapshot}
                onPlanCommand={handlePlanCommand}
              />
            </div>
          </section>
        ) : (
          <section id="main-content" style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
            <div
              ref={layoutRef}
              style={{
                display: "grid",
                gridTemplateColumns: `${layoutWidths[0]}% ${layoutWidths[1]}% ${layoutWidths[2]}%`,
                width: "100%",
                height: "100%",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <PlanColumn snapshot={snapshot} />
              <WorkerColumn snapshot={snapshot} />
              <CoordinatorColumn snapshot={snapshot} width={100} />

              <div
                onMouseDown={() => {
                  layoutDrag.current = "left";
                  document.body.style.cursor = 'col-resize';
                  document.body.style.userSelect = 'none';
                }}
                style={{
                  position: "absolute",
                  left: `calc(${layoutWidths[0]}% - 4px)`,
                  top: 0,
                  bottom: 0,
                  width: "8px",
                  cursor: "col-resize",
                  background: "transparent",
                  zIndex: 10,
                }}
              />
              <div
                onMouseDown={() => {
                  layoutDrag.current = "right";
                  document.body.style.cursor = 'col-resize';
                  document.body.style.userSelect = 'none';
                }}
                style={{
                  position: "absolute",
                  left: `calc(${layoutWidths[0] + layoutWidths[1]}% - 4px)`,
                  top: 0,
                  bottom: 0,
                  width: "8px",
                  cursor: "col-resize",
                  background: "transparent",
                  zIndex: 10,
                }}
              />
            </div>
            <div style={{ position: "fixed", right: "24px", bottom: "24px", zIndex: 50 }}>
              <button
                onClick={() => setOrchChatOpen(true)}
                style={{
                  padding: "14px 18px",
                  borderRadius: "999px",
                  border: "none",
                  background: "#000000",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
                }}
              >
                Chat with Orchestrator
              </button>
            </div>

            {orchChatOpen && snapshot && (
              <div
                style={{
                  position: "fixed",
                  right: "24px",
                  bottom: "90px",
                  width: "360px",
                  height: "420px",
                  background: "#ffffff",
                  borderRadius: "16px",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                  border: "1px solid #e5e7eb",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  zIndex: 60,
                }}
              >
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderBottom: "1px solid #e5e7eb",
                  background: "#f9fafb",
                }}>
                  <div style={{ fontWeight: 700, fontSize: "13px" }}>Orchestrator</div>
                  <button
                    onClick={() => setOrchChatOpen(false)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "16px",
                      color: "#6b7280",
                    }}
                    aria-label="Close orchestrator chat"
                  >
                    ×
                  </button>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <ExecutionView session={snapshot} onSendExecutionMessage={sendExecutionMessage} />
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
          onClick={handleDeleteCancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "440px",
              width: "90%",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#000000",
              marginBottom: "12px",
            }}>
              Delete Session?
            </div>
            <div style={{
              fontSize: "15px",
              color: "#666666",
              lineHeight: "1.6",
              marginBottom: "8px",
            }}>
              Are you sure you want to delete this session?
            </div>
            <div style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "#000000",
              padding: "12px 16px",
              background: "#f5f5f5",
              borderRadius: "8px",
              marginBottom: "8px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {deleteConfirm.sessionTopic || "Untitled"}
            </div>
            <div style={{
              fontSize: "13px",
              color: "#ff4444",
              marginBottom: "24px",
              fontWeight: "600",
            }}>
              ⚠ This action cannot be undone.
            </div>
            <div style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
            }}>
              <button
                onClick={handleDeleteCancel}
                style={{
                  padding: "12px 24px",
                  background: "#ffffff",
                  color: "#000000",
                  border: "1px solid #e0e0e0",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#f5f5f5";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#ffffff";
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  padding: "12px 24px",
                  background: "#ff4444",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#cc0000";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#ff4444";
                }}
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

type ColumnProps = { snapshot: SessionSnapshot | null; width: number };

function PlanColumn({ snapshot }: { snapshot: SessionSnapshot | null }) {
  const planTitle = snapshot?.plan?.title || snapshot?.topic || "Plan";
  const subtasks = snapshot?.subtasks ?? [];

  return (
    <div style={{
      borderRight: "1px solid #e5e7eb",
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      padding: "20px",
      overflow: "hidden",
    }}>
      <h4 style={{
        margin: "0 0 12px 0",
        fontSize: "15px",
        fontWeight: 700,
        color: "#000000",
      }}>
        Plan (read-only)
      </h4>
      <div style={{
        padding: "12px 14px",
        borderRadius: "10px",
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        marginBottom: "12px",
        fontWeight: 600,
        fontSize: "14px",
        color: "#111827",
      }}>
        {planTitle}
      </div>
      <div style={{ overflowY: "auto", flex: 1, paddingRight: "6px" }}>
        {subtasks.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: "14px" }}>
            No subtasks available.
          </div>
        )}
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {subtasks.map((task, idx) => (
            <li key={task.id} style={{
              padding: "12px 12px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "#f3f4f6",
                    color: "#111827",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}>
                    #{idx + 1}
                  </span>
                  <div style={{ fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.title}
                  </div>
                </div>
                <span style={{
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: "#eef2ff",
                  color: "#4338ca",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  {task.status}
                </span>
              </div>
              {task.notes && (
                <div style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.5 }}>
                  {task.notes}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function WorkerColumn({ snapshot }: { snapshot: SessionSnapshot | null }) {
  const outputs = [...(snapshot?.worker_outputs ?? [])].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const subtaskMap = new Map((snapshot?.subtasks ?? []).map((s) => [s.id, s.title]));
  const subtaskOrder = new Map((snapshot?.subtasks ?? []).map((s, i) => [s.id, i + 1]));
  return (
    <div style={{
      borderRight: "1px solid #e5e7eb",
      background: "#f9fafb",
      display: "flex",
      flexDirection: "column",
      padding: "20px",
      overflow: "hidden",
    }}>
      <h4 style={{
        margin: "0 0 12px 0",
        fontSize: "15px",
        fontWeight: 700,
        color: "#000000",
      }}>
        Worker
      </h4>
      <div style={{ overflowY: "auto", flex: 1, paddingRight: "6px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {outputs.length === 0 && (
          <div style={{
            color: "#4b5563",
            fontSize: "14px",
            padding: "12px",
            borderRadius: "12px",
            background: "#ffffff",
            border: "1px dashed #d1d5db",
          }}>
            No worker output yet.
          </div>
        )}
        {outputs.map((out, idx) => {
          const title = subtaskMap.get(out.subtask_id) ?? `Task ${out.subtask_id}`;
          const content = out.preview || out.content || "No content.";
          const order = subtaskOrder.get(out.subtask_id);
          return (
            <div key={idx} style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 14px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              position: "relative",
            }}>
              {order && (
                <span style={{
                  position: "absolute",
                  top: "10px",
                  left: "10px",
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  background: "#111827",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
                  textTransform: "uppercase",
                }}>
                  T{order}
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ fontWeight: 700, color: "#111827", fontSize: "13px" }}>{title}</div>
                <span style={{ fontSize: "11px", color: "#6b7280" }}>
                  {new Date(out.timestamp).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#1f2937", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoordinatorColumn({ snapshot, width }: ColumnProps) {
  const decisions = snapshot?.coord_decisions ?? [];
  return (
    <div
      style={{
        width: `${width}%`,
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <h4 style={{
        margin: "0 0 20px 0",
        fontSize: "15px",
        fontWeight: "600",
        color: "#000000",
        textTransform: "uppercase",
        letterSpacing: "0.5px"
      }}>Reviewer</h4>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#fafafa",
          padding: "16px",
          borderRadius: "10px",
          border: "1px solid #e0e0e0",
          marginBottom: "16px",
        }}
      >
        {!snapshot && (
          <div style={{ color: "#666666", fontSize: "14px" }}>
            Reviewer decisions will appear here.
          </div>
        )}
        {snapshot && decisions.length === 0 && (
          <div style={{
            color: "#4b5563",
            fontSize: "14px",
            padding: "12px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #f7f7f7 0%, #ededed 100%)",
            border: "1px dashed #d1d5db",
            textAlign: "center",
          }}>
            No reviewer decisions yet.
          </div>
        )}
        {decisions.map((decision, index) => {
          const statusRaw = typeof decision.decision === "string" ? decision.decision : "";
          const status = statusRaw ? statusRaw.toLowerCase() : "pending";
          const subtaskId =
            typeof decision.subtask_id === "string" || typeof decision.subtask_id === "number"
              ? decision.subtask_id
              : typeof (decision as any).id === "string" || typeof (decision as any).id === "number"
                ? (decision as any).id
                : "—";
          const reason =
            typeof decision.reason === "string"
              ? decision.reason
              : typeof (decision as any).comment === "string"
                ? (decision as any).comment
                : "";
          const ts = (decision as any).timestamp ?? (decision as any).ts ?? null;
          const palette: Record<string, { bg: string; fg: string; shadow: string }> = {
            accept: { bg: "rgba(16, 185, 129, 0.12)", fg: "#0f766e", shadow: "0 10px 24px rgba(16,185,129,0.18)" },
            redo: { bg: "rgba(248, 113, 113, 0.12)", fg: "#b91c1c", shadow: "0 10px 24px rgba(248,113,113,0.18)" },
            changes_requested: { bg: "#f5f5f5", fg: "#1f2937", shadow: "0 10px 24px rgba(0,0,0,0.06)" },
            pending: { bg: "#f5f5f5", fg: "#1f2937", shadow: "0 10px 24px rgba(0,0,0,0.06)" },
          };
          const colors = palette[status] ?? palette.pending;

          return (
            <div
              key={index}
              style={{
                marginBottom: "14px",
                padding: "14px 16px",
                borderRadius: "16px",
                border: "1px solid #e4e4e7",
                background: "#ffffff",
                boxShadow: colors.shadow,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#111827", fontWeight: 700, fontSize: "13px" }}>
                  <span style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    background: "#f4f4f5",
                    border: "1px solid #e4e4e7",
                    letterSpacing: "0.02em",
                    color: "#111827",
                  }}>
                    Task {subtaskId}
                  </span>
                  <span style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    background: colors.bg,
                    color: colors.fg,
                    fontSize: "12px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>
                    {statusRaw || "Pending"}
                  </span>
                </div>
                {ts && (
                  <span style={{ fontSize: "12px", color: "#52525b" }}>
                    {new Date(ts).toLocaleString()}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: "13px",
                color: "#1f2937",
                lineHeight: "1.7",
                whiteSpace: "pre-wrap",
              }}>
                {reason || "No additional notes provided."}
              </div>
              {decision.source && (
                <div style={{
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "#6b7280",
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                }}>
                  <span style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "999px",
                    background: "#9ca3af",
                    display: "inline-block",
                  }} />
                  <span>by {decision.source}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;

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
  const [plannerWidth, setPlannerWidth] = useState(33.33);
  const [workerWidth, setWorkerWidth] = useState(33.33);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    sessionId: string | null;
    sessionTopic: string | null;
  }>({ show: false, sessionId: null, sessionTopic: null });

  const isDraggingSidebar = useRef(false);
  const isDraggingPlanner = useRef(false);
  const isDraggingWorker = useRef(false);

  const coordinatorWidth = 100 - plannerWidth - workerWidth;

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
      }
      if (isDraggingPlanner.current || isDraggingWorker.current) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;
        const rect = mainContent.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const percentage = (relativeX / rect.width) * 100;

        if (isDraggingPlanner.current) {
          const newPlannerWidth = Math.max(15, Math.min(70, percentage));
          setPlannerWidth(newPlannerWidth);
        } else if (isDraggingWorker.current) {
          const newWorkerWidth = Math.max(15, Math.min(70, percentage - plannerWidth));
          setWorkerWidth(newWorkerWidth);
        }
      }
    };

    const handleMouseUp = () => {
      isDraggingSidebar.current = false;
      isDraggingPlanner.current = false;
      isDraggingWorker.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [plannerWidth]);

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

  async function handleLogin(e: React.FormEvent) {
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

  async function handleRegister(e: React.FormEvent) {
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

  async function handleVerify(e: React.FormEvent) {
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
    const topic = window.prompt("Topic / goal for this session?");
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
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Command failed",
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
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Plan edit command failed",
      }));
    }
  }

  async function handleAsk(question: string) {
    if (!state.activeSessionId || !question.trim()) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(state.activeSessionId, "ask", {
        question,
      });
      setState((prev) => ({ ...prev, loading: false, snapshot }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Ask failed",
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
          {snapshot && (
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

        <section id="main-content" style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
          <PlannerColumn
            snapshot={snapshot}
            onPlanCommand={handlePlanCommand}
            width={plannerWidth}
          />
          <div
            onMouseDown={() => {
              isDraggingPlanner.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            style={{
              width: "4px",
              cursor: "col-resize",
              background: "transparent",
              position: "relative",
              transition: "background 0.2s ease",
              flexShrink: 0,
            }}
            onMouseOver={(e) => e.currentTarget.style.background = "#e0e0e0"}
            onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
          />
          <WorkerColumn snapshot={snapshot} width={workerWidth} />
          <div
            onMouseDown={() => {
              isDraggingWorker.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            style={{
              width: "4px",
              cursor: "col-resize",
              background: "transparent",
              position: "relative",
              transition: "background 0.2s ease",
              flexShrink: 0,
            }}
            onMouseOver={(e) => e.currentTarget.style.background = "#e0e0e0"}
            onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
          />
          <CoordinatorColumn snapshot={snapshot} onAsk={handleAsk} width={coordinatorWidth} />
        </section>
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

type PlannerColumnProps = ColumnProps & {
  onPlanCommand: (
    command: PlanEditCommand,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
};

function PlannerColumn({ snapshot, onPlanCommand, width }: PlannerColumnProps) {
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);
  const [hoveredSubtaskId, setHoveredSubtaskId] = useState<string | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (expandedSubtaskId) {
        setExpandedSubtaskId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [expandedSubtaskId]);

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
    <div
      style={{
        width: `${width}%`,
        padding: "20px",
        overflowY: "auto",
        background: "#ffffff",
      }}
    >
      <h4 style={{
        margin: "0 0 20px 0",
        fontSize: "15px",
        fontWeight: "600",
        color: "#000000",
        textTransform: "uppercase",
        letterSpacing: "0.5px"
      }}>Planner</h4>
      {!snapshot && <div style={{ color: "#666666", fontSize: "14px" }}>Choose or create a session.</div>}
      {snapshot && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
              gap: "12px",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "14px", color: "#000000", flex: 1 }}>
              {snapshot.plan?.title || snapshot.topic}
            </div>
            <button
              onClick={handleAppend}
              style={{
                padding: "8px 14px",
                background: "#000000",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "#333333"}
              onMouseOut={(e) => e.currentTarget.style.background = "#000000"}
            >＋ Add</button>
          </div>
          <ol style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
            {snapshot.subtasks.map((subtask) => {
              const isCurrent = snapshot.current_subtask_id === subtask.id;
              const handleSetCurrent = () => {
                void onPlanCommand("set_current_subtask", {
                  subtask_id: subtask.id,
                });
              };
              const handleUpdate = () => {
                const titleInput = window.prompt("Edit title", subtask.title);
                if (titleInput === null) return;
                const notesInput = window.prompt(
                  "Edit description (optional)",
                );
                const patch: Record<string, unknown> = {};
                const trimmedTitle = titleInput.trim();
                if (trimmedTitle) {
                  patch.title = trimmedTitle;
                }
                if (notesInput !== null) {
                  patch.notes = notesInput.trim();
                }
                if (!Object.keys(patch).length) return;
                void onPlanCommand("update_subtask", {
                  subtask_id: subtask.id,
                  patch,
                });
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
                const confirmSkip = window.confirm(
                  `Skip "${subtask.title}"?`,
                );
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
                    marginBottom: "8px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: isCurrent
                      ? "2px solid #000000"
                      : "1px solid #e0e0e0",
                    background: isCurrent ? "#fafafa" : "#ffffff",
                    position: "relative",
                    transition: "all 0.2s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                  onMouseEnter={() => setHoveredSubtaskId(subtask.id)}
                  onMouseLeave={() => setHoveredSubtaskId(null)}
                >
                  {isCurrent && (
                    <div style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "3px",
                      height: "100%",
                      background: "#000000",
                      borderRadius: "8px 0 0 8px",
                    }} />
                  )}

                  {/* Task number badge */}
                  <div style={{
                    fontSize: "10px",
                    color: "#999999",
                    background: "#f5f5f5",
                    padding: "3px 7px",
                    borderRadius: "4px",
                    fontWeight: "600",
                    flexShrink: 0,
                  }}>
                    #{subtask.index + 1}
                  </div>

                  {/* Task content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: subtask.status === "in_progress" ? 600 : 500,
                        textDecoration: subtask.status === "done" ? "line-through" : "none",
                        color: subtask.status === "done" ? "#999999" : "#000000",
                        fontSize: "12px",
                        marginBottom: "3px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {subtask.title}
                    </div>
                    <div style={{
                      fontSize: "9px",
                      color: "#999999",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      fontWeight: "600",
                    }}>
                      {subtask.status}
                    </div>
                  </div>

                  {/* Advanced Settings Button */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSubtaskId(expandedSubtaskId === subtask.id ? null : subtask.id);
                      }}
                      onMouseEnter={() => setHoveredSubtaskId(subtask.id)}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "6px",
                        border: "none",
                        background: expandedSubtaskId === subtask.id ? "#000000" : "transparent",
                        color: expandedSubtaskId === subtask.id ? "#ffffff" : "#999999",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease",
                        position: "relative",
                      }}
                      onMouseOver={(e) => {
                        if (expandedSubtaskId !== subtask.id) {
                          e.currentTarget.style.background = "#f5f5f5";
                          e.currentTarget.style.color = "#000000";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (expandedSubtaskId !== subtask.id) {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#999999";
                        }
                      }}
                    >
                      {/* Modern settings icon */}
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="3" r="1" fill="currentColor"/>
                        <circle cx="8" cy="8" r="1" fill="currentColor"/>
                        <circle cx="8" cy="13" r="1" fill="currentColor"/>
                      </svg>
                    </button>

                    {/* Tooltip */}
                    {hoveredSubtaskId === subtask.id && expandedSubtaskId !== subtask.id && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 6px)",
                          right: 0,
                          background: "#000000",
                          color: "#ffffff",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: "500",
                          whiteSpace: "nowrap",
                          zIndex: 200,
                          pointerEvents: "none",
                          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                        }}
                      >
                        Advanced Settings
                        {/* Arrow */}
                        <div style={{
                          position: "absolute",
                          bottom: "-4px",
                          right: "8px",
                          width: "8px",
                          height: "8px",
                          background: "#000000",
                          transform: "rotate(45deg)",
                        }} />
                      </div>
                    )}

                    {/* Dropdown Menu */}
                    {expandedSubtaskId === subtask.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          right: 0,
                          background: "#000000",
                          borderRadius: "8px",
                          padding: "6px",
                          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                          zIndex: 100,
                          minWidth: "150px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetCurrent();
                            setExpandedSubtaskId(null);
                          }}
                          style={{
                            padding: "8px 12px",
                            background: "transparent",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = "#333333"}
                          onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                        >Set current</button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdate();
                            setExpandedSubtaskId(null);
                          }}
                          style={{
                            padding: "8px 12px",
                            background: "transparent",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = "#333333"}
                          onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                        >Update</button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInsertBelow();
                            setExpandedSubtaskId(null);
                          }}
                          style={{
                            padding: "8px 12px",
                            background: "transparent",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = "#333333"}
                          onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                        >Insert below</button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSkip();
                            setExpandedSubtaskId(null);
                          }}
                          style={{
                            padding: "8px 12px",
                            background: "transparent",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = "#333333"}
                          onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                        >Skip</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div style={{ marginTop: "16px" }}>
            <button
              onClick={handleAppend}
              style={{
                padding: "10px 16px",
                background: "#ffffff",
                color: "#000000",
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s ease",
                width: "100%",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "#000000";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "#ffffff";
                e.currentTarget.style.color = "#000000";
              }}
            >＋ Append subtask</button>
          </div>
        </>
      )}
    </div>
  );
}

function WorkerColumn({ snapshot, width }: ColumnProps) {
  return (
    <div
      style={{
        width: `${width}%`,
        padding: "20px",
        overflowY: "auto",
        background: "#ffffff",
      }}
    >
      <h4 style={{
        margin: "0 0 20px 0",
        fontSize: "15px",
        fontWeight: "600",
        color: "#000000",
        textTransform: "uppercase",
        letterSpacing: "0.5px"
      }}>Worker</h4>
      {!snapshot && <div style={{ color: "#666666", fontSize: "14px" }}>Worker outputs will appear here.</div>}
      {snapshot &&
        (snapshot.worker_outputs.length === 0 ? (
          <div style={{ color: "#666666", fontSize: "14px" }}>No worker outputs yet.</div>
        ) : (
          snapshot.worker_outputs.map((output) => (
            <div
              key={output.subtask_id + output.timestamp}
              style={{
                marginBottom: "14px",
                padding: "14px",
                border: "1px solid #e0e0e0",
                borderRadius: "10px",
                background: "#fafafa",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{
                fontSize: "11px",
                color: "#666666",
                marginBottom: "10px",
                fontWeight: "600",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}>
                <span style={{
                  background: "#000000",
                  color: "#ffffff",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  fontSize: "10px",
                }}>
                  {output.subtask_id}
                </span>
                <span>{output.timestamp}</span>
              </div>
              <pre style={{
                whiteSpace: "pre-wrap",
                margin: 0,
                fontFamily: "ui-monospace, 'SF Mono', Monaco, monospace",
                fontSize: "12px",
                lineHeight: "1.6",
                color: "#000000",
                background: "#ffffff",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #e0e0e0",
              }}>
                {output.preview ?? output.content}
              </pre>
            </div>
          ))
        ))}
    </div>
  );
}

function CoordinatorColumn({
  snapshot,
  onAsk,
  width,
}: ColumnProps & { onAsk: (question: string) => void }) {
  const [input, setInput] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question) return;
    onAsk(question);
    setInput("");
  }

  return (
    <div
      style={{
        width: `${width}%`,
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
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
        {!snapshot && <div style={{ color: "#666666", fontSize: "14px" }}>Chat with the Reviewer here.</div>}
        {snapshot &&
          snapshot.chat_history.map((message, index) => {
            const response =
              typeof message.payload?.response === "string"
                ? message.payload.response
                : null;
            const text =
              typeof message.payload?.text === "string"
                ? message.payload.text
                : null;
            const fallback =
              typeof message.payload === "object"
                ? JSON.stringify(message.payload)
                : String(message.payload ?? "");
            const content = response ?? text ?? fallback;
            const isUser = message.role === "user";
            return (
              <div key={index} style={{ marginBottom: "16px" }}>
                <div style={{
                  fontSize: "10px",
                  color: "#666666",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  fontWeight: "600",
                }}>
                  {message.role}
                </div>
                <div style={{
                  background: isUser ? "#000000" : "#ffffff",
                  color: isUser ? "#ffffff" : "#000000",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  border: isUser ? "none" : "1px solid #e0e0e0",
                  whiteSpace: "pre-wrap",
                }}>
                  {content}
                </div>
              </div>
            );
          })}
      </div>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: "8px" }}
      >
        <input
          type="text"
          placeholder="Ask the reviewer…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          style={{
            flex: 1,
            padding: "12px 16px",
            fontSize: "14px",
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            outline: "none",
            transition: "all 0.2s ease",
            background: "#ffffff",
            color: "#000000",
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = "#000000"}
          onBlur={(e) => e.currentTarget.style.borderColor = "#e0e0e0"}
        />
        <button
          type="submit"
          disabled={!snapshot}
          style={{
            padding: "12px 24px",
            background: snapshot ? "#000000" : "#e0e0e0",
            color: snapshot ? "#ffffff" : "#999999",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: snapshot ? "pointer" : "not-allowed",
            transition: "all 0.2s ease",
          }}
          onMouseOver={(e) => {
            if (snapshot) e.currentTarget.style.background = "#333333";
          }}
          onMouseOut={(e) => {
            if (snapshot) e.currentTarget.style.background = "#000000";
          }}
        >
          Ask
        </button>
      </form>
    </div>
  );
}

export default App;

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
} from "./api";
import "./App.css";

const SESSION_TOKEN_KEY = "cyber1924_last_session_id";

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

  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [plannerWidth, setPlannerWidth] = useState(33.33);
  const [workerWidth, setWorkerWidth] = useState(33.33);

  const isDraggingSidebar = useRef(false);
  const isDraggingPlanner = useRef(false);
  const isDraggingWorker = useRef(false);

  const coordinatorWidth = 100 - plannerWidth - workerWidth;

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
        const newWidth = Math.max(200, Math.min(500, e.clientX));
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
          console.error("Failed to restore fallback session", err);
        }
      } catch (err: any) {
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
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Ask failed",
      }));
    }
  }

  function handleLogout() {
    localStorage.removeItem("cyber1924_token");
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setAccessToken(null);
    setAuth({
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

  // Login screen
  if (!auth.isLoggedIn) {
    if (auth.showVerification) {
      return (
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
      );
    }

    if (auth.showRegister) {
      return (
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
      );
    }

    return (
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
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", background: "#ffffff" }}>
      <aside
        style={{
          width: sidebarWidth,
          background: "#fafafa",
          padding: "20px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          position: "relative",
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
              onClick={() => handleSelectSession(session.session_id)}
              style={{
                padding: "12px 14px",
                marginBottom: "6px",
                cursor: "pointer",
                borderRadius: "8px",
                background: activeSessionId === session.session_id ? "#000000" : "#ffffff",
                color: activeSessionId === session.session_id ? "#ffffff" : "#000000",
                border: "1px solid #e0e0e0",
                transition: "all 0.2s ease",
              }}
              onMouseOver={(e) => {
                if (activeSessionId !== session.session_id) {
                  e.currentTarget.style.background = "#f5f5f5";
                }
              }}
              onMouseOut={(e) => {
                if (activeSessionId !== session.session_id) {
                  e.currentTarget.style.background = "#ffffff";
                }
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>{session.topic ?? "Untitled"}</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                {session.last_updated}
              </div>
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
            right: 0,
            top: 0,
            bottom: 0,
            width: "4px",
            cursor: "col-resize",
            background: "transparent",
            transition: "background 0.2s ease",
          }}
          onMouseOver={(e) => e.currentTarget.style.background = "#e0e0e0"}
          onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
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
    </div>
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
                    marginBottom: "10px",
                    padding: "14px",
                    borderRadius: "10px",
                    border: isCurrent
                      ? "2px solid #000000"
                      : "1px solid #e0e0e0",
                    background: isCurrent ? "#fafafa" : "#ffffff",
                    position: "relative",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isCurrent && (
                    <div style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "3px",
                      height: "100%",
                      background: "#000000",
                      borderRadius: "10px 0 0 10px",
                    }} />
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginBottom: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: subtask.status === "in_progress" ? 600 : 500,
                        textDecoration: subtask.status === "done" ? "line-through" : "none",
                        color: subtask.status === "done" ? "#999999" : "#000000",
                        fontSize: "13px",
                        flex: 1,
                      }}
                    >
                      {subtask.title}
                    </span>
                    <span style={{
                      fontSize: "11px",
                      color: "#999999",
                      background: "#f5f5f5",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontWeight: "600",
                    }}>
                      #{subtask.index + 1}
                    </span>
                  </div>
                  <div style={{
                    fontSize: "10px",
                    color: "#666666",
                    marginBottom: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    fontWeight: "600",
                  }}>
                    {subtask.status}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                    }}
                  >
                    <button
                      onClick={handleSetCurrent}
                      style={{
                        padding: "6px 12px",
                        background: "#ffffff",
                        color: "#000000",
                        border: "1px solid #e0e0e0",
                        borderRadius: "6px",
                        fontSize: "11px",
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
                    >Set current</button>
                    <button
                      onClick={handleUpdate}
                      style={{
                        padding: "6px 12px",
                        background: "#ffffff",
                        color: "#000000",
                        border: "1px solid #e0e0e0",
                        borderRadius: "6px",
                        fontSize: "11px",
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
                    >Update</button>
                    <button
                      onClick={handleInsertBelow}
                      style={{
                        padding: "6px 12px",
                        background: "#ffffff",
                        color: "#000000",
                        border: "1px solid #e0e0e0",
                        borderRadius: "6px",
                        fontSize: "11px",
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
                    >Insert below</button>
                    <button
                      onClick={handleSkip}
                      style={{
                        padding: "6px 12px",
                        background: "#ffffff",
                        color: "#000000",
                        border: "1px solid #e0e0e0",
                        borderRadius: "6px",
                        fontSize: "11px",
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
                    >Skip</button>
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
      }}>Coordinator</h4>
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
        {!snapshot && <div style={{ color: "#666666", fontSize: "14px" }}>Chat with the Coordinator here.</div>}
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
          placeholder="Ask the coordinator…"
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

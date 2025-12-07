import { type FormEvent, useEffect, useState } from "react";
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

const LAST_SESSION_KEY = "cyber1924:lastSessionId";

function updateSessionInUrl(sessionId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  window.history.replaceState({}, "", url.toString());
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
    verificationCode: "",
    accessToken: null,
    isLoggedIn: false,
    authError: null,
    showVerification: false,
    showRegister: false,
  });

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

  useEffect(() => {
    if (!auth.isLoggedIn || !auth.accessToken) return;

    (async () => {
      try {
        const sessions = await listSessions();
        setState((prev) => ({ ...prev, sessions }));

        const params = new URLSearchParams(window.location.search);
        const urlSessionId = params.get("session");

        let targetId: string | null = null;

        if (urlSessionId && sessions.some((s) => s.session_id === urlSessionId)) {
          targetId = urlSessionId;
        } else {
          const lastId = localStorage.getItem(LAST_SESSION_KEY);
          if (lastId && sessions.some((s) => s.session_id === lastId)) {
            targetId = lastId;
          }
        }

        if (targetId) {
          try {
            const snapshot = await getSession(targetId);
            localStorage.setItem(LAST_SESSION_KEY, targetId);
            updateSessionInUrl(targetId);
            setState((prev) => ({
              ...prev,
              activeSessionId: targetId,
              snapshot,
            }));
          } catch (err) {
            localStorage.removeItem(LAST_SESSION_KEY);
          }
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

      localStorage.setItem(LAST_SESSION_KEY, id);
      updateSessionInUrl(id);

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

  async function handleSelectSession(id: string) {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await getSession(id);

      localStorage.setItem(LAST_SESSION_KEY, id);
      updateSessionInUrl(id);

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
    setAccessToken(null);
    setAuth({
      email: "",
      password: "",
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
  }

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
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui" }}>
      <aside
        style={{
          width: 260,
          borderRight: "1px solid #ddd",
          padding: 12,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div>
          <h3>Sessions</h3>
          <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 8 }}>v1.0 - Auto Deploy</div>
          <button onClick={handleCreateSession} style={{ width: "100%", marginBottom: 8 }}>＋ New Session</button>
          <button onClick={handleLogout} style={{ width: "100%", marginBottom: 12, background: "#f44", color: "white" }}>Logout</button>
        </div>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
          {sessions.map((session) => (
            <li
              key={session.session_id}
              onClick={() => handleSelectSession(session.session_id)}
              style={{
                padding: "6px 8px",
                marginBottom: 4,
                cursor: "pointer",
                borderRadius: 4,
                background:
                  activeSessionId === session.session_id ? "#eee" : "transparent",
              }}
            >
              <div style={{ fontWeight: 600 }}>{session.topic ?? "Untitled"}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {session.last_updated}
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #ddd",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>
              {snapshot ? snapshot.topic : "No session selected"}
            </div>
            {loading && <span style={{ fontSize: 12 }}>Thinking…</span>}
            {error && (
              <span style={{ fontSize: 12, color: "red", marginLeft: 8 }}>
                {error}
              </span>
            )}
          </div>
          {snapshot && (
            <div>
              <button onClick={() => handleCommand("next")} style={{ marginRight: 8 }}>
                Next Step
              </button>
              <button onClick={() => handleCommand("all")}>Run All</button>
            </div>
          )}
        </header>

          <section style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <PlannerColumn
              snapshot={snapshot}
              onPlanCommand={handlePlanCommand}
            />
            <WorkerColumn snapshot={snapshot} />
            <CoordinatorColumn snapshot={snapshot} onAsk={handleAsk} />
          </section>
      </main>
    </div>
  );
}

type ColumnProps = { snapshot: SessionSnapshot | null };

type PlannerColumnProps = ColumnProps & {
  onPlanCommand: (
    command: PlanEditCommand,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
};

function PlannerColumn({ snapshot, onPlanCommand }: PlannerColumnProps) {
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
        flex: 1,
        borderRight: "1px solid #eee",
        padding: 12,
        overflowY: "auto",
      }}
    >
      <h4>Planner</h4>
      {!snapshot && <div>Choose or create a session.</div>}
      {snapshot && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 600 }}>{snapshot.plan?.title || snapshot.topic}</div>
            <button onClick={handleAppend}>Append subtask</button>
          </div>
          <ol style={{ paddingLeft: 18 }}>
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
                    margin: "6px 0",
                    padding: 10,
                    borderRadius: 8,
                    border: isCurrent
                      ? "1px solid #4a90e2"
                      : "1px solid #f0f0f0",
                    background: isCurrent ? "#eef7ff" : "#fff",
                    listStyle: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: subtask.status === "in_progress" ? 600 : 500,
                        textDecoration:
                          subtask.status === "done" ? "line-through" : "none",
                      }}
                    >
                      [{subtask.status}] {subtask.title}
                    </span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      #{subtask.index + 1}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <button onClick={handleSetCurrent}>Set current</button>
                    <button onClick={handleUpdate}>Update</button>
                    <button onClick={handleInsertBelow}>Insert below</button>
                    <button onClick={handleSkip}>Skip</button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div style={{ marginTop: 10 }}>
            <button onClick={handleAppend}>Append subtask</button>
          </div>
        </>
      )}
    </div>
  );
}

function WorkerColumn({ snapshot }: ColumnProps) {
  return (
    <div
      style={{
        flex: 1,
        borderRight: "1px solid #eee",
        padding: 12,
        overflowY: "auto",
      }}
    >
      <h4>Worker</h4>
      {!snapshot && <div>Worker outputs will appear here.</div>}
      {snapshot &&
        (snapshot.worker_outputs.length === 0 ? (
          <div>No worker outputs yet.</div>
        ) : (
          snapshot.worker_outputs.map((output) => (
            <div
              key={output.subtask_id + output.timestamp}
              style={{
                marginBottom: 12,
                padding: 8,
                border: "1px solid #ddd",
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Subtask: {output.subtask_id} @ {output.timestamp}
              </div>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
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
      style={{ flex: 1.2, padding: 12, display: "flex", flexDirection: "column" }}
    >
      <h4>Coordinator</h4>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid #eee",
          padding: 8,
        }}
      >
        {!snapshot && <div>Chat with the Coordinator here.</div>}
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
            return (
              <div key={index} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{message.role}</div>
                <div>{content}</div>
              </div>
            );
          })}
      </div>
      <form
        onSubmit={handleSubmit}
        style={{ marginTop: 8, display: "flex", gap: 8 }}
      >
        <input
          type="text"
          placeholder="Ask the coordinator…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          style={{ flex: 1, padding: 6 }}
        />
        <button type="submit" disabled={!snapshot}>
          Ask
        </button>
      </form>
    </div>
  );
}

export default App;

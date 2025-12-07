import { type FormEvent, useEffect, useState } from "react";
import type { SessionSummary, SessionSnapshot } from "./api";
import {
  listSessions,
  createSession,
  getSession,
  sendCommand,
} from "./api";
import "./App.css";

type UIState = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  snapshot: SessionSnapshot | null;
  loading: boolean;
  error: string | null;
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

  useEffect(() => {
    (async () => {
      try {
        const sessions = await listSessions();
        setState((prev) => ({ ...prev, sessions }));
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          error: err.message ?? "Failed to load sessions",
        }));
      }
    })();
  }, []);

  async function handleCreateSession() {
    const topic = window.prompt("Topic / goal for this session?");
    if (!topic) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await createSession(topic);
      const sessions = await listSessions();
      setState((prev) => ({
        ...prev,
        loading: false,
        sessions,
        activeSessionId: snapshot.session_id,
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

  const { sessions, snapshot, loading, error, activeSessionId } = state;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui" }}>
      <aside
        style={{
          width: 260,
          borderRight: "1px solid #ddd",
          padding: 12,
          boxSizing: "border-box",
        }}
      >
        <h3>Sessions</h3>
        <button onClick={handleCreateSession}>＋ New Session</button>
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
            <div style={{ fontWeight: 600 }}>{snapshot.plan.title}</div>
            <button onClick={handleAppend}>Append subtask</button>
          </div>
          <ol style={{ paddingLeft: 18 }}>
            {snapshot.plan.subtasks.map((subtask) => {
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

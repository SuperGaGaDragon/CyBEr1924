import { type FormEvent, useEffect, useState, useRef, useMemo, type Dispatch, type SetStateAction } from "react";
import type { SessionSummary, SessionSnapshot, Subtask } from "./api";
import {
  listSessions,
  createSession,
  getSession,
  sendCommand,
  getSessionEvents,
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
    <div
      className="planning-view"
      style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", padding: "24px", minHeight: 0, overflow: "hidden" }}
    >
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
        minHeight: 0,
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
  pendingMessage?: string | null;
  isSending?: boolean;
};

function ExecutionView({ session, onSendExecutionMessage, pendingMessage, isSending }: ExecutionViewProps) {
  const [input, setInput] = useState("");
  const pendingText = (pendingMessage ?? "").trim();

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
        {isSending && (
          <div className="orch-pulse" style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "#111827",
            padding: "6px 10px",
            borderRadius: "999px",
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}>
            Thinking…
          </div>
        )}
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
        {pendingText && (
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: "70%",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "#111827",
              color: "#ffffff",
              border: "none",
              boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
              opacity: 0.8,
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: "0.5px", textTransform: "uppercase", opacity: 0.7, marginBottom: "4px" }}>
              You · sending…
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6", fontSize: "14px" }}>{pendingText}</div>
          </div>
        )}
        {isSending && (
          <div
            className="orch-pulse"
            style={{
              alignSelf: "flex-start",
              maxWidth: "68%",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "#f3f4f6",
              color: "#111827",
              border: "1px solid #e5e7eb",
              boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: "0.5px", textTransform: "uppercase", opacity: 0.6, marginBottom: "4px" }}>
              Orchestrator
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6", fontSize: "14px" }}>Thinking…</div>
          </div>
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

type CreateSessionFormState = {
  show: boolean;
  topic: string;
  novelMode: boolean;
  wizardOpen: boolean;
  step: number;
  length: string;
  year: string;
  genre: string;
  otherGenres: string;
  characters: { name: string; role: string }[];
  style: string;
  titleChoice: "not_yet" | "provided" | "";
  titleText: string;
  extraNotes: string;
  error: string | null;
};

type PlanPanelProps = {
  snapshot: SessionSnapshot;
  onPlanCommand: (
    command: PlanEditCommand,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
  createSessionForm: CreateSessionFormState;
  setCreateSessionForm: Dispatch<SetStateAction<CreateSessionFormState>>;
};

function PlanAdvancedPanel({ snapshot, onPlanCommand, createSessionForm, setCreateSessionForm }: PlanPanelProps) {
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

      {/* Novel Questionnaire */}
      {createSessionForm.wizardOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
            backdropFilter: "blur(6px)",
          }}
          onClick={() => setCreateSessionForm((prev) => ({ ...prev, wizardOpen: false }))}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "640px",
              background: "#ffffff",
              borderRadius: "18px",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              padding: "26px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              maxHeight: "88vh",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: "4px" }}>
                  Novel Mode
                </div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#0b0b0b" }}>Answer to continue</div>
              </div>
              <button
                onClick={() => setCreateSessionForm((prev) => ({ ...prev, wizardOpen: false }))}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "14px",
                  color: "#6b7280",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
              {createSessionForm.step === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>1. 您的小说会是什么篇幅？</div>
                  {[
                    { value: "flash fiction", label: "flash fiction (<1000 words)" },
                    { value: "short story", label: "short story (1000-7500 words)" },
                    { value: "novelette", label: "novelette (7500-17500 words)" },
                    { value: "novella", label: "novella (17500-40000)" },
                    { value: "novel", label: "novel (40000+ words)" },
                  ].map((opt) => (
                    <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="length"
                        checked={createSessionForm.length === opt.value}
                        onChange={() => setCreateSessionForm((prev) => ({ ...prev, length: opt.value }))}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {createSessionForm.step === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>2. 请输入您期望的小说发生的年份</div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="year"
                      checked={createSessionForm.year === "架空历史"}
                      onChange={() => setCreateSessionForm((prev) => ({ ...prev, year: "架空历史" }))}
                    />
                    <span>架空历史</span>
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      type="radio"
                      name="year"
                      checked={createSessionForm.year !== "" && createSessionForm.year !== "架空历史"}
                      onChange={() => setCreateSessionForm((prev) => ({ ...prev, year: prev.year === "架空历史" ? "" : prev.year }))}
                    />
                    <input
                      type="text"
                      placeholder="请输入大致年份区间（可以是未来年份）"
                      value={createSessionForm.year !== "架空历史" ? createSessionForm.year : ""}
                      onChange={(e) => setCreateSessionForm((prev) => ({ ...prev, year: e.target.value }))}
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "1px solid #e5e7eb",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                </div>
              )}

              {createSessionForm.step === 3 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>3. 请输入您的希望的题材</div>
                  {[
                    "Literary Fiction",
                    "Fantasy",
                    "Sci-Fi",
                    "Mystery / Crime",
                    "Horror",
                    "Romance",
                    "Historical",
                    "Adventure",
                    "Thriller",
                    "Hybrid",
                  ].map((g) => (
                    <label key={g} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "10px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="genre"
                        checked={createSessionForm.genre === g}
                        onChange={() => setCreateSessionForm((prev) => ({ ...prev, genre: g }))}
                      />
                      <span>{g}</span>
                    </label>
                  ))}
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      type="radio"
                      name="genre"
                      checked={!!createSessionForm.otherGenres}
                      onChange={() => setCreateSessionForm((prev) => ({ ...prev, genre: "", otherGenres: prev.otherGenres })) }
                    />
                    <input
                      type="text"
                      placeholder="请输入您想到的其他体裁（“/”分割）"
                      value={createSessionForm.otherGenres}
                      onChange={(e) => setCreateSessionForm((prev) => ({ ...prev, otherGenres: e.target.value }))}
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "1px solid #e5e7eb",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                </div>
              )}

              {createSessionForm.step === 4 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>4. 请给出您已经想到的一些角色姓名和身份</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {createSessionForm.characters.map((c, idx) => (
                      <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="text"
                          placeholder="角色姓名"
                          value={c.name}
                          onChange={(e) => {
                            const next = [...createSessionForm.characters];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setCreateSessionForm((prev) => ({ ...prev, characters: next }));
                          }}
                          style={{
                            flex: 1,
                            padding: "12px 14px",
                            borderRadius: "10px",
                            border: "1px solid #e5e7eb",
                            fontSize: "14px",
                          }}
                        />
                        <span style={{ color: "#9ca3af" }}>｜</span>
                        <input
                          type="text"
                          placeholder="身份信息（可选）"
                          value={c.role}
                          onChange={(e) => {
                            const next = [...createSessionForm.characters];
                            next[idx] = { ...next[idx], role: e.target.value };
                            setCreateSessionForm((prev) => ({ ...prev, characters: next }));
                          }}
                          style={{
                            flex: 1,
                            padding: "12px 14px",
                            borderRadius: "10px",
                            border: "1px solid #e5e7eb",
                            fontSize: "14px",
                          }}
                        />
                        {createSessionForm.characters.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = createSessionForm.characters.filter((_, i) => i !== idx);
                              setCreateSessionForm((prev) => ({ ...prev, characters: next.length ? next : [{ name: "", role: "" }] }));
                            }}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#dc2626",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setCreateSessionForm((prev) => ({
                          ...prev,
                          characters: [...prev.characters, { name: "", role: "" }],
                        }))
                      }
                      style={{
                        alignSelf: "flex-start",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        border: "1px dashed #d1d5db",
                        background: "#f9fafb",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      ＋ 新增角色
                    </button>
                  </div>
                </div>
              )}

              {createSessionForm.step === 5 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>5. 您希望文笔类似什么风格</div>
                  <textarea
                    placeholder="请描述风格，推荐输入希望模仿的作家"
                    value={createSessionForm.style}
                    onChange={(e) => setCreateSessionForm((prev) => ({ ...prev, style: e.target.value }))}
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      fontSize: "14px",
                    }}
                  />
                </div>
              )}

              {createSessionForm.step === 6 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>6. 您想好的小说题目吗</div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="radio"
                      name="title_choice"
                      checked={createSessionForm.titleChoice === "not_yet"}
                      onChange={() => setCreateSessionForm((prev) => ({ ...prev, titleChoice: "not_yet", titleText: "" }))}
                    />
                    <span>Not yet (which is totally NOT a problem!)</span>
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      type="radio"
                      name="title_choice"
                      checked={createSessionForm.titleChoice === "provided"}
                      onChange={() => setCreateSessionForm((prev) => ({ ...prev, titleChoice: "provided" }))}
                    />
                    <input
                      type="text"
                      placeholder="请输入你想好的题目"
                      value={createSessionForm.titleText}
                      onChange={(e) => setCreateSessionForm((prev) => ({ ...prev, titleText: e.target.value, titleChoice: "provided" }))}
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "1px solid #e5e7eb",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                </div>
              )}

              {createSessionForm.step === 7 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>7. 您有其他想让我们知道的关于小说的信息吗？</div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="radio"
                      name="extra_notes"
                      checked={!createSessionForm.extraNotes}
                      onChange={() => setCreateSessionForm((prev) => ({ ...prev, extraNotes: "" }))}
                    />
                    <span>没有</span>
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      type="radio"
                      name="extra_notes"
                      checked={!!createSessionForm.extraNotes}
                      onChange={() => setCreateSessionForm((prev) => ({ ...prev, extraNotes: prev.extraNotes || "" }))}
                    />
                    <textarea
                      placeholder="请输入"
                      value={createSessionForm.extraNotes}
                      onChange={(e) => setCreateSessionForm((prev) => ({ ...prev, extraNotes: e.target.value }))}
                      rows={3}
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "1px solid #e5e7eb",
                        background: "#f9fafb",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Step {createSessionForm.step}/7</div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() =>
                    setCreateSessionForm((prev) => ({
                      ...prev,
                      step: Math.max(1, prev.step - 1),
                    }))
                  }
                  disabled={createSessionForm.step === 1}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    color: "#111827",
                    fontWeight: 700,
                    cursor: createSessionForm.step === 1 ? "not-allowed" : "pointer",
                    opacity: createSessionForm.step === 1 ? 0.6 : 1,
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (createSessionForm.step === 7) {
                      setCreateSessionForm((prev) => ({ ...prev, wizardOpen: false }));
                      return;
                    }
                    const nextStep = createSessionForm.step + 1;
                    setCreateSessionForm((prev) => ({
                      ...prev,
                      step: Math.min(7, nextStep),
                    }));
                  }}
                  disabled={
                    (createSessionForm.step === 1 && !createSessionForm.length) ||
                    (createSessionForm.step === 2 && !createSessionForm.year) ||
                    (createSessionForm.step === 3 && !createSessionForm.genre && !createSessionForm.otherGenres) ||
                    (createSessionForm.step === 4 &&
                      !(createSessionForm.characters || []).some((c) => c.name.trim() || c.role.trim())) ||
                    (createSessionForm.step === 5 && !createSessionForm.style) ||
                    (createSessionForm.step === 6 &&
                      (!createSessionForm.titleChoice ||
                        (createSessionForm.titleChoice === "provided" && !createSessionForm.titleText)))
                  }
                  style={{
                    padding: "10px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background: createSessionForm.step === 7 ? "#111827" : "#000000",
                    color: "#ffffff",
                    fontWeight: 800,
                    cursor: "pointer",
                    opacity:
                      (createSessionForm.step === 1 && !createSessionForm.length) ||
                      (createSessionForm.step === 2 && !createSessionForm.year) ||
                      (createSessionForm.step === 3 && !createSessionForm.genre && !createSessionForm.otherGenres) ||
                      (createSessionForm.step === 4 &&
                        !(createSessionForm.characters || []).some((c) => c.name.trim() || c.role.trim())) ||
                      (createSessionForm.step === 5 && !createSessionForm.style) ||
                      (createSessionForm.step === 6 &&
                        (!createSessionForm.titleChoice ||
                          (createSessionForm.titleChoice === "provided" && !createSessionForm.titleText)))
                        ? 0.4
                        : 1,
                  }}
                >
                  {createSessionForm.step === 7 ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </div>
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
  lastEventTs: string | null;
  pollingEvents: boolean;
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

type ProgressItem = {
  subtaskId: string;
  title: string;
  agent: "worker" | "reviewer";
  status: "in_progress" | "completed";
  startedAt?: string;
  finishedAt?: string;
  order: number;
};

type ViewMode = "timeline" | "output";

function buildNovelProfileSummary(profile: Record<string, any> | null | undefined): string | null {
  if (!profile) return null;
  const len = profile.length ? `Length: ${profile.length}` : "";
  const year = profile.year ? `Year: ${profile.year}` : "";
  const genre = profile.genre || profile.other_genres ? `Genre: ${profile.genre || profile.other_genres}` : "";
  const style = profile.style ? `Style: ${profile.style}` : "";
  const title = profile.title_text ? `Title: ${profile.title_text}` : "";
  const charsRaw = Array.isArray(profile.characters) ? profile.characters : [];
  const chars = charsRaw
    .map((c: any) => {
      if (!c) return null;
      const name = (c.name ?? "").trim();
      const role = (c.role ?? "").trim();
      if (!name && !role) return null;
      return `${name}${role ? ` (${role})` : ""}`;
    })
    .filter(Boolean)
    .join(", ");
  const characters = chars ? `Characters: ${chars}` : "";
  const extra = profile.extra_notes ? `Notes: ${profile.extra_notes}` : "";
  const summary = [len, year, genre, style, title, characters, extra].filter(Boolean).join("; ");
  if (!summary) return null;
  return `Here is my novel profile for planning:\n${summary}`;
}

function deriveProgressByAgent(snapshot: SessionSnapshot | null): Record<"worker" | "reviewer", ProgressItem[]> {
  if (!snapshot) {
    return { worker: [], reviewer: [] };
  }

  const titleMap = new Map((snapshot.subtasks ?? []).map((s) => [String(s.id), s.title]));
  const events = [...(snapshot.progress_events ?? [])].sort((a, b) => {
    const ta = a?.ts ? new Date(a.ts).getTime() : 0;
    const tb = b?.ts ? new Date(b.ts).getTime() : 0;
    return ta - tb;
  });

  const buckets: Record<"worker" | "reviewer", Map<string, ProgressItem>> = {
    worker: new Map(),
    reviewer: new Map(),
  };
  const orders: Record<"worker" | "reviewer", number> = { worker: 0, reviewer: 0 };

  for (const ev of events) {
    const agent = ev?.agent;
    if (agent !== "worker" && agent !== "reviewer") continue;
    const subtaskIdRaw = ev.subtask_id;
    if (!subtaskIdRaw) continue;
    const subtaskId = String(subtaskIdRaw);
    const bucket = buckets[agent];
    let current = bucket.get(subtaskId);
    if (!current) {
      orders[agent] += 1;
      current = {
        subtaskId,
        title: titleMap.get(subtaskId) ?? `Subtask ${subtaskId}`,
        agent,
        status: ev.status ?? (ev.stage === "finish" ? "completed" : "in_progress"),
        order: orders[agent],
      };
    }

    if (ev.stage === "start") {
      current.startedAt = current.startedAt ?? ev.ts;
      current.status = ev.status ?? "in_progress";
    } else if (ev.stage === "finish") {
      current.finishedAt = ev.ts ?? current.finishedAt;
      current.startedAt = current.startedAt ?? ev.ts;
      current.status = ev.status ?? "completed";
    }

    bucket.set(subtaskId, current);
  }

  return {
    worker: Array.from(buckets.worker.values()).sort((a, b) => a.order - b.order),
    reviewer: Array.from(buckets.reviewer.values()).sort((a, b) => a.order - b.order),
  };
}

const buildSubtasksFromPlan = (planData: Record<string, any> | null | undefined): Subtask[] => {
  const subtasksArray = planData?.subtasks;
  const entries = Array.isArray(subtasksArray) ? subtasksArray : [];
  return entries.map((entry: Record<string, any>, idx: number) => ({
    id: String(entry.id),
    title: entry.title ?? "",
    status: entry.status ?? "pending",
    notes: entry.notes ?? "",
    index: idx + 1,
    needs_redo: entry.needs_redo,
  }));
};

function mergeSnapshotWithEvents(
  snapshot: SessionSnapshot,
  events: { progress_events?: any[]; worker_outputs?: any[] },
): SessionSnapshot {
  const mergedProgress = [...(snapshot.progress_events ?? [])];
  const seen = new Set(mergedProgress.map((ev) => `${ev.agent}-${ev.subtask_id}-${ev.stage}-${ev.ts}`));
  for (const ev of events.progress_events ?? []) {
    const key = `${ev.agent}-${ev.subtask_id}-${ev.stage}-${ev.ts}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mergedProgress.push(ev);
  }
  mergedProgress.sort((a, b) => {
    const ta = a?.ts ? new Date(a.ts).getTime() : 0;
    const tb = b?.ts ? new Date(b.ts).getTime() : 0;
    return ta - tb;
  });

  const mergedOutputs = [...(snapshot.worker_outputs ?? [])];
  const existingOutputs = new Set(mergedOutputs.map((o) => `${o.subtask_id}-${o.timestamp}`));
  for (const wo of events.worker_outputs ?? []) {
    const key = `${wo.subtask_id}-${wo.timestamp}`;
    if (existingOutputs.has(key)) continue;
    existingOutputs.add(key);
    mergedOutputs.push(wo);
  }

  let updatedPlan = snapshot.plan;
  let updatedSubtasks = snapshot.subtasks ?? [];
  const planUpdates = (events.progress_events ?? [])
    .map((ev) => ({
      ts: ev?.ts,
      plan: ev?.payload?.plan_snapshot,
    }))
    .filter((entry) => entry.plan);
  if (planUpdates.length > 0) {
    planUpdates.sort((a, b) => {
      const ta = a.ts ? new Date(a.ts).getTime() : 0;
      const tb = b.ts ? new Date(b.ts).getTime() : 0;
      return ta - tb;
    });
    const latestPlan = planUpdates[planUpdates.length - 1].plan;
    if (latestPlan) {
      updatedPlan = latestPlan;
      updatedSubtasks = buildSubtasksFromPlan(latestPlan);
    }
  }

  return {
    ...snapshot,
    plan: updatedPlan,
    subtasks: updatedSubtasks,
    progress_events: mergedProgress,
    worker_outputs: mergedOutputs,
    last_progress_event_ts: events.progress_events && events.progress_events.length
      ? events.progress_events[events.progress_events.length - 1]?.ts ?? snapshot.last_progress_event_ts
      : snapshot.last_progress_event_ts,
  };
}

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
    lastEventTs: null,
    pollingEvents: false,
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
  const [orchSize, setOrchSize] = useState<{ width: number; height: number }>({ width: 360, height: 420 });
  const [orchPos, setOrchPos] = useState<{ x: number; y: number } | null>(null);
  const [orchSending, setOrchSending] = useState(false);
  const [orchPendingText, setOrchPendingText] = useState<string | null>(null);
  const orchDrag = useRef(false);
  const orchResize = useRef<{
    resizing: boolean;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startLeft: number;
    startTop: number;
    dir: "nw" | "ne" | "sw" | "se";
  }>({ resizing: false, startX: 0, startY: 0, startW: 360, startH: 420, startLeft: 0, startTop: 0, dir: "se" });
  const orchDragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    sessionId: string | null;
    sessionTopic: string | null;
  }>({ show: false, sessionId: null, sessionTopic: null });
  const [viewModes, setViewModes] = useState<{ worker: ViewMode; reviewer: ViewMode }>({
    worker: "timeline",
    reviewer: "timeline",
  });
  const [createSessionForm, setCreateSessionForm] = useState<CreateSessionFormState>({
    show: false,
    topic: "",
    novelMode: false,
    wizardOpen: false,
    step: 1,
    length: "",
    year: "",
    genre: "",
    otherGenres: "",
    characters: [{ name: "", role: "" }],
    style: "",
    titleChoice: "",
    titleText: "",
    extraNotes: "",
    error: null,
  });
  const eventsPollTimer = useRef<number | null>(null);
  const isRunning = state.snapshot?.is_running ?? false;
  const commandsDisabled = isRunning || state.pollingEvents;
  const pushNovelProfileOnce = useRef<Set<string>>(new Set());

  useEffect(() => {
    setViewModes({ worker: "timeline", reviewer: "timeline" });
  }, [state.activeSessionId]);

  useEffect(() => {
    // Clear polling timer when session changes or app unmounts.
    return () => {
      if (eventsPollTimer.current) {
        window.clearTimeout(eventsPollTimer.current);
        eventsPollTimer.current = null;
      }
    };
  }, []);

  const stopEventPolling = () => {
    if (eventsPollTimer.current) {
      window.clearTimeout(eventsPollTimer.current);
      eventsPollTimer.current = null;
    }
    setState((prev) => ({ ...prev, pollingEvents: false }));
  };

  const schedulePoll = (delayMs: number) => {
    if (eventsPollTimer.current) {
      window.clearTimeout(eventsPollTimer.current);
      eventsPollTimer.current = null;
    }
    eventsPollTimer.current = window.setTimeout(() => {
      void pollEventsOnce();
    }, delayMs);
  };

  const sendNovelProfileToPlanner = async (sessionId: string, profile: Record<string, any> | null | undefined) => {
    if (!profile || pushNovelProfileOnce.current.has(sessionId)) return;
    const summary = buildNovelProfileSummary(profile);
    if (!summary) return;
    pushNovelProfileOnce.current.add(sessionId);
    try {
      const snapshot = await sendCommand(sessionId, "ask", { question: summary });
      setState((prev) => ({
        ...prev,
        snapshot,
        lastEventTs: snapshot.last_progress_event_ts ?? prev.lastEventTs,
        pollingEvents: snapshot.is_running ?? prev.pollingEvents,
      }));
    } catch (err: any) {
      // non-blocking; planner chat can still proceed manually
      console.warn("Failed to push novel profile to planner", err);
    }
  };

  const pollEventsOnce = async () => {
    if (!state.activeSessionId || !state.snapshot) return;
    const since = state.lastEventTs || state.snapshot.last_progress_event_ts || null;
    let stillRunning = false;
    try {
      const resp = await getSessionEvents(state.activeSessionId, since ?? undefined);
      setState((prev) => {
        if (!prev.snapshot) return prev;
        const merged = mergeSnapshotWithEvents(prev.snapshot, resp);
        const events = resp.progress_events ?? [];
        const latestTs =
          events.length > 0
            ? events[events.length - 1]?.ts ?? merged.last_progress_event_ts
            : merged.last_progress_event_ts ?? prev.lastEventTs;
        stillRunning = merged.is_running ?? false;
        return {
          ...prev,
          snapshot: merged,
          lastEventTs: latestTs ?? null,
          pollingEvents: merged.is_running ?? false,
        };
      });
    } catch (err: any) {
      if (!handleAuthError(err)) {
        setState((prev) => ({ ...prev, error: err.message ?? "Polling failed" }));
      }
      stopEventPolling();
      return;
    }

    if (stillRunning) {
      schedulePoll(1200);
    } else {
      stopEventPolling();
    }
  };

  useEffect(() => {
    const shouldPoll = !!state.activeSessionId && (state.snapshot?.is_running || state.snapshot?.current_subtask_id);
    if (shouldPoll) {
      setState((prev) => ({ ...prev, pollingEvents: true }));
      if (!eventsPollTimer.current) {
        void pollEventsOnce();
      }
    } else {
      stopEventPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeSessionId, state.snapshot?.is_running, state.snapshot?.current_subtask_id]);

  const isDraggingSidebar = useRef(false);
  const clearActiveSession = async (message: string) => {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setState((prev) => ({
      ...prev,
      loading: false,
      activeSessionId: null,
      snapshot: null,
      error: message,
      lastEventTs: null,
      pollingEvents: false,
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
      lastEventTs: null,
      pollingEvents: false,
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

  // Initialize orchestrator chat position when opened
  useEffect(() => {
    if (!orchChatOpen || orchPos) return;
    const pad = 24;
    const fallbackW = orchSize.width;
    const fallbackH = orchSize.height;
    if (typeof window === "undefined") return;
    const maxW = Math.max(320, Math.min(fallbackW, window.innerWidth - pad * 2));
    const maxH = Math.max(320, Math.min(fallbackH, window.innerHeight - pad * 2));
    const x = Math.max(pad, window.innerWidth - maxW - pad);
    const y = Math.max(pad, window.innerHeight - maxH - 90);
    if (maxW !== fallbackW || maxH !== fallbackH) {
      setOrchSize({ width: maxW, height: maxH });
    }
    setOrchPos({ x, y });
  }, [orchChatOpen, orchPos, orchSize.width, orchSize.height]);

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
        return;
      }

      if (orchDrag.current && orchPos) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const nextX = e.clientX - orchDragOffset.current.x;
        const nextY = e.clientY - orchDragOffset.current.y;
        const clampedX = Math.min(Math.max(8, nextX), Math.max(8, vw - orchSize.width - 8));
        const clampedY = Math.min(Math.max(8, nextY), Math.max(8, vh - orchSize.height - 8));
        setOrchPos({ x: clampedX, y: clampedY });
        return;
      }

      if (orchResize.current.resizing) {
        const { startX, startY, startW, startH, startLeft, startTop, dir } = orchResize.current;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        let nextW = startW;
        let nextH = startH;
        let nextLeft = startLeft;
        let nextTop = startTop;
        const MIN = 320;

        if (dir === "se") {
          nextW = Math.max(MIN, startW + deltaX);
          nextH = Math.max(MIN, startH + deltaY);
        } else if (dir === "sw") {
          nextW = Math.max(MIN, startW - deltaX);
          nextLeft = startLeft + deltaX;
          nextH = Math.max(MIN, startH + deltaY);
        } else if (dir === "ne") {
          nextW = Math.max(MIN, startW + deltaX);
          nextH = Math.max(MIN, startH - deltaY);
          nextTop = startTop + deltaY;
        } else if (dir === "nw") {
          nextW = Math.max(MIN, startW - deltaX);
          nextLeft = startLeft + deltaX;
          nextH = Math.max(MIN, startH - deltaY);
          nextTop = startTop + deltaY;
        }

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const maxLeft = Math.max(8, vw - nextW - 8);
        const maxTop = Math.max(8, vh - nextH - 8);
        nextLeft = Math.min(Math.max(8, nextLeft), maxLeft);
        nextTop = Math.min(Math.max(8, nextTop), maxTop);

        setOrchSize({ width: nextW, height: nextH });
        setOrchPos({ x: nextLeft, y: nextTop });
        return;
      }
    };

    const handleMouseUp = () => {
      isDraggingSidebar.current = false;
      layoutDrag.current = null;
      orchDrag.current = false;
      orchResize.current.resizing = false;
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
              lastEventTs: snapshot.last_progress_event_ts ?? null,
              pollingEvents: snapshot.is_running ?? false,
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
            lastEventTs: snapshot.last_progress_event_ts ?? null,
            pollingEvents: snapshot.is_running ?? false,
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

  function handleCreateSession() {
    setCreateSessionForm({
      show: true,
      topic: "",
      novelMode: false,
      wizardOpen: false,
      step: 1,
      length: "",
      year: "",
      genre: "",
      otherGenres: "",
      characters: [{ name: "", role: "" }],
      style: "",
      titleChoice: "",
      titleText: "",
      extraNotes: "",
      error: null,
    });
  }

  const buildNovelProfile = (): Record<string, unknown> | undefined => {
    if (!createSessionForm.novelMode) return undefined;
    const characters = (createSessionForm.characters || []).filter(
      (c) => c.name.trim() || c.role.trim()
    );
    return {
      length: createSessionForm.length || undefined,
      year: createSessionForm.year || undefined,
      genre: createSessionForm.genre || undefined,
      other_genres: createSessionForm.otherGenres || undefined,
      characters: characters.map((c) => ({ name: c.name.trim(), role: c.role.trim() })),
      style: createSessionForm.style || undefined,
      title_choice: createSessionForm.titleChoice || undefined,
      title_text: createSessionForm.titleText || undefined,
      extra_notes: createSessionForm.extraNotes || undefined,
    };
  };

  async function submitCreateSession(e?: FormEvent) {
    if (e) e.preventDefault();
    const topic = createSessionForm.topic.trim();
    if (!topic) {
      setCreateSessionForm((prev) => ({ ...prev, error: "Session name is required." }));
      return;
    }
    if (createSessionForm.novelMode) {
      const requiredStepsFilled =
        createSessionForm.length &&
        createSessionForm.year &&
        (createSessionForm.genre || createSessionForm.otherGenres) &&
        createSessionForm.style &&
        createSessionForm.titleChoice &&
        (createSessionForm.titleChoice === "not_yet" || createSessionForm.titleText);
      if (!requiredStepsFilled) {
        setCreateSessionForm((prev) => ({
          ...prev,
          error: "Please finish the novel questionnaire before starting.",
          wizardOpen: true,
        }));
        return;
      }
    }
    const novelProfile = buildNovelProfile();

    setState((prev) => ({ ...prev, loading: true, error: null }));
    setCreateSessionForm((prev) => ({ ...prev, error: null }));
    try {
      const snapshot = await createSession(topic, {
        novel_mode: createSessionForm.novelMode,
        novel_profile: novelProfile,
      });
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
      const profileFromResponse =
        (snapshot as any)?.state?.extra?.novel_profile ||
        (snapshot as any)?.orchestrator_state?.extra?.novel_profile ||
        novelProfile;
      if (createSessionForm.novelMode) {
        await sendNovelProfileToPlanner(id, profileFromResponse as Record<string, any>);
      }
      setCreateSessionForm({
        show: false,
        topic: "",
        novelMode: false,
        wizardOpen: false,
        step: 1,
        length: "",
        year: "",
        genre: "",
        otherGenres: "",
        characters: [{ name: "", role: "" }],
        style: "",
        titleChoice: "",
        titleText: "",
        extraNotes: "",
        error: null,
      });
    } catch (err: any) {
      if (handleAuthError(err)) {
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }
      const message = err.message ?? "Failed to create session";
      setState((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      setCreateSessionForm((prev) => ({
        ...prev,
        error: message,
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
    setState((prev) => ({ ...prev, error: null, pollingEvents: true }));
    try {
      const snapshot = await sendCommand(state.activeSessionId, command);
      setState((prev) => ({
        ...prev,
        snapshot,
        lastEventTs: snapshot.last_progress_event_ts ?? prev.lastEventTs,
        pollingEvents: snapshot.is_running ?? prev.pollingEvents,
      }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      if (err instanceof ApiError && err.status === 404) {
        await clearActiveSession("Session not found; please re-open or create a session.");
        return;
      }
      setState((prev) => ({
        ...prev,
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
      setState((prev) => ({
        ...prev,
        loading: false,
        snapshot,
        lastEventTs: snapshot.last_progress_event_ts ?? prev.lastEventTs,
        pollingEvents: snapshot.is_running ?? prev.pollingEvents,
      }));
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
    setOrchPendingText(text);
    setOrchSending(true);
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(sessionId, "ask", { question: text });
      setState((prev) => ({
        ...prev,
        loading: false,
        snapshot,
        lastEventTs: snapshot.last_progress_event_ts ?? prev.lastEventTs,
        pollingEvents: snapshot.is_running ?? prev.pollingEvents,
      }));
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
    } finally {
      setOrchSending(false);
      setOrchPendingText(null);
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
      setState((prev) => ({
        ...prev,
        loading: false,
        snapshot,
        lastEventTs: snapshot.last_progress_event_ts ?? prev.lastEventTs,
        pollingEvents: snapshot.is_running ?? prev.pollingEvents,
      }));
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

  async function applyReviewerRevision(subtaskId: string) {
    if (!state.activeSessionId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(state.activeSessionId, "apply_reviewer_revision", { subtask_id: subtaskId });
      setState((prev) => ({
        ...prev,
        loading: false,
        snapshot,
        lastEventTs: snapshot.last_progress_event_ts ?? prev.lastEventTs,
        pollingEvents: snapshot.is_running ?? prev.pollingEvents,
      }));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? "Failed to apply revision",
      }));
    }
  }

  async function confirmCurrentPlan() {
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await sendCommand(sessionId, "confirm_plan");
      setState((prev) => ({
        ...prev,
        loading: false,
        snapshot,
        lastEventTs: snapshot.last_progress_event_ts ?? prev.lastEventTs,
        pollingEvents: snapshot.is_running ?? prev.pollingEvents,
      }));
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
  const progressByAgent = useMemo(() => deriveProgressByAgent(snapshot), [snapshot]);
  const progressSeenCounts = useMemo(() => {
    const events = snapshot?.progress_events ?? [];
    const workerSet = new Set<string>();
    const reviewerSet = new Set<string>();
    for (const ev of events) {
      if (!ev?.subtask_id) continue;
      const sid = String(ev.subtask_id);
      if (ev.agent === "worker") workerSet.add(sid);
      if (ev.agent === "reviewer") reviewerSet.add(sid);
    }
    return { worker: workerSet.size, reviewer: reviewerSet.size };
  }, [snapshot?.progress_events]);
  useEffect(() => {
    if (!snapshot?.progress_events?.length) return;
    const invalid = snapshot.progress_events.filter((ev) => !ev?.agent || !ev?.subtask_id);
    if (invalid.length > 0) {
      console.warn("Dropped malformed progress events", invalid);
    }
  }, [snapshot?.progress_events]);
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
      <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", background: "#ffffff", overflowY: "auto", overflowX: "hidden" }}>
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

      <main style={{ flex: 1, display: "flex", flexDirection: "column", background: "#ffffff", minHeight: 0, overflow: "hidden" }}>
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
            {snapshot?.state?.extra?.novel_mode && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                <span style={{
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}>
                  Novel Mode
                </span>
                <span style={{ fontSize: "12px", color: "#374151" }}>
                  {[
                    snapshot.state?.extra?.novel_profile?.length,
                    snapshot.state?.extra?.novel_profile?.genre || snapshot.state?.extra?.novel_profile?.other_genres,
                    snapshot.state?.extra?.novel_profile?.style,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            )}
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
                disabled={commandsDisabled}
                style={{
                  padding: "10px 20px",
                  background: commandsDisabled ? "#f3f4f6" : "#ffffff",
                  color: commandsDisabled ? "#9ca3af" : "#000000",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: commandsDisabled ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  if (commandsDisabled) return;
                  e.currentTarget.style.background = "#000000";
                  e.currentTarget.style.color = "#ffffff";
                }}
                onMouseOut={(e) => {
                  if (commandsDisabled) return;
                  e.currentTarget.style.background = "#ffffff";
                  e.currentTarget.style.color = "#000000";
                }}
              >
                Next Step
              </button>
              <button
                onClick={() => handleCommand("all")}
                disabled={commandsDisabled}
                style={{
                  padding: "10px 20px",
                  background: commandsDisabled ? "#1f2937" : "#000000",
                  color: commandsDisabled ? "#9ca3af" : "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: commandsDisabled ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  if (commandsDisabled) return;
                  e.currentTarget.style.background = "#333333";
                }}
                onMouseOut={(e) => {
                  if (commandsDisabled) return;
                  e.currentTarget.style.background = "#000000";
                }}
              >
                Run All
              </button>
            </div>
          )}
        </header>

        {snapshot && snapshot.session_mode === "planning" ? (
          <section
            id="main-content"
            style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative", minHeight: 0 }}
          >
            <div style={{ flex: 2, minWidth: 0, borderRight: "1px solid #e5e7eb", minHeight: 0, overflow: "hidden" }}>
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
                createSessionForm={createSessionForm}
                setCreateSessionForm={setCreateSessionForm}
              />
            </div>
          </section>
        ) : (
          <section
            id="main-content"
            style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative", minHeight: 0 }}
          >
            <div
              ref={layoutRef}
              style={{
                display: "grid",
                gridTemplateColumns: `${layoutWidths[0]}% ${layoutWidths[1]}% ${layoutWidths[2]}%`,
                width: "100%",
                height: "100%",
                minHeight: 0,
                overflow: "visible",
                position: "relative",
                alignItems: "stretch",
              }}
            >
              <PlanColumn snapshot={snapshot} />
              <WorkerColumn
                snapshot={snapshot}
                progress={progressByAgent.worker}
                progressSeenCount={progressSeenCounts.worker}
                viewMode={viewModes.worker}
                onViewModeChange={(mode) => setViewModes((prev) => ({ ...prev, worker: mode }))}
              />
              <CoordinatorColumn
                snapshot={snapshot}
                width={100}
                progress={progressByAgent.reviewer}
                progressSeenCount={progressSeenCounts.reviewer}
                viewMode={viewModes.reviewer}
                onViewModeChange={(mode) => setViewModes((prev) => ({ ...prev, reviewer: mode }))}
                onAdoptRevision={applyReviewerRevision}
              />

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
                  left: orchPos ? `${orchPos.x}px` : undefined,
                  top: orchPos ? `${orchPos.y}px` : undefined,
                  right: orchPos ? undefined : "24px",
                  bottom: orchPos ? undefined : "90px",
                  width: `${orchSize.width}px`,
                  height: `${orchSize.height}px`,
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderBottom: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    cursor: "grab",
                    userSelect: "none",
                  }}
                  onMouseDown={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button")) return;
                    const rect = (e.currentTarget.parentElement as HTMLDivElement).getBoundingClientRect();
                    orchDrag.current = true;
                    orchDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                    if (!orchPos) {
                      setOrchPos({ x: rect.left, y: rect.top });
                    }
                    document.body.style.cursor = 'grabbing';
                    document.body.style.userSelect = 'none';
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "13px" }}>Orchestrator</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {orchSending && (
                      <span
                        className="orch-pulse"
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#111827",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          border: "1px solid #e5e7eb",
                          background: "#ffffff",
                        }}
                        aria-live="polite"
                      >
                        Thinking…
                      </span>
                    )}
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
                </div>
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    <ExecutionView
                      session={snapshot}
                      onSendExecutionMessage={sendExecutionMessage}
                      pendingMessage={orchPendingText}
                      isSending={orchSending}
                    />
                  </div>
                </div>
                {(["nw", "ne", "sw", "se"] as const).map((dir) => {
                  const cursorMap: Record<typeof dir, string> = {
                    nw: "nwse-resize",
                    se: "nwse-resize",
                    ne: "nesw-resize",
                    sw: "nesw-resize",
                  };
                  const cursor = cursorMap[dir];
                  const positionStyle: Record<string, string> = {};
                  if (dir === "nw" || dir === "ne") positionStyle.top = "6px";
                  if (dir === "sw" || dir === "se") positionStyle.bottom = "6px";
                  if (dir === "nw" || dir === "sw") positionStyle.left = "6px";
                  if (dir === "ne" || dir === "se") positionStyle.right = "6px";
                  return (
                    <div
                      key={dir}
                      onMouseDown={(e) => {
                        if (!orchPos) {
                          const pad = 24;
                          const fallbackX = Math.max(pad, window.innerWidth - orchSize.width - pad);
                          const fallbackY = Math.max(pad, window.innerHeight - orchSize.height - 90);
                          setOrchPos({ x: fallbackX, y: fallbackY });
                        }
                        orchResize.current = {
                          resizing: true,
                          startX: e.clientX,
                          startY: e.clientY,
                          startW: orchSize.width,
                          startH: orchSize.height,
                          startLeft: orchPos?.x ?? Math.max(24, window.innerWidth - orchSize.width - 24),
                          startTop: orchPos?.y ?? Math.max(24, window.innerHeight - orchSize.height - 90),
                          dir,
                        };
                        document.body.style.cursor = cursor;
                        document.body.style.userSelect = 'none';
                      }}
                      style={{
                        position: "absolute",
                        width: "14px",
                        height: "14px",
                        borderRadius: "4px",
                        background: "#f3f4f6",
                        border: "1px solid #d1d5db",
                        cursor,
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
                        ...positionStyle,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Create Session Modal */}
      {createSessionForm.show && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setCreateSessionForm((prev) => ({ ...prev, show: false }))}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "520px",
              background: "#ffffff",
              borderRadius: "18px",
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ fontSize: "14px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", marginBottom: "6px" }}>
                New Session
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0b0b0b", letterSpacing: "-0.3px" }}>
                Please Name this Session
              </div>
            </div>
            <form onSubmit={(e) => void submitCreateSession(e)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Session Name</label>
                <input
                  autoFocus
                  type="text"
                  value={createSessionForm.topic}
                  onChange={(e) => setCreateSessionForm((prev) => ({ ...prev, topic: e.target.value }))}
                  placeholder="e.g. Long-form novel about time travel"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={createSessionForm.novelMode}
                  onChange={(e) => setCreateSessionForm((prev) => ({
                    ...prev,
                    novelMode: e.target.checked,
                    wizardOpen: e.target.checked || prev.wizardOpen,
                    step: 1,
                    length: e.target.checked ? prev.length : "",
                    year: e.target.checked ? prev.year : "",
                    genre: e.target.checked ? prev.genre : "",
                    otherGenres: e.target.checked ? prev.otherGenres : "",
                    characters: e.target.checked ? prev.characters : [{ name: "", role: "" }],
                    style: e.target.checked ? prev.style : "",
                    titleChoice: e.target.checked ? prev.titleChoice : "",
                    titleText: e.target.checked ? prev.titleText : "",
                    extraNotes: e.target.checked ? prev.extraNotes : "",
                  }))}
                  style={{ width: "18px", height: "18px" }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#0b0b0b" }}>Enable Novel Mode</div>
                  <div style={{ fontSize: "12px", color: "#4b5563" }}>Novel prompts and flows only apply when this is on.</div>
                </div>
              </label>

              {createSessionForm.novelMode && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setCreateSessionForm((prev) => ({ ...prev, wizardOpen: true, step: 1 }))}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      color: "#0b0b0b",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Open Novel Questionnaire
                  </button>
                </div>
              )}

              {createSessionForm.error && (
                <div style={{ fontSize: "12px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "10px 12px" }}>
                  {createSessionForm.error}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setCreateSessionForm((prev) => ({ ...prev, show: false }))}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    color: "#111827",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "12px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#000000",
                    color: "#ffffff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Start Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

type ColumnProps = {
  snapshot: SessionSnapshot | null;
  width: number;
  progress?: ProgressItem[];
  progressSeenCount?: number;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onAdoptRevision?: (subtaskId: string) => void;
};

function ProgressStrip({ items, label, sourceCount = 0 }: { items: ProgressItem[]; label: string; sourceCount?: number }) {
  const palette: Record<ProgressItem["status"], { bg: string; fg: string; badge: string }> = {
    in_progress: { bg: "#f4f4f5", fg: "#111827", badge: "#f97316" },
    completed: { bg: "#ecfdf3", fg: "#065f46", badge: "#10b981" },
  };

  const formatted = (ts?: string) => {
    if (!ts) return "—";
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const durationLabel = (start?: string, finish?: string) => {
    if (!start || !finish) return null;
    const startDate = new Date(start);
    const finishDate = new Date(finish);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(finishDate.getTime())) return null;
    const diff = Math.max(0, finishDate.getTime() - startDate.getTime());
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.round((diff % 60000) / 1000);
    if (minutes <= 0 && seconds <= 0) return null;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`;
  };

  const droppedHint = Math.max(0, sourceCount - items.length);
  const waitingLabel = sourceCount > 0 ? "Subtask progress detected, waiting for details..." : "Waiting for a subtask to start.";

  return (
    <div style={{
      marginBottom: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#4b5563" }}>
          Live subtasks · {label}
        </span>
        <span style={{ fontSize: "12px", color: "#6b7280" }}>{items.length || 0}</span>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {items.length === 0 ? (
          <div style={{
            padding: "10px 12px",
            borderRadius: "10px",
            background: "#f8fafc",
            border: "1px dashed #e5e7eb",
            color: "#6b7280",
            fontSize: "12px",
            }}>
            {waitingLabel}
          </div>
        ) : items.map((item) => {
          const colors = palette[item.status] ?? palette.in_progress;
          const isInProgress = item.status === "in_progress";
          const duration = durationLabel(item.startedAt, item.finishedAt);
          return (
            <div key={`${item.agent}-${item.subtaskId}`} style={{
              minWidth: "180px",
              padding: "14px 14px 12px 14px",
              borderRadius: "14px",
              border: "1px solid #e5e7eb",
              background: colors.bg,
              color: colors.fg,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  background: "#111827",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.18)",
                }}>
                  T{item.order}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontWeight: 700,
                    fontSize: "13px",
                    color: colors.fg,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                    {isInProgress ? `Started ${formatted(item.startedAt)}` : `Finished ${formatted(item.finishedAt)}${duration ? ` · ${duration}` : ""}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {isInProgress ? (
                    <span className="progress-spinner" aria-hidden="true" />
                  ) : (
                    <span style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: colors.badge,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: 800,
                    }}>
                      ✓
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                borderRadius: "999px",
                background: colors.badge,
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                alignSelf: "flex-start",
              }}>
                {isInProgress ? "In progress" : "Completed"}
                {!isInProgress && duration && (
                  <span style={{ opacity: 0.85, fontWeight: 700 }}>{duration}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {droppedHint > 0 && (
        <div style={{
          marginTop: "4px",
          fontSize: "11px",
          color: "#b91c1c",
          background: "#fef2f2",
          border: "1px solid #fecdd3",
          padding: "6px 8px",
          borderRadius: "10px",
        }}>
          Detected {droppedHint} extra {label.toLowerCase()} subtask event(s); awaiting data to render.
        </div>
      )}
    </div>
  );
}

function PlanColumn({ snapshot }: { snapshot: SessionSnapshot | null }) {
  const planTitle = snapshot?.plan?.title || snapshot?.topic || "Plan";
  const subtasks = snapshot?.subtasks ?? [];

  return (
    <div style={{
      borderRight: "1px solid #e5e7eb",
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      flex: "1 1 0",
      padding: "20px",
      minHeight: 0,
      height: "100%",
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

function WorkerColumn({ snapshot, progress, progressSeenCount = 0, viewMode = "timeline", onViewModeChange }: { snapshot: SessionSnapshot | null; progress: ProgressItem[]; progressSeenCount?: number; viewMode?: ViewMode; onViewModeChange?: (mode: ViewMode) => void }) {
  const [descending, setDescending] = useState(true);
  const activeViewMode: ViewMode = viewMode ?? "timeline";
  const outputs = [...(snapshot?.worker_outputs ?? [])].sort((a, b) => {
    const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return descending ? -diff : diff;
  });
  useEffect(() => {
    const hasProgress = (snapshot?.progress_events?.length ?? 0) > 0;
    if (hasProgress && outputs.length === 0) {
      console.warn("Worker outputs are empty while progress events exist; check backend SUBTASK_RESULT writes or artifact access.");
    }
  }, [snapshot?.progress_events, outputs.length]);

  const novelSummary = (snapshot as any)?.state?.extra?.novel_summary_t1_t4 || (snapshot as any)?.orchestrator_state?.extra?.novel_summary_t1_t4;

  const escapeHtml = (str: string) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const handleViewAll = (out: any, fallbackIndex: number) => {
    const title = subtaskMap.get(out.subtask_id) ?? `Task ${out.subtask_id ?? fallbackIndex + 1}`;
    const body = out.content || out.preview || "No content.";
    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #111827; background: #ffffff; line-height: 1.6; }
    h1 { margin-top: 0; font-size: 20px; }
    pre { white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <pre>${escapeHtml(body)}</pre>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    const link = document.createElement("a");
    link.href = url;
    link.download = `output-${out.subtask_id ?? fallbackIndex + 1}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handlePackAll = () => {
    if (outputs.length === 0) return;
    const entries = outputs.map((out, idx) => {
      const title = subtaskMap.get(out.subtask_id) ?? `Task ${out.subtask_id ?? idx + 1}`;
      const content = out.content || out.preview || "No content.";
      const order = subtaskOrder.get(out.subtask_id);
      return { title, content, order, ts: out.timestamp, idx };
    });
    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Worker Outputs</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #111827; background: #ffffff; line-height: 1.6; }
    h1 { margin-top: 0; font-size: 22px; }
    article { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 16px 16px 20px; margin-bottom: 16px; background: #ffffff; box-shadow: 0 8px 20px rgba(0,0,0,0.05); }
    .meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #6b7280; margin-bottom: 8px; }
    .pill { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; background: #111827; color: #fff; font-weight: 800; margin-right: 10px; box-shadow: 0 6px 14px rgba(0,0,0,0.18); }
    pre { white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Worker Outputs</h1>
  ${entries
    .map((e) => {
      const badge = e.order ? `<span class="pill">T${e.order}</span>` : "";
      const ts = e.ts ? new Date(e.ts).toLocaleString() : "";
      return `<article>${badge}<div class="meta"><strong>${escapeHtml(e.title)}</strong><span>${escapeHtml(ts)}</span></div><pre>${escapeHtml(e.content)}</pre></article>`;
    })
    .join("\n")}
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    const link = document.createElement("a");
    link.href = url;
    link.download = "worker-outputs.html";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const subtaskMap = new Map((snapshot?.subtasks ?? []).map((s) => [s.id, s.title]));
  const subtaskOrder = new Map((snapshot?.subtasks ?? []).map((s, i) => [s.id, i + 1]));
  return (
    <div style={{
      borderRight: "1px solid #e5e7eb",
      background: "#f9fafb",
      display: "flex",
      flexDirection: "column",
      flex: "1 1 0",
      padding: "20px",
      minHeight: 0,
      height: "100%",
      overflowX: "hidden",
      overflowY: "auto",
    }} data-view-mode={activeViewMode}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", gap: "10px" }}>
        <h4 style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: 700,
          color: "#000000",
        }}>
          Worker
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "inline-flex", borderRadius: "12px", border: "1px solid #d1d5db", background: "#ffffff", overflow: "hidden" }}>
            {(["timeline", "output"] as ViewMode[]).map((mode) => {
              const active = activeViewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => onViewModeChange?.(mode)}
                  aria-pressed={active}
                  style={{
                    padding: "8px 10px",
                    border: "none",
                    background: active ? "linear-gradient(135deg, #0f172a 0%, #1f2937 100%)" : "transparent",
                    color: active ? "#ffffff" : "#111827",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    minWidth: "70px",
                    transition: "all 0.15s ease",
                  }}
                >
                  {mode === "timeline" ? "Timeline" : "Output"}
                </button>
              );
            })}
          </div>
          {activeViewMode === "output" && (
            <button
              onClick={handlePackAll}
              disabled={outputs.length === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background: outputs.length === 0 ? "#f3f4f6" : "#ffffff",
                color: outputs.length === 0 ? "#9ca3af" : "#111827",
                fontSize: "12px",
                fontWeight: 700,
                cursor: outputs.length === 0 ? "not-allowed" : "pointer",
                boxShadow: outputs.length === 0 ? "none" : "0 8px 18px rgba(0,0,0,0.08)",
              }}
              aria-label="Pack all outputs"
            >
              Pack everything
            </button>
          )}
          <button
            onClick={() => setDescending((prev) => !prev)}
            title={descending ? "最新在前" : "最旧在前"}
            aria-pressed={descending}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "12px",
              border: "1px solid #d1d5db",
              background: descending ? "linear-gradient(135deg, #0f172a 0%, #1f2937 100%)" : "#ffffff",
              cursor: "pointer",
              boxShadow: descending ? "0 12px 26px rgba(0,0,0,0.14)" : "0 6px 18px rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
              zIndex: 5,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "#0f172a";
              e.currentTarget.style.boxShadow = "0 12px 30px rgba(0,0,0,0.16)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "#d1d5db";
              e.currentTarget.style.boxShadow = descending ? "0 12px 26px rgba(0,0,0,0.14)" : "0 6px 18px rgba(0,0,0,0.08)";
            }}
            aria-label="Toggle worker task order"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5.5L12 2L16 5.5H13.5V14.5H10.5V5.5H8Z" fill={descending ? "#ffffff" : "#111827"} />
              <path d="M16 18.5L12 22L8 18.5H10.5V9.5H13.5V18.5H16Z" fill={descending ? "#ffffff" : "#111827"} />
            </svg>
          </button>
        </div>
      </div>
      {novelSummary && (
        <div style={{
          padding: "10px 12px",
          borderRadius: "10px",
          border: "1px solid #e5e7eb",
          background: "#eef2ff",
          color: "#111827",
          fontSize: "12px",
          lineHeight: 1.5,
          marginBottom: "12px",
        }}>
          <div style={{ fontWeight: 800, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4338ca", marginBottom: "4px" }}>
            Novel Summary (t1–t4)
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{novelSummary}</div>
        </div>
      )}
      {activeViewMode === "timeline" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          <ProgressStrip items={progress} label="Worker" sourceCount={progressSeenCount} />
          {progress.length === 0 && (
            <div style={{
              color: "#4b5563",
              fontSize: "14px",
              padding: "12px",
              borderRadius: "12px",
              background: "#ffffff",
              border: "1px dashed #d1d5db",
            }}>
              No progress yet. Switch to Output to inspect generated artifacts when available.
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, paddingRight: "6px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {outputs.length === 0 && (
            <div style={{
              color: "#4b5563",
              fontSize: "14px",
              padding: "12px",
              borderRadius: "12px",
              background: "#ffffff",
              border: "1px dashed #d1d5db",
            }}>
              No worker output yet. If tasks are running, verify backend SUBTASK_RESULT logs and artifact access.
            </div>
          )}
          {outputs.map((out, idx) => {
            const title = subtaskMap.get(out.subtask_id) ?? `Task ${out.subtask_id}`;
            const content = out.content || out.preview || "No content.";
            const order = subtaskOrder.get(out.subtask_id);
            const previewLimit = 300;
            const needsTruncate = content.length > previewLimit;
            const preview = needsTruncate ? `${content.slice(0, previewLimit)}…` : content;
            const viewAllLabel = "View all";
            return (
              <div key={idx} style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "14px 16px 14px 76px",
                boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                position: "relative",
              }}>
                {order && (
                  <span style={{
                    position: "absolute",
                    top: "14px",
                    left: "16px",
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    background: "#111827",
                    color: "#ffffff",
                    fontSize: "12px",
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
                  {preview}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => handleViewAll(out, idx)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "10px",
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      color: "#111827",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {viewAllLabel}{needsTruncate ? " →" : ""}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CoordinatorColumn({ snapshot, width, progress = [], progressSeenCount = 0, viewMode = "timeline", onViewModeChange, onAdoptRevision }: ColumnProps) {
  const baseDecisions: any[] = snapshot?.coord_decisions ?? [];
  const subtaskOrder = new Map((snapshot?.subtasks ?? []).map((s, i) => [String(s.id), i + 1]));
  const activeViewMode: ViewMode = viewMode ?? "timeline";
  const [descending, setDescending] = useState(true);
  const novelSummary = (snapshot as any)?.state?.extra?.novel_summary_t1_t4 || (snapshot as any)?.orchestrator_state?.extra?.novel_summary_t1_t4;
  const reviewerRevisions = (snapshot as any)?.state?.extra?.reviewer_revisions || (snapshot as any)?.orchestrator_state?.extra?.reviewer_revisions || {};

  // Derive reviewer-like statuses from subtasks when no explicit decision exists.
  const existingIds = new Set(
    baseDecisions
      .map((d) => {
        const sid =
          typeof d?.subtask_id === "string" || typeof d?.subtask_id === "number"
            ? d.subtask_id
            : (d as any)?.id;
        return sid == null ? null : String(sid);
      })
      .filter(Boolean) as string[]
  );

  const derivedDecisions: any[] =
    snapshot?.subtasks
      ?.map((sub) => {
        if (!sub || (sub.id != null && existingIds.has(String(sub.id)))) return null;
        const status = sub.needs_redo ? "redo" : sub.status === "done" ? "accept" : "pending";
        return {
          subtask_id: sub.id,
          decision: status,
          reason: sub.notes || "",
          timestamp: (sub as any)?.updated_at || (sub as any)?.ts || null,
          source: "orchestrator",
        };
      })
      .filter(Boolean) as any[] ?? [];

  const decisions = [...baseDecisions, ...derivedDecisions];
  const sortedDecisions = [...decisions].sort((a, b) => {
    const taRaw = (a as any)?.timestamp ?? (a as any)?.ts ?? null;
    const tbRaw = (b as any)?.timestamp ?? (b as any)?.ts ?? null;
    const ta = taRaw ? new Date(taRaw).getTime() : 0;
    const tb = tbRaw ? new Date(tbRaw).getTime() : 0;
    const diff = ta - tb;
    return descending ? -diff : diff;
  });

  return (
    <div
      style={{
        width: `${width}%`,
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        overflow: "visible",
        minHeight: 0,
        height: "100%",
        flex: "1 1 0",
      }}
      data-view-mode={activeViewMode}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
        <h4 style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: "600",
          color: "#000000",
          textTransform: "uppercase",
          letterSpacing: "0.5px"
        }}>Reviewer</h4>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "inline-flex", borderRadius: "12px", border: "1px solid #d1d5db", background: "#ffffff", overflow: "hidden" }}>
            {(["timeline", "output"] as ViewMode[]).map((mode) => {
              const active = activeViewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => onViewModeChange?.(mode)}
                  aria-pressed={active}
                  style={{
                    padding: "8px 10px",
                    border: "none",
                    background: active ? "linear-gradient(135deg, #0f172a 0%, #1f2937 100%)" : "transparent",
                    color: active ? "#ffffff" : "#111827",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    minWidth: "70px",
                    transition: "all 0.15s ease",
                  }}
                >
                  {mode === "timeline" ? "Timeline" : "Output"}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setDescending((prev) => !prev)}
            title={descending ? "最新在前" : "最旧在前"}
            aria-pressed={descending}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "12px",
              border: "1px solid #d1d5db",
              background: descending ? "linear-gradient(135deg, #0f172a 0%, #1f2937 100%)" : "#ffffff",
              cursor: "pointer",
              boxShadow: descending ? "0 12px 26px rgba(0,0,0,0.14)" : "0 6px 18px rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
              zIndex: 5,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "#0f172a";
              e.currentTarget.style.boxShadow = "0 12px 30px rgba(0,0,0,0.16)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "#d1d5db";
              e.currentTarget.style.boxShadow = descending ? "0 12px 26px rgba(0,0,0,0.14)" : "0 6px 18px rgba(0,0,0,0.08)";
            }}
            aria-label="Toggle reviewer decision order"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5.5L12 2L16 5.5H13.5V14.5H10.5V5.5H8Z" fill={descending ? "#ffffff" : "#111827"} />
              <path d="M16 18.5L12 22L8 18.5H10.5V9.5H13.5V18.5H16Z" fill={descending ? "#ffffff" : "#111827"} />
            </svg>
          </button>
        </div>
      </div>
      {novelSummary && (
        <div style={{
          padding: "10px 12px",
          borderRadius: "10px",
          border: "1px solid #e5e7eb",
          background: "#eef2ff",
          color: "#111827",
          fontSize: "12px",
          lineHeight: 1.5,
          marginBottom: "12px",
        }}>
          <div style={{ fontWeight: 800, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4338ca", marginBottom: "4px" }}>
            Novel Summary (t1–t4)
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{novelSummary}</div>
        </div>
      )}
      {activeViewMode === "timeline" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          <ProgressStrip items={progress} label="Reviewer" sourceCount={progressSeenCount} />
          {progress.length === 0 && (
            <div style={{
              color: "#4b5563",
              fontSize: "14px",
              padding: "12px",
              borderRadius: "12px",
              background: "#ffffff",
              border: "1px dashed #d1d5db",
            }}>
              No reviewer timeline data yet. Switch to Output to view decisions when available.
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            background: "#fafafa",
            padding: "16px",
            borderRadius: "10px",
            border: "1px solid #e0e0e0",
            marginBottom: "16px",
            minHeight: 0,
          }}
        >
          {reviewerRevisions && Object.keys(reviewerRevisions).length > 0 && (
            <div style={{
              marginBottom: "12px",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
            }}>
              <div style={{ fontWeight: 800, fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#111827", marginBottom: "6px" }}>
                Reviewer Revised Drafts
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {Object.entries(reviewerRevisions).map(([subId, revision]) => {
                  const entry =
                    typeof revision === "object" && revision !== null
                      ? (revision as any)
                      : { text: revision };
                  return (
                    <div key={subId} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #e5e7eb", background: "#ffffff" }}>
                      <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "6px", color: "#111827" }}>Task {subId}</div>
                      {entry.batch_id && (
                        <div style={{ fontSize: "11px", marginBottom: "4px", color: "#4b5563" }}>
                          Batch {entry.batch_id}
                        </div>
                      )}
                      <div style={{ fontSize: "13px", color: "#1f2937", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {String(entry.text ?? "")}
                      </div>
                      {entry.artifact_path && (
                        <div style={{ fontSize: "11px", marginTop: "6px", color: "#2563eb" }}>
                          Artifact: {entry.artifact_path}
                        </div>
                      )}
                      {onAdoptRevision && (
                        <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => onAdoptRevision(subId)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "10px",
                              border: "1px solid #d1d5db",
                              background: "#0f172a",
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            Adopt revision
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
          {sortedDecisions.map((decision, index) => {
            const statusRaw = typeof decision?.decision === "string" ? decision.decision : "";
            const status = statusRaw ? statusRaw.toLowerCase() : "pending";
            const subtaskId =
              typeof decision?.subtask_id === "string" || typeof decision?.subtask_id === "number"
                ? decision.subtask_id
                : typeof (decision as any)?.id === "string" || typeof (decision as any)?.id === "number"
                  ? (decision as any).id
                  : "—";
            const reason =
              typeof decision?.reason === "string"
                ? decision.reason
                : typeof (decision as any)?.comment === "string"
                  ? (decision as any).comment
                  : "";
            const ts = (decision as any)?.timestamp ?? (decision as any)?.ts ?? null;
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
                  padding: "14px 16px 14px 76px",
                  borderRadius: "16px",
                  border: "1px solid #e4e4e7",
                  background: "#ffffff",
                  boxShadow: colors.shadow,
                  position: "relative",
                }}
              >
                {subtaskOrder.has(String(subtaskId)) && (
                  <span style={{
                    position: "absolute",
                    top: "14px",
                    left: "16px",
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    background: "#111827",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}>
                    T{subtaskOrder.get(String(subtaskId))}
                  </span>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#111827", fontWeight: 700, fontSize: "13px", minHeight: "28px" }}>
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
      )}
    </div>
  );
}

export default App;

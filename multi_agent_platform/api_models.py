from __future__ import annotations

from datetime import datetime
from typing import Dict, Any, List, Optional, Literal

from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    topic: str
    novel_mode: Optional[bool] = False
    novel_profile: Optional[Dict[str, Any]] = None


class CommandRequest(BaseModel):
    command: Literal[
        "plan",
        "next",
        "all",
        "confirm_plan",
        "ask",
        "set_current_subtask",
        "update_subtask",
        "insert_subtask",
        "append_subtask",
        "skip_subtask",
        "apply_reviewer_revision",
    ]
    payload: Optional[Dict[str, Any]] = None


class SessionSummaryModel(BaseModel):
    session_id: str
    topic: Optional[str] = None
    created_at: Optional[datetime] = Field(default=None, description="UTC timestamp when session was created")
    last_updated: Optional[datetime] = Field(default=None, description="UTC timestamp of most recent state update")


class OrchestratorMessageModel(BaseModel):
    role: Literal["user", "orchestrator"]
    content: str
    ts: datetime


class OrchestratorEventModel(BaseModel):
    from_role: Literal["orchestrator"]
    to_role: Literal["planner", "reviewer", "worker"]
    kind: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    ts: datetime


class SubtaskProgressEventModel(BaseModel):
    agent: Literal["worker", "reviewer"]
    subtask_id: str
    stage: Literal["start", "finish"] = "start"
    status: Literal["in_progress", "completed"] = "in_progress"
    payload: Dict[str, Any] = Field(default_factory=dict)
    ts: datetime


class PlannerChatMessageModel(BaseModel):
    role: Literal["user", "planner"]
    content: str
    ts: datetime


class SessionSnapshotModel(BaseModel):
    session_id: str
    topic: str
    plan: Dict[str, Any]
    subtasks: List[Dict[str, Any]]
    current_subtask_id: Optional[str]
    is_running: bool = False
    last_progress_event_ts: Optional[datetime] = None
    orchestrator_state: Dict[str, Any]
    worker_outputs: List[Dict[str, Any]]
    coord_decisions: List[Dict[str, Any]]
    chat_history: List[Dict[str, Any]]
    plan_locked: bool = False
    session_mode: Literal["planning", "execution"] = "planning"
    progress_events: List[SubtaskProgressEventModel] = Field(default_factory=list)
    orchestrator_messages: List[OrchestratorMessageModel] = Field(default_factory=list)
    orch_events: List[OrchestratorEventModel] = Field(default_factory=list)
    planner_chat: List[PlannerChatMessageModel] = Field(default_factory=list)
    message: str
    ok: bool
    command: Optional[str]
    mode: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    state: Dict[str, Any]


class EventsResponseModel(BaseModel):
    progress_events: List[SubtaskProgressEventModel] = Field(default_factory=list)
    worker_outputs: List[Dict[str, Any]] = Field(default_factory=list)
    since: Optional[datetime] = None


class RegisterRequest(BaseModel):
    email: str
    password: str


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    message: str
    access_token: str | None = None
    token_type: str | None = "bearer"

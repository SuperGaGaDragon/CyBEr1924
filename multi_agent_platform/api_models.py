from __future__ import annotations

from datetime import datetime
from typing import Dict, Any, List, Optional, Literal

from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    topic: str


class CommandRequest(BaseModel):
    command: Literal[
        "plan",
        "next",
        "all",
        "ask",
        "set_current_subtask",
        "update_subtask",
        "insert_subtask",
        "append_subtask",
        "skip_subtask",
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
    orchestrator_state: Dict[str, Any]
    worker_outputs: List[Dict[str, Any]]
    coord_decisions: List[Dict[str, Any]]
    chat_history: List[Dict[str, Any]]
    plan_locked: bool = False
    orchestrator_messages: List[OrchestratorMessageModel] = Field(default_factory=list)
    orch_events: List[OrchestratorEventModel] = Field(default_factory=list)
    planner_chat: List[PlannerChatMessageModel] = Field(default_factory=list)
    message: str
    ok: bool
    command: Optional[str]
    mode: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    state: Dict[str, Any]


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

"""
Session state management for the multi-agent platform.

This module defines the orchestrator state that provides a snapshot of the current
session status, separate from artifacts and logs.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime
import json
from pydantic import BaseModel

from .message_bus import MessageBus
from .plan_model import Plan
from .session_store import ArtifactStore
from src.protocol import PayloadType


class OrchestratorMessage(BaseModel):
    role: Literal["user", "orchestrator"]
    content: str
    ts: datetime


class OrchestratorEvent(BaseModel):
    from_role: Literal["orchestrator"]
    to_role: Literal["planner", "reviewer", "worker"]
    kind: str  # "REQUEST_REDO", "REQUEST_PLAN_UPDATE", ...
    payload: Dict[str, Any] = {}
    ts: datetime


class PlannerChatMessage(BaseModel):
    role: Literal["user", "planner"]
    content: str
    ts: datetime


@dataclass
class OrchestratorState:
    """
    Represents the current state of an orchestrator session.

    This is the "current state snapshot" that CLI/API can query and update.
    All information about what's happening right now is here.
    """
    session_id: str
    plan_id: str
    status: str  # "idle" | "running" | "completed" | "error"
    current_subtask_id: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)
    plan_locked: bool = False
    orchestrator_messages: List[OrchestratorMessage] = field(default_factory=list)
    orch_events: List[OrchestratorEvent] = field(default_factory=list)
    planner_chat: List[PlannerChatMessage] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        d = asdict(self)
        # Ensure extra is always a dict
        if d.get("extra") is None:
            d["extra"] = {}
        d["orchestrator_messages"] = [
            msg.dict() if isinstance(msg, OrchestratorMessage) else msg
            for msg in self.orchestrator_messages
        ]
        d["orch_events"] = [
            event.dict() if isinstance(event, OrchestratorEvent) else event
            for event in self.orch_events
        ]
        d["planner_chat"] = [
            msg.dict() if isinstance(msg, PlannerChatMessage) else msg
            for msg in self.planner_chat
        ]
        return d

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "OrchestratorState":
        """Create from dictionary."""
        orchestrator_messages_data = data.get("orchestrator_messages") or []
        orch_events_data = data.get("orch_events") or []
        planner_chat_data = data.get("planner_chat") or []

        def _load_items(items: List[Any], model_cls: type[BaseModel]) -> List[BaseModel]:
            parsed: List[BaseModel] = []
            for item in items:
                if isinstance(item, model_cls):
                    parsed.append(item)
                    continue
                if isinstance(item, dict):
                    try:
                        parsed.append(model_cls(**item))
                    except Exception:
                        continue
            return parsed

        return cls(
            session_id=data["session_id"],
            plan_id=data["plan_id"],
            status=data.get("status", "idle"),
            current_subtask_id=data.get("current_subtask_id"),
            extra=data.get("extra") or {},
            plan_locked=data.get("plan_locked", False),
            orchestrator_messages=_load_items(
                orchestrator_messages_data, OrchestratorMessage
            ),
            orch_events=_load_items(orch_events_data, OrchestratorEvent),
            planner_chat=_load_items(planner_chat_data, PlannerChatMessage),
        )

    @classmethod
    def from_json(cls, json_str: str) -> "OrchestratorState":
        """Create from JSON string."""
        data = json.loads(json_str)
        return cls.from_dict(data)

    def save(self, path: Path) -> None:
        """Save state to a file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.to_json(), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "OrchestratorState":
        """Load state from a file."""
        return cls.from_json(path.read_text(encoding="utf-8"))


def _read_log_entries(log_path: Path) -> List[Dict[str, Any]]:
    if not log_path.exists():
        return []

    entries: List[Dict[str, Any]] = []
    with log_path.open("r", encoding="utf-8") as reader:
        for line in reader:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except Exception:
                continue
    return entries


def _normalize_payload_type(payload_type: Any) -> str:
    if isinstance(payload_type, PayloadType):
        return payload_type.value
    return str(payload_type)


def _read_artifact_preview(store: ArtifactStore, artifact_path: Optional[str]) -> str:
    if not artifact_path:
        return ""
    full_path = Path(store.root.parent) / artifact_path
    if not full_path.exists():
        return ""
    try:
        content = full_path.read_text(encoding="utf-8")
    except Exception:
        return ""
    return content[:400] + "..." if len(content) > 400 else content


@dataclass
class SessionSnapshot:
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
    orchestrator_messages: List[Dict[str, Any]] = field(default_factory=list)
    orch_events: List[Dict[str, Any]] = field(default_factory=list)
    planner_chat: List[Dict[str, Any]] = field(default_factory=list)
    message: str = ""
    ok: bool = True
    command: str | None = None
    mode: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    state: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        snapshot = {
            "session_id": self.session_id,
            "topic": self.topic,
            "plan": self.plan,
            "subtasks": self.subtasks,
            "current_subtask_id": self.current_subtask_id,
            "state": self.state or self.orchestrator_state,
            "orchestrator_state": self.orchestrator_state,
            "worker_outputs": self.worker_outputs,
            "coord_decisions": self.coord_decisions,
            "chat_history": self.chat_history,
            "plan_locked": self.plan_locked,
            "orchestrator_messages": self.orchestrator_messages,
            "orch_events": self.orch_events,
            "planner_chat": self.planner_chat,
            "message": self.message,
            "ok": self.ok,
            "command": self.command,
        }
        if self.mode is not None:
            snapshot["mode"] = self.mode
        if self.context is not None:
            snapshot["context"] = self.context
        return snapshot


def build_session_snapshot(
    session_store: ArtifactStore,
    orchestrator_state: OrchestratorState,
    message_bus: MessageBus,
) -> SessionSnapshot:
    session_id = orchestrator_state.session_id
    state_path = session_store.session_dir(session_id) / "state.json"
    plan_data: Dict[str, Any] = {}
    if state_path.exists():
        try:
            raw = json.loads(state_path.read_text(encoding="utf-8"))
            plan_data = raw.get("plan", {})
        except Exception:
            plan_data = {}

    if not plan_data:
        plan_data = {
            "plan_id": orchestrator_state.plan_id,
            "title": orchestrator_state.plan_id,
            "subtasks": [],
        }

    plan = Plan.from_dict(plan_data)
    topic = plan.title or orchestrator_state.plan_id

    subtasks = []
    for index, subtask in enumerate(plan.subtasks, start=1):
        subtasks.append(
            {
                "id": subtask.id,
                "title": subtask.title,
                "status": subtask.status,
                "notes": subtask.notes,
                "index": index,
            }
        )

    log_path = message_bus.store.logs_dir(session_id) / "envelopes.jsonl"
    envelopes = _read_log_entries(log_path)
    envelopes.sort(key=lambda env: env.get("timestamp", ""))

    subtask_map = {sub["id"]: sub["title"] for sub in subtasks}

    worker_outputs: Dict[str, Dict[str, Any]] = {}
    coord_decisions: Dict[str, Dict[str, Any]] = {}
    chat_history: List[Dict[str, Any]] = []

    for envelope in envelopes:
        payload_type = _normalize_payload_type(envelope.get("payload_type"))
        payload = envelope.get("payload", {})
        timestamp = envelope.get("timestamp")

        if payload_type == PayloadType.SUBTASK_RESULT.value:
            sub_id = payload.get("subtask_id")
            if not sub_id:
                continue
            existing = worker_outputs.get(sub_id)
            if existing and existing.get("timestamp", "") >= (timestamp or ""):
                continue

            artifact_info = payload.get("result_artifact", {})
            artifact_path = artifact_info.get("path")
            preview = _read_artifact_preview(session_store, artifact_path)

            worker_outputs[sub_id] = {
                "subtask_id": sub_id,
                "subtask_title": subtask_map.get(sub_id, ""),
                "artifact_path": artifact_path,
                "preview": preview,
                "timestamp": timestamp,
                "source": envelope.get("source"),
            }

        if payload_type == PayloadType.COORD_DECISION.value:
            sub_id = payload.get("subtask_id")
            if not sub_id:
                continue
            existing = coord_decisions.get(sub_id)
            if existing and existing.get("timestamp", "") >= (timestamp or ""):
                continue
            coord_decisions[sub_id] = {
                "subtask_id": sub_id,
                "decision": payload.get("decision"),
                "reason": payload.get("reason"),
                "timestamp": timestamp,
                "source": envelope.get("source"),
            }

        if payload_type in (
            PayloadType.USER_COMMAND.value,
            PayloadType.COORD_DECISION.value,
            PayloadType.COORD_RESPONSE.value,
        ):
            chat_history.append(
                {
                    "timestamp": timestamp,
                    "source": envelope.get("source"),
                    "payload_type": payload_type,
                    "payload": payload,
                }
            )

    chat_history.sort(key=lambda entry: entry.get("timestamp", ""))

    worker_list = [
        worker_outputs[sub_id]
        for sub_id in subtask_map.keys()
        if sub_id in worker_outputs
    ]
    coord_list = [
        coord_decisions[sub_id]
        for sub_id in subtask_map.keys()
        if sub_id in coord_decisions
    ]

    state_dict = orchestrator_state.to_dict()

    orchestrator_messages = [
        msg.dict() if hasattr(msg, "dict") else msg
        for msg in orchestrator_state.orchestrator_messages
    ]
    orch_events = [
        event.dict() if hasattr(event, "dict") else event
        for event in orchestrator_state.orch_events
    ]
    planner_chat = [
        msg.dict() if hasattr(msg, "dict") else msg
        for msg in orchestrator_state.planner_chat
    ]

    return SessionSnapshot(
        session_id=session_id,
        topic=topic,
        plan=plan.to_dict(),
        subtasks=subtasks,
        current_subtask_id=orchestrator_state.current_subtask_id,
        orchestrator_state=state_dict,
        worker_outputs=worker_list,
        coord_decisions=coord_list,
        chat_history=chat_history,
        plan_locked=orchestrator_state.plan_locked,
        orchestrator_messages=orchestrator_messages,
        orch_events=orch_events,
        planner_chat=planner_chat,
        state=state_dict,
    )

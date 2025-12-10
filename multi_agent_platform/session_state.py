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
from pydantic import BaseModel, Field, root_validator

from .message_bus import MessageBus
from .plan_model import Plan
from .session_store import ArtifactStore, ArtifactRef
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


class SubtaskProgressEvent(BaseModel):
    agent: Literal["worker", "reviewer"]
    subtask_id: str
    stage: Literal["start", "finish"] = "start"
    status: Literal["in_progress", "completed"] = "in_progress"
    ts: datetime
    payload: Dict[str, Any] = Field(default_factory=dict)

    @root_validator(pre=True)
    def _default_status_from_stage(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        stage = values.get("stage") or values.get("event") or "start"
        values["stage"] = stage
        if not values.get("status"):
            values["status"] = PROGRESS_STAGE_STATUS_MAP.get(stage, "in_progress")
        if "payload" not in values or values.get("payload") is None:
            values["payload"] = {}
        return values


PROGRESS_STAGE_STATUS_MAP: Dict[str, str] = {
    "start": "in_progress",
    "finish": "completed",
}


class PlannerChatMessage(BaseModel):
    role: Literal["user", "planner"]
    content: str
    ts: datetime


@dataclass
class WorkerOutputState:
    """
    Minimal worker output record stored on orchestrator state for snapshot recovery.

    We persist the artifact ref plus timestamp so worker outputs can be reconstructed
    even if envelopes are missing.
    """
    subtask_id: str
    title: str
    artifact: ArtifactRef
    timestamp: datetime | str | None = None

    def to_dict(self) -> Dict[str, Any]:
        ts_val = self.timestamp
        if isinstance(ts_val, datetime):
            ts_val = ts_val.isoformat()
        return {
            "subtask_id": self.subtask_id,
            "title": self.title,
            "artifact": self.artifact.to_payload(),
            "timestamp": ts_val,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "WorkerOutputState":
        artifact_data = data.get("artifact") or {}
        if isinstance(artifact_data, ArtifactRef):
            artifact = artifact_data
        elif isinstance(artifact_data, dict):
            try:
                artifact = ArtifactRef(**artifact_data)
            except Exception:
                artifact = ArtifactRef(session_id="", artifact_id="", kind="text", path="")
        else:
            artifact = ArtifactRef(session_id="", artifact_id="", kind="text", path="")
        ts_val = data.get("timestamp")
        if isinstance(ts_val, str):
            try:
                ts_val = datetime.fromisoformat(ts_val)
            except Exception:
                pass
        return cls(
            subtask_id=data.get("subtask_id") or "",
            title=data.get("title") or "",
            artifact=artifact,
            timestamp=ts_val,
        )


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
    progress_events: List[SubtaskProgressEvent] = field(default_factory=list)
    planner_chat: List[PlannerChatMessage] = field(default_factory=list)
    worker_outputs: List[WorkerOutputState] = field(default_factory=list)

    @property
    def session_mode(self) -> str:
        """
        Derived session mode:
          - planning: plan not locked
          - execution: plan locked
        """
        return "execution" if self.plan_locked else "planning"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        d = asdict(self)
        def _ser_ts(value: Any) -> Any:
            if isinstance(value, datetime):
                return value.isoformat()
            return value
        # Ensure extra is always a dict
        if d.get("extra") is None:
            d["extra"] = {}
        d["orchestrator_messages"] = [
            {
                **(msg.dict() if isinstance(msg, OrchestratorMessage) else msg),
                "ts": _ser_ts(getattr(msg, "ts", None) if hasattr(msg, "ts") else (msg.get("ts") if isinstance(msg, dict) else None)),
            }
            for msg in self.orchestrator_messages
        ]
        d["orch_events"] = [
            {
                **(event.dict() if isinstance(event, OrchestratorEvent) else event),
                "ts": _ser_ts(getattr(event, "ts", None) if hasattr(event, "ts") else (event.get("ts") if isinstance(event, dict) else None)),
            }
            for event in self.orch_events
        ]
        d["progress_events"] = []
        for event in self.progress_events:
            base = event.dict() if isinstance(event, SubtaskProgressEvent) else dict(event)
            stage = base.get("stage") or "start"
            status = base.get("status") or PROGRESS_STAGE_STATUS_MAP.get(stage, "in_progress")
            ts_val = getattr(event, "ts", None) if hasattr(event, "ts") else base.get("ts")
            d["progress_events"].append(
                {
                    **base,
                    "stage": stage,
                    "status": status,
                    "payload": base.get("payload") or {},
                    "ts": _ser_ts(ts_val),
                }
            )
        d["planner_chat"] = [
            {
                **(msg.dict() if isinstance(msg, PlannerChatMessage) else msg),
                "ts": _ser_ts(getattr(msg, "ts", None) if hasattr(msg, "ts") else (msg.get("ts") if isinstance(msg, dict) else None)),
            }
            for msg in self.planner_chat
        ]
        d["worker_outputs"] = []
        for wo in self.worker_outputs:
            if isinstance(wo, WorkerOutputState):
                d["worker_outputs"].append(wo.to_dict())
            elif isinstance(wo, dict):
                d["worker_outputs"].append(wo)
        return d

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)

    def add_orchestrator_message(
        self,
        role: str,
        content: str,
        ts: Optional[datetime] = None,
    ) -> None:
        """Record a user/orchestrator message for future orchestration flows."""
        if role not in ("user", "orchestrator"):
            return
        if ts is None:
            ts = datetime.utcnow().isoformat()
        self.orchestrator_messages.append(
            OrchestratorMessage(role=role, content=content, ts=ts)
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "OrchestratorState":
        """Create from dictionary."""
        orchestrator_messages_data = data.get("orchestrator_messages") or []
        orch_events_data = data.get("orch_events") or []
        progress_events_data = data.get("progress_events") or []
        planner_chat_data = data.get("planner_chat") or []
        worker_outputs_data = data.get("worker_outputs") or []

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
            progress_events=_load_items(progress_events_data, SubtaskProgressEvent),
            planner_chat=_load_items(planner_chat_data, PlannerChatMessage),
            worker_outputs=[
                item
                for item in (
                    [
                        WorkerOutputState.from_dict(item)
                        for item in worker_outputs_data
                        if isinstance(item, (dict, WorkerOutputState))
                    ]
                )
                if item
            ],
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
    """Read artifact content for lightweight previews (legacy helper)."""
    return _read_artifact_content(store, artifact_path, max_length=400)


def _read_artifact_content(store: ArtifactStore, artifact_path: Optional[str], max_length: int | None = None) -> str:
    """
    Read artifact content with optional truncation.

    Args:
        store: Artifact store to resolve paths.
        artifact_path: Relative artifact path.
        max_length: If provided, returns a truncated string with ellipsis when exceeded.
    """
    if not artifact_path:
        return ""
    full_path = Path(store.root.parent) / artifact_path
    if not full_path.exists():
        return ""
    try:
        content = full_path.read_text(encoding="utf-8")
    except Exception:
        return ""

    if max_length is None:
        return content

    return content[:max_length] + "..." if len(content) > max_length else content


@dataclass
class SessionSnapshot:
    session_id: str
    topic: str
    plan: Dict[str, Any]
    subtasks: List[Dict[str, Any]]
    current_subtask_id: Optional[str]
    orchestrator_state: Dict[str, Any] = field(default_factory=dict)
    worker_outputs: List[Dict[str, Any]] = field(default_factory=list)
    coord_decisions: List[Dict[str, Any]] = field(default_factory=list)
    chat_history: List[Dict[str, Any]] = field(default_factory=list)
    is_running: bool = False
    last_progress_event_ts: Optional[str] = None
    plan_locked: bool = False
    session_mode: str = "planning"
    progress_events: List[Dict[str, Any]] = field(default_factory=list)
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
            "is_running": self.is_running,
            "last_progress_event_ts": self.last_progress_event_ts,
            "state": self.state or self.orchestrator_state,
            "orchestrator_state": self.orchestrator_state,
            "worker_outputs": self.worker_outputs,
            "coord_decisions": self.coord_decisions,
            "chat_history": self.chat_history,
            "plan_locked": self.plan_locked,
            "session_mode": self.session_mode,
            "progress_events": self.progress_events,
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

    print(f"[Snapshot] Processing {len(envelopes)} envelopes for session {session_id}")
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
            full_text = _read_artifact_content(session_store, artifact_path, max_length=None)
            preview = _read_artifact_preview(session_store, artifact_path)

            print(f"[Snapshot] Found SUBTASK_RESULT for {sub_id}: artifact_path={artifact_path}, content_length={len(full_text) if full_text else 0}")

            worker_outputs[sub_id] = {
                "subtask_id": sub_id,
                "subtask_title": subtask_map.get(sub_id, ""),
                "artifact_path": artifact_path,
                "content": full_text,
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
            source_role = envelope.get("source")
            if source_role in ("reviewer", "coordinator"):
                continue
            chat_history.append(
                {
                    "timestamp": timestamp,
                    "source": source_role,
                    "payload_type": payload_type,
                    "payload": payload,
                }
            )

    chat_history.sort(key=lambda entry: entry.get("timestamp", ""))

    # Use in-memory cached worker outputs when envelopes are missing; prefer logs when available.
    try:
        cached_outputs = orchestrator_state.worker_outputs or []
    except Exception:
        cached_outputs = []

    for cached in cached_outputs:
        sub_id = getattr(cached, "subtask_id", None) or (cached.get("subtask_id") if isinstance(cached, dict) else None)
        if not sub_id or sub_id in worker_outputs:
            continue
        title = getattr(cached, "title", "") or (cached.get("title") if isinstance(cached, dict) else "")
        artifact_ref = getattr(cached, "artifact", None)
        if isinstance(cached, dict):
            artifact_ref = artifact_ref or cached.get("artifact")
        artifact_payload = artifact_ref.to_payload() if hasattr(artifact_ref, "to_payload") else artifact_ref
        artifact_path = artifact_payload.get("path") if isinstance(artifact_payload, dict) else None
        full_text = _read_artifact_content(session_store, artifact_path, max_length=None)
        if not full_text and isinstance(cached, dict):
            full_text = str(cached.get("content") or "")
        preview = _read_artifact_preview(session_store, artifact_path)
        ts_val = getattr(cached, "timestamp", None)
        if isinstance(cached, dict):
            ts_val = ts_val or cached.get("timestamp")
        if isinstance(ts_val, datetime):
            ts_val = ts_val.isoformat()

        worker_outputs[sub_id] = {
            "subtask_id": sub_id,
            "subtask_title": subtask_map.get(sub_id, title),
            "artifact_path": artifact_path,
            "content": full_text,
            "preview": preview or (full_text[:400] if full_text else ""),
            "timestamp": ts_val,
            "source": "state_worker_output",
        }

    # Fallback: if subtask outputs exist on plan but no subtask_result logs were written,
    # synthesize worker_outputs so UI can render content (e.g., TRIGGER_REDO path without artifact writes).
    for subtask in plan.subtasks:
        if getattr(subtask, "output", "") and subtask.id not in worker_outputs:
            text = str(getattr(subtask, "output", "") or "")
            worker_outputs[subtask.id] = {
                "subtask_id": subtask.id,
                "subtask_title": subtask_map.get(subtask.id, subtask.title),
                "artifact_path": None,
                "content": text,
                "preview": text[:400],
                "timestamp": None,
                "source": "state_fallback",
            }

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

    print(f"[Snapshot] Final worker_outputs count: {len(worker_list)} (expected: {len(subtask_map)})")
    for wo in worker_list:
        print(f"[Snapshot]   - {wo['subtask_id']}: {wo['subtask_title']} (source: {wo.get('source', 'unknown')})")

    state_dict = orchestrator_state.to_dict()
    state_dict["session_mode"] = orchestrator_state.session_mode

    # Use serialized versions from state_dict to avoid datetime leakage
    orchestrator_messages = state_dict.get("orchestrator_messages", [])
    raw_events = state_dict.get("orch_events", [])
    progress_events_raw = state_dict.get("progress_events", [])
    progress_log_path = message_bus.store.logs_dir(session_id) / "progress_events.jsonl"
    progress_events_log = _read_log_entries(progress_log_path)
    progress_events: List[Dict[str, Any]] = []
    last_progress_event_ts: Optional[str] = None
    last_progress_event_dt: Optional[datetime] = None

    def _normalize_progress_event(ev: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not isinstance(ev, dict):
            return None
        agent = ev.get("agent")
        subtask_id = ev.get("subtask_id")
        if not agent or not subtask_id:
            return None
        stage = ev.get("stage") or ev.get("event") or "start"
        status = ev.get("status") or PROGRESS_STAGE_STATUS_MAP.get(stage, "in_progress")
        ts_val = ev.get("ts")
        if isinstance(ts_val, datetime):
            ts_val = ts_val.isoformat()
        return {
            **ev,
            "agent": agent,
            "subtask_id": subtask_id,
            "stage": stage,
            "status": status,
            "ts": ts_val,
            "payload": ev.get("payload") or {},
        }

    combined_progress_sources = []
    combined_progress_sources.extend(progress_events_raw or [])
    combined_progress_sources.extend(progress_events_log or [])

    seen_keys = set()
    for ev in combined_progress_sources:
        normalized = _normalize_progress_event(ev)
        if not normalized:
            continue
        key = (
            normalized.get("agent"),
            normalized.get("subtask_id"),
            normalized.get("stage"),
            normalized.get("ts"),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        progress_events.append(normalized)

        ts_val = normalized.get("ts")
        ts_dt = None
        if isinstance(ts_val, str):
            try:
                ts_dt = datetime.fromisoformat(ts_val)
            except Exception:
                ts_dt = None
        if ts_dt:
            if last_progress_event_dt is None or ts_dt > last_progress_event_dt:
                last_progress_event_dt = ts_dt
                last_progress_event_ts = ts_dt.isoformat()
        elif ts_val and last_progress_event_ts is None:
            last_progress_event_ts = str(ts_val)

    progress_events.sort(key=lambda ev: ev.get("ts") or "")
    # Filter out malformed orch_events to avoid downstream validation errors
    orch_events = []
    for ev in raw_events:
        if not isinstance(ev, dict):
            continue
        if not all(k in ev for k in ("from_role", "to_role", "kind")):
            continue
        ts_val = ev.get("ts")
        orch_events.append({**ev, "ts": ts_val})
    planner_chat = state_dict.get("planner_chat", [])

    return SessionSnapshot(
        session_id=session_id,
        topic=topic,
        plan=plan.to_dict(),
        subtasks=subtasks,
        current_subtask_id=orchestrator_state.current_subtask_id,
        is_running=orchestrator_state.status == "running",
        last_progress_event_ts=last_progress_event_ts,
        orchestrator_state=state_dict,
        worker_outputs=worker_list,
        coord_decisions=coord_list,
        chat_history=chat_history,
        plan_locked=orchestrator_state.plan_locked,
        session_mode=orchestrator_state.session_mode,
        orchestrator_messages=orchestrator_messages,
        orch_events=orch_events,
        progress_events=progress_events,
        planner_chat=planner_chat,
        state=state_dict,
    )

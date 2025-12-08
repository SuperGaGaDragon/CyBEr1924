import json
from datetime import datetime, timedelta
from pathlib import Path

from multi_agent_platform.message_bus import MessageBus
from multi_agent_platform.plan_model import Plan, Subtask
from multi_agent_platform.session_state import OrchestratorState, build_session_snapshot
from multi_agent_platform.session_store import ArtifactStore


def _write_state(store: ArtifactStore, session_id: str, plan: Plan) -> Path:
    """Persist a minimal state.json so build_session_snapshot can hydrate plan/subtasks."""
    state_dir = store.session_dir(session_id)
    state_dir.mkdir(parents=True, exist_ok=True)
    state_path = state_dir / "state.json"
    state_path.write_text(json.dumps({"plan": plan.to_dict()}, ensure_ascii=False), encoding="utf-8")
    return state_path


def test_progress_events_round_trip(tmp_path: Path) -> None:
    """
    Progress start/finish events should survive snapshot building with normalized statuses.
    """
    store = ArtifactStore(root=tmp_path / "sessions")
    bus = MessageBus(store=store)

    plan = Plan(plan_id="plan-1", title="Demo plan", subtasks=[Subtask(id="t1", title="Alpha")])
    session_id = "sess-progress"
    _write_state(store, session_id, plan)

    start_ts = datetime.utcnow()
    finish_ts = start_ts + timedelta(seconds=75)
    reviewer_ts = finish_ts + timedelta(seconds=12)

    state = OrchestratorState(
        session_id=session_id,
        plan_id=plan.plan_id,
        status="running",
        plan_locked=True,
        progress_events=[
            {"agent": "worker", "subtask_id": "t1", "stage": "start", "ts": start_ts},
            {"agent": "worker", "subtask_id": "t1", "stage": "finish", "ts": finish_ts},
            {"agent": "reviewer", "subtask_id": "t1", "stage": "start", "ts": reviewer_ts},
        ],
    )

    snapshot = build_session_snapshot(store, state, bus)
    events = snapshot.progress_events

    assert len(events) == 3
    assert events[0]["status"] == "in_progress"
    assert events[1]["status"] == "completed"
    assert any(ev["agent"] == "reviewer" for ev in events)

    worker_events = [ev for ev in events if ev["agent"] == "worker"]
    assert [ev["stage"] for ev in worker_events] == ["start", "finish"]
    assert worker_events[0]["subtask_id"] == "t1"
    assert worker_events[1]["subtask_id"] == "t1"

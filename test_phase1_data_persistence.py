import json
from datetime import datetime, timezone

import pytest

from multi_agent_platform import api
from multi_agent_platform.message_bus import MessageBus
from multi_agent_platform.session_state import OrchestratorState
from multi_agent_platform.session_store import ArtifactStore


def _write_subtask_result_envelope(store: ArtifactStore, session_id: str, subtask_id: str = "t1") -> None:
    """
    Append a SUBTASK_RESULT envelope so fallback paths can read it.
    """
    artifact = store.save_artifact(session_id, f"phase1 content {subtask_id}", kind="text")
    bus = MessageBus(store=store)
    envelope = bus.build_envelope(
        session_id=session_id,
        sender="worker",
        recipient="coordinator",
        payload_type="subtask_result",
        payload={
            "subtask_id": subtask_id,
            "subtask_title": f"Phase1 {subtask_id}",
            "result_artifact": artifact.to_payload(),
        },
    )
    bus.append_envelope(session_id, envelope)


@pytest.mark.parametrize("since_offset_seconds", [None, 0])
def test_load_worker_outputs_falls_back_to_envelopes(tmp_path, monkeypatch, since_offset_seconds):
    store = ArtifactStore(root=tmp_path / "sessions")
    monkeypatch.setattr(api, "artifact_store", store)

    session_id = "sess-phase1-worker-output"
    _write_subtask_result_envelope(store, session_id, subtask_id="t1")

    since = None
    if since_offset_seconds is not None:
        since = datetime.utcnow(tz=timezone.utc)
    outputs = api._load_worker_outputs_since(session_id, since)

    assert outputs, "Expected worker_outputs fallback to read envelopes"
    first = outputs[0]
    assert first["subtask_id"] == "t1"
    assert first["source"] == "envelopes_fallback"
    assert "artifact_path" in first
    assert isinstance(first.get("content"), str)


def test_load_progress_events_falls_back_to_envelope(tmp_path, monkeypatch):
    store = ArtifactStore(root=tmp_path / "sessions")
    monkeypatch.setattr(api, "artifact_store", store)

    session_id = "sess-phase1-progress"
    _write_subtask_result_envelope(store, session_id, subtask_id="t1")

    events = api._load_progress_events(session_id, None)

    assert events, "Expected progress events fallback from envelopes"
    worker_events = [ev for ev in events if ev.get("agent") == "worker"]
    assert any(ev.get("subtask_id") == "t1" for ev in worker_events)
    assert all(ev.get("status") == "completed" for ev in worker_events if ev.get("stage") == "finish")


def test_worker_outputs_prefers_state_cache(tmp_path, monkeypatch):
    store = ArtifactStore(root=tmp_path / "sessions")
    monkeypatch.setattr(api, "artifact_store", store)

    session_id = "sess-phase1-cache"
    state = OrchestratorState(
        session_id=session_id,
        plan_id="plan-cache",
        status="running",
        plan_locked=True,
        worker_outputs=[
            {
                "subtask_id": "t-cache",
                "title": "cache fallback",
                "artifact": {},
                "timestamp": datetime.utcnow().isoformat(),
            }
        ],
    )
    # Persist orchestrator_state to fake cache
    orch_state_path = api.orch._state_path(session_id)
    orch_state_path.parent.mkdir(parents=True, exist_ok=True)
    state.save(orch_state_path)

    outputs = api._load_worker_outputs_since(session_id, None)
    assert outputs
    assert outputs[0]["subtask_id"] == "t-cache"
    assert outputs[0].get("source") != "envelopes_fallback"

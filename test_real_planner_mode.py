#!/usr/bin/env python3
"""
Tests for real planner mode:
- When USE_REAL_PLANNER is true, planning turns should call run_planner_agent
  and replace plan/subtasks with the agent result instead of stub logic.
"""

import os
from pathlib import Path

from multi_agent_platform.run_flow import Orchestrator, OrchestratorState, Plan, Subtask, PlannerResult
from multi_agent_platform.session_store import ArtifactStore
from multi_agent_platform.message_bus import MessageBus


def test_handle_planning_turn_uses_real_planner(monkeypatch, tmp_path: Path):
    # Ensure guardrails pass without hitting a real API.
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key")
    monkeypatch.setenv("USE_REAL_PLANNER", "true")

    captured = {}

    def fake_run_planner_agent(planner_chat, plan, subtasks, latest_user_input, model="gpt-4.1-mini"):
        captured.update(
            {
                "planner_chat": planner_chat,
                "plan": plan,
                "subtasks": subtasks,
                "latest_user_input": latest_user_input,
                "model": model,
            }
        )
        return PlannerResult(
            plan={
                "plan_id": "plan-1",
                "title": "Updated Title",
                "description": "new desc",
                "notes": "updated notes",
            },
            subtasks=[
                {"subtask_id": "t1", "title": "Rewrite intro", "status": "PENDING", "notes": "n1"},
                {"subtask_id": "t2", "title": "Add summary", "status": "PENDING", "notes": ""},
            ],
        )

    monkeypatch.setattr("multi_agent_platform.run_flow.run_planner_agent", fake_run_planner_agent)
    monkeypatch.setattr("multi_agent_platform.run_flow.USE_REAL_PLANNER", True)
    monkeypatch.setattr("multi_agent_platform.agent_runner.Agent.run", lambda self, user_message: "[stubbed agent reply]")

    store_root = tmp_path / "sessions"
    artifact_store = ArtifactStore(root=store_root)
    bus = MessageBus(store=artifact_store)

    plan = Plan(plan_id="p1", title="Old Title", description="", notes="", subtasks=[Subtask(id="t1", title="Intro", status="pending")])
    state = OrchestratorState(session_id="sess-test", plan_id="p1", status="idle", plan_locked=False)

    orch = Orchestrator(artifact_store=artifact_store, message_bus=bus)
    updated_plan, answer = orch.handle_planning_turn("sess-test", plan, state, "Please add a summary section")

    # Planner agent should receive user input and prior plan/subtasks.
    assert captured["latest_user_input"] == "Please add a summary section"
    assert captured["plan"]["title"] == "Old Title"
    assert len(captured["subtasks"]) == 1

    # Updated plan should reflect planner agent output, not stub fallback.
    assert updated_plan.title == "Updated Title"
    assert [s.title for s in updated_plan.subtasks] == ["Rewrite intro", "Add summary"]

    # Planner chat should capture the user message and planner placeholder response.
    assert len(state.planner_chat) >= 2
    assert state.planner_chat[0].content == "Please add a summary section"
    assert "Planner" in state.planner_chat[1].content

    # Coordinator answer is generated (even if stubbed when no API key).
    assert isinstance(answer, str) and answer.strip() != ""

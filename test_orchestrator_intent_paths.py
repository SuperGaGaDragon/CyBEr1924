#!/usr/bin/env python3
"""
Smoke tests for orchestrator intent consumption:
- Plan updates should trigger planner/stub regeneration.
- Content changes should trigger redo flow (worker + reviewer stub).
"""

from multi_agent_platform.run_flow import consume_orchestrator_events
from multi_agent_platform.plan_model import Plan, Subtask
from multi_agent_platform.session_state import OrchestratorState


def _make_plan(subtasks: list[Subtask]) -> Plan:
  return Plan(
      plan_id="p1",
      title="测试计划",
      description="",
      notes="",
      subtasks=subtasks,
  )


def test_plan_update_triggers_planner_stub():
  plan = _make_plan([Subtask(id="t1", title="章节1", status="pending")])
  state = OrchestratorState(session_id="s1", plan_id="p1", status="idle", plan_locked=True)
  state.orch_events.append({"kind": "REQUEST_PLAN_UPDATE", "instructions": "增加章节"})

  consume_orchestrator_events(state, plan)

  # Stub planner appends a new subtask and updates notes
  assert len(plan.subtasks) >= 2, "Plan update should append a subtask"
  assert any("redo the plan" in msg.content for msg in state.orchestrator_messages), "User-facing plan redo message missing"


def test_content_change_triggers_redo_flow():
  plan = _make_plan([Subtask(id="t1", title="章节1", status="pending", notes="")])
  state = OrchestratorState(session_id="s2", plan_id="p2", status="idle", plan_locked=True)
  state.orch_events.append({
      "kind": "REQUEST_CONTENT_CHANGE",
      "target_subtask_id": "t1",
      "instructions": "rewrite the ending",
  })

  # First pass: mark redo and enqueue TRIGGER_REDO
  consume_orchestrator_events(state, plan)
  sub = plan.subtasks[0]
  assert sub.needs_redo is True, "Subtask should be marked for redo"
  assert state.orch_events and state.orch_events[0]["kind"] == "TRIGGER_REDO", "Redo event should be enqueued"

  # Second pass: process TRIGGER_REDO to run worker/reviewer stubs
  consume_orchestrator_events(state, plan)
  sub = plan.subtasks[0]
  assert sub.output and "rewrite the ending" in sub.output, "Worker output should reflect instructions"
  assert sub.status == "done" and sub.needs_redo is False, "Subtask should be completed after redo"
  assert any("rewritten subtask" in msg.content for msg in state.orchestrator_messages), "Orchestrator should acknowledge redo"


if __name__ == "__main__":
  test_plan_update_triggers_planner_stub()
  test_content_change_triggers_redo_flow()
  print("✓ orchestrator intent paths ok")

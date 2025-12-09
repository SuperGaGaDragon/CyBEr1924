import json

from multi_agent_platform.run_flow import (
    Orchestrator,
    _apply_planner_result_to_state,
    _novel_extra_context,
    _update_novel_summary,
    generate_stub_plan_from_planning_input,
)
from multi_agent_platform.prompt_registry import build_coordinator_review_prompt
from multi_agent_platform.plan_model import Plan, Subtask
from multi_agent_platform.planner_agent import PlannerResult
from multi_agent_platform.session_state import OrchestratorState
from multi_agent_platform.session_store import ArtifactStore
from multi_agent_platform.message_bus import MessageBus


def _sample_profile():
    return {
        "length": "novella",
        "year": "架空历史",
        "genre": "Fantasy",
        "style": "Hemingway",
        "title_text": "Chronicles of Time",
        "characters": [{"name": "Alice", "role": "Protagonist"}],
        "extra_notes": "Keep tone consistent",
    }


def test_init_session_injects_novel_t1_t4():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    session_id, plan, state = orch.init_session(
        "Novel Test Topic",
        novel_mode=True,
        novel_profile=_sample_profile(),
    )

    assert state.extra.get("novel_mode") is True
    assert state.extra.get("novel_profile", {}).get("genre") == "Fantasy"

    first_ids = [s.id for s in plan.subtasks[:4]]
    assert first_ids == ["t1", "t2", "t3", "t4"]
    assert "Research" in plan.subtasks[0].title
    # Description should carry profile context and the cover-full-content hint
    desc_text = plan.subtasks[0].description or ""
    assert "Fantasy" in desc_text
    assert "cover full content" in desc_text


def test_apply_planner_result_enforces_t1_t4_and_merges():
    profile = _sample_profile()
    state = OrchestratorState(
        session_id="sess",
        plan_id="plan",
        status="idle",
        extra={"novel_mode": True, "novel_profile": profile},
    )
    existing_plan = Plan(plan_id="plan", title="Novel Plan", subtasks=[])
    result = PlannerResult(
        plan={"plan_id": "plan", "title": "Novel Plan"},
        subtasks=[
            {"subtask_id": "t5", "title": "Write Chapter 1", "status": "pending"},
            {"subtask_id": "t6", "title": "Write Chapter 2", "status": "pending"},
        ],
    )

    merged = _apply_planner_result_to_state(
        state,
        result,
        fallback_user_text="user text",
        existing_plan=existing_plan,
        novel_profile=profile,
    )

    ids = [s.id for s in merged.subtasks]
    assert ids[:4] == ["t1", "t2", "t3", "t4"]
    assert "Write Chapter 1" in [s.title for s in merged.subtasks]
    # Ensure descriptions on seeded tasks include profile fields
    assert "Hemingway" in (merged.subtasks[0].description or "")


def test_stub_planner_generates_novel_t1_t4_when_empty():
    plan = Plan(plan_id="p1", title="Stub Novel", subtasks=[])
    updated = generate_stub_plan_from_planning_input(
        plan,
        "用户补充：请写小说",
        novel_profile=_sample_profile(),
    )

    ids = [s.id for s in updated.subtasks[:4]]
    assert ids == ["t1", "t2", "t3", "t4"]
    assert any("章节分配" in s.title for s in updated.subtasks[:4])


def test_worker_extra_context_uses_novel_summary():
    profile = _sample_profile()
    state = OrchestratorState(
        session_id="sess2",
        plan_id="plan2",
        status="idle",
        extra={"novel_mode": True, "novel_profile": profile},
    )
    plan = Plan(
        plan_id="plan2",
        title="Novel Plan 2",
        subtasks=[
            Subtask(id="t1", title="Research", status="done", output="research notes"),
            Subtask(id="t2", title="人物设定", status="done", output="character list"),
            Subtask(id="t3", title="情节设计", status="done", output="plot arcs"),
            Subtask(id="t4", title="章节分配", status="done", output="chapter outline"),
            Subtask(id="t5", title="写作第1章", status="pending"),
        ],
    )
    summary = _update_novel_summary(state, plan)
    assert summary
    subtask5 = plan.subtasks[4]
    extra_ctx = _novel_extra_context(state, plan, subtask5)
    assert extra_ctx is not None
    assert "research notes" in extra_ctx
    assert "chapter outline" in extra_ctx


def test_reviewer_prompt_includes_strict_critic_and_context():
    plan = Plan(plan_id="p3", title="Novel Plan 3", subtasks=[])
    subtask = Subtask(id="t5", title="写作第1章")
    worker_output = "章节稿件"
    prompt = build_coordinator_review_prompt(
        plan,
        subtask,
        worker_output,
        extra_context="Profile: Fantasy, Hemingway",
        strict_novel_mode=True,
    )
    assert "严格的小说评论家" in prompt
    assert "Profile: Fantasy" in prompt

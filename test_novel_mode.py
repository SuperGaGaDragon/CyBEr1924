import json
from collections import defaultdict

from multi_agent_platform.run_flow import (
    Orchestrator,
    _apply_planner_result_to_state,
    _build_novel_t1_t4,
    _novel_extra_context,
    _update_novel_summary,
    generate_stub_plan_from_planning_input,
    CHAPTER_FULL_CONTENT,
)
import multi_agent_platform.run_flow as run_flow
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


def test_planner_result_formats_post_t4_as_chapters():
    profile = _sample_profile()
    state = OrchestratorState(
        session_id="sess-chapter",
        plan_id="plan-chapter",
        status="idle",
        extra={"novel_mode": True, "novel_profile": profile},
    )
    existing_plan = Plan(
        plan_id="plan-chapter",
        title="Novel Chapter Test",
        subtasks=[Subtask(**raw) for raw in _build_novel_t1_t4(profile, "Novel Chapter Test")],
    )
    result = PlannerResult(
        plan={"plan_id": "plan-chapter", "title": "Novel Chapter Test"},
        subtasks=[
            {"subtask_id": "t5", "title": "First chapter", "status": "pending"},
            {"subtask_id": "t6", "title": "Second chapter", "status": "pending"},
        ],
    )

    merged = _apply_planner_result_to_state(
        state,
        result,
        fallback_user_text="继续写下一章",
        existing_plan=existing_plan,
        novel_profile=profile,
    )

    chapter_task = merged.subtasks[4]
    assert chapter_task.title.startswith("Chapter 1")
    assert CHAPTER_FULL_CONTENT in chapter_task.description


def test_stub_planner_appends_chapter_task():
    profile = _sample_profile()
    plan = Plan(
        plan_id="p-novel",
        title="Stub Chapters",
        subtasks=[Subtask(**raw) for raw in _build_novel_t1_t4(profile, "Stub Chapters")],
    )

    updated = generate_stub_plan_from_planning_input(
        plan,
        "写下一章",
        novel_profile=profile,
    )

    new_task = updated.subtasks[-1]
    assert new_task.title.startswith("Chapter")
    assert CHAPTER_FULL_CONTENT in new_task.description


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


def _extract_subtask_id_from_prompt(prompt: str) -> str:
    marker = "当前子任务（"
    if marker not in prompt:
        raise AssertionError("Coordinator prompt missing subtask marker")
    return prompt.split(marker, 1)[1].split(":", 1)[0]


def test_reviewer_revision_flow_end_to_end():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    session_id, plan, state = orch.init_session(
        "Novel Review Revision",
        novel_mode=True,
        novel_profile=_sample_profile(),
    )
    for idx in range(5, 9):
        plan.subtasks.append(Subtask(id=f"t{idx}", title=f"正文第 {idx - 4} 部分"))

    review_counts = defaultdict(int)
    seen_unique = []
    captured_contexts: dict[str, list[str | None]] = {}

    def mock_coordinator_run(prompt: str) -> str:
        subtask_id = _extract_subtask_id_from_prompt(prompt)
        review_counts[subtask_id] += 1
        if review_counts[subtask_id] == 1:
            seen_unique.append(subtask_id)
        if subtask_id == "t1" and review_counts[subtask_id] == 1:
            return (
                "REDO\n"
                "请根据最新要求重写该段落。\n"
                f"REVISED_TEXT: Revised content for {subtask_id}"
            )
        return "ACCEPT\n内容已经满足要求。"

    orch.coordinator.run = mock_coordinator_run
    original_build_prompt = run_flow.build_coordinator_review_prompt

    def spy_build_prompt(
        plan_obj,
        subtask_obj,
        worker_output,
        *,
        extra_context=None,
        strict_novel_mode=False
    ):
        captured_contexts.setdefault(subtask_obj.id, []).append(extra_context)
        return original_build_prompt(
            plan_obj,
            subtask_obj,
            worker_output,
            extra_context=extra_context,
            strict_novel_mode=strict_novel_mode,
        )

    run_flow.build_coordinator_review_prompt = spy_build_prompt
    try:
        for _ in range(5):
            plan = orch.run_next_pending_subtask(session_id, plan, state=state)

        assert len(seen_unique) == 5
        summary_before_reset = state.extra.get("novel_summary_t1_t4") or ""
        assert summary_before_reset, "Expected novel_summary_t1_t4 to exist before reviewer reset"

        # Trigger the reset branch on the next reviewer call so the prompt only keeps the summary.
        state.extra["reviewer_batch_counter"] = 5
        plan = orch.run_next_pending_subtask(session_id, plan, state=state)

        assert state.extra.get("reviewer_batch_counter") == 1
        contexts_t6 = captured_contexts.get("t6") or []
        assert contexts_t6
        assert contexts_t6[-1] == summary_before_reset
    finally:
        run_flow.build_coordinator_review_prompt = original_build_prompt

    orch.save_state(session_id, plan)
    orch.save_orchestrator_state(state)

    revised_text = state.extra.get("reviewer_revisions", {}).get("t1")
    assert revised_text == "Revised content for t1"

    snapshot = orch.execute_command(
        session_id,
        "/apply_reviewer_revision",
        payload={"subtask_id": "t1"},
    )
    assert snapshot.get("ok") is True

    plan_after = orch._load_plan(session_id)
    target = next(sub for sub in plan_after.subtasks if sub.id == "t1")
    assert target.output == "Revised content for t1"
    assert target.status == "done"
    assert "[adopted reviewer revision]" in (target.notes or "")

    state_after = orch.load_orchestrator_state(session_id)
    last_output = state_after.worker_outputs[-1]
    assert last_output.subtask_id == "t1"
    assert last_output.artifact.kind == "markdown"


def test_novel_mode_disabled_has_no_summary():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    session_id, plan, state = orch.init_session(
        "Classic Writing",
        novel_mode=False,
    )

    assert not state.extra.get("novel_mode")
    assert "novel_summary_t1_t4" not in state.extra
    assert not state.extra.get("reviewer_batch_counter")
    assert plan.subtasks


def test_novel_mode_full_execution_health_check():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    session_id, plan, state = orch.init_session(
        "Novel Health Check",
        novel_mode=True,
        novel_profile=_sample_profile(),
    )
    for idx in range(5, 8):
        plan.subtasks.append(Subtask(id=f"t{idx}", title=f"正文第 {idx - 4} 部分"))

    while any(sub.status != "done" for sub in plan.subtasks):
        plan = orch.run_next_pending_subtask(session_id, plan, state=state)

    assert all(sub.status == "done" for sub in plan.subtasks)
    assert state.extra.get("novel_summary_t1_t4")
    assert state.extra.get("reviewer_batch_counter") is not None
    assert state.worker_outputs

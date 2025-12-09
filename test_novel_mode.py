import json
from collections import defaultdict

from multi_agent_platform.run_flow import (
    Orchestrator,
    _apply_planner_result_to_state,
    _build_novel_t1_t4,
    _chapter_description,
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
            {
                "subtask_id": "t5",
                "title": "Chapter 1: Write Chapter 1",
                "status": "pending",
                "description": _chapter_description("Write Chapter 1"),
            },
            {
                "subtask_id": "t6",
                "title": "Chapter 2: Write Chapter 2",
                "status": "pending",
                "description": _chapter_description("Write Chapter 2"),
            },
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
    assert any("Chapter 1" in s.title for s in merged.subtasks)
    first_chapter = merged.subtasks[4]
    assert first_chapter.metadata.get("chapter_index") == 1
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
            {
                "subtask_id": "t5",
                "title": "Chapter 1: First chapter",
                "status": "pending",
                "description": _chapter_description("First chapter"),
            },
            {
                "subtask_id": "t6",
                "title": "Chapter 2: Second chapter",
                "status": "pending",
                "description": _chapter_description("Second chapter"),
            },
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

    appended = updated.subtasks[4:]
    assert len(appended) == 3
    for task in appended:
        assert task.title.startswith("Chapter")
        assert CHAPTER_FULL_CONTENT in task.description
    assert appended[0].metadata.get("chapter_index") == 1


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


def test_stub_planner_custom_batch_size():
    profile = _sample_profile()
    plan = Plan(
        plan_id="p-batch",
        title="Batch Chapters",
        subtasks=[Subtask(**raw) for raw in _build_novel_t1_t4(profile, "Batch Chapters")],
    )
    updated = generate_stub_plan_from_planning_input(
        plan,
        "写下一章",
        novel_profile=profile,
        chapter_batch_size=2,
    )
    appended = updated.subtasks[4:]
    assert len(appended) == 2
    assert all(task.title.startswith("Chapter") for task in appended)
    assert appended[0].metadata.get("chapter_index") == 1
    assert appended[1].metadata.get("chapter_index") == 2


def test_apply_planner_result_skips_invalid_chapter():
    profile = _sample_profile()
    state = OrchestratorState(
        session_id="sess-invalid",
        plan_id="plan-invalid",
        status="idle",
        extra={"novel_mode": True, "novel_profile": profile},
    )
    existing_plan = Plan(
        plan_id="plan-invalid",
        title="Invalid Chapter Test",
        subtasks=[Subtask(**raw) for raw in _build_novel_t1_t4(profile, "Invalid Chapter Test")],
    )
    result = PlannerResult(
        plan={"plan_id": "plan-invalid", "title": "Invalid Chapter Test"},
        subtasks=[
            {"subtask_id": "t5", "title": "Chapter 1 Outline", "status": "pending"},
            {"subtask_id": "t6", "title": "Chapter 2", "status": "pending", "description": "Incomplete."},
        ],
    )

    merged = _apply_planner_result_to_state(
        state,
        result,
        fallback_user_text="继续",
        existing_plan=existing_plan,
        novel_profile=profile,
    )

    assert len(merged.subtasks) == 4
    assert "Skipped planner chapter" in merged.notes


def test_novel_extra_context_includes_artifact_link():
    profile = _sample_profile()
    artifact_payload = {
        "path": "sessions/artifacts/t4-summary.md",
        "description": "T1-T4 overview",
    }
    state = OrchestratorState(
        session_id="sess-artifact",
        plan_id="plan-artifact",
        status="idle",
        extra={
            "novel_mode": True,
            "novel_profile": profile,
            "novel_summary_t1_t4": "t4 章节分配: detailed plan",
            "novel_summary_artifact": artifact_payload,
        },
    )
    plan = Plan(
        plan_id="plan-artifact",
        title="Artifact Context Test",
        subtasks=[
            Subtask(id="t1", title="Research", status="done", output=""),
            Subtask(id="t2", title="人物设定", status="done", output=""),
            Subtask(id="t3", title="情节设计", status="done", output=""),
            Subtask(id="t4", title="章节分配", status="done", output=""),
            Subtask(id="t5", title="正文第1章", status="pending"),
        ],
    )
    extra_ctx = _novel_extra_context(state, plan, plan.subtasks[-1])
    assert extra_ctx is not None
    assert "Novel summary (t1-t4)" in extra_ctx
    assert "Novel summary artifact: sessions/artifacts/t4-summary.md" in extra_ctx
    assert "T1-T4 overview" in extra_ctx


def test_run_next_pending_t4_appends_chapters():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)
    profile = _sample_profile()
    plan = Plan(
        plan_id="plan-t4",
        title="Novel T4 Append",
        subtasks=[
            Subtask(id="t1", title="Research", status="done", output="research notes"),
            Subtask(id="t2", title="人物设定", status="done", output="character notes"),
            Subtask(id="t3", title="情节设计", status="done", output="plot notes"),
            Subtask(id="t4", title="章节分配", status="pending"),
        ],
    )
    def fake_call_planner(
        topic,
        novel_profile=None,
        novel_summary=None,
        summary_artifact=None,
        reviewer_batch_annotations=None,
    ):
        return "\n".join(
            [
                "Chapter 1: Write the opening",
                "Chapter 2: Continue the arc",
                "Chapter 3: Introduce conflict",
                "Chapter 4: Reach finale",
                "Chapter 5: Wrap up epilogue",
            ]
        )
    orch._call_planner = fake_call_planner
    state = OrchestratorState(
        session_id="sess-t4-append",
        plan_id=plan.plan_id,
        status="idle",
        extra={"novel_mode": True, "novel_profile": profile},
    )

    updated_plan = orch.run_next_pending_subtask(
        "sess-t4-append",
        plan,
        state=state,
        interactive=False,
    )

    assert len(updated_plan.subtasks) > 4
    extra_tasks = updated_plan.subtasks[4:]
    assert extra_tasks
    for task in extra_tasks:
        assert CHAPTER_FULL_CONTENT in task.description


def test_novel_phase_step_tracks_chapter_count():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)
    profile = _sample_profile()
    plan = Plan(
        plan_id="plan-t4-step",
        title="Novel Phase Step",
        subtasks=[
            Subtask(id="t1", title="Research", status="done", output="research"),
            Subtask(id="t2", title="人物设定", status="done", output="characters"),
            Subtask(id="t3", title="情节设计", status="done", output="plot"),
            Subtask(id="t4", title="章节分配", status="pending"),
        ],
    )
    def fake_call_planner(topic, novel_profile=None, novel_summary=None, summary_artifact=None):
        return "\n".join(
            [
                "Chapter 1: Fresh start",
                "Chapter 2: Rising tension",
                "Chapter 3: Reverse twist",
            ]
        )
    orch._call_planner = fake_call_planner
    state = OrchestratorState(
        session_id="sess-t4-step",
        plan_id=plan.plan_id,
        status="idle",
        extra={"novel_mode": True, "novel_profile": profile},
    )

    updated_plan = orch.run_next_pending_subtask(
        "sess-t4-step",
        plan,
        state=state,
        interactive=False,
    )

    added_count = len(updated_plan.subtasks) - 4
    assert added_count == state.extra.get("novel_phase_step")


def test_reviewer_batch_waits_for_three():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)
    profile = _sample_profile()
    plan = Plan(
        plan_id="plan-batch-review",
        title="Batch Review",
        subtasks=[
            Subtask(id="t1", title="Research", status="done", output=""),
            Subtask(id="t2", title="人物设定", status="done", output=""),
            Subtask(id="t3", title="情节设计", status="done", output=""),
            Subtask(id="t4", title="章节分配", status="done", output=""),
            Subtask(id="t5", title="Chapter 1", status="pending"),
            Subtask(id="t6", title="Chapter 2", status="pending"),
            Subtask(id="t7", title="Chapter 3", status="pending"),
        ],
    )
    state = OrchestratorState(
        session_id="sess-batch",
        plan_id=plan.plan_id,
        status="idle",
        extra={"novel_mode": True, "novel_profile": profile},
    )

    captured: list[str | None] = []
    def stub_coordinator(plan_arg, subtask, worker_output, state=None, batch_context=None):
        captured.append(batch_context)
        return "ACCEPT\n"
    orch._call_coordinator = stub_coordinator

    for _ in range(5, 8):
        plan = orch.run_next_pending_subtask("sess-batch", plan, state=state, interactive=False)

    assert captured == [captured[0]]
    batch_ctx = captured[0]
    assert batch_ctx
    assert "t5" in batch_ctx
    assert "t6" in batch_ctx
    assert "t7" in batch_ctx
    assert state.extra.get("reviewer_batch_tasks") == []


def test_planner_prompt_includes_summary_context():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)
    captured: dict[str, str] = {}

    class StubPlanner:
        def run(self, user_message: str) -> str:
            captured["prompt"] = user_message
            return "stub plan"

    orch.planner = StubPlanner()
    summary = "t1 Research: deep dive\n"
    artifact_payload = {
        "path": "sessions/sess-summary/artifacts/summary.md",
        "description": "T1-T4 overview",
    }
    orch._call_planner(
        "Sample Topic",
        novel_profile=_sample_profile(),
        novel_summary=summary,
        summary_artifact=artifact_payload,
    )
    prompt = captured.get("prompt", "")
    assert "Novel summary artifact stored at sessions/sess-summary/artifacts/summary.md" in prompt
    assert "Context:" in prompt
    assert "Profile:" in prompt
    assert "Summary:" in prompt
    assert summary.strip() in prompt


def test_update_novel_summary_saves_artifact():
    store = ArtifactStore()
    state = OrchestratorState(
        session_id="sess-summary",
        plan_id="plan-summary",
        status="idle",
        extra={"novel_mode": True},
    )
    plan = Plan(
        plan_id="plan-summary",
        title="Summary Storage Test",
        subtasks=[
            Subtask(id="t1", title="Research", status="done", output="research details"),
            Subtask(id="t2", title="人物设定", status="done", output="characters"),
            Subtask(id="t3", title="情节设计", status="done", output="plot"),
            Subtask(id="t4", title="章节分配", status="done", output="chapters"),
        ],
    )

    summary = _update_novel_summary(state, plan, artifact_store=store)
    assert summary
    artifact_payload = state.extra.get("novel_summary_artifact")
    assert artifact_payload
    assert artifact_payload.get("kind") == "markdown"


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
        for _ in range(7):
            plan = orch.run_next_pending_subtask(session_id, plan, state=state)

        assert len(seen_unique) == 5
        summary_before_reset = state.extra.get("novel_summary_t1_t4") or ""
        assert summary_before_reset, "Expected novel_summary_t1_t4 to exist before reviewer reset"
        assert state.extra.get("reviewer_batch_tasks") == []
        assert state.extra.get("reviewer_batch_counter") == 1
        inflight_info = state.extra.get("novel_inflight_batch") or {}
        assert inflight_info.get("batch_id") == "batch_1"
        batch_notes = state.extra.get("reviewer_revisions_batch") or ""
        assert batch_notes.startswith("Reviewer batch batch_1 summary:")
        batch_revision = state.extra.get("reviewer_revisions", {}).get("t1") or {}
        assert batch_revision.get("text") == "Revised content for t1"
        t5_revision = state.extra.get("reviewer_revisions", {}).get("t5") or {}
        assert t5_revision.get("batch_id") == "batch_1"
        assert t5_revision.get("artifact_path")

        # Trigger the reset branch on the next reviewer call so the prompt only keeps the summary.
        state.extra["reviewer_batch_counter"] = 5
        for idx in range(9, 12):
            plan.subtasks.append(Subtask(id=f"t{idx}", title=f"正文第 {idx - 4} 部分"))
        prev_seen = len(seen_unique)
        next_review_id = None
        while next_review_id is None:
            plan = orch.run_next_pending_subtask(session_id, plan, state=state)
            if len(seen_unique) > prev_seen:
                next_review_id = seen_unique[-1]

        assert state.extra.get("reviewer_batch_counter") == 1
        contexts_next = captured_contexts.get(next_review_id) or []
        assert contexts_next
        assert summary_before_reset in contexts_next[-1]
    finally:
        run_flow.build_coordinator_review_prompt = original_build_prompt

    orch.save_state(session_id, plan)
    orch.save_orchestrator_state(state)

    revisions = state.extra.get("reviewer_revisions", {}) or {}
    t1_revision = revisions.get("t1") or {}
    assert t1_revision.get("text") == "Revised content for t1"

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
    inflight_after = state_after.extra.get("novel_inflight_batch") or {}
    assert "t1" in (inflight_after.get("applied_subtasks") or [])


def test_planner_prompt_includes_novel_context():
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    session_id, plan, state = orch.init_session(
        "Planner Prompt Context",
        novel_mode=True,
        novel_profile=_sample_profile(),
    )
    state.extra["novel_summary_t1_t4"] = "Novel summary content (t1-t4):\nSample summary"
    state.extra["novel_summary_artifact"] = {
        "path": "sessions/sample/summary.md",
        "description": "T1-T4 summary",
    }
    state.extra["reviewer_revisions_batch"] = "Batch batch_1 summary"

    prompts: dict[str, str] = {}
    original_run = orch.planner.run

    def fake_planner_run(prompt: str) -> str:
        prompts["prompt"] = prompt
        return "Chapter 5: Act One\nChapter 6: Act Two\nChapter 7: Act Three"

    orch.planner.run = fake_planner_run
    try:
        orch._append_chapter_tasks_from_planner_stub(session_id, plan, state)
    finally:
        orch.planner.run = original_run

    captured_prompt = prompts.get("prompt", "")
    assert "Novel summary content (t1-t4)" in captured_prompt
    assert "sessions/sample/summary.md" in captured_prompt
    assert "Batch batch_1 summary" in captured_prompt
    assert len(plan.subtasks) > 4


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

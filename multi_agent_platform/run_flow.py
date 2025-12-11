from __future__ import annotations

import json
from dataclasses import dataclass
import os
import re
import threading
from pathlib import Path
from typing import Tuple, Optional, Dict, Any, List, Callable
from datetime import datetime

from .agent_runner import Agent
from .message_bus import MessageBus
from .orchestrator_intent_agent import run_orchestrator_intent_agent
from .planner_agent import PlannerResult, run_planner_agent
from .prompt_registry import (
    COORDINATOR_CHAT_PROMPT,
    COORDINATOR_PROMPT,
    PLANNER_PROMPT,
    WORKER_PROMPT,
    build_coordinator_review_prompt,
    build_worker_prompt,
)
from .plan_model import Plan, Subtask
from .session_state import (
    OrchestratorState,
    PlannerChatMessage,
    PROGRESS_STAGE_STATUS_MAP,
    WorkerOutputState,
    build_session_snapshot,
    _read_log_entries,
)

USE_REAL_PLANNER = os.getenv("USE_REAL_PLANNER", "true").lower() in (
    "1",
    "true",
    "yes",
)


def _require_real_planner() -> None:
    """Guardrail: real planner must have credentials; fail fast instead of stubbing."""
    if not USE_REAL_PLANNER:
        return
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("USE_REAL_PLANNER=true but OPENAI_API_KEY is missing; refusing to fall back to stub planner.")

PLAN_EDITING_KINDS = {
    "set_current_subtask",
    "update_subtask",
    "insert_subtask",
    "append_subtask",
    "skip_subtask",
}


CHAPTER_FULL_CONTENT = "请写完整内容，覆盖该章节/任务的全文结果。"


def _chapter_title(chapter_index: int, base_title: str | None) -> str:
    prefix = f"Chapter {chapter_index}"
    cleaned = (base_title or "").strip()
    if cleaned.startswith(prefix):
        return cleaned
    if cleaned:
        return f"{prefix}: {cleaned}"
    return prefix


def _chapter_description(base_desc: str | None) -> str:
    trimmed = (base_desc or "").strip()
    if trimmed:
        return f"{trimmed}\n{CHAPTER_FULL_CONTENT}"
    return CHAPTER_FULL_CONTENT


def _chapter_title_has_index(title: str | None) -> bool:
    if not title:
        return False
    return bool(re.search(r"chapter\s*\d+", title, re.IGNORECASE))


def _chapter_description_has_full_content(desc: str | None) -> bool:
    return bool(desc and CHAPTER_FULL_CONTENT in desc)


def _is_valid_chapter_candidate(raw: Dict[str, Any]) -> bool:
    title = raw.get("title") or ""
    desc = raw.get("description") or raw.get("notes") or ""
    return _chapter_title_has_index(title) and _chapter_description_has_full_content(desc)


def _normalize_chapter_subtask(raw: Dict[str, Any], index: int) -> Dict[str, Any]:
    chapter_index = max(1, index - 4)
    base_title = raw.get("title") or raw.get("subtask_description") or ""
    normalized_title = _chapter_title(chapter_index, base_title)
    normalized_description = _chapter_description(raw.get("description") or raw.get("notes") or "")
    subtask_id = raw.get("subtask_id") or raw.get("id") or f"t{index}"
    metadata = dict(raw.get("metadata") or {})
    metadata["chapter_index"] = chapter_index
    return {
        "subtask_id": subtask_id,
        "id": subtask_id,
        "title": normalized_title,
        "description": normalized_description,
        "status": raw.get("status") or "pending",
        "notes": raw.get("notes") or "",
        "metadata": metadata,
    }


def _normalize_event_kind(kind: str | None) -> str:
    """Normalize event kinds so variants still route to the consumer branches."""
    if not kind:
        return "REQUEST_OTHER"
    mapping = {
        "content_change": "REQUEST_CONTENT_CHANGE",
        "request_content_change": "REQUEST_CONTENT_CHANGE",
        "content": "REQUEST_CONTENT_CHANGE",
        "plan_update": "REQUEST_PLAN_UPDATE",
        "request_plan_update": "REQUEST_PLAN_UPDATE",
        "modify_plan": "REQUEST_PLAN_UPDATE",
        "plan": "REQUEST_PLAN_UPDATE",
        "other": "REQUEST_OTHER",
        "request_other": "REQUEST_OTHER",
        "trigger_redo": "TRIGGER_REDO",
        "redo": "TRIGGER_REDO",
    }
    lowered = kind.strip().lower()
    if lowered in mapping:
        return mapping[lowered]
    if kind.isupper():
        return kind
    return kind.upper()


def _parse_reviewer_response(decision_text: str) -> Tuple[str, str, Optional[str]]:
    """
    Parse reviewer/coordinator output into (decision, reason, revised_text).
    Recognizes an optional block starting with REVISED_TEXT: or REVISED:.
    """
    lines = [line.strip() for line in (decision_text or "").strip().splitlines() if line.strip()]
    if not lines:
        return "ACCEPT", "", None
    decision_line = lines[0].upper()
    decision = "ACCEPT" if "ACCEPT" in decision_line else "REDO"
    remaining = lines[1:]
    revised_lines: list[str] = []
    reason_lines: list[str] = []
    capture_revised = False
    for line in remaining:
        lower = line.lower()
        if lower.startswith("revised_text:") or lower.startswith("revised:"):
            capture_revised = True
            revised_lines.append(line.split(":", 1)[1].strip())
            continue
        if capture_revised:
            revised_lines.append(line)
        else:
            reason_lines.append(line)
    revised_text = "\n".join(revised_lines).strip() or None
    reason = "\n".join(reason_lines).strip()
    return decision, reason, revised_text


def _append_progress_event(
    state: OrchestratorState | None,
    agent: str,
    subtask_id: str | None,
    stage: str,
    payload: Optional[Dict[str, Any]] = None,
    ts: Optional[datetime] = None,
) -> Dict[str, Any] | None:
    """Record a subtask progress event on state; no-op if state/subtask missing."""
    if state is None or not subtask_id:
        return None
    event = {
        "agent": agent,
        "subtask_id": subtask_id,
        "stage": stage or "start",
        "status": PROGRESS_STAGE_STATUS_MAP.get(stage or "start", "in_progress"),
        "payload": payload or {},
        "ts": ts or datetime.utcnow(),
    }
    try:
        state.progress_events.append(event)
    except Exception:
        # Defensive: avoid breaking flows if state storage is unexpected
        return None
    return event


def run_worker_for_subtask(plan: Plan, subtask: Subtask, instructions: str | None) -> str:
    """Placeholder worker rewrite using instructions."""
    instructions = instructions or ""
    base = f"[worker rewrite for {subtask.id}]"
    if instructions:
        return f"{base} Applying instructions: {instructions}"
    return f"{base} No additional instructions provided."


def run_reviewer_on_output(plan: Plan, subtask: Subtask, text: str) -> Dict[str, str]:
    """Placeholder reviewer evaluation for a worker output."""
    return {
        "decision": "accept",
        "notes": "placeholder review",
    }


def _build_novel_t1_t4(profile: Dict[str, Any] | None, base_topic: str) -> List[Dict[str, Any]]:
    """Construct the mandatory first four subtasks for novel mode."""
    profile = profile or {}
    length = profile.get("length") or ""
    year = profile.get("year") or ""
    genre = profile.get("genre") or profile.get("other_genres") or ""
    style = profile.get("style") or ""
    title_text = profile.get("title_text") or ""
    characters = profile.get("characters") or []
    chars_desc = "; ".join(
        [
            f"{c.get('name','').strip()} ({c.get('role','').strip()})".strip()
            for c in characters
            if isinstance(c, dict) and (c.get("name") or c.get("role"))
        ]
    )
    extra_notes = profile.get("extra_notes") or ""

    def _desc(text: str) -> str:
        return (
            f"{text}（cover full content for this task）\n"
            f"- Length: {length}\n- Year: {year}\n- Genre: {genre}\n- Style: {style}\n"
            f"- Title: {title_text}\n- Characters: {chars_desc}\n- Extra: {extra_notes}"
        ).strip()

    return [
        {
            "id": "t1",
            "title": "Research",
            "status": "pending",
            "notes": "Research for genre/time/style context",
            "description": _desc("Research the genre, time setting, and target style."),
        },
        {
            "id": "t2",
            "title": "人物设定",
            "status": "pending",
            "notes": "Character roster",
            "description": _desc("List and refine character names and roles."),
        },
        {
            "id": "t3",
            "title": "情节设计",
            "status": "pending",
            "notes": "Plot arcs",
            "description": _desc("Design main plot arcs consistent with the brief."),
        },
        {
            "id": "t4",
            "title": "章节分配 & 小说概要撰写",
            "status": "pending",
            "notes": "Chapter plan and synopsis",
            "description": _desc(
                "作为一位资深作家指导新人，请为每个章节制定详细的写作指南。\n\n"
                "对于每个章节，请用以下格式描述：\n"
                "【章节X】标题\n"
                "- 详细情节内容：（具体描述本章要发生什么，人物如何互动，情节如何推进）\n"
                "- 文笔风格：（本章应该采用什么样的叙述方式，如：紧张悬疑/温馨抒情/快节奏动作等）\n"
                "- 侧重点：（本章的核心目标是什么，如：人物性格塑造/情节转折/氛围营造/冲突升级等）\n"
                "- 写作建议：（给新人作家的具体建议，如需要注意的细节、避免的陷阱、推荐的写作技巧等）\n\n"
                "最后生成一份简明的小说整体概要（synopsis）。"
            ),
        },
    ]


def _format_novel_profile_context(profile: Dict[str, Any] | None) -> str:
    profile = profile or {}
    parts = []
    if profile.get("length"):
        parts.append(f"Length: {profile.get('length')}")
    if profile.get("year"):
        parts.append(f"Year: {profile.get('year')}")
    if profile.get("genre") or profile.get("other_genres"):
        parts.append(f"Genre: {profile.get('genre') or profile.get('other_genres')}")
    if profile.get("style"):
        parts.append(f"Style: {profile.get('style')}")
    if profile.get("title_text"):
        parts.append(f"Title: {profile.get('title_text')}")
    characters = profile.get("characters") or []
    if characters:
        formatted = []
        for c in characters:
            if not isinstance(c, dict):
                continue
            name = c.get("name", "").strip()
            role = c.get("role", "").strip()
            if not name and not role:
                continue
            formatted.append(f"{name} ({role})".strip())
        if formatted:
            parts.append(f"Characters: {', '.join(formatted)}")
    if profile.get("extra_notes"):
        parts.append(f"Extra: {profile.get('extra_notes')}")
    return "\n".join(parts)


def _update_novel_summary(
    state: OrchestratorState | None,
    plan: Plan,
    artifact_store: ArtifactStore | None = None,
) -> str | None:
    """Compute and cache t1-t4 summary for novel mode."""
    if state is None:
        return None
    try:
        if not state.extra.get("novel_mode"):
            return None
    except Exception:
        return None

    summary_lines: List[str] = []
    t4_chapter_allocations = None

    print(f"  [Novel Summary] Processing {len(plan.subtasks[:4])} tasks (t1-t4)")
    for sub in plan.subtasks[:4]:
        content = getattr(sub, "output", "") or getattr(sub, "notes", "") or ""
        if content:
            preview = content[:100] + "..." if len(content) > 100 else content
            print(f"  [Novel Summary] {sub.id} has output ({len(content)} chars): {preview}")
            summary_lines.append(f"{sub.id} {sub.title}: {content}")

            # Extract t4 detailed chapter allocations
            if sub.id == "t4":
                t4_chapter_allocations = content
                print(f"  [Novel Summary] Extracted t4 chapter allocations ({len(content)} chars)")

    profile_ctx = _format_novel_profile_context(getattr(state, "extra", {}).get("novel_profile"))
    if profile_ctx:
        summary_lines.insert(0, f"Profile:\n{profile_ctx}")

    summary = "\n".join(summary_lines).strip()
    try:
        if state.extra is None:
            state.extra = {}
        state.extra["novel_summary_t1_t4"] = summary

        # Save t4 detailed output separately for display and chapter generation
        if t4_chapter_allocations:
            state.extra["t4_detailed_chapter_allocations"] = t4_chapter_allocations
    except Exception:
        pass

    if (
        artifact_store
        and summary
        and hasattr(state, "session_id")
        and getattr(state, "session_id")
    ):
        session_id = state.session_id
        try:
            summary_ref = artifact_store.save_artifact(
                session_id,
                summary,
                kind="markdown",
                description="Novel mode t1-t4 summary",
            )
            try:
                state.extra["novel_summary_artifact"] = summary_ref.to_payload()
            except Exception:
                pass
        except Exception:
            pass
    return summary


def _format_novel_summary_block(summary: str | None) -> Optional[str]:
    trimmed = (summary or "").strip()
    if not trimmed:
        return None
    return f"Novel summary (t1-t4):\n{trimmed}"


def _format_novel_summary_artifact_block(artifact_payload: Dict[str, Any] | None) -> Optional[str]:
    if not artifact_payload:
        return None
    path = artifact_payload.get("path") or artifact_payload.get("artifact_path")
    if not path:
        return None
    desc = artifact_payload.get("description")
    line = f"Novel summary artifact: {path}"
    if desc:
        line += f" ({desc})"
    return line


def _format_recent_worker_outputs_context(state: OrchestratorState | None) -> Optional[str]:
    if state is None:
        return None
    outputs = (getattr(state, "extra", {}) or {}).get("recent_worker_outputs") or []
    if not outputs:
        return None
    lines: List[str] = ["Recent worker outputs (latest first):"]
    for entry in outputs[-3:]:
        header = f"{entry.get('subtask_id')}: {entry.get('title')}"
        artifact_path = entry.get("artifact_path")
        if artifact_path:
            header += f" (artifact: {artifact_path})"
        lines.append(header)
        preview = entry.get("preview")
        if preview:
            lines.append(f"Preview:\n{preview}")
    return "\n\n".join(lines)


def _format_novel_inflight_batch_context(batch_info: Dict[str, Any] | None) -> Optional[str]:
    if not batch_info:
        return None
    parts: List[str] = []
    batch_id = batch_info.get("batch_id")
    if batch_id:
        parts.append(f"Reviewer batch in-flight: {batch_id}")
    summary = batch_info.get("summary")
    if summary:
        parts.append(f"Batch context:\n{summary}")
    reason = batch_info.get("reason")
    if reason:
        parts.append(f"Reviewer reason:\n{reason}")
    decision = batch_info.get("decision")
    if decision:
        parts.append(f"Decision: {decision}")
    return "\n\n".join(parts) if parts else None


def _cache_reviewer_revision_entry(
    state: OrchestratorState | None,
    subtask_id: str | None,
    *,
    text: str | None,
    batch_id: str | None = None,
    artifact_path: str | None = None,
) -> None:
    if state is None or not subtask_id or not text:
        return
    try:
        if state.extra is None:
            state.extra = {}
        revisions = state.extra.setdefault("reviewer_revisions", {})
        entry = revisions.get(subtask_id) or {}
        entry.update(
            {
                "batch_id": batch_id or entry.get("batch_id"),
                "text": text,
            }
        )
        if artifact_path:
            entry["artifact_path"] = artifact_path
        revisions[subtask_id] = entry
    except Exception:
        pass


def _record_recent_worker_output(
    state: OrchestratorState | None,
    subtask: Subtask,
    worker_output: str,
    artifact_path: str | None,
) -> None:
    if state is None:
        return
    try:
        if state.extra is None:
            state.extra = {}
        outputs = state.extra.setdefault("recent_worker_outputs", [])
        preview = worker_output or ""
        if len(preview) > 400:
            preview = f"{preview[:400]}..."
        outputs.append(
            {
                "subtask_id": subtask.id,
                "title": subtask.title,
                "preview": preview,
                "artifact_path": artifact_path,
                "ts": datetime.utcnow().isoformat(),
            }
        )
        while len(outputs) > 3:
            outputs.pop(0)
    except Exception:
        pass


def _novel_extra_context(state: OrchestratorState | None, plan: Plan, subtask: Subtask) -> Optional[str]:
    if state is None:
        return None
    try:
        if not state.extra.get("novel_mode"):
            return None
    except Exception:
        return None
    profile_ctx = _format_novel_profile_context(getattr(state, "extra", {}).get("novel_profile"))
    summary = getattr(state, "extra", {}).get("novel_summary_t1_t4") or ""
    artifact_payload = getattr(state, "extra", {}).get("novel_summary_artifact") or {}

    summary_block = _format_novel_summary_block(summary)
    artifact_block = _format_novel_summary_artifact_block(artifact_payload)
    inflight_block = _format_novel_inflight_batch_context(
        getattr(state, "extra", {}).get("novel_inflight_batch")
    )
    recent_block = _format_recent_worker_outputs_context(state)

    if subtask.id in {"t1", "t2", "t3", "t4"}:
        sections = [profile_ctx, summary_block, artifact_block]
    else:
        sections = [summary_block, artifact_block, profile_ctx]
    for block in (inflight_block, recent_block):
        if block:
            sections.append(block)

    context = "\n\n".join(filter(None, sections)).strip()
    return context or None

def consume_orchestrator_events(state: OrchestratorState, plan: Plan | None = None) -> None:
    """v0.2: true action consumer — handles structured events produced by the intent agent."""

    new_events = []
    pending = list(state.orch_events or [])
    for ev in pending:
        payload = ev if isinstance(ev, dict) else getattr(ev, "payload", {}) or {}
        raw_kind = payload.get("raw_kind") or payload.get("kind") or getattr(ev, "kind", None)
        kind = _normalize_event_kind(raw_kind)

        # === CONTENT CHANGE ===
        if kind == "REQUEST_CONTENT_CHANGE":
            target = payload.get("target_subtask_id")
            instr = payload.get("instructions")

            target_index = None
            target_label = target

            if plan and plan.subtasks:
                if isinstance(target, int) and 0 <= target < len(plan.subtasks):
                    target_index = target
                elif isinstance(target, str):
                    for idx, subtask in enumerate(plan.subtasks):
                        if subtask.id == target:
                            target_index = idx
                            break
                if target_index is not None:
                    subtask = plan.subtasks[target_index]
                    if not hasattr(subtask, "needs_redo"):
                        setattr(subtask, "needs_redo", True)
                    else:
                        subtask.needs_redo = True
                    if instr:
                        note_prefix = f"[redo request] {instr}"
                        existing_notes = getattr(subtask, "notes", "") or ""
                        subtask.notes = f"{existing_notes}\n{note_prefix}".strip()
                    target_label = subtask.id or target_index
            elif hasattr(state, "subtasks") and target is not None:
                # Fallback for state-managed subtasks
                try:
                    if 0 <= target < len(state.subtasks):
                        state.subtasks[target].needs_redo = True
                except Exception:
                    pass

            confirmation = (
                f"Got it. Triggering a redo for subtask {target_label} "
                f"with instructions: {instr or '(no specific instructions provided)'}"
            )
            state.add_orchestrator_message("orchestrator", confirmation)

            new_events.append({
                "kind": "TRIGGER_REDO",
                "target_subtask_id": target,
                "instructions": instr,
            })

        # === PLAN CHANGE ===
        elif kind == "REQUEST_PLAN_UPDATE":
            instr = payload.get("instructions")
            updated_plan = plan

            # Invoke planner to regenerate plan/subtasks when available.
            if plan is not None:
                if USE_REAL_PLANNER:
                    plan_dict = plan.to_dict() if hasattr(plan, "to_dict") else None
                    subtasks_dicts: List[Dict[str, Any]] = []
                    for s in plan.subtasks or []:
                        try:
                            subtasks_dicts.append(s.to_dict())
                        except AttributeError:
                            subtasks_dicts.append(
                                {
                                    "subtask_id": getattr(s, "id", None) or getattr(s, "subtask_id", None),
                                    "title": s.title,
                                    "description": getattr(s, "description", ""),
                                    "status": getattr(s, "status", "pending"),
                                    "notes": getattr(s, "notes", ""),
                                }
                            )
                    planner_chat = [
                        msg.dict() if hasattr(msg, "dict") else msg
                        for msg in getattr(state, "planner_chat", []) or []
                    ]
                    try:
                        result = run_planner_agent(
                            planner_chat=planner_chat,
                            plan=plan_dict,
                            subtasks=subtasks_dicts,
                            latest_user_input=instr or "",
                        )
                        updated_plan = _apply_planner_result_to_state(
                            state,
                            result,
                            fallback_user_text=instr or "",
                            existing_plan=plan,
                            novel_profile=getattr(state, "extra", {}).get("novel_profile") if getattr(state, "extra", None) else None,
                        )
                    except Exception:
                        # Fallback to stub if planner call fails
                        updated_plan = generate_stub_plan_from_planning_input(
                            plan,
                            instr or "",
                            novel_profile=getattr(state, "extra", {}).get("novel_profile") if getattr(state, "extra", None) else None,
                        )
                else:
                    updated_plan = generate_stub_plan_from_planning_input(
                        plan,
                        instr or "",
                        novel_profile=getattr(state, "extra", {}).get("novel_profile") if getattr(state, "extra", None) else None,
                    )

                plan.notes = getattr(updated_plan, "notes", plan.notes)
                plan.title = getattr(updated_plan, "title", plan.title)
                plan.description = getattr(updated_plan, "description", getattr(plan, "description", ""))
                plan.subtasks = getattr(updated_plan, "subtasks", plan.subtasks)

            state.add_orchestrator_message(
                "orchestrator",
                f"Planner will redo the plan based on your request: {instr or '(no details provided)'}"
            )

        # === OTHER ===
        elif kind == "REQUEST_OTHER":
            state.add_orchestrator_message(
                "orchestrator",
                "Understood. (General request acknowledged.)"
            )

        # === TRIGGER REDO ===
        elif kind == "TRIGGER_REDO":
            target = payload.get("target_subtask_id")
            instr = payload.get("instructions")
            subtask = None
            target_label = target

            if plan and plan.subtasks:
                if isinstance(target, int) and 0 <= target < len(plan.subtasks):
                    subtask = plan.subtasks[target]
                elif isinstance(target, str):
                    subtask = next((s for s in plan.subtasks if s.id == target), None)
                if subtask:
                    target_label = subtask.id

            # 1) worker rewrite (stubbed)
            worker_output = ""
            if subtask:
                _append_progress_event(
                    state,
                    agent="worker",
                    subtask_id=subtask.id,
                    stage="start",
                    payload={"source": "orchestrator_event", "kind": kind},
                )
                worker_output = run_worker_for_subtask(plan, subtask, instr)
                subtask.output = worker_output
                subtask.needs_redo = False
                _update_novel_summary(state, plan)
                _append_progress_event(
                    state,
                    agent="worker",
                    subtask_id=subtask.id,
                    stage="finish",
                    payload={"source": "orchestrator_event", "kind": kind},
                )

            # 2) reviewer eval (stubbed)
            if subtask:
                _append_progress_event(
                    state,
                    agent="reviewer",
                    subtask_id=subtask.id,
                    stage="start",
                    payload={"source": "orchestrator_event", "kind": kind},
                )
            review = run_reviewer_on_output(plan, subtask, worker_output) if subtask else {"decision": "accept", "notes": ""}
            decision = review.get("decision", "").lower()
            notes = review.get("notes", "")
            revised_text = review.get("revised_text")
            if subtask:
                _append_progress_event(
                    state,
                    agent="reviewer",
                    subtask_id=subtask.id,
                    stage="finish",
                    payload={
                        "source": "orchestrator_event",
                        "kind": kind,
                        "decision": decision or "accept",
                    },
                )

            # 3) update state/subtask status
            if subtask:
                subtask.notes = notes or subtask.notes
                if decision == "redo":
                    subtask.status = "pending"
                    subtask.needs_redo = True
                else:
                    subtask.status = "done"
                    subtask.needs_redo = False
                # cache reviewer revision if provided
                if revised_text:
                    _cache_reviewer_revision_entry(state, subtask.id, text=revised_text)

            # 4) orchestrator user-visible message
            final_text = (
                f"I’ve rewritten subtask {target_label} based on your instructions.\n\n"
                f"Updated version:\n{worker_output}\n\n"
                f"Reviewer notes:\n{notes or 'accept'}"
            )
            state.add_orchestrator_message("orchestrator", final_text)

        else:
            state.add_orchestrator_message(
                "orchestrator",
                f"Unhandled event type: {raw_kind or kind}"
            )

    state.orch_events = new_events


def run_orchestrator_turn(
    state: OrchestratorState,
    user_text: str,
    ts: Optional[datetime] = None,
) -> None:
    """
    Unified orchestrator hook.

    Current behavior:
      - Uses LLM intent parser to classify requests and enqueue structured orch_events.
      - No plan changes or redo triggers executed yet.
    """
    text = (user_text or "").strip()
    if not text:
        return

    if ts is None:
        ts = datetime.utcnow().isoformat()

    action = run_orchestrator_intent_agent(state, text)

    state.orch_events.append({
        "kind": action.kind,
        "raw_kind": action.raw_kind,
        "target_subtask_id": action.target_subtask_id,
        "instructions": action.instructions,
        "needs_redo": action.needs_redo,
        "raw_text": action.raw_text,
    })

    state.add_orchestrator_message(
        role="orchestrator",
        content=(
            f"[intent-parser] Classified user request as {action.kind}"
            + (f" (raw: {action.raw_kind})" if action.raw_kind and action.raw_kind != action.kind else "")
        ),
        ts=ts,
    )


def generate_stub_plan_from_planning_input(
    plan: Plan,
    user_text: str,
    novel_profile: Optional[Dict[str, Any]] = None,
    *,
    chapter_batch_size: int = 3,
) -> Plan:
    """
    Populate/update a placeholder plan and subtasks based on planning input.
    v0.2: on every planning input, append a visible subtask so structure changes are observable.
    """
    text = (user_text or "").strip()
    if not text:
        return plan

    novel_mode = bool(novel_profile)

    # Seed a basic plan and initial subtasks if empty
    if not plan.subtasks:
        plan.title = plan.title or "写一个长篇小说"
        plan.notes = (plan.notes or "stub planner").strip()
        if novel_mode:
            plan.subtasks = [
                Subtask(**raw)
                for raw in _build_novel_t1_t4(novel_profile or {}, plan.title)
            ]
        else:
            plan.subtasks = [
                Subtask(id="t1", title="确定小说的主题和整体思想", status="pending"),
                Subtask(id="t2", title="设计主要人物角色和基本设定", status="pending"),
            ]

    # Update plan notes with user input
    notes_prefix = plan.notes or ""
    plan.notes = f"{notes_prefix}\n[用户补充] {text}".strip()

    batch_count = chapter_batch_size if novel_mode else 1
    batch_count = max(1, batch_count)

    for batch_idx in range(batch_count):
        next_id_num = len(plan.subtasks) + 1
        chapter_index = max(1, next_id_num - 4)
        title_base = text or f"Chapter {chapter_index}"
        title_suffix = f"（续 {batch_idx + 1}）" if batch_count > 1 else ""
        rule_title = f"根据补充要求：{title_base}{title_suffix}"

        raw_chapter = {
            "subtask_id": f"t{next_id_num}",
            "title": _chapter_title(chapter_index, rule_title) if novel_mode else rule_title,
            "description": _chapter_description(text if novel_mode else text or ""),
            "notes": "来自规划对话的最新需求",
            "status": "pending",
        }

        if novel_mode:
            normalized = _normalize_chapter_subtask(raw_chapter, next_id_num)
        else:
            normalized = raw_chapter

        new_subtask = Subtask(
            id=normalized["subtask_id"],
            title=normalized["title"],
            status=normalized.get("status", "pending"),
            notes=normalized.get("notes", ""),
            description=normalized.get("description", ""),
            needs_redo=False,
            metadata=normalized.get("metadata", {}),
        )
        plan.subtasks.append(new_subtask)

    return plan


def _apply_planner_result_to_state(
    state: OrchestratorState,
    result: PlannerResult,
    fallback_user_text: str,
    existing_plan: Plan | None,
    novel_profile: Optional[Dict[str, Any]] = None,
) -> Plan:
    """Merge PlannerResult into a Plan object (state does not store plan directly)."""

    plan_dict = result.plan or {}
    subtasks_dicts = result.subtasks or []

    # ---- Plan ----
    plan_id = plan_dict.get("plan_id") or (existing_plan.plan_id if existing_plan else f"plan-{state.session_id}")
    title = plan_dict.get("title") or (existing_plan.title if existing_plan else "Writing Project")
    description = plan_dict.get("description") or (getattr(existing_plan, "description", "") if existing_plan else "")
    notes = plan_dict.get("notes") or (getattr(existing_plan, "notes", "") if existing_plan else "")

    new_plan = Plan(
        plan_id=plan_id,
        title=title,
        description=description,
        notes=notes,
    )

    # ---- Subtasks ----
    novel_mode = False
    try:
        novel_mode = bool(state.extra.get("novel_mode"))
    except Exception:
        novel_mode = False

    # If novel mode, seed with mandatory t1–t4 and then append remaining planner items (dedup by id)
    base_subtasks: List[Dict[str, Any]] = []
    if novel_mode:
        base_subtasks.extend(_build_novel_t1_t4(novel_profile, title))

    merged_subtasks: List[Dict[str, Any]] = []
    seen_ids = set()
    for raw in base_subtasks + subtasks_dicts:
        sub_id = raw.get("subtask_id") or raw.get("id")
        if not sub_id:
            # auto-generate id after existing ones
            sub_id = f"t{len(seen_ids) + 1}"
        if sub_id in seen_ids:
            continue
        seen_ids.add(sub_id)
        merged_subtasks.append(raw | {"subtask_id": sub_id, "id": sub_id})

    if not merged_subtasks:
        merged_subtasks = subtasks_dicts

    warning_lines: List[str] = []
    new_subtasks: List[Subtask] = []
    for idx, raw in enumerate(merged_subtasks, start=1):
        sub_id = raw.get("subtask_id") or raw.get("id") or f"t{idx}"
        title = raw.get("title") or f"Subtask {idx}"
        status = raw.get("status") or "pending"
        notes = raw.get("notes") or ""
        desc = raw.get("description", "")
        if novel_mode and idx > 4:
            if not _is_valid_chapter_candidate(raw):
                warning_lines.append(
                    f"Skipped planner chapter {sub_id} because title must include 'Chapter {{n}}' and description must contain '{CHAPTER_FULL_CONTENT}'."
                )
                continue
            normalized = _normalize_chapter_subtask(raw, idx)
            sub_id = normalized["subtask_id"]
            title = normalized["title"]
            desc = normalized["description"]
            status = normalized.get("status", status)
            notes = normalized.get("notes", notes)

        metadata = raw.get("metadata") or {}
        if novel_mode and idx > 4:
            metadata = normalized.get("metadata", metadata)
        new_subtasks.append(
            Subtask(
                id=sub_id,
                title=title,
                status=str(status).lower(),
                notes=notes,
                output="",
                needs_redo=False,
                description=desc,
                metadata=metadata,
            )
        )

    if not new_subtasks:
        # Fallback, ensure at least two tasks
        new_subtasks = [
            Subtask(
                id="t1",
                title=f"Outline: {fallback_user_text}",
                description="Create a high-level outline based on the latest user input.",
                status="pending",
                notes="auto-generated fallback",
            ),
            Subtask(
                id="t2",
                title="Write the first section draft",
                description="Draft the opening section based on the outline.",
                status="pending",
                notes="auto-generated fallback",
            ),
        ]

    if warning_lines:
        warning_block = "\n".join(warning_lines)
        plan_notes = new_plan.notes or ""
        new_plan.notes = f"{plan_notes}\n{warning_block}".strip()

    new_plan.subtasks = new_subtasks
    return new_plan

from .plan_model import Plan, Subtask
from .session_store import ArtifactStore, ArtifactRef


@dataclass
class OrchestratorConfig:
    model_planner: str = "gpt-4.1-mini"
    model_worker: str = "gpt-4.1-mini"
    model_coordinator: str = "gpt-4.1-mini"


class Orchestrator:
    """
    重新构造后的执行器：Planner → Worker → Coordinator 形式的子任务循环。
    """

    def __init__(
        self,
        artifact_store: ArtifactStore | None = None,
        message_bus: MessageBus | None = None,
        cfg: OrchestratorConfig | None = None,
    ):
        self.store = artifact_store or ArtifactStore()
        self.bus = message_bus or MessageBus(store=self.store)
        self.cfg = cfg or OrchestratorConfig()

        self.planner = Agent(
            name="planner",
            system_prompt=PLANNER_PROMPT,
            model=self.cfg.model_planner,
        )
        self.worker = Agent(
            name="worker",
            system_prompt=WORKER_PROMPT,
            model=self.cfg.model_worker,
        )
        self.coordinator = Agent(
            name="coordinator",
            system_prompt=COORDINATOR_PROMPT,
            model=self.cfg.model_coordinator,
        )
        self._last_outline_ref: ArtifactRef | None = None

    def _call_planner(
        self,
        topic: str,
        novel_profile: Optional[Dict[str, Any]] = None,
        novel_summary: Optional[str] = None,
        summary_artifact: Optional[Dict[str, Any]] = None,
        reviewer_batch_annotations: Optional[str] = None,
    ) -> str:
        context_parts: List[str] = []

        if summary_artifact:
            artifact_path = summary_artifact.get("path")
            if artifact_path:
                artifact_desc = summary_artifact.get("description")
                descriptor = f"Novel summary artifact stored at {artifact_path}"
                if artifact_desc:
                    descriptor += f" ({artifact_desc})"
                context_parts.append(descriptor)

        if novel_summary:
            context_parts.append(f"Novel summary content (t1-t4):\\n{novel_summary}")

        profile_block = ""
        if novel_profile:
            try:
                profile_block = json.dumps(novel_profile, ensure_ascii=False)
            except Exception:
                profile_block = str(novel_profile)

        extra_sections: List[str] = []
        if context_parts:
            extra_sections.append("Context:\\n" + "\\n\\n".join(context_parts))
        if profile_block:
            extra_sections.append("Profile:\\n" + profile_block)
        if novel_summary:
            extra_sections.append(f"Summary:\\n{novel_summary}")
        if reviewer_batch_annotations:
            extra_sections.append("Reviewer batch annotations:\\n" + reviewer_batch_annotations)

        extra_context = "\\n\\n".join(extra_sections).strip()
        novel_hint = ""
        if novel_profile or novel_summary:
            novel_hint = (
                "\\n\\nNovel mode is ON. You MUST output the first four subtasks exactly as:"
                "\\n- t1 Research (include questionnaire info, cover full content)"
                "\\n- t2 人物设定 (include questionnaire info, cover full content)"
                "\\n- t3 情节设计 (include questionnaire info, cover full content)"
                "\\n- t4 章节分配 & 小说概要撰写 (include questionnaire info, cover full content)"
                "\\nAll remaining subtasks (t5+) should focus on drafting chapters/正文; keep IDs incremental."
            )

        prompt = f"请为下面的主题生成一个分步骤的计划，每个子任务一句话：\\n\\n主题：{topic}"
        if extra_context:
            prompt += f"\\n\\n{extra_context}"
        prompt += novel_hint
        return self.planner.run(prompt)

    def _call_worker(self, plan: Plan, subtask: Subtask, state: OrchestratorState | None = None) -> str:
        extra_ctx = _novel_extra_context(state, plan, subtask)
        return self.worker.run(
            build_worker_prompt(plan, subtask, topic=plan.title, extra_context=extra_ctx)
        )

    def _build_reviewer_batch_context(
        self,
        state: OrchestratorState | None,
    ) -> str | None:
        if state is None:
            return None
        batch = state.extra.get("reviewer_batch_tasks") or []
        if not batch:
            return None
        lines: List[str] = []
        for entry in batch:
            header = f"{entry.get('subtask_id')}: {entry.get('title')}"
            artifact_path = entry.get("artifact_path")
            if artifact_path:
                header += f" (artifact: {artifact_path})"
            lines.append(header)
            preview = entry.get("worker_output_preview")
            if preview:
                lines.append(f"Preview:\n{preview}")
        return "\n\n".join(lines)

    def _finalize_reviewer_batch(
        self,
        state: OrchestratorState | None,
        batch_tasks: List[Dict[str, Any]],
        batch_context: str,
        decision: str,
        reason: str,
        revised_text: str | None,
    ) -> str:
        if state is None:
            return ""
        if state.extra is None:
            state.extra = {}
        counter = int(state.extra.get("reviewer_batch_counter", 0) or 0)
        batch_id = f"batch_{counter + 1}"
        state.extra["reviewer_batch_counter"] = counter + 1
        inflight_info = {
            "batch_id": batch_id,
            "summary": batch_context or "",
            "reason": reason or "",
            "decision": decision,
            "timestamp": datetime.utcnow().isoformat(),
        }
        state.extra["novel_inflight_batch"] = inflight_info

        note_lines: List[str] = [f"Reviewer batch {batch_id} summary:"]
        if decision:
            note_lines.append(f"Decision: {decision}")
        if reason:
            note_lines.append(f"Reason: {reason}")
        if batch_context:
            note_lines.append(f"Context:\n{batch_context}")
        state.extra["reviewer_revisions_batch"] = "\n".join(note_lines).strip()

        primary_id = batch_tasks[-1].get("subtask_id") if batch_tasks else None
        for entry in batch_tasks:
            sub_id = entry.get("subtask_id")
            if not sub_id:
                continue
            entry_reason = revised_text if revised_text and sub_id == primary_id else reason or ""
            artifact_path = entry.get("artifact_path")
            _cache_reviewer_revision_entry(
                state,
                sub_id,
                text=entry_reason,
                batch_id=batch_id,
                artifact_path=artifact_path,
            )
        state.extra["reviewer_batch_tasks"] = []
        return batch_id

    def _enqueue_reviewer_batch_task(
        self,
        state: OrchestratorState | None,
        subtask: Subtask,
        worker_output: str,
        artifact_ref_path: str | None,
    ) -> bool:
        if state is None:
            return False
        batch = state.extra.setdefault("reviewer_batch_tasks", [])
        batch.append(
            {
                "subtask_id": subtask.id,
                "title": subtask.title,
                "artifact_path": artifact_ref_path,
                "worker_output_preview": worker_output[:400],
            }
        )
        return len(batch) >= 3

    def _call_coordinator(
        self,
        plan: Plan,
        subtask: Subtask,
        worker_output: str,
        state: OrchestratorState | None = None,
        *,
        batch_context: str | None = None,
    ) -> str:
        strict_novel = False
        try:
            strict_novel = bool(getattr(state, "extra", {}).get("novel_mode"))
        except Exception:
            strict_novel = False

        reset_reviewer_ctx = False
        if strict_novel and state is not None:
            try:
                counter = state.extra.get("reviewer_batch_counter", 0)
                if counter and counter % 5 == 0:
                    reset_reviewer_ctx = True
                    state.extra["reviewer_batch_counter"] = 0
            except Exception:
                reset_reviewer_ctx = False

        if reset_reviewer_ctx:
            summary_only = ""
            try:
                summary_only = state.extra.get("novel_summary_t1_t4", "") if state and state.extra else ""
            except Exception:
                summary_only = ""
            extra_ctx = summary_only
        else:
            extra_ctx = _novel_extra_context(state, plan, subtask)
        if extra_ctx and batch_context:
            extra_ctx = "\n\n".join([extra_ctx, batch_context])
        elif batch_context:
            extra_ctx = batch_context
        return self.coordinator.run(
            build_coordinator_review_prompt(
                plan,
                subtask,
                worker_output,
                extra_context=extra_ctx,
                strict_novel_mode=strict_novel,
            )
        )

    def _append_chapter_tasks_from_planner_stub(
        self,
        session_id: str,
        plan: Plan,
        state: OrchestratorState | None,
    ) -> None:
        """Invoke planner again after t4 to append t5+ chapter subtasks."""
        if state is None:
            print("[Planner] Skipping chapter expansion: state is None")
            return
        try:
            if not state.extra or not state.extra.get("novel_mode"):
                print("[Planner] Skipping chapter expansion: not in novel_mode")
                return
        except Exception:
            print("[Planner] Skipping chapter expansion: exception checking novel_mode")
            return

        print(f"[Planner] Starting chapter expansion after t4 completion (current subtasks: {len(plan.subtasks)})")

        # Record that planner is starting to generate chapter tasks
        try:
            self._record_progress_event(
                session_id,
                state,
                agent="planner",
                subtask_id="chapter_expansion",
                stage="start",
                payload={"note": "Generating chapter tasks after t4 completion"},
            )
        except Exception:
            pass

        summary = state.extra.get("novel_summary_t1_t4")
        artifact_payload = state.extra.get("novel_summary_artifact")
        reviewer_annotations = state.extra.get("reviewer_revisions_batch")
        profile = state.extra.get("novel_profile")

        topic = plan.title or "Novel Story"
        outline = ""
        print(f"[Planner] Calling planner to generate chapter outline for: {topic}")
        try:
            outline = self._call_planner(
                topic,
                novel_profile=profile,
                novel_summary=summary,
                summary_artifact=artifact_payload,
                reviewer_batch_annotations=reviewer_annotations,
            )
            print(f"[Planner] ✓ Planner returned outline ({len(outline)} chars)")
        except Exception as e:
            print(f"[Planner] ❌ Failed to call planner: {e}")
            return

        # Save planner outline for debugging
        try:
            debug_ref = self.store.save_artifact(
                session_id,
                outline,
                kind="markdown",
                description="Planner chapter outline (after t4)",
            )
            print(f"[Planner] Outline saved to {debug_ref.path}")
        except Exception:
            pass

        try:
            stub_plan = Plan.from_outline(topic, outline)
            print(f"[Planner] Parsed {len(stub_plan.subtasks)} chapter candidates from outline")
        except Exception as e:
            print(f"[Planner] ❌ Failed to parse planner outline: {e}")
            stub_plan = None

        sanitized_subtasks: List[Dict[str, Any]] = []
        base_count = len(plan.subtasks)

        if stub_plan:
            for sub in stub_plan.subtasks:
                title = sub.title or ""
                # Relaxed validation: accept "chapter", "第X章", or "章节"
                has_chapter = (
                    "chapter" in title.lower() or
                    "章" in title or
                    "Chapter" in title
                )
                if not has_chapter:
                    print(f"[Planner] Skipping non-chapter subtask: {title}")
                    continue
                desc = sub.description or _chapter_description(title)
                next_id = f"t{base_count + len(sanitized_subtasks) + 1}"
                sanitized_subtasks.append(
                    {
                        "subtask_id": next_id,
                        "title": title,
                        "status": "pending",
                        "description": desc,
                        "notes": sub.notes,
                    }
                )

        print(f"[Planner] After sanitization: {len(sanitized_subtasks)} valid chapters")

        # Fallback: if no valid chapters, generate default 5 chapters
        if not sanitized_subtasks:
            print("[Planner] ⚠️ No valid chapters found, generating default 5 chapters")
            chapter_count = profile.get("chapter_count", 5) if profile else 5
            for i in range(chapter_count):
                next_id = f"t{base_count + i + 1}"
                sanitized_subtasks.append(
                    {
                        "subtask_id": next_id,
                        "title": f"Chapter {i+1}",
                        "status": "pending",
                        "description": _chapter_description(f"Chapter {i+1}"),
                        "notes": "Auto-generated chapter task (planner fallback)",
                    }
                )
            print(f"[Planner] Generated {len(sanitized_subtasks)} default chapters")

        planner_result = PlannerResult(
            plan={
                "plan_id": stub_plan.plan_id if stub_plan else plan.plan_id,
                "title": stub_plan.title if stub_plan else plan.title,
                "description": stub_plan.description if stub_plan else "",
                "notes": stub_plan.notes if stub_plan else "",
            },
            subtasks=sanitized_subtasks,
        )

        try:
            updated_plan = _apply_planner_result_to_state(
                state,
                planner_result,
                fallback_user_text=summary or "",
                existing_plan=plan,
                novel_profile=profile,
            )
        except Exception:
            return

        existing_ids = {sub.id for sub in plan.subtasks}
        added = 0
        for new_sub in updated_plan.subtasks:
            if new_sub.id in existing_ids:
                continue
            plan.subtasks.append(new_sub)
            existing_ids.add(new_sub.id)
            added += 1

        if added:
            self._update_novel_phase_step(state, increment=added)
            try:
                self._record_progress_event(
                    session_id,
                    state,
                    agent="planner",
                    subtask_id="chapter_expansion",
                    stage="finish",
                    payload={
                        "plan_snapshot": plan.to_dict(),
                        "note": f"Appended {added} chapter subtasks after t4 completion",
                        "added_count": added,
                    },
                )
            except Exception:
                pass
            # Persist plan and state immediately so new chapters are visible to next iteration
            print(f"[Planner] Persisting plan with {added} new chapter tasks (total: {len(plan.subtasks)})")
            try:
                self.save_state(session_id, plan)
                self.save_orchestrator_state(state)
                print(f"[Planner] ✓ Plan and state persisted successfully")
            except Exception as e:
                print(f"[Planner] ❌ Failed to persist plan/state: {e}")
        else:
            self._update_novel_phase_step(state, increment=0)
            print("[Planner] No chapter tasks were added (skipping plan persistence)")

    def _update_novel_phase_step(self, state: OrchestratorState | None, *, increment: int = 0) -> None:
        if state is None:
            return
        try:
            if state.extra is None:
                state.extra = {}
            current = int(state.extra.get("novel_phase_step", 0) or 0)
            if increment:
                state.extra["novel_phase_step"] = current + increment
            else:
                # ensure key exists even when no change
                state.extra.setdefault("novel_phase_step", current)
        except Exception:
            pass

    def _state_path(self, session_id: str) -> Path:
        """Get the path to the state.json file for a session."""
        return self.store.session_dir(session_id) / "orchestrator_state.json"

    def _find_subtask_index(self, plan: Plan, subtask_id: str) -> int | None:
        for index, subtask in enumerate(plan.subtasks):
            if subtask.id == subtask_id:
                return index
        return None

    def _find_subtask(self, plan: Plan, subtask_id: str) -> Subtask | None:
        idx = self._find_subtask_index(plan, subtask_id)
        return plan.subtasks[idx] if idx is not None else None

    def _generate_subtask_id(self, plan: Plan) -> str:
        existing_nums = []
        for subtask in plan.subtasks:
            if subtask.id.startswith("t") and subtask.id[1:].isdigit():
                existing_nums.append(int(subtask.id[1:]))
        next_num = max(existing_nums, default=0) + 1
        return f"t{next_num}"

    @staticmethod
    def _is_subtask_complete(subtask: Subtask) -> bool:
        return subtask.status in {"done", "skipped"}

    def _next_pending_subtask(self, plan: Plan) -> Subtask | None:
        for subtask in plan.subtasks:
            if not self._is_subtask_complete(subtask):
                return subtask
        return None

    def _has_pending_subtasks(self, plan: Plan) -> bool:
        return any(not self._is_subtask_complete(subtask) for subtask in plan.subtasks)

    def _mark_background_error(self, session_id: str, exc: Exception) -> None:
        """Persist a lightweight error marker if a background task fails."""
        try:
            state = self.load_orchestrator_state(session_id)
        except FileNotFoundError:
            return
        state.status = "error"
        try:
            if state.extra is None:
                state.extra = {}
            state.extra["last_error"] = str(exc)
        except Exception:
            state.extra = {"last_error": str(exc)}
        try:
            state.add_orchestrator_message(
                "orchestrator",
                f"Background task failed: {exc}. Please retry the command.",
            )
        except Exception:
            pass
        try:
            self.save_orchestrator_state(state)
        except Exception:
            return

    def _start_background_task(
        self,
        session_id: str,
        label: str,
        target: Callable[[], None],
    ) -> None:
        """Run a short-lived background task and capture errors onto orchestrator state."""

        def _wrapper() -> None:
            try:
                target()
            except Exception as exc:
                self._mark_background_error(session_id, exc)

        thread = threading.Thread(
            target=_wrapper,
            name=f"orch-{label}-{session_id}",
            daemon=True,
        )
        thread.start()

    def _record_progress_event(
        self,
        session_id: str,
        state: OrchestratorState | None,
        *,
        agent: str,
        subtask_id: str | None,
        stage: str,
        payload: Optional[Dict[str, Any]] = None,
        ts: Optional[datetime] = None,
    ) -> None:
        """Append a progress event, persist state, and log to progress_events.jsonl."""
        self._update_novel_phase_step(state)
        event = _append_progress_event(state, agent=agent, subtask_id=subtask_id, stage=stage, payload=payload, ts=ts)
        if state is None or event is None:
            return

        # Persist orchestrator state so polling sees the update immediately.
        try:
            self.save_orchestrator_state(state)
        except Exception:
            pass

        # Write a progress_event log entry for timeline reconstruction.
        try:
            log_path = self.store.logs_dir(session_id) / "progress_events.jsonl"
            log_path.parent.mkdir(parents=True, exist_ok=True)
            ts_val = event.get("ts")
            if isinstance(ts_val, datetime):
                ts_val = ts_val.isoformat()
            payload_obj = event.get("payload") or {}
            record = {
                "session_id": session_id,
                "agent": event.get("agent"),
                "subtask_id": event.get("subtask_id"),
                "stage": event.get("stage"),
                "status": event.get("status"),
                "payload": payload_obj,
                "ts": ts_val,
            }
            with log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False))
                f.write("\n")
                # Ensure data is flushed to disk to avoid race conditions
                f.flush()
                os.fsync(f.fileno())
            # Also mirror into envelopes.jsonl for downstream diagnostics/analytics.
            try:
                self.bus.log_progress_event(session_id, record)
            except Exception:
                pass
        except Exception:
            # Logging is best-effort; do not block orchestration.
            pass

    def save_orchestrator_state(self, state: OrchestratorState) -> None:
        """Save orchestrator state to orchestrator_state.json."""
        path = self._state_path(state.session_id)
        state.save(path)

    def load_orchestrator_state(self, session_id: str) -> OrchestratorState:
        """Load orchestrator state from orchestrator_state.json."""
        path = self._state_path(session_id)
        if not path.exists():
            raise FileNotFoundError(f"No state found for session {session_id}")
        return OrchestratorState.load(path)

    def init_session(
        self,
        topic: str,
        novel_mode: bool = False,
        novel_profile: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Plan, OrchestratorState]:
        """
        Initialize a new session with a topic.

        Returns:
            (session_id, plan, state)
        """
        session_id = self.store.create_session_id()
        print(f"Session created: {session_id}\\n")
        safe_profile = None
        try:
            safe_profile = dict(novel_profile) if isinstance(novel_profile, dict) else None
        except Exception:
            safe_profile = None
        outline = self._call_planner(topic, novel_profile=safe_profile)
        ref_outline = self.store.save_artifact(
            session_id,
            outline,
            kind="markdown",
            description="原始大纲/计划文本",
        )
        print("Outline saved:", ref_outline.path)
        plan = Plan.from_outline(topic, outline)

        # Novel mode: force use of t1-t4 structure
        if safe_profile:
            try:
                plan.subtasks = [
                    Subtask(**raw)
                    for raw in _build_novel_t1_t4(safe_profile, plan.title or topic)
                ]
            except Exception as e:
                print(f"WARNING: Failed to build t1-t4 with profile: {e}")
                # Fallback: use empty profile to ensure we still get t1-t4
                plan.subtasks = [
                    Subtask(**raw)
                    for raw in _build_novel_t1_t4({}, plan.title or topic)
                ]

            # Validation: ensure we have exactly 4 tasks in novel mode
            if len(plan.subtasks) != 4:
                print(f"ERROR: Novel mode requires 4 base tasks, got {len(plan.subtasks)}")
                print(f"Task IDs: {[s.id for s in plan.subtasks]}")
                # Force rebuild with minimal profile
                plan.subtasks = [
                    Subtask(**raw)
                    for raw in _build_novel_t1_t4({}, plan.title or topic)
                ]
                print(f"Rebuilt with {len(plan.subtasks)} tasks: {[s.id for s in plan.subtasks]}")

        ref_plan = self.store.save_artifact(
            session_id,
            plan.to_dict(),
            kind="json",
            description="结构化计划（子任务列表）",
        )
        print("Plan JSON saved:", ref_plan.path)
        self.bus.send(
            session_id=session_id,
            sender="planner",
            recipient="worker",
            payload_type="plan_created",
            payload={
                "topic": topic,
                "outline_artifact": ref_outline.to_payload(),
                "plan": plan.to_dict(),
                "plan_artifact": ref_plan.to_payload(),
            },
        )

        # Create and save initial state
        state = OrchestratorState(
            session_id=session_id,
            plan_id=plan.plan_id,
            status="idle",
            current_subtask_id=None,
            plan_locked=True if novel_mode else False,
            extra={
                "novel_mode": bool(novel_mode),
                "novel_profile": safe_profile or {},
            },
        )
        self.save_orchestrator_state(state)
        print(f"[INIT_SESSION] Novel mode: {novel_mode}, plan_locked: {state.plan_locked}")

        # Verify persistence
        log_path = self.store.root / f"sessions/{session_id}/orchestrator_state.json"
        if log_path.exists():
            import json
            with open(log_path) as f:
                saved_state = json.load(f)
                print(f"[INIT_SESSION] Verified plan_locked in file: {saved_state.get('plan_locked')}")
        else:
            print(f"[INIT_SESSION] WARNING: State file not found at {log_path}")

        self._last_outline_ref = ref_outline
        # Save compatible plan snapshot for quick recovery
        self.save_state(session_id, plan)
        return session_id, plan, state

    def run_next_pending_subtask(
        self,
        session_id: str,
        plan: Plan,
        state: OrchestratorState | None = None,
        interactive: bool = False,
        user_feedback_callback=None
    ) -> Plan:
        """
        执行下一个待处理的子任务。

        Args:
            session_id: 会话ID
            plan: 当前计划
            interactive: 是否启用交互模式（让用户审核）
            user_feedback_callback: 用户反馈回调函数 (worker_output) -> (decision, feedback)
                返回: ("accept"/"redo", "用户反馈内容") 或 None（使用自动审核）
        """
        subtask = self._next_pending_subtask(plan)
        if subtask is None:
            return plan
        print(f"\\n=== Subtask {subtask.id}: {subtask.title} ===")

        user_feedback_text = None  # 用户的修改要求

        while True:
            subtask.status = "in_progress"
            self._record_progress_event(
                session_id,
                state,
                agent="worker",
                subtask_id=subtask.id,
                stage="start",
                payload={"title": subtask.title, "session_id": session_id},
            )

            # 如果有用户反馈，把它传递给 Worker
            if user_feedback_text:
                worker_output = self._call_worker_with_feedback(
                    plan, subtask, user_feedback_text, state=state
                )
            else:
                worker_output = self._call_worker(plan, subtask, state=state)

            ref_work = self.store.save_artifact(
                session_id,
                worker_output,
                kind="markdown",
                description=f"子任务 {subtask.id} 的执行结果",
            )
            print(f"  Worker result saved: {ref_work.path}")
            print(f"  Worker output length: {len(worker_output)} chars")
            print(f"  Sending SUBTASK_RESULT for {subtask.id}")

            # Send envelope and verify it was written
            try:
                envelope = self.bus.send(
                    session_id=session_id,
                    sender="worker",
                    recipient="coordinator",
                    payload_type="subtask_result",
                    payload={
                        "subtask_id": subtask.id,
                        "subtask_title": subtask.title,
                        "result_artifact": ref_work.to_payload(),
                    },
                )
                print(f"  ✓ SUBTASK_RESULT envelope sent for {subtask.id}")

                # Verify the envelope was written to the log file
                log_path = self.bus.store.logs_dir(session_id) / "envelopes.jsonl"
                if not log_path.exists():
                    print(f"  ❌ ERROR: Envelope log not found at {log_path}")
                    log_path.parent.mkdir(parents=True, exist_ok=True)
                else:
                    # Count SUBTASK_RESULT envelopes in the file
                    import json
                    with open(log_path) as f:
                        lines = f.readlines()
                        subtask_results = [l for l in lines if '"payload_type": "subtask_result"' in l or '"payload_type": "SUBTASK_RESULT"' in l]
                        print(f"  ✓ Envelope log exists with {len(subtask_results)} SUBTASK_RESULT entries")
            except Exception as e:
                print(f"  ❌ ERROR: Failed to send/verify envelope for {subtask.id}: {e}")
                raise
            if state is not None:
                try:
                    state.worker_outputs.append(
                        WorkerOutputState(
                            subtask_id=subtask.id,
                            title=subtask.title,
                            artifact=ref_work,
                            timestamp=datetime.utcnow(),
                        )
                    )
                    # Persist worker output immediately for polling clients.
                    self.save_orchestrator_state(state)
                except Exception:
                    # Keep orchestration running even if the in-memory cache fails
                    pass
            _record_recent_worker_output(
                state,
                subtask,
                worker_output,
                artifact_path=ref_work.path if ref_work else None,
            )
            # Cache output on subtask and refresh novel summary if applicable
            try:
                subtask.output = worker_output
                print(f"  Cached output on subtask {subtask.id}")
            except Exception as e:
                print(f"  WARNING: Failed to cache output on subtask: {e}")
                pass

            # Update novel summary for t1-t4
            if state and state.extra.get("novel_mode"):
                print(f"  Updating novel summary (novel mode active)")
            _update_novel_summary(state, plan, self.store)

            self._record_progress_event(
                session_id,
                state,
                agent="worker",
                subtask_id=subtask.id,
                stage="finish",
                payload={"artifact_path": ref_work.path, "session_id": session_id},
            )

            # 交互模式：让用户审核
            if interactive and user_feedback_callback:
                self._record_progress_event(
                    session_id,
                    state,
                    agent="reviewer",
                    subtask_id=subtask.id,
                    stage="start",
                    payload={"mode": "interactive", "session_id": session_id},
                )
                user_decision = user_feedback_callback(worker_output)

                if user_decision is None:
                    # 用户选择让 AI 审核
                    decision_text = self._call_coordinator(plan, subtask, worker_output, state=state)
                    decision, reason, revised_text = _parse_reviewer_response(decision_text)
                    if revised_text:
                        reason = reason or "Reviewer provided revised text."
                        _cache_reviewer_revision_entry(
                            state,
                            subtask.id,
                            text=revised_text,
                            artifact_path=ref_work.path if ref_work else None,
                        )
                    user_feedback_text = None
                else:
                    decision_type, feedback = user_decision
                    decision = "ACCEPT" if decision_type == "accept" else "REDO"
                    reason = f"用户反馈: {feedback}"
                    revised_text = None
                    user_feedback_text = feedback if decision == "REDO" else None

                    # 记录用户反馈
                    self.bus.send(
                        session_id=session_id,
                        sender="user",
                        recipient="worker",
                        payload_type="user_feedback",
                        payload={
                            "subtask_id": subtask.id,
                            "decision": decision_type,
                            "feedback": feedback,
                        },
                    )
            else:
                # 自动模式：AI 审核（批次）
                self._record_progress_event(
                    session_id,
                    state,
                    agent="reviewer",
                    subtask_id=subtask.id,
                    stage="start",
                    payload={"mode": "auto", "session_id": session_id},
                )

                decision = "ACCEPT"
                reason = ""
                revised_text = None
                batch_mode = bool(
                    subtask.id not in {"t1", "t2", "t3", "t4"}
                    and getattr(state, "extra", {}).get("novel_mode")
                )
                coordinator_called = False

                if batch_mode:
                    batch_ready = self._enqueue_reviewer_batch_task(
                        state,
                        subtask,
                        worker_output,
                        artifact_ref_path=ref_work.path if ref_work else None,
                    )
                    if batch_ready:
                        batch_tasks = list(state.extra.get("reviewer_batch_tasks") or [])
                        batch_context = self._build_reviewer_batch_context(state) or ""
                        decision_text = self._call_coordinator(
                            plan,
                            subtask,
                            worker_output,
                            state=state,
                            batch_context=batch_context,
                        )
                        decision, reason, revised_text = _parse_reviewer_response(decision_text)
                        self._finalize_reviewer_batch(
                            state,
                            batch_tasks,
                            batch_context,
                            decision,
                            reason,
                            revised_text,
                        )
                        coordinator_called = True
                else:
                    decision_text = self._call_coordinator(plan, subtask, worker_output, state=state)
                    decision, reason, revised_text = _parse_reviewer_response(decision_text)
                    coordinator_called = True
                    if revised_text:
                        reason = reason or "Reviewer provided revised text."
                        _cache_reviewer_revision_entry(
                            state,
                            subtask.id,
                            text=revised_text,
                            artifact_path=ref_work.path if ref_work else None,
                        )

                if not coordinator_called:
                    decision = "ACCEPT"
                    reason = "等待批次满 3 个任务后再复核。"
                    revised_text = None
                user_feedback_text = None

            self._record_progress_event(
                session_id,
                state,
                agent="reviewer",
                subtask_id=subtask.id,
                stage="finish",
                payload={
                    "decision": decision,
                    "reason": reason,
                    "session_id": session_id,
                },
            )
            if decision == "ACCEPT":
                subtask.status = "done"
                subtask.notes = reason
                if subtask.id == "t4":
                    self._append_chapter_tasks_from_planner_stub(session_id, plan, state)
                print("  Decision: ACCEPT")
            else:
                subtask.status = "pending"
                subtask.notes = reason
                print("  Decision: REDO（将重做该子任务）")

            self.bus.send(
                session_id=session_id,
                sender="coordinator",
                recipient="worker",
                payload_type="coord_decision",
                payload={
                    "subtask_id": subtask.id,
                    "decision": decision,
                    "reason": reason,
                },
            )

            if decision == "ACCEPT":
                break
        return plan

    def _call_worker_with_feedback(self, plan: Plan, subtask: Subtask, user_feedback: str, state: OrchestratorState | None = None) -> str:
        """
        调用 Worker，并传入用户的修改要求
        """
        extra_ctx = _novel_extra_context(state, plan, subtask)
        return self.worker.run(
            build_worker_prompt(
                plan,
                subtask,
                topic=plan.title,
                user_feedback=user_feedback,
                extra_context=extra_ctx,
            )
        )

    def run_all(self, topic: str) -> dict:
        session_id, plan, state = self.init_session(topic)
        while self._has_pending_subtasks(plan):
            plan = self.run_next_pending_subtask(session_id, plan, state=state)
            self.save_orchestrator_state(state)
        ref_final_plan = self.store.save_artifact(
            session_id,
            plan.to_dict(),
            kind="json",
            description="最终计划状态（包含各子任务 status/notes）",
        )
        print("\\nFinal plan saved:", ref_final_plan.path)
        print("\\nAll artifacts saved under:")
        print(f"multi_agent_platform/sessions/{session_id}/artifacts/")
        return {
            "session_id": session_id,
            "plan": ref_final_plan,
            "outline": self._last_outline_ref,
            "state": state,
        }

    def answer_user_question(self, session_id: str, plan: Plan, user_input: str) -> str:
        """
        让 coordinator 根据 plan 解释当前进度/回答用户问题。
        现在包含更丰富的上下文：当前计划、最后的工作产物、最后的协调决策。
        """
        try:
            plan_summary = plan.to_brief_text()
        except AttributeError:
            lines = [f"Plan: {plan.title} (id={plan.plan_id})"]
            for subtask in plan.subtasks:
                lines.append(f"- [{subtask.status}] {subtask.id}: {subtask.title}")
            plan_summary = "\n".join(lines)

        # 收集额外上下文
        context_parts = [f"当前计划概况：\n{plan_summary}"]

        # 1. 找到最后完成的子任务及其产物
        last_done_subtask = None
        for subtask in reversed(plan.subtasks):
            if subtask.status == "done":
                last_done_subtask = subtask
                break

        if last_done_subtask:
            context_parts.append(
                f"\n最近完成的子任务：\n"
                f"  - {last_done_subtask.id}: {last_done_subtask.title}\n"
                f"  - 协调意见: {last_done_subtask.notes[:200] if last_done_subtask.notes else '无'}"
            )

            # 尝试读取最后的工作产物（简要内容）
            try:
                # 从 logs 中找最近的 subtask_result
                logs_file = self.store.logs_dir(session_id) / "envelopes.jsonl"
                if logs_file.exists():
                    last_artifact_path = None
                    with logs_file.open("r", encoding="utf-8") as f:
                        for line in f:
                            if not line.strip():
                                continue
                            envelope = json.loads(line)
                            if (envelope.get("payload_type") == "subtask_result" and
                                envelope.get("payload", {}).get("subtask_id") == last_done_subtask.id):
                                artifact_info = envelope.get("payload", {}).get("result_artifact", {})
                                last_artifact_path = artifact_info.get("path")

                    if last_artifact_path:
                        from pathlib import Path
                        artifact_full_path = Path(self.store.root.parent) / last_artifact_path
                        if artifact_full_path.exists():
                            with artifact_full_path.open("r", encoding="utf-8") as f:
                                content = f.read()
                                preview = content[:300] + "..." if len(content) > 300 else content
                                context_parts.append(f"\n最近产物预览：\n{preview}")
            except Exception:
                pass  # 如果读取失败就跳过

        # 2. 找到当前进行中的子任务
        current_subtask = None
        for subtask in plan.subtasks:
            if subtask.status == "in_progress":
                current_subtask = subtask
                break

        if current_subtask:
            context_parts.append(
                f"\n当前进行中的子任务：\n  - {current_subtask.id}: {current_subtask.title}"
            )

        # 3. 找到下一个待执行的子任务
        next_subtask = None
        for subtask in plan.subtasks:
            if subtask.status == "pending":
                next_subtask = subtask
                break

        if next_subtask:
            context_parts.append(
                f"\n下一个待执行的子任务：\n  - {next_subtask.id}: {next_subtask.title}"
            )

        full_context = "\n".join(context_parts)

        messages = [
            {"role": "system", "content": COORDINATOR_CHAT_PROMPT},
            {"role": "system", "content": full_context},
            {"role": "user", "content": user_input},
        ]

        reply = self.coordinator.run(messages)

        # 记录这次问答到日志
        self.bus.send(
            session_id=session_id,
            sender="coordinator",
            recipient="user",
            payload_type="coord_response",
            payload={"question": user_input, "response": reply},
        )

        return reply

    def handle_planning_turn(
        self,
        session_id: str,
        plan: Plan,
        state: OrchestratorState,
        user_text: str,
    ) -> tuple[Plan, str]:
        """
        Entry point for planning-phase user messages. Currently delegates to existing answer logic.
        """
        if state.plan_locked:
            return plan, self.answer_user_question(session_id, plan, user_text)
        text = (user_text or "").strip()
        if text:
            state.planner_chat.append(
                PlannerChatMessage(role="user", content=text, ts=datetime.utcnow())
            )
        state.planner_chat.append(
            PlannerChatMessage(
                role="planner",
                content="Planner (placeholder): 已收到你的输入。接下来规划阶段会整合你的想法为初步大纲。",
                ts=datetime.utcnow(),
            )
        )
        if USE_REAL_PLANNER:
            _require_real_planner()
            plan_dict = plan.to_dict() if hasattr(plan, "to_dict") else None

            subtasks_dicts: List[Dict[str, Any]] = []
            for s in plan.subtasks or []:
                try:
                    subtasks_dicts.append(s.to_dict())
                except AttributeError:
                    subtasks_dicts.append(
                        {
                            "subtask_id": getattr(s, "id", None) or getattr(s, "subtask_id", None),
                            "title": s.title,
                            "description": getattr(s, "description", ""),
                            "status": getattr(s, "status", "pending"),
                            "notes": getattr(s, "notes", ""),
                        }
                    )

            result = run_planner_agent(
                planner_chat=[msg.dict() if hasattr(msg, "dict") else msg for msg in state.planner_chat],
                plan=plan_dict,
                subtasks=subtasks_dicts,
                latest_user_input=text,
            )
            plan = _apply_planner_result_to_state(
                state,
                result,
                fallback_user_text=text,
                existing_plan=plan,
                novel_profile=getattr(state, "extra", {}).get("novel_profile") if getattr(state, "extra", None) else None,
            )
        else:
            plan = generate_stub_plan_from_planning_input(
                plan,
                text,
                novel_profile=getattr(state, "extra", {}).get("novel_profile") if getattr(state, "extra", None) else None,
            )
        answer = self.answer_user_question(session_id, plan, user_text)
        return plan, answer

    def save_state(self, session_id: str, plan: Plan) -> Path:
        """
        保存当前会话状态到 state.json，用于断点续跑。
        包括：session_id, plan（完整的子任务状态）
        """
        state_data = {
            "session_id": session_id,
            "plan": plan.to_dict(),
        }

        state_file = self.store.session_dir(session_id) / "state.json"
        state_file.parent.mkdir(parents=True, exist_ok=True)

        with state_file.open("w", encoding="utf-8") as f:
            json.dump(state_data, f, ensure_ascii=False, indent=2)

        return state_file

    def load_state(self, session_id: str) -> tuple[str, Plan] | None:
        """
        从 state.json 恢复会话状态。
        返回 (session_id, plan)，如果文件不存在返回 None。
        """
        state_file = self.store.session_dir(session_id) / "state.json"

        if not state_file.exists():
            return None

        with state_file.open("r", encoding="utf-8") as f:
            state_data = json.load(f)

        session_id_loaded = state_data["session_id"]
        plan = Plan.from_dict(state_data["plan"])

        return session_id_loaded, plan

    def _load_plan(self, session_id: str) -> Plan:
        """
        Load the Plan object for a session.
        """
        result = self.load_state(session_id)
        if result is None:
            raise FileNotFoundError(f"No plan snapshot found for session {session_id}")
        _, plan = result
        return plan

    def _persist_plan_state(self, session_id: str, plan: Plan, state: OrchestratorState) -> None:
        """
        Persist the plan and orchestrator state for a session.
        """
        self._update_novel_phase_step(state)
        self.save_state(session_id, plan)
        self.save_orchestrator_state(state)

    def _auto_trigger_redo_from_logs(self, session_id: str, plan: Plan, state: OrchestratorState) -> None:
        """
        If the latest coord_decision logs contain a REDO, enqueue TRIGGER_REDO and consume it.
        Avoids waiting for a manual orchestrator turn when reviewer marks redo asynchronously.
        """
        try:
            log_path = self.store.logs_dir(session_id) / "envelopes.jsonl"
            envelopes = _read_log_entries(log_path)
        except Exception:
            return

        latest: Dict[str, Dict[str, Any]] = {}
        for env in envelopes:
            payload_type = (env.get("payload_type") or "").lower()
            if payload_type != "coord_decision":
                continue
            payload = env.get("payload", {}) or {}
            sub_id = payload.get("subtask_id")
            if not sub_id:
                continue
            ts = env.get("timestamp") or ""
            existing = latest.get(sub_id)
            if existing and existing.get("timestamp", "") >= ts:
                continue
            latest[sub_id] = {
                "decision": (payload.get("decision") or "").lower(),
                "reason": payload.get("reason") or "",
                "timestamp": ts,
            }

        if not latest:
            return

        processed: Dict[str, str] = {}
        try:
            if isinstance(state.extra.get("processed_redo_decisions"), dict):
                processed.update(state.extra.get("processed_redo_decisions"))
        except Exception:
            processed = {}

        new_events: list[Dict[str, Any]] = []
        existing_targets = {
            str(ev.get("target_subtask_id"))
            for ev in state.orch_events
            if isinstance(ev, dict) and ev.get("kind") == "TRIGGER_REDO"
        }

        for sub_id, info in latest.items():
            ts = info.get("timestamp", "")
            if info.get("decision") != "redo":
                continue
            if ts and processed.get(str(sub_id), "") >= ts:
                continue
            if str(sub_id) in existing_targets:
                processed[str(sub_id)] = ts or processed.get(str(sub_id), "")
                continue

            instructions = info.get("reason") or f"Redo requested by reviewer at {ts or 'latest'}"
            new_events.append(
                {
                    "kind": "TRIGGER_REDO",
                    "target_subtask_id": sub_id,
                    "instructions": instructions,
                    "source": "coord_decision",
                    "ts": ts or None,
                }
            )
            if ts:
                processed[str(sub_id)] = ts

        if not new_events:
            return

        state.orch_events.extend(new_events)
        state.extra["processed_redo_decisions"] = processed
        consume_orchestrator_events(state, plan)
        self._persist_plan_state(session_id, plan, state)

    def _render_session_snapshot(
        self,
        session_id: str,
        command: str,
        plan: Plan,
        state: OrchestratorState,
        message: str,
        *,
        ok: bool = True,
        mode: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        _ = plan
        # Auto-trigger redo if reviewer logs contain a REDO decision written outside the orchestrator loop.
        self._auto_trigger_redo_from_logs(session_id, plan, state)
        snapshot = build_session_snapshot(
            self.store,
            state,
            self.bus,
        )
        snapshot.message = message
        snapshot.command = command
        snapshot.ok = ok
        snapshot.mode = mode
        snapshot.context = context
        return snapshot.to_dict()

    def list_sessions(self) -> list[str]:
        """
        列出所有可用的 session_id（已保存 state.json 的会话）。
        """
        sessions = []
        if not self.store.root.exists():
            return sessions

        for session_dir in self.store.root.iterdir():
            if session_dir.is_dir() and (session_dir / "state.json").exists():
                sessions.append(session_dir.name)

        return sorted(sessions, reverse=True)  # 按时间倒序

    def run_next_with_state(
        self, session_id: str, plan: Plan, state: OrchestratorState
    ) -> Tuple[Plan, OrchestratorState]:
        """
        State-aware version of run_next_pending_subtask (simplified, non-interactive).

        Returns:
            (updated_plan, updated_state)
        """
        subtask = self._next_pending_subtask(plan)
        if subtask is None:
            return plan, state

        # Update state: running
        state.status = "running"
        state.current_subtask_id = subtask.id
        self.save_orchestrator_state(state)

        # Call the existing run_next_pending_subtask for actual execution
        plan = self.run_next_pending_subtask(session_id, plan, state=state)

        # Update state: back to idle
        state.status = "idle"
        state.current_subtask_id = None
        self.save_orchestrator_state(state)

        return plan, state

    def run_all_pending(
        self,
        session_id: str,
        plan: Plan,
        state: OrchestratorState,
    ) -> Tuple[Plan, OrchestratorState]:
        """
        Execute all remaining subtasks using the state-aware runner.
        """
        state.status = "running"
        self.save_orchestrator_state(state)

        while self._has_pending_subtasks(plan):
            plan, state = self.run_next_with_state(session_id, plan, state)

        state.status = "completed"
        self.save_orchestrator_state(state)
        return plan, state

    def execute_command(
        self,
        session_id: str,
        command: str,
        payload: dict | None = None,
        interactive_coordinator=None,
    ) -> Dict[str, Any]:
        """
        Unified command entry point for CLI/API.

        Args:
            session_id: Session ID
            command: Command keyword or user text
            payload: Optional data for commands like "ask"
            interactive_coordinator: Optional coordinator for review loops

        Returns:
            SessionSnapshot dict representing the current session.
        """
        payload = payload or {}
        normalized = (command or "").strip()
        plan = self._load_plan(session_id)
        state = self.load_orchestrator_state(session_id)

        if not normalized:
            snapshot = self._render_session_snapshot(
                session_id,
                command,
                plan,
                state,
                message="空命令",
                ok=False,
            )
            self._persist_plan_state(session_id, plan, state)
            return snapshot

        # Interactive review branch
        if interactive_coordinator and interactive_coordinator.is_reviewing():
            state.add_orchestrator_message(role="user", content=normalized)
            run_orchestrator_turn(state, normalized)
            plan, message = interactive_coordinator.process_user_input(
                session_id, plan, normalized
            )
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=message,
                mode=interactive_coordinator.get_mode(),
                context=interactive_coordinator.get_context(),
            )

        cmd_lower = normalized.lower()
        bare_cmd = cmd_lower.lstrip("/")

        # Prevent re-entrant execution while a background run is active.
        if state.status == "running" and bare_cmd in {"next", "all"}:
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message="已有执行在进行中，请稍候再试",
                ok=False,
            )

        # Block plan edits after plan is locked
        if state.plan_locked and bare_cmd in PLAN_EDITING_KINDS:
            state.add_orchestrator_message(
                "orchestrator",
                (
                    "The plan is locked. Direct plan editing commands are disabled in execution phase. "
                    "Please describe the change you want in natural language, and I will update the plan for you."
                ),
            )
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message="Plan editing is disabled after lock.",
                ok=False,
            )

        if bare_cmd == "plan":
            message = "当前计划"
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id, normalized, plan, state, message=message
            )

        if bare_cmd == "confirm_plan":
            if state.plan_locked:
                message = "Plan already locked."
            else:
                state.plan_locked = True
                state.add_orchestrator_message(
                    role="orchestrator",
                    content="Plan has been locked; execution phase can begin.",
                )
                message = "Plan locked."
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id, normalized, plan, state, message=message
            )

        if bare_cmd == "next":
            if not self._has_pending_subtasks(plan):
                message = "所有子任务已经完成"
                self._persist_plan_state(session_id, plan, state)
                return self._render_session_snapshot(
                    session_id, normalized, plan, state, message=message
                )

            if interactive_coordinator:
                subtask = self._next_pending_subtask(plan)
                if not subtask:
                    self._persist_plan_state(session_id, plan, state)
                    return self._render_session_snapshot(
                        session_id,
                        normalized,
                        plan,
                        state,
                        message="没有待执行的子任务",
                        ok=False,
                    )

                print(f"\n▶ 正在执行: {subtask.id} - {subtask.title}")
                subtask.status = "in_progress"
                self._record_progress_event(
                    session_id,
                    state,
                    agent="worker",
                    subtask_id=subtask.id,
                    stage="start",
                    payload={"title": subtask.title, "session_id": session_id},
                )
                worker_output = self._call_worker(plan, subtask)

                ref_work = self.store.save_artifact(
                    session_id,
                    worker_output,
                    kind="markdown",
                    description=f"子任务 {subtask.id} 的执行结果",
                )
                self._record_progress_event(
                    session_id,
                    state,
                    agent="worker",
                    subtask_id=subtask.id,
                    stage="finish",
                    payload={"artifact_path": ref_work.path, "session_id": session_id},
                )
                _record_recent_worker_output(
                    state,
                    subtask,
                    worker_output,
                    artifact_path=ref_work.path,
                )

                interactive_coordinator.enter_review_mode(
                    session_id, subtask, worker_output, ref_work
                )
                self._record_progress_event(
                    session_id,
                    state,
                    agent="reviewer",
                    subtask_id=subtask.id,
                    stage="start",
                    payload={"mode": "interactive", "session_id": session_id},
                )

                self._persist_plan_state(session_id, plan, state)

                preview = (
                    worker_output[:500] + "..." if len(worker_output) > 500 else worker_output
                )
                message = (
                    f"📄 Worker 产出:\n\n{preview}\n\n"
                    f"💬 满意吗？\n  - 回复 '好' 或 '接受' 来确认\n"
                    f"  - 说明修改要求，例如 '不，改成蓝色的龙'"
                )

                return self._render_session_snapshot(
                    session_id,
                    normalized,
                    plan,
                    state,
                    message=message,
                    mode=interactive_coordinator.get_mode(),
                    context=interactive_coordinator.get_context(),
                )
            else:
                # Fire-and-return: mark running and kick off background execution.
                subtask = self._next_pending_subtask(plan)
                if subtask:
                    state.status = "running"
                    state.current_subtask_id = subtask.id
                self._persist_plan_state(session_id, plan, state)

                def _run_next_bg() -> None:
                    self.run_next_with_state(session_id, plan, state)
                    self._persist_plan_state(session_id, plan, state)

                self._start_background_task(session_id, "next", _run_next_bg)
                return self._render_session_snapshot(
                    session_id,
                    normalized,
                    plan,
                    state,
                    message="已触发后台执行一个子任务",
                )

        if bare_cmd == "set_current_subtask":
            subtask_id = payload.get("subtask_id")
            if not subtask_id:
                message = "请提供 subtask_id"
                ok = False
            else:
                target = self._find_subtask(plan, subtask_id)
                if not target:
                    message = f"未找到子任务 {subtask_id}"
                    ok = False
                else:
                    state.current_subtask_id = subtask_id
                    message = f"当前步骤已设为 {target.id}: {target.title}"
                    ok = True
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=message,
                ok=ok,
            )

        if bare_cmd == "update_subtask":
            subtask_id = payload.get("subtask_id")
            patch = payload.get("patch") or {}
            if not subtask_id:
                message = "请提供 subtask_id"
                ok = False
            else:
                target = self._find_subtask(plan, subtask_id)
                if not target:
                    message = f"未找到子任务 {subtask_id}"
                    ok = False
                else:
                    if not isinstance(patch, dict) or not patch:
                        message = "patch 为空或格式错误"
                        ok = False
                    else:
                        changes = []
                        for field in ("title", "notes", "status"):
                            if field in patch:
                                setattr(target, field, patch[field])
                                changes.append(field)
                        if not changes:
                            message = "patch 没有可更新的字段"
                            ok = False
                        else:
                            message = f"已更新子任务 {target.id} 的字段：{', '.join(changes)}"
                            ok = True
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=message,
                ok=ok,
            )

        if bare_cmd == "insert_subtask":
            title = payload.get("title")
            if not title:
                message = "请提供 title"
                ok = False
            else:
                after_id = payload.get("after_id")
                insert_index = len(plan.subtasks)
                if after_id:
                    after_idx = self._find_subtask_index(plan, after_id)
                    if after_idx is None:
                        message = f"未找到 after_id: {after_id}"
                        ok = False
                        self._persist_plan_state(session_id, plan, state)
                        return self._render_session_snapshot(
                            session_id,
                            normalized,
                            plan,
                            state,
                            message=message,
                            ok=False,
                        )
                    insert_index = after_idx + 1
                new_id = payload.get("subtask_id") or self._generate_subtask_id(plan)
                new_subtask = Subtask(
                    id=new_id,
                    title=title,
                    status=payload.get("status", "pending"),
                    notes=payload.get("notes", ""),
                )
                plan.subtasks.insert(insert_index, new_subtask)
                message = f"已插入子任务 {new_subtask.id}: {new_subtask.title}"
                ok = True
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=message,
                ok=ok,
            )

        if bare_cmd == "append_subtask":
            title = payload.get("title")
            if not title:
                message = "请提供 title"
                ok = False
            else:
                new_id = payload.get("subtask_id") or self._generate_subtask_id(plan)
                new_subtask = Subtask(
                    id=new_id,
                    title=title,
                    status=payload.get("status", "pending"),
                    notes=payload.get("notes", ""),
                )
                plan.subtasks.append(new_subtask)
                message = f"已追加子任务 {new_subtask.id}: {new_subtask.title}"
                ok = True
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=message,
                ok=ok,
            )

        if bare_cmd == "apply_reviewer_revision":
            subtask_id = payload.get("subtask_id")
            revisions = {}
            try:
                revisions = getattr(state, "extra", {}).get("reviewer_revisions", {}) or {}
            except Exception:
                revisions = {}
            if not subtask_id:
                message = "请提供 subtask_id"
                ok = False
            elif not revisions or str(subtask_id) not in revisions:
                message = "未找到该子任务的 reviewer revised_text"
                ok = False
            else:
                target = self._find_subtask(plan, str(subtask_id))
                if not target:
                    message = f"未找到子任务 {subtask_id}"
                    ok = False
                else:
                    raw_revision = revisions.get(str(subtask_id))
                    if isinstance(raw_revision, dict):
                        revision_text = raw_revision.get("text") or ""
                    else:
                        revision_text = str(raw_revision)
                    try:
                        ref_revision = self.store.save_artifact(
                            session_id,
                            revision_text,
                            kind="markdown",
                            description=f"Reviewer revision applied for {target.id}",
                        )
                        target.output = revision_text
                        target.status = "done"
                        note_prefix = "[adopted reviewer revision]"
                        target.notes = f"{note_prefix} {target.notes or ''}".strip()
                        # ✅ Phase 5 Fix: Do NOT add reviewer revision to worker_outputs
                        # Reviewer revisions are already stored in:
                        # 1. target.notes (for display in subtask notes)
                        # 2. state.extra.reviewer_revisions (for structured access)
                        # Adding to worker_outputs causes "reviewer comments appearing in worker output"
                        if state is not None:
                            if state.extra is None:
                                state.extra = {}
                            inflight = state.extra.get("novel_inflight_batch")
                            if isinstance(inflight, dict):
                                inflight.setdefault("applied_subtasks", []).append(target.id)
                                inflight["applied_at"] = datetime.utcnow().isoformat()
                                state.extra["novel_inflight_batch"] = inflight
                            _record_recent_worker_output(
                                state,
                                target,
                                revision_text,
                                artifact_path=ref_revision.path,
                            )
                            _update_novel_summary(state, plan, self.store)
                        message = f"已采纳 reviewer 修订并写回子任务 {target.id}"
                        ok = True
                    except Exception as exc:
                        message = f"采纳失败：{exc}"
                        ok = False
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=message,
                ok=ok,
            )

        if bare_cmd == "skip_subtask":
            subtask_id = payload.get("subtask_id")
            reason = payload.get("reason") or payload.get("notes")
            if not subtask_id:
                message = "请提供 subtask_id"
                ok = False
            else:
                target = self._find_subtask(plan, subtask_id)
                if not target:
                    message = f"未找到子任务 {subtask_id}"
                    ok = False
                else:
                    target.status = "skipped"
                    if reason:
                        target.notes = reason
                    if state.current_subtask_id == subtask_id:
                        state.current_subtask_id = None
                    message = f"已跳过子任务 {target.id}：{target.title}"
                    if reason:
                        message += f"（原因：{reason}）"
                    ok = True
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=message,
                ok=ok,
            )

        if bare_cmd == "all":
            # Fire-and-return: mark running and execute all pending subtasks in background.
            first_subtask = self._next_pending_subtask(plan)
            state.status = "running"
            state.current_subtask_id = first_subtask.id if first_subtask else None
            self._persist_plan_state(session_id, plan, state)

            def _run_all_bg() -> None:
                self.run_all_pending(session_id, plan, state)
                self._persist_plan_state(session_id, plan, state)

            self._start_background_task(session_id, "all", _run_all_bg)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message="已触发后台执行所有待处理子任务",
            )

        if bare_cmd == "ask":
            question = payload.get("question") or payload.get("prompt") or ""
            if not question:
                self._persist_plan_state(session_id, plan, state)
                return self._render_session_snapshot(
                    session_id,
                    normalized,
                    plan,
                    state,
                    message="请提供问答内容",
                    ok=False,
                )
            state.add_orchestrator_message(role="user", content=question)
            run_orchestrator_turn(state, question)
            if not state.plan_locked:
                plan, answer = self.handle_planning_turn(session_id, plan, state, question)
            else:
                answer = self.answer_user_question(session_id, plan, question)
                consume_orchestrator_events(state, plan)
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=answer,
            )

        # Natural language / fallback handling
        if interactive_coordinator:
            state.add_orchestrator_message(role="user", content=normalized)
            run_orchestrator_turn(state, normalized)
            plan, message = interactive_coordinator.process_user_input(
                session_id, plan, normalized
            )
            consume_orchestrator_events(state, plan)
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=message,
                mode=interactive_coordinator.get_mode(),
                context=interactive_coordinator.get_context(),
            )
        else:
            state.add_orchestrator_message(role="user", content=normalized)
            run_orchestrator_turn(state, normalized)
            answer = self.answer_user_question(session_id, plan, normalized)
            consume_orchestrator_events(state, plan)
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message=answer,
            )

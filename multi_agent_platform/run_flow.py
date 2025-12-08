from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple, Optional, Dict, Any
from datetime import datetime

from .agent_runner import Agent
from .message_bus import MessageBus
from .orchestrator_intent_agent import run_orchestrator_intent_agent
from .prompt_registry import (
    COORDINATOR_CHAT_PROMPT,
    COORDINATOR_PROMPT,
    PLANNER_PROMPT,
    WORKER_PROMPT,
    build_coordinator_review_prompt,
    build_worker_prompt,
)
from .session_state import OrchestratorState, PlannerChatMessage, build_session_snapshot

PLAN_EDITING_KINDS = {
    "set_current_subtask",
    "update_subtask",
    "insert_subtask",
    "append_subtask",
    "skip_subtask",
}

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

def consume_orchestrator_events(state: OrchestratorState, plan: Plan | None = None) -> None:
    """v0.2: true action consumer — handles structured events produced by the intent agent."""

    new_events = []
    pending = list(state.orch_events or [])
    for ev in pending:
        payload = ev if isinstance(ev, dict) else getattr(ev, "payload", {}) or {}
        kind = payload.get("kind") or getattr(ev, "kind", None)

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
                        subtask.notes = f"{subtask.notes}\n{note_prefix}".strip()
                    target_label = subtask.id or target_index
            elif hasattr(state, "subtasks") and target is not None:
                # Fallback for state-managed subtasks
                try:
                    if 0 <= target < len(state.subtasks):
                        state.subtasks[target].needs_redo = True
                except Exception:
                    pass

            state.add_orchestrator_message(
                "orchestrator",
                f"I'll revise subtask {target_label} based on your instructions: {instr}"
            )

            new_events.append({
                "kind": "TRIGGER_REDO",
                "target_subtask_id": target,
                "instructions": instr,
            })

        # === PLAN CHANGE ===
        elif kind == "REQUEST_PLAN_UPDATE":
            instr = payload.get("instructions")

            if plan is not None:
                if hasattr(plan, "notes"):
                    plan.notes = f"(Updated by orchestrator) {instr}"
                else:
                    setattr(plan, "notes", f"(Updated by orchestrator) {instr}")

            state.add_orchestrator_message(
                "orchestrator",
                f"Plan updated based on your request: {instr}"
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
                worker_output = run_worker_for_subtask(plan, subtask, instr)
                subtask.output = worker_output
                subtask.needs_redo = False

            # 2) reviewer eval (stubbed)
            review = run_reviewer_on_output(plan, subtask, worker_output) if subtask else {"decision": "accept", "notes": ""}
            decision = review.get("decision", "").lower()
            notes = review.get("notes", "")

            # 3) update state/subtask status
            if subtask:
                subtask.notes = notes or subtask.notes
                if decision == "redo":
                    subtask.status = "pending"
                    subtask.needs_redo = True
                else:
                    subtask.status = "done"
                    subtask.needs_redo = False

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
                f"Unhandled event type: {kind}"
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
        "target_subtask_id": action.target_subtask_id,
        "instructions": action.instructions,
        "needs_redo": action.needs_redo,
        "raw_text": action.raw_text,
    })

    state.add_orchestrator_message(
        role="orchestrator",
        content=f"[intent-parser] Classified user request as {action.kind}",
        ts=ts,
    )


def generate_stub_plan_from_planning_input(plan: Plan, user_text: str) -> Plan:
    """
    Populate/update a placeholder plan and subtasks based on planning input.
    This will be replaced by a real planner in a later step.
    """
    text = (user_text or "").strip()
    if not text:
        return plan

    snippet = text[:40]

    if not plan.title:
        plan.title = f"规划草稿：{snippet}"

    if not plan.subtasks:
        plan.subtasks = [
            Subtask(id="t1", title="Outline Step 1（占位）：梳理关键主题"),
            Subtask(id="t2", title="Outline Step 2（占位）：起草结构要点"),
        ]
    else:
        # Light-touch update to reflect latest intent in notes/titles
        first = plan.subtasks[0]
        if not first.title:
            first.title = "Outline Step 1（占位）：梳理关键主题"
        if not first.notes:
            first.notes = f"最新规划输入: {snippet}"

    return plan

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

    def _call_planner(self, topic: str) -> str:
        return self.planner.run(
            f"请为下面的主题生成一个分步骤的计划，每个子任务一句话：\\n\\n主题：{topic}"
        )

    def _call_worker(self, plan: Plan, subtask: Subtask) -> str:
        return self.worker.run(
            build_worker_prompt(plan, subtask, topic=plan.title)
        )

    def _call_coordinator(self, plan: Plan, subtask: Subtask, worker_output: str) -> str:
        return self.coordinator.run(
            build_coordinator_review_prompt(plan, subtask, worker_output)
        )

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
    ) -> Tuple[str, Plan, OrchestratorState]:
        """
        Initialize a new session with a topic.

        Returns:
            (session_id, plan, state)
        """
        session_id = self.store.create_session_id()
        print(f"Session created: {session_id}\\n")
        outline = self._call_planner(topic)
        ref_outline = self.store.save_artifact(
            session_id,
            outline,
            kind="markdown",
            description="原始大纲/计划文本",
        )
        print("Outline saved:", ref_outline.path)
        plan = Plan.from_outline(topic, outline)
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
        )
        self.save_orchestrator_state(state)

        self._last_outline_ref = ref_outline
        # Save compatible plan snapshot for quick recovery
        self.save_state(session_id, plan)
        return session_id, plan, state

    def run_next_pending_subtask(
        self,
        session_id: str,
        plan: Plan,
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

            # 如果有用户反馈，把它传递给 Worker
            if user_feedback_text:
                worker_output = self._call_worker_with_feedback(
                    plan, subtask, user_feedback_text
                )
            else:
                worker_output = self._call_worker(plan, subtask)

            ref_work = self.store.save_artifact(
                session_id,
                worker_output,
                kind="markdown",
                description=f"子任务 {subtask.id} 的执行结果",
            )
            print("  Worker result saved:", ref_work.path)
            self.bus.send(
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

            # 交互模式：让用户审核
            if interactive and user_feedback_callback:
                user_decision = user_feedback_callback(worker_output)

                if user_decision is None:
                    # 用户选择让 AI 审核
                    decision_text = self._call_coordinator(plan, subtask, worker_output)
                    lines = [line.strip() for line in decision_text.strip().splitlines() if line.strip()]
                    first_line = (lines[0] if lines else "").upper()
                    decision = "ACCEPT" if "ACCEPT" in first_line else "REDO"
                    reason = "\\n".join(lines[1:]) if len(lines) > 1 else ""
                    user_feedback_text = None
                else:
                    decision_type, feedback = user_decision
                    decision = "ACCEPT" if decision_type == "accept" else "REDO"
                    reason = f"用户反馈: {feedback}"
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
                # 自动模式：AI 审核
                decision_text = self._call_coordinator(plan, subtask, worker_output)
                lines = [line.strip() for line in decision_text.strip().splitlines() if line.strip()]
                first_line = (lines[0] if lines else "").upper()
                decision = "ACCEPT" if "ACCEPT" in first_line else "REDO"
                reason = "\\n".join(lines[1:]) if len(lines) > 1 else ""
                user_feedback_text = None

            if decision == "ACCEPT":
                subtask.status = "done"
                subtask.notes = reason
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

    def _call_worker_with_feedback(self, plan: Plan, subtask: Subtask, user_feedback: str) -> str:
        """
        调用 Worker，并传入用户的修改要求
        """
        return self.worker.run(
            build_worker_prompt(
                plan,
                subtask,
                topic=plan.title,
                user_feedback=user_feedback,
            )
        )

    def run_all(self, topic: str) -> dict:
        session_id, plan, state = self.init_session(topic)
        while self._has_pending_subtasks(plan):
            plan = self.run_next_pending_subtask(session_id, plan)
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
    ) -> str:
        """
        Entry point for planning-phase user messages. Currently delegates to existing answer logic.
        """
        if state.plan_locked:
            return self.answer_user_question(session_id, plan, user_text)
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
        generate_stub_plan_from_planning_input(plan, text)
        return self.answer_user_question(session_id, plan, user_text)

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
        self.save_state(session_id, plan)
        self.save_orchestrator_state(state)

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
        plan = self.run_next_pending_subtask(session_id, plan)

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
                worker_output = self._call_worker(plan, subtask)

                ref_work = self.store.save_artifact(
                    session_id,
                    worker_output,
                    kind="markdown",
                    description=f"子任务 {subtask.id} 的执行结果",
                )

                interactive_coordinator.enter_review_mode(
                    session_id, subtask, worker_output, ref_work
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
                plan, state = self.run_next_with_state(session_id, plan, state)
                self._persist_plan_state(session_id, plan, state)
                return self._render_session_snapshot(
                    session_id,
                    normalized,
                    plan,
                    state,
                    message="已执行一个子任务",
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
            plan, state = self.run_all_pending(session_id, plan, state)
            self._persist_plan_state(session_id, plan, state)
            return self._render_session_snapshot(
                session_id,
                normalized,
                plan,
                state,
                message="所有子任务已完成",
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
                answer = self.handle_planning_turn(session_id, plan, state, question)
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

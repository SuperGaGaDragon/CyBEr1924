"""
Interactive Coordinator for managing user review feedback loops.

This module provides the InteractiveCoordinator class that enables
interactive review mode where users can approve or request changes
to worker outputs in real-time.
"""

from __future__ import annotations
from typing import TYPE_CHECKING, Optional, Dict, Any, Tuple

if TYPE_CHECKING:
    from .run_flow import Orchestrator
    from .plan_model import Plan, Subtask


class InteractiveCoordinator:
    """
    Interactive Coordinator - manages stateful user review sessions.

    This coordinator maintains conversation state and enables users to:
    - Review worker outputs
    - Request modifications ("change it to blue")
    - Accept or reject outputs
    - Modify the plan (future feature)
    """

    def __init__(self, orch: "Orchestrator"):
        self.orch = orch
        self.current_context: Optional[Dict[str, Any]] = None
        self.mode: str = "idle"  # "idle" | "reviewing" | "executing"

    def enter_review_mode(self, session_id: str, subtask: "Subtask", worker_output: str, artifact_ref: Any) -> None:
        """Enter review mode with the given context."""
        self.mode = "reviewing"
        self.current_context = {
            "session_id": session_id,
            "subtask": subtask,
            "worker_output": worker_output,
            "artifact_ref": artifact_ref,
        }

    def exit_review_mode(self) -> None:
        """Exit review mode and clear context."""
        self.mode = "idle"
        self.current_context = None

    def is_reviewing(self) -> bool:
        """Check if currently in review mode."""
        return self.mode == "reviewing" and self.current_context is not None

    def process_user_input(
        self, session_id: str, plan: "Plan", user_input: str
    ) -> Tuple["Plan", str]:
        """
        Process user input with context awareness.

        Args:
            session_id: Current session ID
            plan: Current plan
            user_input: User's input text

        Returns:
            (updated_plan, response_message)
        """
        # If in review mode, handle as feedback
        if self.is_reviewing():
            return self._handle_review_feedback(session_id, plan, user_input)

        # Otherwise, understand intent and route
        intent, params = self._understand_intent(user_input, plan)

        if intent == "query":
            response = self.orch.answer_user_question(session_id, plan, user_input)
            return plan, response

        elif intent == "modify_plan":
            return self._modify_plan(session_id, plan, params)

        else:  # unclear
            response = self.orch.answer_user_question(session_id, plan, user_input)
            return plan, response

    def _understand_intent(self, user_input: str, plan: "Plan") -> Tuple[str, Dict[str, Any]]:
        """
        Understand user intent from natural language.

        Returns:
            (intent, params) where intent is "query" | "modify_plan" | "unclear"
        """
        input_lower = user_input.lower()

        # Check for plan modification keywords
        plan_keywords = ["删除任务", "添加任务", "修改任务", "不需要", "去掉", "加一个", "插入"]
        if any(kw in input_lower for kw in plan_keywords):
            return ("modify_plan", {"request": user_input})

        # Default to query
        return ("query", {})

    def _handle_review_feedback(
        self, session_id: str, plan: "Plan", feedback: str
    ) -> Tuple["Plan", str]:
        """
        Handle user feedback on current worker output.

        Args:
            session_id: Session ID
            plan: Current plan
            feedback: User's feedback text

        Returns:
            (updated_plan, response_message)
        """
        if not self.current_context:
            return plan, "❌ No active review context"

        context = self.current_context
        subtask = context["subtask"]
        worker_output = context["worker_output"]
        feedback_lower = feedback.lower()

        # Accept output
        accept_keywords = ["好", "可以", "接受", "ok", "yes", "是", "通过", "行"]
        if any(kw in feedback_lower for kw in accept_keywords):
            subtask.status = "done"
            subtask.notes = f"用户接受: {feedback}"
            self.exit_review_mode()

            # Log acceptance
            self.orch.bus.send(
                session_id=session_id,
                sender="user",
                recipient="coordinator",
                payload_type="user_feedback",
                payload={
                    "subtask_id": subtask.id,
                    "decision": "accept",
                    "feedback": feedback,
                },
            )

            return plan, "✅ 已接受当前产出，进入下一步"

        # Reject and request modification
        reject_keywords = ["不", "改", "重做", "修改", "no", "换", "重新"]
        if any(kw in feedback_lower for kw in reject_keywords):
            modification_request = feedback

            # Call worker with feedback
            print("  → 正在根据你的要求重新生成...")
            new_output = self.orch._call_worker_with_feedback(plan, subtask, modification_request)

            # Save new output
            ref_work = self.orch.store.save_artifact(
                session_id,
                new_output,
                kind="markdown",
                description=f"子任务 {subtask.id} 的执行结果（用户反馈后）",
            )

            # Update context with new output
            self.current_context["worker_output"] = new_output
            self.current_context["artifact_ref"] = ref_work

            # Log feedback
            self.orch.bus.send(
                session_id=session_id,
                sender="user",
                recipient="worker",
                payload_type="user_feedback",
                payload={
                    "subtask_id": subtask.id,
                    "decision": "redo",
                    "feedback": modification_request,
                },
            )

            # Show preview of new output
            preview = new_output[:400] + "..." if len(new_output) > 400 else new_output
            response = f"✅ 已根据你的要求重新生成:\n\n{preview}\n\n💬 满意吗？（回复 '好'/'不，...'）"
            return plan, response

        # Unclear feedback
        return plan, "❓ 我没理解清楚。请回复：\n- '好' 表示接受\n- '不，我希望...' 说明修改要求"

    def _modify_plan(self, session_id: str, plan: "Plan", params: Dict[str, Any]) -> Tuple["Plan", str]:
        """
        Modify the plan based on user request.

        Args:
            session_id: Session ID
            plan: Current plan
            params: Parameters including 'request' with user's modification request

        Returns:
            (updated_plan, response_message)
        """
        request = params.get("request", "")

        # TODO: Implement plan modification with Planner AI
        # For now, return a placeholder message
        return plan, f"📋 计划修改功能即将上线。你的要求：{request}"

    def get_context(self) -> Optional[Dict[str, Any]]:
        """Get current review context."""
        return self.current_context

    def get_mode(self) -> str:
        """Get current mode."""
        return self.mode

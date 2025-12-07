#!/usr/bin/env python3
"""
交互式会话 V2 - Coordinator 作为中控

用户通过 Coordinator 与系统交互：
- 直接对话：查询进度、提问
- 审核产出：接受或提出修改意见
- 修改计划：添加/删除/修改任务
"""

from __future__ import annotations

from .message_bus import MessageBus
from .plan_model import Plan
from .run_flow import Orchestrator
from .session_store import ArtifactStore


def render_plan(plan: Plan) -> str:
    lines = [f"Plan: {plan.title} (id={plan.plan_id})", ""]
    for subtask in plan.subtasks:
        lines.append(f"- [{subtask.status:7}] {subtask.id}: {subtask.title}")
        if subtask.notes:
            snippet = subtask.notes if len(subtask.notes) <= 60 else subtask.notes[:57] + "..."
            lines.append(f"    notes: {snippet}")
    return "\n".join(lines)


class InteractiveCoordinator:
    """
    交互式 Coordinator - 作为用户与系统之间的唯一接口
    """

    def __init__(self, orch: Orchestrator):
        self.orch = orch
        self.current_context = None  # 当前上下文：正在审核的产出
        self.mode = "idle"  # idle/reviewing/executing

    def process_user_input(self, session_id: str, plan: Plan, user_input: str) -> tuple[Plan, str]:
        """
        处理用户输入，自动判断意图并路由

        返回: (updated_plan, response)
        """
        # 模式：正在审核产出
        if self.mode == "reviewing" and self.current_context:
            return self._handle_review_feedback(session_id, plan, user_input)

        # 模式：普通对话或命令
        else:
            # 让 Coordinator AI 理解用户意图
            intent, params = self._understand_intent(user_input, plan)

            if intent == "query":
                # 普通询问
                response = self.orch.answer_user_question(session_id, plan, user_input)
                return plan, response

            elif intent == "modify_plan":
                # 用户想修改计划
                return self._modify_plan(session_id, plan, params)

            elif intent == "unclear":
                # 无法理解，让 Coordinator AI 自由回答
                response = self.orch.answer_user_question(session_id, plan, user_input)
                return plan, response

    def _understand_intent(self, user_input: str, plan: Plan) -> tuple[str, dict]:
        """
        使用 Coordinator AI 理解用户意图

        返回: (intent, params)
            intent: "query" | "modify_plan" | "unclear"
        """
        # 简化版：关键词匹配（未来可用 LLM）
        input_lower = user_input.lower()

        # 计划修改关键词
        if any(kw in input_lower for kw in ["删除任务", "添加任务", "修改任务", "不需要", "去掉"]):
            return ("modify_plan", {"request": user_input})

        # 默认当作询问
        return ("query", {})

    def _handle_review_feedback(
        self, session_id: str, plan: Plan, feedback: str
    ) -> tuple[Plan, str]:
        """
        处理用户对当前产出的反馈
        """
        context = self.current_context
        subtask = context["subtask"]
        worker_output = context["worker_output"]

        feedback_lower = feedback.lower()

        # 接受
        if any(kw in feedback_lower for kw in ["好", "可以", "接受", "ok", "yes", "是"]):
            subtask.status = "done"
            subtask.notes = f"用户接受: {feedback}"
            self.mode = "idle"
            self.current_context = None

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

            return plan, "✓ 已接受当前产出，进入下一步"

        # 拒绝并修改
        elif any(kw in feedback_lower for kw in ["不", "改", "重做", "修改", "no"]):
            # 提取修改要求（简化版）
            modification_request = feedback

            # 重新调用 Worker
            print("  → 正在根据你的要求重新生成...")
            new_output = self.orch._call_worker_with_feedback(plan, subtask, modification_request)

            # 保存新产出
            ref_work = self.orch.store.save_artifact(
                session_id,
                new_output,
                kind="markdown",
                description=f"子任务 {subtask.id} 的执行结果（用户反馈后）",
            )

            # 更新上下文
            self.current_context["worker_output"] = new_output

            # 记录反馈
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

            # 展示新产出
            preview = new_output[:400] + "..." if len(new_output) > 400 else new_output
            response = f"✓ 已根据你的要求重新生成:\n\n{preview}\n\n满意吗？（回复'好'/'不'）"
            return plan, response

        # 无法理解
        else:
            return plan, "❓ 我没理解清楚。请回复：\n- '好' 表示接受\n- '不，我希望...' 说明修改要求"

    def _modify_plan(self, session_id: str, plan: Plan, params: dict) -> tuple[Plan, str]:
        """
        根据用户要求修改计划
        """
        request = params["request"]

        # TODO: 这里可以调用 Planner AI 来智能修改计划
        # 目前返回提示
        return plan, f"📋 计划修改功能即将上线。你的要求：{request}"


def main() -> None:
    artifact_store = ArtifactStore()
    message_bus = MessageBus(store=artifact_store)
    orch = Orchestrator(artifact_store=artifact_store, message_bus=message_bus)
    coord = InteractiveCoordinator(orch)

    print("=== Multi-Agent Interactive Session V2 ===")
    print("💬 你可以直接对话，例如：")
    print("   - '当前进度如何？'")
    print("   - '我不希望这个嘎嘎龙是绿色的，改成蓝色'")
    print("   - '删除第5个任务'\n")

    # 检查是否有可恢复的会话
    existing_sessions = orch.list_sessions()
    if existing_sessions:
        print("\n可恢复的会话：")
        for i, sess_id in enumerate(existing_sessions[:5], 1):
            print(f"  {i}. {sess_id}")
        print("\n输入会话编号恢复，或直接按回车新建会话")
        choice = input("选择: ").strip()

        if choice.isdigit() and 1 <= int(choice) <= min(5, len(existing_sessions)):
            session_id = existing_sessions[int(choice) - 1]
            result = orch.load_state(session_id)
            if result:
                session_id, plan = result
                print(f"✅ 已恢复 session: {session_id}")
                print(render_plan(plan))
            else:
                print("❌ 恢复失败，将新建会话")
                topic = input("新建 Session，请输入主题：").strip()
                if not topic:
                    print("需要一个主题才能开始。")
                    return
                session_id, plan, state = orch.init_session(topic)
                print(f"✅ 已创建 session: {session_id}")
                print(render_plan(plan))
                orch.save_state(session_id, plan)
        else:
            topic = input("新建 Session，请输入主题：").strip()
            if not topic:
                print("需要一个主题才能开始。")
                return
            session_id, plan, state = orch.init_session(topic)
            print(f"✅ 已创建 session: {session_id}")
            print(render_plan(plan))
            orch.save_state(session_id, plan)
    else:
        topic = input("新建 Session，请输入主题：").strip()
        if not topic:
            print("需要一个主题才能开始。")
            return
        session_id, plan, state = orch.init_session(topic)
        print(f"✅ 已创建 session: {session_id}")
        print(render_plan(plan))
        orch.save_state(session_id, plan)

    # 主循环
    while True:
        user_input = input("\n你> ").strip()
        if not user_input:
            continue

        message_bus.log_user_command(session_id, user_input)

        # 退出
        if user_input in ("/quit", "/exit"):
            print("Bye.")
            break

        # /help
        if user_input == "/help":
            print(
                "可用命令：\n"
                "  /plan      查看当前计划\n"
                "  /next      执行下一个任务（会进入审核模式）\n"
                "  /exit      退出会话\n\n"
                "  plan-edit 命令（API/UI）：set_current_subtask / skip_subtask / insert_subtask / append_subtask / update_subtask\n"
                "    使用 REST payload 提供 subtask_id、title 等字段。\n\n"
                "直接对话示例：\n"
                "  - 当前进度如何？\n"
                "  - 我不希望这个嘎嘎龙是绿色的\n"
                "  - 删除第3个任务"
            )
            continue

        # /plan
        if user_input == "/plan":
            print(render_plan(plan))
            continue

        # /next - 交互式执行
        if user_input == "/next":
            if all(subtask.status == "done" for subtask in plan.subtasks):
                print("✅ 所有子任务已完成。")
                continue

            # 找到下一个任务
            subtask = next((s for s in plan.subtasks if s.status != "done"), None)
            if not subtask:
                continue

            print(f"\n▶ 正在执行: {subtask.id} - {subtask.title}")
            subtask.status = "in_progress"

            # 调用 Worker
            worker_output = orch._call_worker(plan, subtask)

            # 保存产出
            ref_work = orch.store.save_artifact(
                session_id,
                worker_output,
                kind="markdown",
                description=f"子任务 {subtask.id} 的执行结果",
            )

            # 进入审核模式
            coord.mode = "reviewing"
            coord.current_context = {
                "subtask": subtask,
                "worker_output": worker_output,
                "artifact_ref": ref_work,
            }

            # 展示产出
            print("\n" + "="*60)
            print("📄 Worker 产出:")
            print("="*60)
            preview = worker_output[:500] + "..." if len(worker_output) > 500 else worker_output
            print(preview)
            print("="*60)
            print("\n💬 满意吗？你可以：")
            print("  - 回复 '好' 或 '接受' 来确认")
            print("  - 说明修改要求，例如 '不，改成蓝色的龙'")

            continue

        # 普通输入 - 交给 Coordinator 处理
        plan, response = coord.process_user_input(session_id, plan, user_input)

        # 自动保存
        orch.save_state(session_id, plan)

        print(f"\n[Coordinator] {response}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Unified Interactive Session (V2 + V3 Merged)

Features:
- Uses unified execute_command() for all operations
- Supports interactive review mode (user can modify Worker outputs)
- Compatible with FastAPI backend
- State persistence with OrchestratorState
"""

from __future__ import annotations

from .interactive_coordinator import InteractiveCoordinator
from .message_bus import MessageBus
from .plan_model import Plan
from .run_flow import Orchestrator
from .session_state import OrchestratorState
from .session_store import ArtifactStore


def render_plan(plan: Plan) -> str:
    """Render plan for display."""
    lines = [f"Plan: {plan.title} (id={plan.plan_id})", ""]
    for subtask in plan.subtasks:
        lines.append(f"- [{subtask.status:7}] {subtask.id}: {subtask.title}")
        if subtask.notes:
            snippet = subtask.notes if len(subtask.notes) <= 60 else subtask.notes[:57] + "..."
            lines.append(f"    notes: {snippet}")
    return "\n".join(lines)


def main() -> None:
    """Main interactive session loop."""
    artifact_store = ArtifactStore()
    message_bus = MessageBus(store=artifact_store)
    orch = Orchestrator(artifact_store=artifact_store, message_bus=message_bus)
    coord = InteractiveCoordinator(orch)

    print("=== Multi-Agent Platform - Unified Interactive Session ===")
    print("💬 你可以：")
    print("   - 直接对话：'当前进度如何？'")
    print("   - 审核产出：'我不希望这个嘎嘎龙是绿色的，改成蓝色'")
    print("   - 执行任务：'/next' 或 '/all'")
    print("   - 查看计划：'/plan'\n")

    # 检查是否有可恢复的会话
    existing_sessions = orch.list_sessions()
    if existing_sessions:
        print("\n可恢复的会话：")
        for i, sess_id in enumerate(existing_sessions[:5], 1):  # 只显示最近5个
            print(f"  {i}. {sess_id}")
        print("\n输入会话编号恢复，或直接按回车新建会话")
        choice = input("选择: ").strip()

        if choice.isdigit() and 1 <= int(choice) <= min(5, len(existing_sessions)):
            session_id = existing_sessions[int(choice) - 1]
            result = orch.load_state(session_id)
            if result:
                session_id, plan = result
                # Load orchestrator state
                try:
                    state = orch.load_orchestrator_state(session_id)
                except FileNotFoundError:
                    # Create state if missing
                    state = OrchestratorState(
                        session_id=session_id,
                        plan_id=plan.plan_id,
                        status="idle",
                    )
                    orch.save_orchestrator_state(state)
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
        else:
            topic = input("新建 Session，请输入主题：").strip()
            if not topic:
                print("需要一个主题才能开始。")
                return
            session_id, plan, state = orch.init_session(topic)
            print(f"✅ 已创建 session: {session_id}")
            print(render_plan(plan))
    else:
        topic = input("新建 Session，请输入主题：").strip()
        if not topic:
            print("需要一个主题才能开始。")
            return
        session_id, plan, state = orch.init_session(topic)
        print(f"✅ 已创建 session: {session_id}")
        print(render_plan(plan))

    # Main loop
    while True:
        user_input = input("\n你> ").strip()
        if not user_input:
            continue

        message_bus.log_user_command(session_id, user_input)

        # Exit
        if user_input in ("/quit", "/exit"):
            print("Bye.")
            break

        # Help
        if user_input == "/help":
            print(
                "可用命令：\n"
                "  /plan      查看当前计划\n"
                "  /next      执行下一个任务（交互式审核）\n"
                "  /all       自动执行所有任务\n"
                "  /exit      退出会话\n\n"
                "  plan-edit 命令（API/UI）：set_current_subtask / skip_subtask / insert_subtask / append_subtask / update_subtask\n"
                "    使用 REST payload 指定 subtask_id、title 等字段。\n\n"
                "直接对话示例：\n"
                "  - 当前进度如何？\n"
                "  - 我不希望这个嘎嘎龙是绿色的\n"
                "  - 删除第3个任务"
            )
            continue

        # === Unified Command Handling ===
        snapshot = orch.execute_command(
            session_id, user_input, interactive_coordinator=coord
        )

        plan = Plan.from_dict(snapshot["plan"])
        state = OrchestratorState.from_dict(snapshot["state"])

        print(f"\n{snapshot['message']}")

        # Special handling for /plan command
        if user_input == "/plan":
            print(render_plan(plan))


if __name__ == "__main__":
    main()

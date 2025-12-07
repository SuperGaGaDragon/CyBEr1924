#!/usr/bin/env python3
"""
Unified interactive session using execute_command.

This version uses the unified command handler, making it easy to
transition to HTTP API later.
"""

from __future__ import annotations

from .message_bus import MessageBus
from .plan_model import Plan
from .run_flow import Orchestrator
from .session_state import OrchestratorState
from .session_store import ArtifactStore


def render_plan(plan: Plan) -> str:
    """Render a plan as text."""
    lines = [f"Plan: {plan.title} (id={plan.plan_id})", ""]
    for subtask in plan.subtasks:
        lines.append(f"- [{subtask.status:7}] {subtask.id}: {subtask.title}")
        if subtask.notes:
            snippet = subtask.notes if len(subtask.notes) <= 60 else subtask.notes[:57] + "..."
            lines.append(f"    notes: {snippet}")
    return "\n".join(lines)


def main() -> None:
    artifact_store = ArtifactStore()
    message_bus = MessageBus(store=artifact_store)
    orch = Orchestrator(artifact_store=artifact_store, message_bus=message_bus)

    print("=== Multi-Agent Interactive Session (Unified) ===")

    # Check for existing sessions
    existing_sessions = orch.list_sessions()
    session_id = None
    plan = None
    state = None

    if existing_sessions:
        print("\n可恢复的会话：")
        for i, sess_id in enumerate(existing_sessions[:5], 1):
            print(f"  {i}. {sess_id}")
        print("\n输入会话编号恢复，或直接按回车新建会话")
        choice = input("选择: ").strip()

        if choice.isdigit() and 1 <= int(choice) <= min(5, len(existing_sessions)):
            session_id = existing_sessions[int(choice) - 1]
            # Load state and plan
            try:
                state = orch.load_orchestrator_state(session_id)
                result = orch.load_state(session_id)
                if result:
                    _, plan = result
                    print(f"✅ 已恢复 session: {session_id}")
                    print(f"   Status: {state.status}")
                    print(render_plan(plan))
                else:
                    raise Exception("Cannot load plan")
            except Exception as e:
                print(f"❌ 恢复失败: {e}，将新建会话")
                session_id = None

    # Create new session if needed
    if session_id is None:
        topic = input("新建 Session，请输入主题：").strip()
        if not topic:
            print("需要一个主题才能开始。")
            return

        session_id, plan, state = orch.init_session(topic)
        print(f"✅ 已创建 session: {session_id}")
        print(render_plan(plan))

        # Also save to the old state.json format for compatibility
        orch.save_state(session_id, plan)

    # Main loop
    while True:
        user_input = input("\n你（/help 获取命令列表）> ").strip()
        if not user_input:
            continue

        # Log command
        message_bus.log_user_command(session_id, user_input)

        # Handle exit
        if user_input in ("/quit", "/exit"):
            print("Bye.")
            break

        # Handle help
        if user_input == "/help":
            print(
                    "可用命令：\n"
                    "  /plan      查看当前计划\n"
                    "  /next      执行下一个 pending 子任务\n"
                    "  /all       按顺序执行剩余所有子任务\n"
                    "  /status    查看 orchestrator 状态\n"
                    "  /exit      退出会话\n"
                    "  plan-edit 命令（API/UI）：set_current_subtask / skip_subtask / insert_subtask / append_subtask / update_subtask\n"
                    "    通过 Web UI 的编辑按钮或 REST payload 指定 subtask_id、title 等字段。\n"
                    "  /help      显示此帮助信息\n\n"
                "普通对话输入将由协调 AI 回答，例如：\n"
                "  - 当前进度如何？\n"
                "  - 下一步要做什么？\n"
                "  - 最近完成了什么？\n\n"
                "💾 会话状态会自动保存。"
            )
            continue

        # Handle /status
        if user_input == "/status":
            print(f"Session: {state.session_id}")
            print(f"Plan ID: {state.plan_id}")
            print(f"Status: {state.status}")
            print(f"Current Subtask: {state.current_subtask_id or 'None'}")
            continue

        # ===== UNIFIED COMMAND HANDLER =====
        snapshot = orch.execute_command(session_id, user_input)

        if not snapshot.get("ok", True):
            print(f"[错误] {snapshot['message']}")
            continue

        plan = Plan.from_dict(snapshot["plan"])
        state = OrchestratorState.from_dict(snapshot["state"])

        if user_input == "/plan":
            print(render_plan(plan))
        else:
            print(f"\n{snapshot['message']}")


if __name__ == "__main__":
    main()

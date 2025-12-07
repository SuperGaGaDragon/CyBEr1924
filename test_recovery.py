#!/usr/bin/env python3
"""
测试会话恢复功能的脚本。
"""

from multi_agent_platform.session_store import ArtifactStore
from multi_agent_platform.message_bus import MessageBus
from multi_agent_platform.run_flow import Orchestrator
from multi_agent_platform.plan_model import Plan

def test_save_and_load():
    """测试保存和加载状态"""
    print("=== 测试会话状态保存和恢复 ===\n")

    # 1. 创建会话
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # 2. 初始化一个简单的会话
    topic = "测试主题：编写一个简单的Python函数"
    print(f"创建新会话: {topic}")
    session_id, plan, state = orch.init_session(topic)
    print(f"✅ Session ID: {session_id}")
    print(f"✅ 计划包含 {len(plan.subtasks)} 个子任务\n")

    # 显示初始计划
    print("初始计划：")
    for subtask in plan.subtasks:
        print(f"  - [{subtask.status}] {subtask.id}: {subtask.title}")
    print()

    # 3. 保存状态
    print("保存会话状态...")
    state_file = orch.save_state(session_id, plan)
    print(f"✅ 状态已保存到: {state_file}\n")

    # 4. 模拟修改计划（执行一个子任务）
    if plan.subtasks:
        plan.subtasks[0].status = "done"
        plan.subtasks[0].notes = "测试完成"
        print(f"将第一个子任务标记为完成: {plan.subtasks[0].title}")
        orch.save_state(session_id, plan)
        print("✅ 更新后的状态已保存\n")

    # 5. 尝试恢复状态
    print("尝试恢复会话...")
    result = orch.load_state(session_id)

    if result:
        loaded_session_id, loaded_plan = result
        print(f"✅ 成功恢复 Session: {loaded_session_id}")
        print(f"✅ 恢复的计划包含 {len(loaded_plan.subtasks)} 个子任务\n")

        # 验证状态是否正确恢复
        print("恢复后的计划：")
        for subtask in loaded_plan.subtasks:
            print(f"  - [{subtask.status}] {subtask.id}: {subtask.title}")
            if subtask.notes:
                print(f"    备注: {subtask.notes}")
        print()

        # 验证第一个子任务是否为 "done"
        if loaded_plan.subtasks and loaded_plan.subtasks[0].status == "done":
            print("✅ 验证通过：第一个子任务状态正确恢复为 'done'")
        else:
            print("❌ 验证失败：第一个子任务状态未正确恢复")

    else:
        print("❌ 恢复失败")

    # 6. 测试列出所有会话
    print("\n列出所有可恢复的会话：")
    sessions = orch.list_sessions()
    for i, sess_id in enumerate(sessions[:5], 1):
        print(f"  {i}. {sess_id}")

    print(f"\n✅ 找到 {len(sessions)} 个可恢复的会话")

def test_context_enrichment():
    """测试 answer_user_question 的上下文增强"""
    print("\n\n=== 测试上下文增强功能 ===\n")

    # 使用已存在的会话
    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    sessions = orch.list_sessions()
    if not sessions:
        print("❌ 没有可用的会话进行测试")
        return

    # 加载第一个会话
    session_id = sessions[0]
    result = orch.load_state(session_id)

    if not result:
        print("❌ 无法加载会话")
        return

    _, plan = result
    print(f"已加载会话: {session_id}")
    print(f"计划: {plan.title}")
    print()

    # 测试问答功能
    test_questions = [
        "当前进度如何？",
        "下一步要做什么？",
        "已经完成了哪些任务？"
    ]

    for question in test_questions:
        print(f"问题: {question}")
        try:
            answer = orch.answer_user_question(session_id, plan, question)
            print(f"回答: {answer[:200]}...")  # 只显示前200个字符
            print("✅ 问答功能正常\n")
        except Exception as e:
            print(f"❌ 问答失败: {e}\n")

if __name__ == "__main__":
    test_save_and_load()
    # 注意：test_context_enrichment 需要调用 AI，可能需要 API key
    # test_context_enrichment()

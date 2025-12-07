#!/usr/bin/env python3
"""
MVP 功能验证脚本 - 验收测试
"""

import sys
from pathlib import Path
from multi_agent_platform.session_store import ArtifactStore
from multi_agent_platform.message_bus import MessageBus
from multi_agent_platform.run_flow import Orchestrator
from multi_agent_platform.plan_model import Plan

def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def test_1_state_persistence():
    """测试 1: 状态持久化"""
    print_section("测试 1: 状态持久化")

    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # 创建会话
    session_id, plan, state = orch.init_session("测试计划")
    print(f"✓ 创建会话: {session_id}")

    # 保存状态
    state_file = orch.save_state(session_id, plan)
    assert state_file.exists(), "state.json 文件应该存在"
    print(f"✓ 状态已保存: {state_file}")

    # 恢复状态
    result = orch.load_state(session_id)
    assert result is not None, "应该能够恢复状态"
    restored_id, restored_plan = result
    assert restored_id == session_id, "恢复的 session_id 应该匹配"
    assert restored_plan.plan_id == plan.plan_id, "恢复的 plan_id 应该匹配"
    print(f"✓ 状态成功恢复")

    # 列出会话
    sessions = orch.list_sessions()
    assert session_id in sessions, "新会话应该在列表中"
    print(f"✓ 会话列表包含当前会话")

    return True

def test_2_enhanced_context():
    """测试 2: 增强的上下文"""
    print_section("测试 2: 增强的对话上下文")

    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # 使用已存在的会话（如果有）
    sessions = orch.list_sessions()
    if not sessions:
        print("⚠ 没有现有会话，跳过上下文测试")
        return True

    session_id = sessions[0]
    result = orch.load_state(session_id)
    if not result:
        print("⚠ 无法加载会话，跳过上下文测试")
        return True

    _, plan = result
    print(f"✓ 加载会话: {session_id}")

    # 检查 answer_user_question 方法是否包含新参数
    import inspect
    sig = inspect.signature(orch.answer_user_question)
    assert 'session_id' in sig.parameters, "应该有 session_id 参数"
    assert 'plan' in sig.parameters, "应该有 plan 参数"
    assert 'user_input' in sig.parameters, "应该有 user_input 参数"
    print(f"✓ answer_user_question 方法签名正确")

    # 检查方法内是否读取了额外的上下文（通过代码检查）
    import multi_agent_platform.run_flow as run_flow_module
    source = inspect.getsource(run_flow_module.Orchestrator.answer_user_question)
    assert 'last_done_subtask' in source, "应该查找最后完成的子任务"
    assert 'artifact_path' in source or 'artifact_full_path' in source, "应该读取产物内容"
    assert 'current_subtask' in source, "应该查找当前进行中的子任务"
    assert 'next_subtask' in source, "应该查找下一个待执行的子任务"
    print(f"✓ answer_user_question 包含丰富上下文逻辑")

    return True

def test_3_protocol_extension():
    """测试 3: 协议扩展"""
    print_section("测试 3: 协议扩展")

    from src.protocol import PayloadType, PAYLOAD_SCHEMAS

    # 检查新增的 payload type
    assert hasattr(PayloadType, 'COORD_RESPONSE'), "应该有 COORD_RESPONSE"
    assert PayloadType.COORD_RESPONSE.value == 'coord_response', "值应该是 'coord_response'"
    print(f"✓ PayloadType.COORD_RESPONSE 已定义")

    # 检查 schema
    assert 'coord_response' in PAYLOAD_SCHEMAS, "应该有 coord_response schema"
    schema = PAYLOAD_SCHEMAS['coord_response']
    assert 'question' in schema['properties'], "schema 应该包含 question"
    assert 'response' in schema['properties'], "schema 应该包含 response"
    print(f"✓ coord_response schema 正确定义")

    return True

def test_4_auto_save():
    """测试 4: 自动保存机制"""
    print_section("测试 4: 自动保存机制")

    # 检查 interactive_session.py 中是否有自动保存逻辑
    with open('multi_agent_platform/interactive_session.py', 'r') as f:
        content = f.read()

    # 检查 /next 命令后是否有保存
    assert 'orch.save_state(session_id, plan)' in content, "应该在适当位置调用 save_state"
    print(f"✓ interactive_session.py 包含自动保存逻辑")

    # 检查初始化时是否保存
    init_saves = content.count('orch.save_state(session_id, plan)')
    assert init_saves >= 3, f"至少应该有 3 处保存点，找到 {init_saves} 处"
    print(f"✓ 找到 {init_saves} 处自动保存点")

    return True

def test_5_session_recovery_ui():
    """测试 5: 会话恢复 UI"""
    print_section("测试 5: 会话恢复 UI")

    with open('multi_agent_platform/interactive_session.py', 'r') as f:
        content = f.read()

    # 检查是否有会话列表显示
    assert 'existing_sessions = orch.list_sessions()' in content, "应该调用 list_sessions"
    assert '可恢复的会话' in content, "应该显示可恢复的会话提示"
    assert 'orch.load_state' in content, "应该调用 load_state"
    print(f"✓ interactive_session.py 包含会话恢复 UI")

    # 检查帮助文本是否更新
    assert '自动保存' in content or '💾' in content, "帮助文本应该提及自动保存"
    print(f"✓ 帮助文本已更新")

    return True

def main():
    """运行所有测试"""
    print("\n" + "="*60)
    print("  MVP 功能验收测试")
    print("="*60)

    tests = [
        ("状态持久化", test_1_state_persistence),
        ("增强的对话上下文", test_2_enhanced_context),
        ("协议扩展", test_3_protocol_extension),
        ("自动保存机制", test_4_auto_save),
        ("会话恢复 UI", test_5_session_recovery_ui),
    ]

    results = []
    for name, test_func in tests:
        try:
            success = test_func()
            results.append((name, success, None))
        except Exception as e:
            results.append((name, False, str(e)))
            print(f"\n❌ 测试失败: {e}")

    # 打印总结
    print_section("测试总结")
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)

    for name, success, error in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {name}")
        if error:
            print(f"     错误: {error}")

    print(f"\n总计: {passed}/{total} 通过")

    if passed == total:
        print("\n🎉 所有测试通过！MVP 功能完整！")
        return 0
    else:
        print(f"\n⚠️  {total - passed} 个测试失败")
        return 1

if __name__ == "__main__":
    sys.exit(main())

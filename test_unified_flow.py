#!/usr/bin/env python3
"""
Test the unified flow with OrchestratorState and execute_command.
"""

from multi_agent_platform.session_store import ArtifactStore
from multi_agent_platform.message_bus import MessageBus
from multi_agent_platform.run_flow import Orchestrator
from multi_agent_platform.session_state import OrchestratorState
from multi_agent_platform.plan_model import Plan


def test_state_management():
    """Test OrchestratorState save/load."""
    print("=== Test 1: State Management ===\n")

    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # Create session
    session_id, plan, state = orch.init_session("测试主题")
    print(f"✓ Created session: {session_id}")
    print(f"✓ Initial state: status={state.status}, plan_id={state.plan_id}")

    # Check orchestrator_state.json exists
    state_path = orch._state_path(session_id)
    assert state_path.exists(), "orchestrator_state.json should exist"
    print(f"✓ State file created: {state_path}")

    # Load state
    loaded_state = orch.load_orchestrator_state(session_id)
    assert loaded_state.session_id == session_id
    assert loaded_state.plan_id == plan.plan_id
    assert loaded_state.status == "idle"
    print(f"✓ State loaded successfully")

    return session_id, plan, state


def test_execute_command(session_id, plan, state):
    """Test execute_command method."""
    print("\n=== Test 2: Execute Command ===\n")

    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # Test /plan command
    snapshot = orch.execute_command(session_id, "/plan")
    assert snapshot["ok"]
    assert "plan" in snapshot
    assert "state" in snapshot
    print(f"✓ /plan command: {snapshot['message']}")

    # Test natural language
    snapshot = orch.execute_command(session_id, "当前进度如何？")
    assert snapshot["ok"]
    print(f"✓ Natural language query works")
    print(f"  Response preview: {snapshot['message'][:100]}...")

    return True


def test_session_index():
    """Test session index tracking."""
    print("\n=== Test 3: Session Index ===\n")

    store = ArtifactStore()

    # Get index
    index = store.get_session_index()
    print(f"✓ Session index: {len(index.get('history', []))} sessions")
    if index.get('latest'):
        print(f"✓ Latest session: {index['latest']}")

    # Check index file exists
    index_path = store.root / "session_index.json"
    if index_path.exists():
        print(f"✓ Index file exists: {index_path}")
    else:
        print(f"⚠ Index file not found (will be created on first session)")

    return True


def test_state_aware_execution():
    """Test state-aware execution."""
    print("\n=== Test 4: State-Aware Execution ===\n")

    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # Create a simple session
    session_id, plan, state = orch.init_session("简单测试：1+1")
    print(f"✓ Created session with {len(plan.subtasks)} subtasks")

    # Execute /next via execute_command
    print(f"✓ Initial state: {state.status}")

    if len(plan.subtasks) > 0:
        snapshot = orch.execute_command(session_id, "/next")
        assert snapshot["ok"]
        plan = Plan.from_dict(snapshot["plan"])
        state = OrchestratorState.from_dict(snapshot["state"])
        print(f"✓ After /next: state.status={state.status}")

        loaded_state = orch.load_orchestrator_state(session_id)
        assert loaded_state.status == state.status
        print(f"✓ State persistence verified")

    return True


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("  Unified Flow Tests")
    print("="*60)

    try:
        # Test 1: State management
        session_id, plan, state = test_state_management()

        # Test 2: Execute command
        test_execute_command(session_id, plan, state)

        # Test 3: Session index
        test_session_index()

        # Test 4: State-aware execution
        test_state_aware_execution()

        print("\n" + "="*60)
        print("  ✅ All Tests Passed!")
        print("="*60)
        print("\n✓ Ready for FastAPI integration")
        print("\nNext steps:")
        print("  1. Run: python3 -m multi_agent_platform.interactive_session_unified")
        print("  2. Prepare FastAPI skeleton with execute_command")

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit(main())

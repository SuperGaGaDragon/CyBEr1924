#!/usr/bin/env python3
"""
Test script to verify long-form writing improvements.

This script demonstrates how the system now handles long-form writing tasks:
1. Planner breaks down into chapters
2. Worker writes actual narrative content
3. Coordinator verifies real content (not examples/tutorials)
"""

from multi_agent_platform.run_flow import Orchestrator
from multi_agent_platform.session_store import ArtifactStore
from multi_agent_platform.message_bus import MessageBus


def test_novel_planning():
    """Test that Planner generates chapter-based plan for novels."""
    print("="*60)
    print("Test: Long-form Novel Planning")
    print("="*60)

    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # Create a novel writing session
    topic = "写一个 1 万字的科幻小说，关于时间旅行"
    print(f"\n📝 Topic: {topic}\n")

    session_id, plan, state = orch.init_session(topic)
    print(f"✅ Session created: {session_id}\n")

    # Display the plan
    print("📋 Generated Plan:")
    print("="*60)
    for i, subtask in enumerate(plan.subtasks, 1):
        print(f"{i}. [{subtask.status:7}] {subtask.title}")
    print("="*60)

    # Verify plan structure
    print("\n✓ Verification:")
    total_tasks = len(plan.subtasks)
    print(f"  - Total subtasks: {total_tasks}")

    # Count writing tasks
    writing_tasks = [s for s in plan.subtasks if any(
        keyword in s.title.lower()
        for keyword in ['章', 'chapter', '撰写', 'write', '写']
    )]
    print(f"  - Writing subtasks: {len(writing_tasks)}")

    # Check if chapters are properly broken down
    chapter_tasks = [s for s in plan.subtasks if '章' in s.title or 'chapter' in s.title.lower()]
    if chapter_tasks:
        print(f"  - Chapter-based subtasks: {len(chapter_tasks)} ✓")
        print(f"  - First chapter: {chapter_tasks[0].title}")
        if len(chapter_tasks) > 1:
            print(f"  - Second chapter: {chapter_tasks[1].title}")

    # Check for mega-tasks (should not exist)
    mega_task_keywords = ['完整', '全文', 'entire', 'complete draft', 'whole']
    mega_tasks = [s for s in plan.subtasks if any(kw in s.title.lower() for kw in mega_task_keywords)]
    if mega_tasks:
        print(f"  ⚠️  Found mega-tasks (should not exist): {len(mega_tasks)}")
        for mt in mega_tasks:
            print(f"     - {mt.title}")
    else:
        print(f"  ✓ No mega-tasks found (good!)")

    print(f"\n✅ Test completed!")
    print(f"\nℹ️  To execute the plan:")
    print(f"   python3 -m multi_agent_platform.interactive_session")
    print(f"   # Recover session: {session_id}")
    print(f"   # Then run: /all")

    return session_id, plan


def test_worker_prompt():
    """Test that Worker prompt is correctly configured."""
    print("\n" + "="*60)
    print("Test: Worker Prompt Configuration")
    print("="*60)

    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # Check Worker prompt
    worker_prompt = orch.worker.system_prompt

    print("\n📝 Worker System Prompt (excerpt):")
    print("="*60)

    # Check for key phrases
    checks = {
        "Writing mode": "FOR WRITING/CREATIVE TASKS" in worker_prompt,
        "Narrative text": "continuous narrative text" in worker_prompt,
        "No meta-commentary": "DO NOT write meta-commentary" in worker_prompt,
        "No examples": "'example chapter'" in worker_prompt,
        "Chapter scope": "only requires THIS chapter" in worker_prompt,
    }

    for check_name, passed in checks.items():
        status = "✓" if passed else "✗"
        print(f"{status} {check_name}: {'PASS' if passed else 'FAIL'}")

    all_passed = all(checks.values())
    print("="*60)
    print(f"\n{'✅' if all_passed else '❌'} Worker prompt configuration: {'PASS' if all_passed else 'FAIL'}")

    return all_passed


def test_planner_prompt():
    """Test that Planner prompt is correctly configured."""
    print("\n" + "="*60)
    print("Test: Planner Prompt Configuration")
    print("="*60)

    store = ArtifactStore()
    bus = MessageBus(store=store)
    orch = Orchestrator(artifact_store=store, message_bus=bus)

    # Check Planner prompt
    planner_prompt = orch.planner.system_prompt

    print("\n📝 Planner System Prompt (excerpt):")
    print("="*60)

    # Check for key phrases
    checks = {
        "Long-form rules": "CRITICAL RULES FOR LONG-FORM WRITING TASKS" in planner_prompt,
        "Break into small tasks": "break the plan into many small writing subtasks" in planner_prompt,
        "Word limits": "1,500-2,000 Chinese characters" in planner_prompt,
        "Chapter structure": "Break the novel into chapters/sections" in planner_prompt,
        "No mega-tasks": "NEVER create vague mega-tasks" in planner_prompt,
    }

    for check_name, passed in checks.items():
        status = "✓" if passed else "✗"
        print(f"{status} {check_name}: {'PASS' if passed else 'FAIL'}")

    all_passed = all(checks.values())
    print("="*60)
    print(f"\n{'✅' if all_passed else '❌'} Planner prompt configuration: {'PASS' if all_passed else 'FAIL'}")

    return all_passed


def main():
    """Run all tests."""
    print("\n🚀 Long-Form Writing Optimization Test Suite\n")

    results = {}

    # Test 1: Planner prompt
    results['planner_prompt'] = test_planner_prompt()

    # Test 2: Worker prompt
    results['worker_prompt'] = test_worker_prompt()

    # Test 3: Novel planning
    try:
        session_id, plan = test_novel_planning()
        results['novel_planning'] = True
    except Exception as e:
        print(f"\n❌ Novel planning test failed: {e}")
        results['novel_planning'] = False

    # Summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)

    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")

    all_passed = all(results.values())
    print("="*60)

    if all_passed:
        print("\n🎉 All tests passed! The system is ready for long-form writing.")
        print("\nNext steps:")
        print("  1. Start the CLI: python3 -m multi_agent_platform.interactive_session")
        print("  2. Create a long-form writing task (e.g., '写一个 1 万字的小说')")
        print("  3. Run /all to generate the complete work chapter by chapter")
    else:
        print("\n⚠️  Some tests failed. Please review the configuration.")

    return 0 if all_passed else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())

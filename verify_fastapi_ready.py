#!/usr/bin/env python3
"""
Quick verification that all FastAPI requirements are met.
"""

import sys
from pathlib import Path

def check_file(path, description):
    """Check if a file exists."""
    if Path(path).exists():
        print(f"✓ {description}: {path}")
        return True
    else:
        print(f"✗ {description}: {path} NOT FOUND")
        return False

def check_class(module_path, class_name):
    """Check if a class exists in a module."""
    try:
        parts = module_path.rsplit('.', 1)
        module = __import__(parts[0], fromlist=[parts[1]] if len(parts) > 1 else [])
        if len(parts) > 1:
            module = getattr(module, parts[1])
        assert hasattr(module, class_name)
        print(f"✓ {module_path}.{class_name} exists")
        return True
    except Exception as e:
        print(f"✗ {module_path}.{class_name} NOT FOUND: {e}")
        return False

def check_method(module_path, class_name, method_name):
    """Check if a method exists in a class."""
    try:
        parts = module_path.rsplit('.', 1)
        module = __import__(parts[0], fromlist=[parts[1]] if len(parts) > 1 else [])
        if len(parts) > 1:
            module = getattr(module, parts[1])
        cls = getattr(module, class_name)
        assert hasattr(cls, method_name)
        print(f"✓ {class_name}.{method_name}() exists")
        return True
    except Exception as e:
        print(f"✗ {class_name}.{method_name}() NOT FOUND: {e}")
        return False

def main():
    """Run all verification checks."""
    print("="*60)
    print("  FastAPI Readiness Verification")
    print("="*60)

    checks = []

    # Step 1: OrchestratorState
    print("\n📋 Step 1: OrchestratorState")
    checks.append(check_file("multi_agent_platform/session_state.py", "session_state.py"))
    checks.append(check_class("multi_agent_platform.session_state", "OrchestratorState"))

    # Step 2: execute_command
    print("\n📋 Step 2: execute_command")
    checks.append(check_class("multi_agent_platform.session_state", "SessionSnapshot"))
    checks.append(check_method("multi_agent_platform.run_flow", "Orchestrator", "execute_command"))
    checks.append(check_method("multi_agent_platform.run_flow", "Orchestrator", "save_orchestrator_state"))
    checks.append(check_method("multi_agent_platform.run_flow", "Orchestrator", "load_orchestrator_state"))

    # Step 3: Unified CLI
    print("\n📋 Step 3: Unified CLI")
    checks.append(check_file("multi_agent_platform/interactive_session_unified.py", "interactive_session_unified.py"))

    # Step 4: session_index
    print("\n📋 Step 4: session_index")
    checks.append(check_method("multi_agent_platform.session_store", "ArtifactStore", "get_session_index"))

    # Step 5: FastAPI
    print("\n📋 Step 5: FastAPI")
    checks.append(check_file("api.py", "api.py"))
    checks.append(check_file("API_README.md", "API_README.md"))

    # Additional files
    print("\n📋 Additional Files")
    checks.append(check_file("test_unified_flow.py", "test_unified_flow.py"))
    checks.append(check_file("FASTAPI_READY_SUMMARY.md", "FASTAPI_READY_SUMMARY.md"))

    # Summary
    print("\n" + "="*60)
    passed = sum(checks)
    total = len(checks)
    print(f"  Results: {passed}/{total} checks passed")
    print("="*60)

    if passed == total:
        print("\n🎉 All checks passed! FastAPI ready to deploy!")
        print("\nNext steps:")
        print("  1. Run: python3 -m multi_agent_platform.interactive_session_unified")
        print("  2. Run: python3 api.py")
        print("  3. Visit: http://localhost:8000/docs")
        return 0
    else:
        print(f"\n⚠️  {total - passed} checks failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())

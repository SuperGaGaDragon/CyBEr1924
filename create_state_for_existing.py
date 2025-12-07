#!/usr/bin/env python3
"""
为已存在的旧会话创建 state.json 文件
"""

import json
from pathlib import Path
from multi_agent_platform.plan_model import Plan

# 会话 ID
session_id = "sess-20251207-042846-aed3cfc5"
session_dir = Path(f"multi_agent_platform/sessions/{session_id}")

# 读取现有的 plan JSON 文件
plan_json_path = session_dir / "artifacts" / "046d5404cae4.json"

if not plan_json_path.exists():
    print(f"❌ Plan JSON 文件不存在: {plan_json_path}")
    exit(1)

with plan_json_path.open("r", encoding="utf-8") as f:
    plan_data = json.load(f)

# 创建 state.json
state_data = {
    "session_id": session_id,
    "plan": plan_data
}

state_file = session_dir / "state.json"
with state_file.open("w", encoding="utf-8") as f:
    json.dump(state_data, f, ensure_ascii=False, indent=2)

print(f"✅ 已为旧会话创建 state.json: {state_file}")
print(f"   Plan: {plan_data['title']}")
print(f"   Subtasks: {len(plan_data['subtasks'])} 个")

# 统计状态
done_count = sum(1 for st in plan_data['subtasks'] if st['status'] == 'done')
print(f"   进度: {done_count}/{len(plan_data['subtasks'])} 已完成")

#!/usr/bin/env python3
"""
Lightweight smoke test for the Planner/Worker/Coordinator prompts.

It runs each Agent (mock when no API key is set) and makes sure
the outputs can be parsed or are non-empty.
"""

import os
import sys

from multi_agent_platform.agent_runner import Agent
from multi_agent_platform.plan_model import Plan, Subtask
from multi_agent_platform.prompt_registry import (
    COORDINATOR_PROMPT,
    PLANNER_PROMPT,
    WORKER_PROMPT,
    build_coordinator_review_prompt,
    build_worker_prompt,
)


def _print_preview(label: str, text: str) -> None:
    print(f"\n--- {label} preview ---")
    print(text[:120] + ("..." if len(text) > 120 else ""))


def verify_planner_topic(topic: str) -> Plan:
    agent = Agent(name="planner", system_prompt=PLANNER_PROMPT)
    prompt = f"Topic: {topic}"
    response = agent.run(prompt)
    _print_preview("Planner output", response)

    try:
        plan = Plan.from_outline(topic, response)
    except Exception as exc:  # pragma: no cover - defensive
        raise RuntimeError(f"Planner output cannot be parsed: {exc}") from exc

    if os.getenv("OPENAI_API_KEY") and len(plan.subtasks) < 2:
        raise RuntimeError("Planner produced fewer than 2 subtasks; check the prompt guidance.")

    if not plan.subtasks:
        plan.subtasks.append(Subtask(id="t1", title="Mock fallback step"))

    return plan


def verify_worker(plan: Plan) -> None:
    agent = Agent(name="worker", system_prompt=WORKER_PROMPT)
    subtask = plan.subtasks[0]
    worker_prompt = build_worker_prompt(plan, subtask, topic=plan.title)
    response = agent.run(worker_prompt)
    _print_preview(f"Worker output for {subtask.id}", response)
    if not response.strip():
        raise RuntimeError("Worker prompt returned empty output.")


def verify_coordinator(plan: Plan) -> None:
    agent = Agent(name="coordinator", system_prompt=COORDINATOR_PROMPT)
    subtask = plan.subtasks[0]
    dummy_result = "这是一个模拟产物，用于验证 Coordinator。"
    review_prompt = build_coordinator_review_prompt(plan, subtask, dummy_result)
    response = agent.run(review_prompt)
    _print_preview("Coordinator output", response)
    if not any(word in response.upper() for word in ("ACCEPT", "REDO")):
        raise RuntimeError("Coordinator output should contain ACCEPT or REDO.")


def main() -> int:
    print("=" * 60)
    print(" Prompt/Persona Readiness Check")
    print("=" * 60)

    topic = "Launch plan for a new AI assistant"
    plan = verify_planner_topic(topic)
    verify_worker(plan)
    verify_coordinator(plan)

    print("\n🎉 Prompts look reasonable. You can eyeball the previews above.")
    print("Next steps:")
    print("  1. Run `/next` or `/all` to see the Worker in action.")
    print("  2. If you change a prompt file, rerun this script to sanity check it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

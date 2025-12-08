from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .agent_runner import call_llm_json


@dataclass
class PlannerResult:
    plan: Dict[str, Any]
    subtasks: List[Dict[str, Any]]


def run_planner_agent(
    planner_chat: List[Dict[str, Any]],
    plan: Optional[Dict[str, Any]],
    subtasks: List[Dict[str, Any]],
    latest_user_input: str,
    model: str = "gpt-4.1-mini",
) -> PlannerResult:
    """
    Call an LLM in JSON mode to update plan + subtasks.
    """
    system_prompt = (
        "You are a planning assistant. You receive a current writing plan and subtasks, "
        "plus the planning chat history and the latest user message. "
        "Your job is to return an updated high-level plan and a list of concrete subtasks. "
        "Subtasks should be ordered, each with an id, title, status, and optional notes."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "Here is the current planning state in JSON.\n\n"
                f"Current plan (may be null): {plan!r}\n\n"
                f"Current subtasks: {subtasks!r}\n\n"
                f"Planning chat history: {planner_chat!r}\n\n"
                f"Latest user planning input: {latest_user_input!r}\n\n"
                "Respond ONLY with a JSON object of the form:\n"
                "{\n"
                '  \"plan\": {\"plan_id\": \"...\", \"title\": \"...\", \"description\": \"...\", \"notes\": \"...\"},\n'
                '  \"subtasks\": [\n'
                '    {\"subtask_id\": \"t1\", \"title\": \"...\", \"status\": \"PENDING\", \"notes\": \"...\"},\n'
                "    ...\n"
                "  ]\n"
                "}\n"
            ),
        },
    ]

    result = call_llm_json(
        messages=messages,
        response_schema={
            "type": "object",
            "properties": {
                "plan": {"type": "object"},
                "subtasks": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["plan", "subtasks"],
        },
        model=model,
    )

    plan_obj = result.get("plan") or {}
    subtasks_obj = result.get("subtasks") or []

    return PlannerResult(plan=plan_obj, subtasks=subtasks_obj)

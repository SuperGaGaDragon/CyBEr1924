from __future__ import annotations
from typing import Dict, Any, Optional
from dataclasses import dataclass
from .agent_runner import call_llm_json  # JSON structured LLM 调用


@dataclass
class OrchestratorAction:
    """Structured intent returned by the Orchestrator LLM agent."""
    kind: str                           # e.g., REQUEST_CONTENT_CHANGE / REQUEST_PLAN_UPDATE / REQUEST_OTHER
    target_subtask_id: Optional[int]    # for content edits
    instructions: Optional[str]         # what the user wants changed
    needs_redo: bool                    # whether to redo worker output
    raw_text: str                       # original user message


def run_orchestrator_intent_agent(state, user_text: str) -> OrchestratorAction:
    """
    Replaces keyword heuristic with a real LLM agent that returns
    structured JSON describing the user's intent.
    """

    plan = state.plan if hasattr(state, "plan") else None
    subtasks = state.subtasks if hasattr(state, "subtasks") else None

    system_prompt = """
You are the Orchestrator Intent Parser for a multi-agent writing system.
Your job is to analyze the user's request and return a structured JSON action.

Rules:
- Determine if user wants to modify the plan (outline / structure),
  or modify content of a specific subtask,
  or ask something else.
- If content change: pick a target_subtask_id (best guess).
- If user change requires rewriting: needs_redo = true.
- ONLY output JSON. Do not add commentary.
"""

    user_prompt = f"""
User message: {user_text}

Current plan: {plan}
Current subtasks: {subtasks}

Return a JSON object:
{{
  "kind": "...",
  "target_subtask_id": 0 or null,
  "instructions": "...",
  "needs_redo": true/false
}}
"""

    result = call_llm_json(system_prompt, user_prompt)

    return OrchestratorAction(
        kind=result.get("kind", "REQUEST_OTHER"),
        target_subtask_id=result.get("target_subtask_id"),
        instructions=result.get("instructions"),
        needs_redo=result.get("needs_redo", False),
        raw_text=user_text,
    )

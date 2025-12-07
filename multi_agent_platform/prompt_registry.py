from __future__ import annotations

from pathlib import Path
from typing import Optional

from .plan_model import Plan, Subtask

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    path = PROMPTS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8").strip()


PLANNER_PROMPT = _load_prompt("planner_prompt.txt")
WORKER_PROMPT = _load_prompt("worker_prompt.txt")
COORDINATOR_PROMPT = _load_prompt("coordinator_prompt.txt")
COORDINATOR_CHAT_PROMPT = _load_prompt("coordinator_chat_prompt.txt")


def format_plan_for_prompt(plan: Plan) -> str:
    lines = [f"Plan: {plan.title} (id={plan.plan_id})", ""]
    for s in plan.subtasks:
        lines.append(f"- {s.id} [{s.status}]: {s.title}")
    return "\n".join(lines)


def build_worker_prompt(
    plan: Plan,
    subtask: Subtask,
    topic: str,
    user_feedback: Optional[str] = None,
) -> str:
    plan_text = format_plan_for_prompt(plan)
    base = (
        "任务主题：{topic}\n\n"
        "整体计划如下：\n"
        "{plan_text}\n\n"
        "当前子任务（{sub_id}: {sub_title}）：\n"
    )
    message = base.format(
        topic=topic,
        plan_text=plan_text,
        sub_id=subtask.id,
        sub_title=subtask.title,
    )
    if user_feedback:
        message += f"用户的修改要求：{user_feedback}\n\n请根据用户的反馈重新完成这个子任务。"
    else:
        message += "请只完成这个子任务对应的内容。"
    return message


def build_coordinator_review_prompt(
    plan: Plan,
    subtask: Subtask,
    worker_output: str,
) -> str:
    plan_text = format_plan_for_prompt(plan)
    return (
        "任务主题：{topic}\n\n"
        "整体计划：\n{plan_text}\n\n"
        "当前子任务（{sub_id}: {sub_title}）的执行结果如下：\n\n"
        "{result}\n\n"
        "请按照约定格式输出：\n"
        "第一行：ACCEPT 或 REDO\n"
        "第二行开始：给出原因和建议。"
    ).format(
        topic=plan.title,
        plan_text=plan_text,
        sub_id=subtask.id,
        sub_title=subtask.title,
        result=worker_output,
    )

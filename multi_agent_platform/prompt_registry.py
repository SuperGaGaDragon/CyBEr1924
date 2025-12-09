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
    extra_context: Optional[str] = None,
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
    if extra_context:
        message += f"\n额外上下文（请严格遵循）：\n{extra_context}\n\n"
    if user_feedback:
        message += f"用户的修改要求：{user_feedback}\n\n请根据用户的反馈重新完成这个子任务。"
    else:
        message += "请只完成这个子任务对应的内容。"
    return message


def build_coordinator_review_prompt(
    plan: Plan,
    subtask: Subtask,
    worker_output: str,
    *,
    extra_context: Optional[str] = None,
    strict_novel_mode: bool = False,
) -> str:
    plan_text = format_plan_for_prompt(plan)
    critic_line = "你是一名严格的小说评论家，请明确指出问题，并在需要时要求重写。" if strict_novel_mode else ""
    ctx = f"\n额外上下文（请严格参考）：\n{extra_context}\n" if extra_context else ""
    return (
        "任务主题：{topic}\n\n"
        "整体计划：\n{plan_text}\n\n"
        "当前子任务（{sub_id}: {sub_title}）的执行结果如下：\n\n"
        "{result}\n\n"
        "{critic}{ctx}"
        "请按照约定格式输出：\n"
        "第一行：ACCEPT 或 REDO\n"
        "第二行开始：给出原因和建议。\n"
        "如果你提供了修改后的正文，请在末尾追加一段以 `REVISED_TEXT:` 开头的修订稿（可多行）。"
    ).format(
        topic=plan.title,
        plan_text=plan_text,
        sub_id=subtask.id,
        sub_title=subtask.title,
        result=worker_output,
        critic=critic_line + ("\n" if critic_line else ""),
        ctx=ctx,
    )

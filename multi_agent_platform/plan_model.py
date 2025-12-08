from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any
import json
import uuid


@dataclass
class Subtask:
    """
    单个子任务：
    - id: 例如 "t1", "t2"
    - title: 子任务一句话描述
    - status: pending / in_progress / done / failed
    - notes: 备注（比如协调 AI 的点评）
    """
    id: str
    title: str
    status: str = "pending"
    description: str = ""
    notes: str = ""
    output: str = ""
    needs_redo: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "notes": self.notes,
            "output": self.output,
            "needs_redo": self.needs_redo,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Subtask":
        return cls(
            id=data["id"],
            title=data["title"],
            description=data.get("description", ""),
            status=data.get("status", "pending"),
            notes=data.get("notes", ""),
            output=data.get("output", ""),
            needs_redo=data.get("needs_redo", False),
        )


@dataclass
class Plan:
    """
    整体计划：
    - plan_id: 全局唯一 id
    - title: 计划标题（通常就是 topic）
    - subtasks: 子任务列表（顺序就是执行顺序）
    """
    plan_id: str
    title: str
    description: str = ""
    notes: str = ""
    subtasks: List[Subtask] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "title": self.title,
            "description": self.description,
            "notes": self.notes,
            "subtasks": [s.to_dict() for s in self.subtasks],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Plan":
        subtasks = [Subtask.from_dict(s) for s in data.get("subtasks", [])]
        return cls(
            plan_id=data["plan_id"],
            title=data["title"],
            description=data.get("description", ""),
            notes=data.get("notes", ""),
            subtasks=subtasks,
        )

    @classmethod
    def from_outline(cls, topic: str, outline: str) -> "Plan":
        """
        根据 Planner 给的 outline 文本，粗暴拆出子任务列表。

        规则很简单（以后可以升级）：
        - 每一行非空且不是大标题的，都当成一个子任务标题
        - 去掉前面的 '-', '*', '•', 数字序号等 bullet 符号
        """
        plan_id = f"plan-{uuid.uuid4().hex[:8]}"

        lines: List[str] = []
        for raw in outline.splitlines():
            line = raw.strip()
            if not line:
                continue
            # 跳过明显是标题的行
            if line.startswith("#") or "大纲" in line:
                continue

            # 去掉前面的项目符号/序号
            cleaned = line.lstrip("-*•0123456789. ").strip()
            if cleaned:
                lines.append(cleaned)

        subtasks = [
            Subtask(id=f"t{i+1}", title=title)
            for i, title in enumerate(lines)
        ]

        return cls(plan_id=plan_id, title=topic, subtasks=subtasks)

    def to_brief_text(self) -> str:
        """
        简单把 plan 变成文本，供 coordinator 回答问题。
        """
        lines = [f"Plan: {self.title} (id={self.plan_id})"]
        if self.notes:
            lines.append(f"Notes: {self.notes}")
        for subtask in self.subtasks:
            suffix = " (redo)" if getattr(subtask, "needs_redo", False) else ""
            lines.append(f"- [{subtask.status}] {subtask.id}: {subtask.title}{suffix}")
        return "\n".join(lines)

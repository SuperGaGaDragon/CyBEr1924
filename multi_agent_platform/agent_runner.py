from __future__ import annotations
from dataclasses import dataclass
import json
from typing import Dict, Any, Sequence, List

from openai import OpenAI
import os


@dataclass
class Agent:
    """
    通用 Agent：
    - name：角色名（planner / writer / reviewer / summarizer）
    - system_prompt：注入到 system role 的设定
    - model：使用的模型
    """

    name: str
    system_prompt: str
    model: str = "gpt-4.1-mini"

    def run(self, user_message: str | Sequence[Dict[str, Any]]) -> str:
        """
        给该 Agent 发送 user_message，让模型回复。
        """
        api_key = os.getenv("OPENAI_API_KEY")
        preview = (
            user_message if isinstance(user_message, str) else str(user_message)
        )
        preview = preview.replace("\n", " ")[:120]
        if not api_key:
            if self.name == "coordinator":
                return "ACCEPT\n[模拟] 自动判定当前子任务通过。"
            return "\n".join(
                [
                    (
                        f"[{self.name} 模拟回复] "
                        f"{self.system_prompt.splitlines()[0]} -> {preview}"
                    ),
                    "- 模拟产出 1：按照 subtask 生成具体内容",
                    "- 模拟产出 2：继续补全该段落",
                ]
            )

        base_url = os.getenv("OPENAI_BASE_URL")
        client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)

        if isinstance(user_message, str):
            messages = [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_message},
            ]
        else:
            messages = list(user_message)

        response = client.chat.completions.create(
            model=self.model,
            messages=messages,
        )

        return response.choices[0].message.content.strip()


def call_llm_json(
    system_prompt: str | None = None,
    user_prompt: str | None = None,
    messages: List[Dict[str, str]] | None = None,
    response_schema: Dict[str, Any] | None = None,
    model: str = "gpt-4.1-mini",
) -> Dict[str, Any]:
    """
    Call an LLM with JSON-mode enabled and return the parsed object.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        # Offline fallback for local development
        return {
            "kind": "REQUEST_OTHER",
            "target_subtask_id": None,
            "instructions": None,
            "needs_redo": False,
        }

    base_url = os.getenv("OPENAI_BASE_URL")
    client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)

    if messages is None:
        if system_prompt is None or user_prompt is None:
            raise ValueError("Either messages or both system_prompt and user_prompt must be provided.")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    response = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object", "schema": response_schema} if response_schema else {"type": "json_object"},
        messages=messages,
    )
    content = response.choices[0].message.content
    try:
        return json.loads(content) if content else {}
    except Exception:
        return {}

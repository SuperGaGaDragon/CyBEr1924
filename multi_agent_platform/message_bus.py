from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Union

from multi_agent_platform.session_store import ArtifactStore
from src import protocol  # 假设你的 protocol.py 在 src/protocol.py
from src.protocol import Envelope, PayloadType
from datetime import datetime


@dataclass
class MessageBus:
    """
    负责把 AI 之间的“消息”封装成 Envelope，并写入 logs。
    """

    store: ArtifactStore

    def _log_file(self, session_id: str) -> Path:
        logs_dir = self.store.logs_dir(session_id)
        return logs_dir / "envelopes.jsonl"

    def build_envelope(
        self,
        *,
        session_id: str,
        sender: str,
        recipient: str,
        payload_type: PayloadType | str,
        payload: Dict[str, Any],
        version: str = "1.0",
        timestamp: datetime | None = None,
    ) -> Envelope:
        """
        构造一个 Envelope 实例，自动把字符串 payload_type 转成枚举。
        """
        ts = timestamp or datetime.now(timezone.utc)
        payload_type_enum = (
            payload_type if isinstance(payload_type, PayloadType) else PayloadType(payload_type)
        )
        return protocol.build_envelope(
            version=version,
            session_id=session_id,
            source=sender,
            target=recipient,
            payload_type=payload_type_enum,
            payload=payload,
            timestamp=ts,
        )

    def append_envelope(self, session_id: str, envelope: Envelope) -> Dict[str, Any]:
        """
        把一个已经构造好的 Envelope 写入 jsonl ，并返回 dict 形式的内容。
        """
        envelope_dict = envelope.to_dict()
        validator = protocol.ProtocolValidator()
        validator.validate_envelope(envelope_dict)

        log_path = self._log_file(session_id)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(envelope_dict, ensure_ascii=False))
            f.write("\n")
            # Ensure data is flushed to disk to avoid race conditions
            f.flush()
            os.fsync(f.fileno())

        return envelope_dict

    def log_user_command(
        self,
        session_id: str,
        text: str,
        *,
        command: str | None = None,
        payload: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        """
        记录用户在 interactive_session 中的输入。
        """
        payload_body: Dict[str, Any] = {"text": text}
        if command is not None:
            payload_body["command"] = command
        if payload is not None:
            payload_body["payload"] = payload
        envelope = self.build_envelope(
            session_id=session_id,
            sender="user",
            recipient="coordinator",
            payload_type=PayloadType.USER_COMMAND,
            payload=payload_body,
        )
        return self.append_envelope(session_id, envelope)

    def log_progress_event(self, session_id: str, event: Dict[str, Any]) -> None:
        """
        Best-effort append of a progress event into envelopes.jsonl for diagnostics.
        Does not validate protocol schema to keep it lightweight.
        """
        log_path = self._log_file(session_id)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "payload_type": "progress_event",
            "timestamp": event.get("ts") or datetime.utcnow().isoformat(),
            "payload": event,
            "source": "orchestrator",
            "target": "observer",
            "version": "1.0",
            "session_id": session_id,
        }
        try:
            with log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False))
                f.write("\n")
        except Exception:
            # Logging is best-effort; ignore failures.
            return

    def send(
        self,
        *,
        session_id: str,
        sender: str,
        recipient: str,
        payload_type: PayloadType | str,
        payload: Dict[str, Any],
        version: str = "1.0",
    ) -> Dict[str, Any]:
        """
        构造一条 Envelope，调用协议层验证，并写入 logs/envelopes.jsonl。

        返回：通过验证后的 envelope dict（方便上层使用）。
        """

        # ⚠️ 这里根据你自己的 protocol.py 接口适当调整
        # 我假设有一个 build_envelope(...) 辅助函数
        envelope = self.build_envelope(
            session_id=session_id,
            sender=sender,
            recipient=recipient,
            payload_type=payload_type,
            payload=payload,
            version=version,
        )
        return self.append_envelope(session_id, envelope)

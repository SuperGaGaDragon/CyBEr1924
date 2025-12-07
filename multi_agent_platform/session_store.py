from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


# sessions 根目录 = 当前文件旁边的 sessions/
_SESSIONS_ROOT = Path(__file__).resolve().parent / "sessions"


@dataclass
class ArtifactRef:
    """
    与 protocol.py 里的 artifact_ref schema 对应的 Python 版本。
    """

    session_id: str
    artifact_id: str
    kind: str  # "markdown" | "code" | "json" | "text" 等
    path: str  # 相对于项目根/当前包的相对路径
    description: str = ""

    def to_payload(self) -> Dict[str, Any]:
        """
        转成可以放进 Envelope.payload 里的 dict，
        字段名要和 JSON Schema 对上。
        """
        return {
            "session_id": self.session_id,
            "artifact_id": self.artifact_id,
            "kind": self.kind,
            "path": self.path,
            "description": self.description,
        }


class ArtifactStore:
    """
    管理 sessions/<session_id>/artifacts/ 下的文件读写。

    以后所有 agent 想“记东西”，都通过这个来存成文件，
    再通过 ArtifactRef 在协议里互相传递。
    """

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or _SESSIONS_ROOT
        self.root.mkdir(parents=True, exist_ok=True)

    # ---------- Session 管理 ----------

    def create_session_id(self) -> str:
        """
        生成一个新的 session_id，并更新 session_index.json。
        """
        now = datetime.now(timezone.utc)
        ts = now.strftime("%Y%m%d-%H%M%S")
        random_part = uuid.uuid4().hex[:8]
        session_id = f"sess-{ts}-{random_part}"

        # Update session index
        self._update_session_index(session_id)

        return session_id

    def _update_session_index(self, session_id: str) -> None:
        """
        Update the session_index.json file with the new session.
        """
        index_path = self.root / "session_index.json"
        index = {"latest": session_id, "history": []}

        if index_path.exists():
            try:
                old = json.loads(index_path.read_text(encoding="utf-8"))
                history = old.get("history", [])
                # Add new session to history
                if session_id not in history:
                    history.append(session_id)
                index["history"] = history
            except Exception:
                # If corrupted, start fresh
                index["history"] = [session_id]
        else:
            index["history"] = [session_id]

        # Save updated index
        index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_session_index(self) -> Dict[str, Any]:
        """
        Get the session index.

        Returns:
            Dictionary with 'latest' and 'history' keys
        """
        index_path = self.root / "session_index.json"
        if not index_path.exists():
            return {"latest": None, "history": []}

        try:
            return json.loads(index_path.read_text(encoding="utf-8"))
        except Exception:
            return {"latest": None, "history": []}

    def session_dir(self, session_id: str) -> Path:
        """
        返回该 session 的根目录路径。
        """
        return self.root / session_id

    def artifacts_dir(self, session_id: str) -> Path:
        """
        返回该 session 的 artifacts/ 目录路径，并确保存在。
        """
        d = self.session_dir(session_id) / "artifacts"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def logs_dir(self, session_id: str) -> Path:
        """
        返回该 session 的 logs/ 目录路径，并确保存在。
        """
        d = self.session_dir(session_id) / "logs"
        d.mkdir(parents=True, exist_ok=True)
        return d

    # ---------- Artifact 读写 ----------

    def _guess_suffix(self, kind: str) -> str:
        """
        根据 kind 猜一个合适的文件后缀。
        """
        mapping = {
            "markdown": ".md",
            "md": ".md",
            "text": ".txt",
            "txt": ".txt",
            "json": ".json",
            "code": ".txt",  # 具体语言可以后续扩展
        }
        return mapping.get(kind, ".txt")

    def save_artifact(
        self,
        session_id: str,
        content: Any,
        *,
        artifact_id: Optional[str] = None,
        kind: str = "text",
        description: str = "",
    ) -> ArtifactRef:
        """
        保存一个 artifact，并返回 ArtifactRef。

        - session_id: 本次协作的会话 ID
        - content: 要保存的内容：
            - kind == "json" 时，期望是可 json 序列化的对象
            - 其他情况会被转成 str 再写入
        - artifact_id: 可选，未提供时自动生成一个
        - kind: "markdown" | "json" | "text" 等
        """
        if artifact_id is None:
            artifact_id = uuid.uuid4().hex[:12]

        suffix = self._guess_suffix(kind)
        filename = f"{artifact_id}{suffix}"

        artifacts_dir = self.artifacts_dir(session_id)
        file_path = artifacts_dir / filename

        if kind == "json":
            with file_path.open("w", encoding="utf-8") as f:
                json.dump(content, f, ensure_ascii=False, indent=2)
        else:
            # 其他情况统一转成字符串
            text = str(content)
            with file_path.open("w", encoding="utf-8") as f:
                f.write(text)

        # 生成相对路径（为了在 payload 里传得更短）
        rel_path = file_path.relative_to(self.root.parent)

        return ArtifactRef(
            session_id=session_id,
            artifact_id=artifact_id,
            kind=kind,
            path=str(rel_path),
            description=description,
        )

    def load_artifact_text(self, artifact_ref: ArtifactRef) -> str:
        """
        以纯文本方式读回 artifact 内容。
        不管是 markdown 还是 code 还是 txt，都可以用这个。
        """
        file_path = self._artifact_path_from_ref(artifact_ref)
        with file_path.open("r", encoding="utf-8") as f:
            return f.read()

    def load_artifact_json(self, artifact_ref: ArtifactRef) -> Any:
        """
        把 artifact 内容当 JSON 读回。
        """
        file_path = self._artifact_path_from_ref(artifact_ref)
        with file_path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _artifact_path_from_ref(self, artifact_ref: ArtifactRef) -> Path:
        """
        根据 ArtifactRef 的 path 字段找到真实文件。
        """
        # artifact_ref.path 是相对于 root.parent 的
        base = self.root.parent
        return base / artifact_ref.path

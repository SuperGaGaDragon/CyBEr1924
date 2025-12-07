# multi_agent_platform/db_session_store.py

from .db import SessionLocal, DbSession
from ..api_models import SessionSnapshotModel


def save_snapshot(session_id: str, snapshot: SessionSnapshotModel) -> None:
    """保存或更新一条 session 记录到数据库。"""
    data = snapshot.model_dump()  # 如果你还是 Pydantic v1，就改成 snapshot.dict()
    with SessionLocal() as db:
        db_obj = db.get(DbSession, session_id)
        if db_obj is None:
            db_obj = DbSession(id=session_id, snapshot=data)
            db.add(db_obj)
        else:
            db_obj.snapshot = data
        db.commit()


def load_snapshot(session_id: str) -> SessionSnapshotModel | None:
    """从数据库加载一条 session 记录，找不到则返回 None。"""
    with SessionLocal() as db:
        db_obj = db.get(DbSession, session_id)
        if db_obj is None:
            return None
        return SessionSnapshotModel(**db_obj.snapshot)

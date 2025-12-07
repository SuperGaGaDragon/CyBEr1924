# multi_agent_platform/db_session_store.py

from .db import SessionLocal, DbSession, DbUserSession
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


def link_user_session(user_id: str, session_id: str) -> None:
    """
    如果 (user_id, session_id) 关联不存在，则创建一条记录。
    """
    with SessionLocal() as db:
        existing = (
            db.query(DbUserSession)
            .filter(
                DbUserSession.user_id == user_id,
                DbUserSession.session_id == session_id,
            )
            .first()
        )
        if existing:
            return

        link = DbUserSession(user_id=user_id, session_id=session_id)
        db.add(link)
        db.commit()


def user_owns_session(user_id: str, session_id: str) -> bool:
    with SessionLocal() as db:
        exists = (
            db.query(DbUserSession)
            .filter(
                DbUserSession.user_id == user_id,
                DbUserSession.session_id == session_id,
            )
            .first()
        )
        return exists is not None


def list_session_ids_for_user(user_id: str) -> list[str]:
    with SessionLocal() as db:
        rows = db.query(DbUserSession).filter(DbUserSession.user_id == user_id).all()
        return [row.session_id for row in rows]

# multi_agent_platform/db.py
import os
from sqlalchemy import create_engine, Column, String, DateTime, func
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime

from .session_state import SessionSnapshotModel  # 你已有的 Pydantic 模型

# 1) 读取环境变量中的 DATABASE_URL（线上 Railway 会提供）
DATABASE_URL = os.getenv("DATABASE_URL", "")

# 本地开发如果没配 DATABASE_URL，就退回到 sqlite
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./local_dev.db"

# 2) 创建引擎 & 会话工厂
engine = create_engine(DATABASE_URL, future=True)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
)

# 3) 声明基类
Base = declarative_base()


# 4) 定义数据库中的 sessions 表
class DbSession(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, index=True)  # 直接用你的 session_id
    snapshot = Column(JSONB, nullable=False)          # 整个 SessionSnapshot 存成 JSONB
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# 5) 初始化数据库（建表）
def init_db() -> None:
    Base.metadata.create_all(bind=engine)

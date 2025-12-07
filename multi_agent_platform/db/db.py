# multi_agent_platform/db.py
import os
import uuid
from datetime import datetime

from sqlalchemy import (
    create_engine,
    Column,
    String,
    DateTime,
    func,
    JSON,
    ForeignKey,
    Boolean,
)
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.dialects.postgresql import JSONB

from ..api_models import SessionSnapshotModel  # Pydantic 模型

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

# 4) 确定使用的 JSON 类型 (PostgreSQL 用 JSONB，SQLite 用 JSON)
JSONType = JSONB if "postgresql" in DATABASE_URL else JSON


# 5) 定义数据库中的 sessions 表
class DbSession(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, index=True)  # 直接用你的 session_id
    snapshot = Column(JSONType, nullable=False)       # 整个 SessionSnapshot 存成 JSON/JSONB
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DbUser(Base):
    __tablename__ = "users"

    # 主键：UUID 字符串
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # 登录账号：邮箱
    email = Column(String, unique=True, index=True, nullable=False)

    # 密码哈希（不用存明文）
    password_hash = Column(String, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ✅ 邮箱验证相关字段
    is_verified = Column(Boolean, nullable=False, server_default="false")
    verification_code = Column(String, nullable=True)              # 最新验证码
    verification_expires_at = Column(DateTime(timezone=True), nullable=True)  # 过期时间


class DbUserSession(Base):
    """
    关联用户和 session：
    - 一个用户可以拥有多个 session
    - 一个 session 目前假定只属于一个用户
    """
    __tablename__ = "user_sessions"

    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# 5) 初始化数据库（建表）
def init_db() -> None:
    Base.metadata.create_all(bind=engine)

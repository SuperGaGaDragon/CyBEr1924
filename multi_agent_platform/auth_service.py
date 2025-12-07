# multi_agent_platform/auth_service.py
import os
import bcrypt
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from .db.db import SessionLocal, DbUser


# ===== 密码哈希相关 =====

def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


# ===== JWT Token 相关 =====

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24  # 24 小时有效期


def create_access_token(user_id: str, expires_minutes: int = JWT_EXPIRE_MINUTES) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    # PyJWT v2 返回 str
    return token


def decode_access_token(token: str) -> Optional[str]:
    """
    解析 access token，返回 user_id（sub），失败时返回 None。
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        sub = payload.get("sub")
        if not isinstance(sub, str):
            return None
        return sub
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_by_id(user_id: str) -> Optional[DbUser]:
    with SessionLocal() as db:
        return db.query(DbUser).filter(DbUser.id == user_id).first()


# ===== 邮箱验证码相关 =====

def generate_verification_code(length: int = 6) -> str:
    """生成一个数字验证码，比如 '483920'。"""
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def create_user(email: str, plain_password: str, ttl_minutes: int = 10) -> DbUser:
    """注册新用户 + 生成验证码。"""
    with SessionLocal() as db:
        # 检查邮箱是否已存在
        existing = db.query(DbUser).filter(DbUser.email == email).first()
        if existing:
            raise ValueError("Email already registered")

        user = DbUser(
            email=email,
            password_hash=hash_password(plain_password),
        )

        # 生成验证码
        code = generate_verification_code()
        user.verification_code = code
        user.verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)

        db.add(user)
        db.commit()
        db.refresh(user)

        # 暂时先用日志/print 代替真正发邮件
        print(f"[DEV ONLY] Verification code for {email} is {code}")

        return user


def get_user_by_email(email: str) -> Optional[DbUser]:
    with SessionLocal() as db:
        return db.query(DbUser).filter(DbUser.email == email).first()


def verify_email_code(email: str, code: str) -> bool:
    """校验邮箱验证码，成功则标记为已验证。"""
    with SessionLocal() as db:
        user = db.query(DbUser).filter(DbUser.email == email).first()
        if not user:
            return False

        # 检查验证码是否匹配 + 未过期
        if not user.verification_code or user.verification_code != code:
            return False

        now = datetime.now(timezone.utc)
        if user.verification_expires_at and user.verification_expires_at < now:
            return False

        # 验证成功，标记已验证，清空验证码
        user.is_verified = True
        user.verification_code = None
        user.verification_expires_at = None

        db.commit()
        return True

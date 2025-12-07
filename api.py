#!/usr/bin/env python3
"""
FastAPI server for the multi-agent platform.

Handles session creation, listing, snapshot retrieval, and command execution for the UI.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from multi_agent_platform.api_models import (
    CommandRequest,
    CreateSessionRequest,
    SessionSnapshotModel,
    SessionSummaryModel,
    RegisterRequest,
    VerifyEmailRequest,
    LoginRequest,
    AuthResponse,
)
from multi_agent_platform.message_bus import MessageBus
from multi_agent_platform.run_flow import Orchestrator
from multi_agent_platform.session_state import build_session_snapshot
from multi_agent_platform.session_store import ArtifactStore
from multi_agent_platform.db.db import init_db
from multi_agent_platform.db.db_session_store import save_snapshot
from multi_agent_platform.auth_service import (
    create_user,
    get_user_by_email,
    verify_email_code,
    verify_password,
)


# Initialize FastAPI
app = FastAPI(
    title="Multi-Agent Platform API",
    description="Unified API for the multi-agent collaboration platform",
    version="1.0.0",
)

# CORS middleware - configure allowed origins
origins = [
    "http://localhost:5173",                # Local frontend development
    "http://localhost:5174",                # Local frontend development (alternate port)
    "https://cyber1924.com",                # Production domain
    "https://cyber1924.pages.dev",          # Cloudflare Pages production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
init_db()

# Initialize orchestrator (singleton)
artifact_store = ArtifactStore()
message_bus = MessageBus(store=artifact_store)
orch = Orchestrator(artifact_store=artifact_store, message_bus=message_bus)


def _iso_datetime(ts: Optional[float]) -> Optional[datetime]:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, timezone.utc)


def _load_plan_title(session_id: str) -> Optional[str]:
    state_path = artifact_store.session_dir(session_id) / "state.json"
    if not state_path.exists():
        return None
    try:
        payload = json.loads(state_path.read_text(encoding="utf-8"))
        plan = payload.get("plan", {})
        return plan.get("title") or plan.get("plan_id")
    except Exception:
        return None


def _session_timestamps(session_id: str) -> tuple[Optional[float], Optional[float]]:
    session_dir = artifact_store.session_dir(session_id)
    created = None
    updated = None
    try:
        stat = session_dir.stat()
        created = getattr(stat, "st_ctime", None)
    except FileNotFoundError:
        return None, None
    state_path = session_dir / "state.json"
    if state_path.exists():
        try:
            state_stat = state_path.stat()
            updated = state_stat.st_mtime
        except FileNotFoundError:
            pass
    return created, updated


@app.get("/")
def read_root() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "message": "Multi-Agent Platform API", "version": "1.0.0"}


@app.post("/sessions", response_model=SessionSnapshotModel)
def create_session(request: CreateSessionRequest) -> SessionSnapshotModel:
    try:
        session_id, plan, state = orch.init_session(request.topic)
        snapshot = build_session_snapshot(artifact_store, state, message_bus)
        snapshot.command = "plan"
        snapshot.message = "Session created"
        snapshot_model = SessionSnapshotModel(**snapshot.to_dict())
        save_snapshot(session_id, snapshot_model)
        return snapshot_model
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/sessions", response_model=List[SessionSummaryModel])
def list_sessions() -> List[SessionSummaryModel]:
    index = artifact_store.get_session_index()
    history = index.get("history", [])
    seen: set[str] = set()
    summaries: List[SessionSummaryModel] = []
    for session_id in reversed(history):
        if session_id in seen:
            continue
        created_ts, updated_ts = _session_timestamps(session_id)
        topic = _load_plan_title(session_id)
        summaries.append(
            SessionSummaryModel(
                session_id=session_id,
                topic=topic,
                created_at=_iso_datetime(created_ts),
                last_updated=_iso_datetime(updated_ts),
            )
        )
        seen.add(session_id)
    return summaries


@app.get("/sessions/{session_id}", response_model=SessionSnapshotModel)
def get_session_snapshot(session_id: str) -> SessionSnapshotModel:
    try:
        state = orch.load_orchestrator_state(session_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    snapshot = build_session_snapshot(artifact_store, state, message_bus)
    snapshot.message = "Session snapshot loaded"
    return SessionSnapshotModel(**snapshot.to_dict())


@app.post("/sessions/{session_id}/command", response_model=SessionSnapshotModel)
def post_command(session_id: str, request: CommandRequest) -> SessionSnapshotModel:
    try:
        message_bus.log_user_command(
            session_id,
            request.command,
            command=request.command,
            payload=request.payload,
        )
        snapshot = orch.execute_command(
            session_id,
            request.command,
            payload=request.payload,
        )
        snapshot_model = SessionSnapshotModel(**snapshot)
        save_snapshot(session_id, snapshot_model)
        return snapshot_model
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ===== Authentication Endpoints =====

@app.post("/auth/register", response_model=AuthResponse)
def register(payload: RegisterRequest):
    """
    注册用户：创建用户 + 生成验证码（先打印在后台日志中）。
    """
    try:
        create_user(payload.email, payload.password)
    except ValueError as e:
        # 比如 Email already registered
        raise HTTPException(status_code=400, detail=str(e))

    return AuthResponse(
        message="Registered successfully. Please check your email for the verification code."
    )


@app.post("/auth/verify-email", response_model=AuthResponse)
def verify_email(payload: VerifyEmailRequest):
    """
    校验邮箱验证码，成功后将用户标记为 is_verified=True。
    """
    ok = verify_email_code(payload.email, payload.code)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    return AuthResponse(message="Email verified successfully.")


@app.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest):
    user = get_user_by_email(payload.email)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or password")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")

    # 这里先不做真正 JWT，后面可以再加
    return AuthResponse(message="Login successful.")


# ===== Run Server =====

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

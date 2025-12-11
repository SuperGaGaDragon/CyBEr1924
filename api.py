#!/usr/bin/env python3
"""
FastAPI server for the multi-agent platform.

Handles session creation, listing, snapshot retrieval, and command execution for the UI.
"""

from __future__ import annotations

import os
import json
import re
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import resend

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from multi_agent_platform.api_models import (
    CommandRequest,
    CreateSessionRequest,
    SessionSnapshotModel,
    SessionSummaryModel,
    EventsResponseModel,
    RegisterRequest,
    VerifyEmailRequest,
    LoginRequest,
    AuthResponse,
)
from multi_agent_platform.message_bus import MessageBus
from multi_agent_platform.run_flow import Orchestrator
from multi_agent_platform.session_state import build_session_snapshot
from multi_agent_platform.session_store import ArtifactStore
from multi_agent_platform.db.db import init_db, SessionLocal, DbSession, DbUserSession
from multi_agent_platform.db.db_session_store import (
    save_snapshot,
    load_snapshot,
    link_user_session,
    user_owns_session,
    list_session_ids_for_user,
)
from multi_agent_platform.auth_service import (
    create_user,
    get_user_by_email,
    verify_email_code,
    verify_password,
    create_access_token,
    decode_access_token,
    get_user_by_id,
)
from multi_agent_platform.session_state import OrchestratorState
from multi_agent_platform.plan_model import Plan


# Initialize FastAPI
app = FastAPI(
    title="Multi-Agent Platform API",
    description="Unified API for the multi-agent collaboration platform",
    version="1.0.0",
)

# CORS middleware - configure allowed origins
# Using allow_origin_regex to support all Cloudflare Pages preview/production URLs
origins = [
    "http://localhost:5173",                # Local frontend development
    "http://localhost:5174",                # Local frontend development (alternate port)
    "https://cyber1924.com",                # Production domain
]

# Regex pattern to match all Cloudflare Pages URLs (production and previews)
# Matches: cyber1924.pages.dev, *.cyber1924.pages.dev, cyber1924-production.up.railway.app
origin_regex = r"https://([a-z0-9-]+\.)?cyber1924\.pages\.dev|https://cyber1924-production\.up\.railway\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
init_db()

# Initialize Resend
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM")
ENV = os.getenv("ENV", "development")  # default to development for safety

if not RESEND_API_KEY or not EMAIL_FROM:
    # 这里不要直接 raise，让本地/测试还能跑；真正发邮件失败再报错
    print(f"[WARN] RESEND_API_KEY or EMAIL_FROM not set (ENV={ENV}); email sending will be disabled.")
else:
    resend.api_key = RESEND_API_KEY
    print(f"[INFO] Resend initialized successfully (ENV={ENV}, EMAIL_FROM={EMAIL_FROM})")

# Initialize orchestrator (singleton)
artifact_store = ArtifactStore()
message_bus = MessageBus(store=artifact_store)
orch = Orchestrator(artifact_store=artifact_store, message_bus=message_bus)

# Security scheme for JWT authentication
security = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    从 Authorization: Bearer <token> 中解析当前用户。
    如果没有 token 或无效，返回 401。
    """
    request_info = f"{request.method} {request.url.path}"

    if credentials is None:
        print(f"[AUTH] {request_info} - No Authorization header received")
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
    print(
        f"[AUTH] {request_info} - Received token prefix: {token[:20]}{'...' if len(token) > 20 else ''}"
    )
    user_id = decode_access_token(token)
    if not user_id:
        print(f"[AUTH] {request_info} - Token decode failed or expired")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = get_user_by_id(user_id)
    if not user:
        print(f"[AUTH] {request_info} - User {user_id} not found")
        raise HTTPException(status_code=401, detail="User not found")

    print(f"[AUTH] {request_info} - Authenticated user {user.id}")
    return user


def send_verification_email(email: str, code: str) -> None:
    """
    使用 Resend 发送邮箱验证码。如果失败，直接抛异常，让上层返回 500。
    """
    print(f"[DEBUG] Preparing to send verification email to {email} with code {code}")
    print(f"[DEBUG] RESEND_API_KEY set: {bool(RESEND_API_KEY)}, EMAIL_FROM: {EMAIL_FROM}")

    if not RESEND_API_KEY or not EMAIL_FROM:
        msg = "Missing RESEND_API_KEY or EMAIL_FROM"
        print(f"[ERROR] {msg}")
        raise HTTPException(status_code=500, detail=msg)

    params = {
        "from": EMAIL_FROM,
        "to": email,
        "subject": "Your Cyber1924 verification code",
        "html": (
            f"<p>Your verification code is: <b>{code}</b></p>"
            "<p>This code will expire in 10 minutes.</p>"
        ),
    }

    try:
        print(f"[DEBUG] Calling Resend.Emails.send with params: {params}")
        resend.Emails.send(params)
        print("[DEBUG] Resend.Emails.send returned successfully")
    except Exception as e:
        print(f"[ERROR] Resend send failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send verification email: {e}")


def _iso_datetime(ts: Optional[float]) -> Optional[datetime]:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, timezone.utc)

def _parse_since(ts_val: Optional[str | float | int]) -> Optional[datetime]:
    if ts_val is None:
        return None
    if isinstance(ts_val, (int, float)):
        return datetime.fromtimestamp(float(ts_val), timezone.utc)
    try:
        return datetime.fromisoformat(ts_val)
    except Exception:
        return None


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


def _load_progress_events(session_id: str, since: Optional[datetime]) -> list[dict]:
    """
    Load progress events from orchestrator_state plus progress_events.jsonl, optionally filtered by since timestamp.
    """
    events: list[dict] = []
    try:
        state = orch.load_orchestrator_state(session_id)
        for ev in state.progress_events or []:
            if not isinstance(ev, dict):
                continue
            ts_val = ev.get("ts")
            ts_dt = None
            if isinstance(ts_val, str):
                try:
                    ts_dt = datetime.fromisoformat(ts_val)
                except Exception:
                    ts_dt = None
            elif isinstance(ts_val, datetime):
                ts_dt = ts_val
            if since and ts_dt and ts_dt <= since:
                continue
            events.append(ev)
    except FileNotFoundError:
        pass

    log_path = artifact_store.logs_dir(session_id) / "progress_events.jsonl"
    if log_path.exists():
        try:
            with log_path.open("r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    obj = json.loads(line)
                    ts_str = obj.get("ts")
                    ts_dt = None
                    if isinstance(ts_str, str):
                        try:
                            ts_dt = datetime.fromisoformat(ts_str)
                        except Exception:
                            ts_dt = None
                    if since and ts_dt and ts_dt <= since:
                        continue
                    events.append(obj)
        except Exception:
            pass

    # If both sources are empty, try to extract from envelopes.jsonl as last resort
    if not events:
        envelope_log_path = artifact_store.logs_dir(session_id) / "envelopes.jsonl"
        if envelope_log_path.exists():
            try:
                with envelope_log_path.open("r", encoding="utf-8") as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            envelope = json.loads(line)
                            # Extract progress-related envelopes
                            # Look for any envelope that indicates progress (worker start/finish, etc.)
                            payload = envelope.get("payload", {})
                            source = envelope.get("source", "")
                            timestamp = envelope.get("timestamp")

                            # Filter by since timestamp
                            ts_dt = None
                            if isinstance(timestamp, str):
                                try:
                                    ts_dt = datetime.fromisoformat(timestamp)
                                except Exception:
                                    pass
                            if since and ts_dt and ts_dt <= since:
                                continue

                            # Try to construct a progress event from the envelope
                            # This is a best-effort reconstruction
                            if source in ["worker", "reviewer", "planner"]:
                                subtask_id = payload.get("subtask_id")
                                if subtask_id:
                                    events.append({
                                        "agent": source,
                                        "subtask_id": subtask_id,
                                        "stage": "finish",  # Assume finish if we see output
                                        "status": "completed",
                                        "ts": timestamp,
                                        "payload": {},
                                    })
                        except Exception:
                            continue
            except Exception:
                pass

    # Deduplicate by (agent, subtask_id, stage, ts)
    seen = set()
    deduped = []
    for ev in events:
        key = (ev.get("agent"), ev.get("subtask_id"), ev.get("stage"), ev.get("ts"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ev)
    deduped.sort(key=lambda e: str(e.get("ts") or ""))
    return deduped


def _load_worker_outputs_since(session_id: str, since: Optional[datetime]) -> list[dict]:
    """
    Load worker outputs from orchestrator_state cache.
    Fallback to envelopes.jsonl if cache is empty or file is missing.
    """
    outputs: list[dict] = []

    # Try to load from orchestrator_state cache first
    try:
        state = orch.load_orchestrator_state(session_id)
        for wo in state.worker_outputs or []:
            data = wo.to_dict() if hasattr(wo, "to_dict") else dict(wo)
            ts_val = data.get("timestamp")
            ts_dt = None
            if isinstance(ts_val, str):
                try:
                    ts_dt = datetime.fromisoformat(ts_val)
                except Exception:
                    ts_dt = None
            elif isinstance(ts_val, datetime):
                ts_dt = ts_val
            if since and ts_dt and ts_dt <= since:
                continue
            outputs.append(data)

        # If we found outputs in cache, return them
        if outputs:
            return outputs
    except FileNotFoundError:
        pass  # Fall through to envelope reading

    # Fallback: Read from envelopes.jsonl if cache is empty or missing
    from src.protocol import PayloadType
    try:
        log_path = artifact_store.logs_dir(session_id) / "envelopes.jsonl"
        if not log_path.exists():
            return outputs

        with log_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    envelope = json.loads(line)
                    payload_type = envelope.get("payload_type", "").upper()
                    if payload_type == "SUBTASK_RESULT" or payload_type == PayloadType.SUBTASK_RESULT.value:
                        payload = envelope.get("payload", {})
                        timestamp = envelope.get("timestamp")

                        # Filter by since timestamp
                        ts_dt = None
                        if isinstance(timestamp, str):
                            try:
                                ts_dt = datetime.fromisoformat(timestamp)
                            except Exception:
                                pass
                        if since and ts_dt and ts_dt <= since:
                            continue

                        # Extract worker output data
                        artifact_info = payload.get("result_artifact", {})
                        artifact_path = artifact_info.get("path")

                        # Read artifact content
                        content = ""
                        if artifact_path:
                            try:
                                full_path = artifact_store.base_dir / artifact_path
                                if full_path.exists():
                                    content = full_path.read_text(encoding="utf-8")
                            except Exception:
                                pass

                        outputs.append({
                            "subtask_id": payload.get("subtask_id"),
                            "subtask_title": payload.get("subtask_title", ""),
                            "artifact_path": artifact_path,
                            "content": content,
                            "preview": content[:400] if content else "",
                            "timestamp": timestamp,
                            "source": "envelopes_fallback",
                        })
                except Exception:
                    continue  # Skip malformed lines
    except Exception:
        pass  # Return whatever we've collected

    return outputs


@app.get("/")
def read_root() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "message": "Multi-Agent Platform API", "version": "1.0.0"}


@app.post("/sessions", response_model=SessionSnapshotModel)
def create_session(
    request: CreateSessionRequest,
    current_user = Depends(get_current_user),
) -> SessionSnapshotModel:
    try:
        session_id, plan, state = orch.init_session(
            request.topic,
            novel_mode=bool(request.novel_mode),
            novel_profile=request.novel_profile,
        )
        snapshot = build_session_snapshot(artifact_store, state, message_bus)
        snapshot.command = "plan"
        snapshot.message = "Session created"
        snapshot_model = SessionSnapshotModel(**snapshot.to_dict())
        save_snapshot(session_id, snapshot_model)
        link_user_session(current_user.id, session_id)
        return snapshot_model
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/sessions", response_model=List[SessionSummaryModel])
def list_sessions(current_user = Depends(get_current_user)) -> List[SessionSummaryModel]:
    session_ids = list_session_ids_for_user(current_user.id)

    summaries: List[SessionSummaryModel] = []
    for session_id in session_ids:
        snapshot = load_snapshot(session_id)
        if snapshot is None:
            continue
        summaries.append(
            SessionSummaryModel(
                session_id=session_id,
                topic=snapshot.topic,
                created_at=snapshot.created_at if hasattr(snapshot, 'created_at') else None,
                last_updated=snapshot.last_updated if hasattr(snapshot, 'last_updated') else None,
            )
        )

    return summaries


@app.get("/sessions/{session_id}", response_model=SessionSnapshotModel)
def get_session_snapshot(
    session_id: str,
    current_user = Depends(get_current_user),
) -> SessionSnapshotModel:
    if not user_owns_session(current_user.id, session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    # Always keep a DB fallback to avoid 404 when state files are missing
    snapshot_from_db = load_snapshot(session_id)
    if snapshot_from_db is None:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        state = orch.load_orchestrator_state(session_id)
        snapshot = build_session_snapshot(artifact_store, state, message_bus)
        snapshot.message = "Session snapshot loaded"
        return SessionSnapshotModel(**snapshot.to_dict())
    except FileNotFoundError:
        # State files were cleaned up or missing; fall back to the persisted snapshot
        snap_dict = snapshot_from_db.model_dump()
        snap_dict["message"] = snap_dict.get("message") or "Session snapshot loaded (from DB cache)"
        return SessionSnapshotModel(**snap_dict)


@app.get("/sessions/{session_id}/events", response_model=EventsResponseModel)
def get_session_events(
    session_id: str,
    since: Optional[str] = None,
    current_user = Depends(get_current_user),
) -> EventsResponseModel:
    if not user_owns_session(current_user.id, session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    since_dt = _parse_since(since)
    try:
        progress_events = _load_progress_events(session_id, since_dt)
        worker_outputs = _load_worker_outputs_since(session_id, since_dt)
        return EventsResponseModel(
            progress_events=progress_events,
            worker_outputs=worker_outputs,
            since=since_dt,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/sessions/{session_id}/command", response_model=SessionSnapshotModel)
def post_command(
    session_id: str,
    request: CommandRequest,
    current_user = Depends(get_current_user),
) -> SessionSnapshotModel:
    if not user_owns_session(current_user.id, session_id):
        raise HTTPException(status_code=404, detail="Session not found")

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
        # Attempt to restore missing state from DB snapshot, then retry once.
        snapshot_from_db = load_snapshot(session_id)
        if snapshot_from_db is None:
            raise HTTPException(status_code=404, detail="Session not found")

        # Rehydrate plan state.json
        plan_dict = snapshot_from_db.plan or {}
        plan_obj = Plan.from_dict(plan_dict) if plan_dict else Plan(plan_id=session_id, title=session_id)
        state_path = artifact_store.session_dir(session_id) / "state.json"
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps({"session_id": session_id, "plan": plan_obj.to_dict()}, ensure_ascii=False, indent=2), encoding="utf-8")

        # Rehydrate orchestrator_state
        orch_state_data = snapshot_from_db.orchestrator_state or {}
        if not orch_state_data:
            orch_state_data = {
                "session_id": session_id,
                "plan_id": plan_obj.plan_id,
                "status": "idle",
                "plan_locked": snapshot_from_db.plan_locked if hasattr(snapshot_from_db, "plan_locked") else False,
            }
        orch_state = OrchestratorState.from_dict(orch_state_data)
        orch.save_orchestrator_state(orch_state)

        # Retry once after restore
        try:
            snapshot = orch.execute_command(
                session_id,
                request.command,
                payload=request.payload,
            )
            snapshot_model = SessionSnapshotModel(**snapshot)
            save_snapshot(session_id, snapshot_model)
            return snapshot_model
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/sessions/{session_id}")
def delete_session(
    session_id: str,
    current_user = Depends(get_current_user),
) -> Dict[str, str]:
    """Delete a session (both file system and database)."""
    if not user_owns_session(current_user.id, session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        # Delete session directory from file system
        import shutil
        session_dir = artifact_store.session_dir(session_id)
        if session_dir.exists():
            shutil.rmtree(session_dir)

        # Delete session from database (both ownership link and snapshot)
        with SessionLocal() as db:
            db.query(DbUserSession).filter(DbUserSession.session_id == session_id).delete()
            db.query(DbSession).filter(DbSession.id == session_id).delete()
            db.commit()

        return {"message": f"Session {session_id} deleted successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(exc)}")


# ===== Authentication Endpoints =====

@app.post("/auth/register", response_model=AuthResponse)
def register(payload: RegisterRequest):
    """
    注册用户：创建用户 + 生成验证码并发邮件。
    """
    print(f"[REGISTER] Starting registration for {payload.email} (ENV={ENV})")

    try:
        verification_code = create_user(payload.email, payload.password)
        print(f"[REGISTER] User created: {payload.email}, verification_code: {verification_code}")
    except ValueError as e:
        # 比如 Email already registered
        print(f"[REGISTER] Failed to create user: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    # Development mode: auto-verify for testing
    if ENV == "development":
        print(f"[REGISTER] Development mode detected - auto-verifying user {payload.email}")
        try:
            from multi_agent_platform.db import get_user_by_email, get_db
            db = next(get_db())
            user = get_user_by_email(db, payload.email)
            if user:
                user.is_verified = True
                db.commit()
                print(f"[REGISTER] User {payload.email} auto-verified successfully")
            db.close()
        except Exception as e:
            print(f"[REGISTER] WARNING: Failed to auto-verify user: {e}")

    # Production mode: send verification email
    if RESEND_API_KEY and EMAIL_FROM:
        try:
            send_verification_email(payload.email, verification_code)
            print(f"[REGISTER] Verification email sent to {payload.email}")
        except Exception as e:
            print(f"[REGISTER] ERROR: Failed to send verification email: {e}")
            # In production, this should fail. In development, we already auto-verified.
            if ENV == "production":
                raise
    else:
        print(f"[REGISTER] WARNING: Email sending disabled (RESEND_API_KEY or EMAIL_FROM not set)")
        if ENV == "production":
            raise HTTPException(
                status_code=500,
                detail="Email service not configured. Please contact administrator."
            )

    message = "Registered successfully. Please check your email for the verification code."
    if ENV == "development":
        message = f"Registered successfully (development mode - auto-verified). Verification code: {verification_code}"

    return AuthResponse(message=message)


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

    token = create_access_token(user.id)

    return AuthResponse(
        message="Login successful.",
        access_token=token,
        token_type="bearer",
    )

# ===== Run Server =====

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

# Current Project Structure (Dec 2025)

## Root
- Backend entrypoint/tests/scripts: `api.py` (FastAPI server), `validate_mvp.py`, `verify_fastapi_ready.py`, `verify_prompts_ready.py`, `test_*` suites.
- Docs & summaries: `ARCHITECTURE_V2.md`, `FASTAPI_READY_SUMMARY.md`, `URL_SYNC_IMPLEMENTATION_SUMMARY.md`, `SESSION_RECOVERY_README.md`, etc.
- Local data/assets: `local_dev.db` (SQLite fallback), `frontend/assets/logocyber1924.png`.

## Backend (multi_agent_platform/)
- API/service layer: `api.py` routes leverage orchestrator + DB; auth and JWT in `auth_service.py`; request/response schemas in `api_models.py`.
- Orchestrator & agents: `run_flow.py`, `run_example.py`, `agent_runner.py`, `session_state.py`, `session_store.py`, `interactive_session*.py`, `interactive_coordinator.py`, `plan_model.py`, `prompt_registry.py`, `message_bus.py`.
- DB layer: `db/db.py` (SQLAlchemy engine/models for sessions/users), `db/db_session_store.py` (snapshot persistence, user-session links).
- Config/logs: `configs/`, `logs/`.
- Session artifacts: `sessions/<session_id>/` containing `state.json`, `orchestrator_state.json`, `logs/envelopes.jsonl`, and `artifacts/`.

## Frontend (multi_agent_platform/ui/)
- Vite + React + TypeScript app: `src/App.tsx` (auth, session list, URL sync), `src/api.ts` (client), `src/main.tsx`, styles `App.css` / `index.css`.
- Tooling/config: `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `index.html`.
- Assets/public/build: `src/assets/`, `public/`, production build in `dist/`.

## Protocol & Prompts
- Shared protocol definitions: `src/protocol.py` (envelope/payload schemas used by MessageBus and agents).
- Prompt templates: `prompts/` (planner/worker/coordinator); additional product/docs in `docs/` and `chanpinshuoming.txt`.

# Current Project Structure and Capabilities

## Root Layout
- `multi_agent_platform/`: core orchestration plus agent helpers (run_flow, session_store, message_bus, plan_model, interactive CLI).
- `src/`: shared protocol definitions (`protocol.py`) and schema helpers used by `MessageBus`.
- Top-level docs (`ARCHITECTURE_V2.md`, `IMPLEMENTATION_SUMMARY.md`, etc.) capture broader design goals and onboarding steps.

## Key Runtime Flow
- `run_example.py` now constructs an `ArtifactStore` & `MessageBus` and instantiates the configurable `Orchestrator`, which exposes `init_session`, `run_next_pending_subtask`, `run_all`, and `answer_user_question`.
- The orchestrator cycles through Planner → Worker → Coordinator, saving artifacts (`session_store.save_artifact`), emitting protocol-validated envelopes (`MessageBus.send`), and logging user queries via `MessageBus.log_user_command` to `sessions/<id>/logs/envelopes.jsonl`.
- `plan_model.Plan` parses Planner outlines into `Subtask`s, serializes to JSON, and exposes a brief text summary so other agents (or the interactive CLI) can share structured state.

## Messaging & Protocol
- `MessageBus` wraps `protocol.build_envelope` + `ProtocolValidator`, with helpers for building/appending envelopes and logging `user_command` payloads (`PayloadType.USER_COMMAND` added to `src/protocol.py`).
- Every agent interaction emits a schema-validated envelope (`plan_created`, `subtask_result`, `coord_decision`, `outline/draft/review/summary`, etc.), keeping `logs/envelopes.jsonl` linearizable for debugging or playback.

## Interactive Layer
- `interactive_session.py` drives a CLI that creates sessions, shows `/plan`, executes `/next` or `/all`, and routes free-form questions to `Orchestrator.answer_user_question`, preserving plan context for the coordinator.
- Commands and natural language inputs are recorded as envelopes so a future UI can replay both automated decisions and user intent.

## Testability & Usage
- `python3 -m multi_agent_platform.run_example` exercises the full sequence using stubbed agents when `OPENAI_API_KEY` is unset; real keys will hit OpenAI APIs per subtask.
- Sessions persist under `multi_agent_platform/sessions/`, making artifacts, logs, and plan snapshots available for replay or recovery.


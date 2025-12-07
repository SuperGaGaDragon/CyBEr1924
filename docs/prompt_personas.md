# Prompt Personas

This brief page explains the Planner / Worker / Coordinator personas and how they are wired into the system.

## Prompt files

Each persona lives in `prompts/` as a standalone file:

- `prompts/planner_prompt.txt` — accepts `Topic: ...` and outputs a `Plan Title` plus a numbered list of `t1`, `t2`, … subtasks. The instructions stress tiny actionable steps, language matching, and no delivery of actual content.
- `prompts/worker_prompt.txt` — receives the plan summary and current subtask, then outputs only the deliverable (text/code/etc.) for that subtask. The prompt forbids rewriting the plan or spilling meta commentary.
- `prompts/coordinator_prompt.txt` — reviews worker outputs, starts with `ACCEPT`/`REDO`, references the plan, and explicitly calls out commands such as `/insert_subtask`, `/set_current_subtask`, `/skip_subtask`, and `/update_subtask` when the plan should change.
- `prompts/coordinator_chat_prompt.txt` — worn by `answer_user_question`, it behaves like a PM/editor who explains progress, interprets vague requests, and tells users which commands/buttons to use when a plan adjustment is needed.

## Sanity check script

Run `python3 verify_prompts_ready.py` whenever you update the prompt files. It:

1. Calls the Planner to generate a mock plan and parses it through `Plan.from_outline`.
2. Uses the Worker prompt to generate a dummy deliverable for the first subtask.
3. Feeds that deliverable to the Coordinator prompt and checks that it emits `ACCEPT`/`REDO`.

With an OpenAI API key the script validates the actual model output flow; without the key it still runs via the built-in mock responses, so you can verify the structure locally.

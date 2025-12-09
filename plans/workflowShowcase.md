目标：让执行阶段能按 subtask 粒度实时出字（每个子任务完成后立即在 UI 展示对应输出/评审）

每一个子任务确保完成后，在[]中打✅

Phase 1
-[x] Step1: 后端执行异步化：next/all 改为触发后台任务，HTTP 立刻返回 running 状态和 current_subtask_id，避免阻塞到整批完成。（multi_agent_platform/run_flow.py:1164+, 1558+）
-[x] Step2: 进度/输出落盘：_append_progress_event 与 worker_output 写完即 save_orchestrator_state + 追加 progress_event 日志，保证轮询能读到进行中的状态。（multi_agent_platform/run_flow.py:80-105, 1310-1390）
-[x] Step3: 防重入：state.status=running 时阻止再次触发 next/all，防止并发写 state.json/logs 混乱。
-[x] Step4: 检查，确认没有bug

Phase 2
[x] Step 1: API 轮询/推送：新增 /sessions/{id}/events?since=ts（或 SSE）返回 progress_events、最新 worker_outputs 摘要；GET /sessions/{id} 支持读取 in-flight 状态而不依赖 command 返回。
[x] Step 2: 快照字段：增加 last_progress_event_ts / is_running / current_subtask_id to snapshot model，便于前端判断是否继续拉取。（multi_agent_platform/session_state.py, api_models）
-[x] Step 3: 数据回填：build_session_snapshot 支持从 progress_event 日志补齐缺失的 in_progress 记录，保证 UI timeline 连续。
-[x] Step4: 检查，确认没有bug

Phase 3
[x] Step 1: UI 调用模式：handleCommand/sendCommand 发送 next/all 后立即返回，启动轮询 getSession/events 直到 status 变 idle/completed；避免 setState.loading 挡住界面。（multi_agent_platform/ui/src/App.tsx:1111+）
[x] Step 2: 实时渲染：用 progress_events 填充 Worker/Reviewer timeline；收到新的 worker_output/coord_decision 时追加卡片并突出“已完成 tX”。
[x] Step 3: 交互/禁用：运行中禁用重复触发按钮并提示“执行中”；支持手动刷新或取消按钮（发 skip_subtask/stop 命令）。
[x] Step4: 检查，确认没有bug

Phase 4
[x] Step 1: 测试：添加 integration test 覆盖后台执行 + 轮询，验证 start 事件→worker_result→review_finish 顺序及 snapshot 可见性。（test_progress_events_flow.py 等）
[x] Step 2: 观察/回退：log 进度事件到 envelopes.jsonl，方便事后诊断；若后台任务异常，写 error status 并提示重试。
[x] Step 3: 文档：更新 QUICK_START/FRONTEND_INTEGRATION 说明新的轮询/事件接口与 UI 行为。
[x] Step4: 检查，确认没有bug

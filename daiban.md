## 进度概览

- [x] 基础“抽屉”打通（后端 + API + 前端类型）：plan_locked / orchestrator_messages / orch_events / planner_chat 字段与模型；序列化/反序列化；SessionSnapshot 透出；前端类型通过构建
- [x] Reviewer 完全退出用户聊天：后端过滤 reviewer/coordinator 消息；前端 Reviewer 列仅渲染 coord_decisions、无输入框
- [x] Orchestrator 基础消息管线：add_orchestrator_message；统一入口记录 user + run_orchestrator_turn，生成 orch_events & 内部说明
- [x] 规划阶段基础脚手架：session_mode(planning/execution)、PlanningView UI、confirm_plan 按钮、planner_chat 占位对话、占位 plan/subtasks 生成
- [x] Orchestrator 事件消费器 v0.1：仅消费 USER_MESSAGE，按 intent 回占位确认

## 目标 1：Orchestrator 接管用户对话
- [x] LLM/agent 意图识别：产出结构化行动（intent/target_subtask/needs_redo 等）并写标准 orch_events（当前仅关键词 heuristic）
- [x] 行动消费器升级：按 orch_events 真正触发 redo / plan 更新，接入现有 redo/plan 编辑流（当前仅 ACK 且会清空其他事件）
- [x] 用户主回复交给 orchestrator：汇总 planner/worker/reviewer 结果写 orchestrator_messages，主对话转向 orchestrator

## 目标 2：规划阶段与 plan 锁定
- [x] 规划模式入口：新 session 进入 planning，confirm_plan 将 session_mode 切到 execution
- [ ] ⏳ plan_locked 生效：锁后禁止 planner 路由/plan 编辑（现有 plan 命令与 ask fallback 仍可改 plan 或走 coordinator）
- [ ] ⏳ 真实 Planner 接入：用 planner agent 基于 planner_chat 更新 plan/subtasks，而非占位提示

## 目标 3：前端 orchestrator & 调试
- [x] 主聊天窗切换 orchestrator_messages 为对接人（当前仍是三栏 planner/worker/reviewer 视图）
- [ ] ⏳ （可选）orch_events / coord_decisions 调试视图

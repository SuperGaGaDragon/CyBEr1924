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
- [x] plan_locked 生效：锁后禁止 planner 路由/plan 编辑（现有 plan 命令与 ask fallback 仍可改 plan 或走 coordinator）
- [x] 真实 Planner 接入：用 planner agent 基于 planner_chat 更新 plan/subtasks，而非占位提示

## 目标 3：前端 orchestrator & 调试
- [x] 主聊天窗切换 orchestrator_messages 为对接人（当前仍是三栏 planner/worker/reviewer 视图）
- [ ] ⏳ （可选）orch_events / coord_decisions 调试视图



----------

###UI重新设计 
总要求：
1、尽量不要出现bug
2、现代、优雅、简约风格的设计。你有非常好的审美。是个优秀设计师。

stage1
- [x] 新建会话弹窗仅用于命名项目：提示文案改为“项目名称…”（需求在对话里说），占位符/引导改成让用户把需求发给 Planner。

stage2
- [x] 计划确认后恢复“三栏”执行视图：Plan（只读）、Worker（输出/当前子任务）、Reviewer（现有 coord_decisions）。禁用 plan 编辑。

- [x] Orchestrator 浮动对话框：右下角按钮打开/关闭，内容沿用现有 orchestrator 聊天，默认隐藏不占主视图。

stage3 

- [x] 允许用户调整三个板块（plan/worker/reviewer）宽度。

stage4

- [x] 三个板块(plan/worker/reviewer)都要可以分别scroll down（上下滑动）。（但不允许整体的左右和上下滑动）

- [ ] Worker的板块也要通过t1 t2这样的左上角黑色圆圈排序

-----

###工作进程透明化

目标：
- 每一个subtask都展现出worker和reviewer的工作进程。以subtask为单位生成

stage 1

stage 2

stage 3 


-----

### 小说专用模式设计

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

- [x] Worker的板块也要通过t1 t2这样的左上角黑色圆圈排序

- [x] worker 板块全板块右上角增添倒序button。如果点击，可以对现有的task倒序/正序排列。你是优秀设计师。用简明的图案设计这个button。

- [x] 当前worker板块的的task序号挡住了文字，请修复。

- [ ] reviewer 顶部带有“Task x”字样的白色圆圈请删除（当前与黑色圆圈t x重复，仅需保留黑色的和worker相同格式的）并重新编排序号，状态，日期的距离，使得他们好看。

- [ ] orchestrator 的对话框。用户可以通过拉取四个边角放大其尺寸，也可以在框上面栏通过按住鼠标在页面内自由拖动此对话框。

-----

## 当前最重要

- 现象：用户在 execution 阶段发起内容修改需求后，orchestrator 回复 “Unhandled event type: content_change”，未触发任何 redo/plan 更新，也没有可见的处理中状态。
- 根因：意图解析产出的 kind 是小写 `content_change`，但 `consume_orchestrator_events` 仅处理 `REQUEST_CONTENT_CHANGE/REQUEST_PLAN_UPDATE/REQUEST_OTHER/TRIGGER_REDO`；导致事件落入兜底分支，仅提示未处理。前端发送时清空输入，无 loading/spinner，进一步放大“什么都没发生”的感知。
- 影响：用户无法通过 orchestrator 修改内容或触发 redo；体验上像“无响应”，阻断 execution 期的自然语言指令入口。
- 解决计划：

stage1 
  - [x] 规范 orchestrator intent 输出：将 `run_orchestrator_intent_agent` 的 `action.kind` 映射到 `REQUEST_CONTENT_CHANGE` 等受支持的枚举（或在 `consume_orchestrator_events` 增加对小写 `content_change` 的兼容分支）。

stage2 
  - [x] 在 `consume_orchestrator_events` 中为 content change 生成 redo/notes，并透出一条 user-facing 确认消息（说明目标 subtask 与执行动作）。

stage3 
  - [x] 为 orchestrator 聊天增加发送中态/短暂占位（前端），避免“输入被清空但无反馈”的空窗；header 的 Thinking… 也可与 orchestrator 请求联动。

  stage4  
  - [x] 补充自动化/手动验证：发送 content 改名等指令应看到 redo 触发、worker/reviewer 输出更新，orchestrator 消息回执正确（含 pending 占位）。手动：执行态输入“改名/改内容”，确认 orch message 未提示未处理，worker/reviewer 有 redo/新输出。自动：补充一条集成测试覆盖 content_change → TRIGGER_REDO → worker/reviewer。

  ------

  ##我的期望

  目标：orchestrator受到用户请求后，判定是plan还是content。如果是plan，应该要求planner redo plan！如果是content，应该要求对应的worker redo subtask！

  stage 1
 - [ ] 定义统一的 intent kind 规范表：plan → REQUEST_PLAN_UPDATE，content → REQUEST_CONTENT_CHANGE；兼容大小写/别名（如 modify_plan）。

  stage 2
- [ ] 在 intent agent 输出后立即规范化 kind，事件队列不再出现未知枚举；记录 raw_kind 便于调试。

  stage 3
- [ ] 请求处理：REQUEST_PLAN_UPDATE 触发 planner 重跑/更新 plan+subtasks，并给 orchestrator 回执；REQUEST_CONTENT_CHANGE 触发标记 needs_redo + TRIGGER_REDO 调用 worker/reviewer。

  stage 4
- [ ] 前端反馈：plan/content 请求时展示 sending/redo 占位，planner/worker/reviewer 结果刷新后收起；Reviewer 列同步显示 redo/accept 状态。

  stage 5
- [ ]  验证：手动走 plan 改动与 content 改动各一条；自动测试覆盖两条路径（plan 更新写入 plan/subtasks，content 触发 redo 输出与 reviewer 状态）。





-----

###工作进程透明化

目标：
- worker和reviewer，每开始一个subtask，就显示一个subtask。

stage 1

stage 2

stage 3 


-----

### 小说专用模式设计

- stage 1

- [ ] 点击 add section之后，不要用Google 弹窗，正常弹出网页窗口。也是只允许黑白灰的简明现代风格。出现文字 “Please Name this Session" 。不需要加文字指路。

- Stage 2

- [ ] stage1新建的方框右下角出现一个椭圆形标识 novel mode。如果点击，会在用户进入和planner对话的页面前出现如下问题(全部用英文) 
必须回答完一个问题，才会出现下一个问题。

1、您的小说会是什么篇幅？
选项1：flash fiction (<1000 words)
选项2：short story (1000-7500 words)
选项3：novelette (7500-17500 words)
选项4：novella (17500-40000)
选项5：novel (40000+ words)

2、请输入您期望的小说发生的年份
选项1: 架空历史
选项2: 请输入大致年份区间（可以是未来年份）

3、请输入您的希望的题材

选项：Literary Fiction
选项：Fantasy
选项：Sci-Fi
选项：Mystery / Crime
选项：Horror
选项：Romance
选项：Historical
选项：Adventure
选项：Thriller
选项：Hybrid
选项：请输入您想到的其他体裁（如果有很多，“/”分割）：

4、请给出您已经想到的一些角色姓名和身份
角色姓名｜身份（如果没想好，可以不写）

5、您希望文笔类似什么风格
请输入（请描述风格，推荐您输入一个您希望我模仿的作家）

全部answer后，自动在对话框生成

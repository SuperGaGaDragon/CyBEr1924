目标：实现 Novel Mode（仅 novel_mode=true 时触发；默认关闭），覆盖问卷→planner/worker/reviewer 上下文策略与审稿修订。

每一个子任务完成后，在 [] 中打 ✅

Phase 0 — 模式开关与数据流
- [x] Step 0.1: 前端新建 Session 弹窗 + novel pill，提交时附上 `novel_mode` 开关；未勾选时保持现状（具体问卷内容见原需求草稿）。
- [x] Step 0.2: 问卷回答打包为 `novel_profile`（篇幅/年份/题材/角色表/风格/题目），随创建或首次 planner 消息传给后端；orchestrator state.extra 持久化 `novel_mode`、`novel_profile`。

Phase 1 — Planner 约束（仅 novel_mode）
- [ ] Step 1.1: 覆写/扩展 planner prompt，强制前置 t1–t4（Research、人物设定、情节设计、章节分配&概要），description 注入问卷信息并要求“cover full content”；t5+ 留给正文分解。
- [ ] Step 1.2: 真实 planner 输出后置处理：确保 t1–t4 存在/覆盖；stub planner 生成时直接加入固定四条。

Phase 2 — Worker 上下文
- [ ] Step 2.1: t1–t4 运行时注入累计 summary（题材/年份/风格/题目/人物表/前序产出），并将产出汇总为 `novel_summary_t1_t4` 存 state.extra。
- [ ] Step 2.2: t5+ 默认为单任务上下文，但 prompt 头部注入 `novel_summary_t1_t4`，description 要求“写完整内容”。

Phase 3 — Reviewer 行为
- [ ] Step 3.1: Reviewer prompt 加入“严格的小说评论家，明确指出问题”；每评审 5 个 task 清空对话，仅保留 `novel_summary_t1_t4` 背景（state.extra.reviewer_batch_counter）。
- [ ] Step 3.2: 允许 reviewer 返回修订版（notes + optional revised_text）；另存 artifact/字段，不覆盖原稿；前端提供“一键采纳”写回 worker output。

Phase 4 — 前端问卷与展示
- [ ] Step 4.1: 问卷 6 题线性 wizard（必答才能下一题，角色表增删行），提交后自动生成英文 summary 发给 planner。
- [ ] Step 4.2: Execution UI 显示 novel pill、章节 summary 提示、Reviewer Revised 区块；非 novel_mode 不受影响。

Phase 5 — QA/兼容
- [ ] Step 5.1: 测试 stub/真实 planner 下的 novel_mode 分支、关闭模式回归、t1–t4 强制/summary 注入/reviewer reset/修订保存。


--------------------
原需求草稿（供对照）
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
角色姓名｜身份信息（如果没想好，可以不写）
|
|（用户可以自由新加rows。每个row至少要有一个column填好）

5、您希望文笔类似什么风格
请输入（请描述风格，推荐您输入一个您希望我模仿的作家）

6、您想好的小说题目吗
选项一：Not yet (which is totally NOT a problem!)
选项二：请输入你想好的题目

全部answer后，自动在对话框生成一段涵盖刚才所有信息的话发给gpt。 

stage 3 
- [ ] 要求planner的agent的plan涉及到正文的内容，给worker的description中必须涵盖写完所有内容。

Stage 4
-[ ] 给planner额外prompt，当进入小说模式，前面几个task必须分别为：
t1: Research 请给出对于这种文学体裁，时间背景，相关风格的研究报告。
description：用户前面输入的小说发生年份、小说题材、风格、小说题目
t2: 人物设定
description：用户前面输入的人物设定
t3: 情节设计
t4: 章节分配&小说概要撰写
description：1、生成前4个task的概要（简明但清晰）2、对每个章节些什么进行分配

worker只在t1-t4保留上下文，其他都是每个task一个上下文

t1-t4完成后，新增worker和planner的交互。worker生成一份消息：信息summary+每个章节情节概要summary。放在每一个plan的prompt里面，让worker去写。reviewer 改成每5个task清空一次上下文，reviewer每次修改都有worker在t1-t4生成的summary。让他的修改意见必须是你是一个严格的小说评论家，让他明确地指出问题

t5-tx ：撰写正文

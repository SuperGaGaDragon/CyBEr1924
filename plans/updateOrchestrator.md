目标：定位并修复 orchestrator/前端交互问题，确保执行与计划编辑体验流畅

Purpose 1: 修复登录页/资源加载 404（图一）  
-[ ] Phase 1 Step 1: 复现 404（前端 Network/Console），确认请求 URL/host 与 CORS/代理配置是否正确。  
-[ ] Phase 1 Step 2: 校验后端路由与部署健康（Railway/反代），补充缺失的 CORS/路径或修正 API_BASE。  
-[ ] Phase 1 Step 3: 回归验证前端登录流程无 4xx/跨域报错。

Purpose 2: Reviewer timeline 可滚动  
-[ ] Phase 1 Step 1: 检查 reviewer timeline 容器样式/高度/overflow 设置，复现无法滚动的具体视口。  
-[ ] Phase 1 Step 2: 调整样式（overflow-y、flex/shrink 等）并验证长列表可滚动；补充回归用例/截图。

Purpose 3: Planner 修改后允许再次 Run All 并刷新产出  
-[ ] Phase 1 Step 1: 确认当前锁定逻辑与 run all 禁用条件，设计“改计划→重新执行”流程（含状态重置）。  
-[ ] Phase 1 Step 2: 实现 unlock/allow-rerun 逻辑（或允许锁后重新 run all），保证重新执行能刷新 snapshot/outputs。  
-[ ] Phase 1 Step 3: 手动/自动回归：计划修改后点击 Run All 能重新跑完并更新 UI。

Purpose 4: 恢复每个子任务的四个按钮并收纳到 Advanced Setting  
-[ ] Phase 1 Step 1: 挖掘旧版四按钮（Set current / Update / Insert below / Skip）渲染逻辑与数据绑定。  
-[ ] Phase 1 Step 2: 在 planner 对话 lock 后的计划列表中增加 per-subtask “Advance setting” 折叠按钮，展开后显示四个操作。  
-[ ] Phase 1 Step 3: 验证四个操作在锁定状态下仍可更新 plan（或按设计允许的范围），UI 状态与计划数据同步；补充回归说明。

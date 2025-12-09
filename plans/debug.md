新计划
你是非常有审美的设计师。做出来的东西非常好看，而且现代简约。之后的任何一个小项目完成后，就在[]当中打上✅

Phase 1：Reviewer 滚动修复  
- [✅] 1.1 审核布局：确认 main grid/Reviewer 容器的 overflow/minHeight/height 设置，找出阻断滚动的父元素（当前 Reviewer 外层 overflow: hidden + grid 高度约束）。  
  - 现状：执行态 section `#main-content` 本身 `overflow: hidden`（multi_agent_platform/ui/src/App.tsx:2191），内部 grid 容器 `layoutRef` `height: 100%` 且 `overflow: hidden`（:2195-2204），Reviewer 外层容器也 `height: "100%"`、`overflow: "hidden"`（:2970-2981）。即 Reviewer 的滚动层被两级 overflow hidden 限制在固定高度的 grid 里。  
- [✅] 1.2 方案：调整 Reviewer 容器（及父级）为 minHeight:0，允许子层 overflowY:auto 生效，必要时移除/放宽外层 overflow hidden。  
  - grid 容器移除 overflow 限制，改为 visible（multi_agent_platform/ui/src/App.tsx:2195-2204）。  
  - Reviewer 主容器移除 overflow hidden，改 visible，保留 minHeight:0（multi_agent_platform/ui/src/App.tsx:2970-2980）。  
  - Reviewer 内滚动层补充 minHeight:0，确保 flex 子项可滚动（multi_agent_platform/ui/src/App.tsx:2992-3001）。  
- [✅] 1.3 验证计划：手动滚动 Reviewer 列，保证卡片可滚动且不影响其他列。  
  - 操作步骤：进入 Execution 模式，Reviewer 列内存在多条决策卡片；滚轮/触控板在 Reviewer 列内上下滚动，确认列表可滚动且 Plan/Worker 列不随动。调整窗口高度/列宽后重复验证。  
  - 预期：滚动条仅出现在 Reviewer 列；头部标题和 ProgressStrip 保持在顶部；滚动不溢出到外层。  
  - 当前未在本地实际操作验证，请执行上述步骤确认。  

Phase 2：Timeline/Output 互斥切换  
- [✅] 2.1 设计状态：为 Worker/Reviewer 各自增加 viewMode 状态（"timeline" | "output"），默认 timeline。  
  - 新增 viewMode 类型与 state，默认 worker/reviewer 均为 timeline，并在切换 Session 时重置（multi_agent_platform/ui/src/App.tsx:600,709-716）。  
  - 将 viewMode 传入 Worker/Reviewer 列并带上 data-view-mode 以便后续 UI/逻辑切换（multi_agent_platform/ui/src/App.tsx:2217-2219,2806-2834,2982-2995）。  
- [✅] 2.2 UI：在列右上角新增切换按钮组（Timeline / Output），与现有排序按钮并排；切换时隐藏另一类内容。  
  - Worker 列：右上角添加切换组 + 原有排序按钮并排（multi_agent_platform/ui/src/App.tsx:2834-2890）。Reviewer 列：右上角添加切换组（multi_agent_platform/ui/src/App.tsx:3003-3028）。  
- [✅] 2.3 渲染逻辑：timeline 仅渲染 ProgressStrip/进度；output 仅渲染 outputs 列表（并可滚动）。  
  - Worker：timeline 展示 ProgressStrip 和空状态，output 模式仅渲染输出列表（multi_agent_platform/ui/src/App.tsx:2891-2958）。  
  - Reviewer：timeline 展示 ProgressStrip；output 模式显示决策列表滚动容器（multi_agent_platform/ui/src/App.tsx:3029-3118）。  
- [✅] 2.4 验证计划：切换互斥，无重叠；排序按钮仍可用。  
  - 手动步骤：在 Execution 模式切换 Worker/Reviewer 上方的 Timeline/Output，观察仅相应内容渲染；Worker 排序按钮在 Output 模式仍可切换顺序；Reviewer Output 模式列表可滚动。调整窗口大小/列宽后重复。  
  - 预期：切换时另一类内容完全隐藏，滚动只作用于 Output 列表区域；Timeline 模式下进度条不被截断。  
  - 未实际操作验证，请按步骤检查。  

Phase 3：Reviewer 排序按钮  
- [✅] 3.1 复用 Worker 排序逻辑（升降序 toggle）。  
  - Reviewer 列新增 descending state，按 timestamp/ts 排序，默认最新在前，切换逆序（multi_agent_platform/ui/src/App.tsx:3010-3052,3144-3184）。  
- [✅] 3.2 UI：放在 Reviewer 右上，与 view toggle 同区域，确保 z-index 足够，点击不被遮挡。  
  - 右上角添加与 Worker 相同样式的排序按钮，紧挨 Timeline/Output 组（multi_agent_platform/ui/src/App.tsx:3069-3136）。  
- [✅] 3.3 验证计划：排序切换生效，列表顺序变化可见。  
  - 手动步骤：切到 Reviewer Output 模式，点击排序按钮，观察决策卡片时间顺序前后切换；在 Timeline 模式不影响进度渲染。  
  - 预期：默认最新在前；切换后按时间升序。未实际操作验证，请执行上述步骤确认。  

Phase 4：输出展示优化  
- [✅] 4.1 输出截断：output 模式下默认显示前 ~300 词/字符 preview，保留进度标签。  
  - Worker output 模式输出卡片使用 300 字符预览，保留 T 序号与时间信息（multi_agent_platform/ui/src/App.tsx:2927-2959）。  
- [✅] 4.2 “View all”：在每条输出加按钮，打开全文（artifact 或生成 Blob HTML）。  
  - 每条输出附 “View all” 按钮，打开/下载单条 HTML，内容做简单 escape 处理（multi_agent_platform/ui/src/App.tsx:2853-2913,2927-2959）。  
- [✅] 4.3 “Pack everything”：按钮收集全部 outputs 生成单页 HTML（含标题/全文），提供下载/新窗口打开。  
  - Worker header 在 Output 模式显示 Pack everything，生成合并 HTML 打开并触发下载（multi_agent_platform/ui/src/App.tsx:2851-2889）。  
- [✅] 4.4 验证计划：预览不撑满页面；全文可查看；打包文件内容完整。  
  - 手动：切到 Worker Output，检查卡片预览截断；点击 View all 新窗口和下载文件含完整正文；点击 Pack everything 生成汇总页面并下载；长文本不撑满布局。  
  - 未实际操作验证，请按步骤检查。  

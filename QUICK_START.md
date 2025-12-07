# 快速开始指南

## 🚀 立即使用

### 1. 启动交互式会话

```bash
cd /Users/alex/Desktop/ai_environment
python3 multi_agent_platform/interactive_session.py
```

### 2. 选项 A：新建会话

```
新建 Session，请输入主题：编写一个 Python 快速排序函数

✅ 已创建 session: sess-20251207-xxx
```

### 2. 选项 B：恢复已有会话

```
可恢复的会话：
  1. sess-20251207-042846-aed3cfc5
  2. sess-20251207-035612-a1b2c3d4

选择: 1
✅ 已恢复 session: sess-20251207-042846-aed3cfc5
```

## 📋 可用命令

| 命令 | 说明 |
|------|------|
| `/plan` | 查看当前计划（所有子任务及状态） |
| `/next` | 执行下一个待处理的子任务 |
| `/all` | 自动执行所有剩余子任务 |
| `/help` | 显示帮助信息 |
| `/exit` | 退出会话 |

## 💬 对话示例

除了命令，你还可以直接问问题：

```
你> 当前进度如何？
[Coordinator] 已完成 3/10 个子任务...

你> 最近完成了什么？
[Coordinator] 最近完成了"设计算法逻辑"，产出了详细的伪代码...

你> 下一步要做什么？
[Coordinator] 下一步是"编写代码实现"...
```

## 🔧 运行测试

### 基础功能测试

```bash
python3 test_recovery.py
```

### 完整验收测试

```bash
python3 validate_mvp.py
```

## 📂 会话文件位置

所有会话数据保存在：

```
multi_agent_platform/sessions/{session_id}/
├── state.json              # 会话状态（用于恢复）
├── artifacts/              # 所有产物文件
│   ├── xxx.md
│   └── xxx.json
└── logs/
    └── envelopes.jsonl     # 完整消息日志
```

## 🎯 典型工作流程

### 场景 1：一次性完成任务

```bash
$ python3 multi_agent_platform/interactive_session.py
主题: 实现二叉树遍历

你> /all
▶ 正在完成所有剩余子任务……
✅ 所有子任务已完成
```

### 场景 2：分步执行和检查

```bash
$ python3 multi_agent_platform/interactive_session.py
主题: 设计 REST API

你> /next
✅ 完成：设计 API 路由

你> 当前进度如何？
[Coordinator] 已完成 1/5，当前在设计数据模型...

你> /next
✅ 完成：设计数据模型

你> /plan
Plan: 设计 REST API
  - [done] t1: 设计 API 路由
  - [done] t2: 设计数据模型
  - [pending] t3: 编写控制器逻辑
  ...
```

### 场景 3：中断后恢复

```bash
# 第一次运行
$ python3 multi_agent_platform/interactive_session.py
主题: 构建电商系统

你> /next
你> /next
你> /next
# ... 中途退出 ...

# 第二次运行
$ python3 multi_agent_platform/interactive_session.py
选择: 1  # 选择上次的会话

✅ 已恢复，继续执行...
你> /all  # 完成剩余任务
```

## 📊 查看会话详情

### 查看状态文件

```bash
cat multi_agent_platform/sessions/sess-xxx/state.json
```

### 查看消息日志

```bash
cat multi_agent_platform/sessions/sess-xxx/logs/envelopes.jsonl | jq .
```

### 查看产物

```bash
ls multi_agent_platform/sessions/sess-xxx/artifacts/
cat multi_agent_platform/sessions/sess-xxx/artifacts/xxx.md
```

## 🐛 故障排查

### 问题：无法恢复会话

**检查**：state.json 是否存在
```bash
ls multi_agent_platform/sessions/sess-xxx/state.json
```

### 问题：AI 回答不准确

**原因**：可能缺少 API key 或模型配置

**解决**：检查 `run_flow.py` 中的 `OrchestratorConfig`

### 问题：找不到已有会话

**检查**：sessions 目录是否存在
```bash
ls -la multi_agent_platform/sessions/
```

## 📖 更多文档

- [SESSION_RECOVERY_README.md](SESSION_RECOVERY_README.md) - 详细功能文档
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - 实现总结
- 源代码注释

## 🖥️ 运行 Web UI

后端：
```bash
uvicorn api:app --reload
```

前端：
```bash
cd ui
npm install   # 第一次
npm run dev
```

浏览器打开 `http://localhost:8000/docs` 查看接口文档，或在 UI 中访问 `http://localhost:5173/`（端口由前端配置决定）观察 Planner / Worker / Coordinator 三栏协作。

## 🌐 REST API Overview for UI / Integrations

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/sessions` | 创建新 session，并同时保存 Planner 产出的初始计划 |
| GET | `/sessions` | 列出所有可恢复的 session（用于左侧列表） |
| GET | `/sessions/{id}` | 获取指定 session 的最新 snapshot（供 UI 渲染） |
| POST | `/sessions/{id}/command` | 发送 `plan`/`next`/`all`/`ask` 和新增的流程控制命令（`set_current_subtask`/`insert_subtask`/`update_subtask`/`append_subtask`/`skip_subtask`） |

示例请求：

```json
{
  "command": "set_current_subtask",
  "payload": {
    "subtask_id": "t2"
  }
}
```

```json
{
  "command": "insert_subtask",
  "payload": {
    "after_id": "t3",
    "title": "撰写第 4 节总结"
  }
}
```

通过此 REST 接口，右侧 Coordinator / 提问栏可以控制 Planner 计划、中间 Worker 执行子任务，左侧计划也能随时被重新排序。

## 🎉 开始使用

现在就试试吧！

```bash
python3 multi_agent_platform/interactive_session.py
```

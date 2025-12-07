# Quick Start - V3 统一系统

## 🎯 V3 = V2 的交互功能 + FastAPI

V3 不是一个新版本，而是 V2 自然演进的结果：
- **V2**: 交互式审核（用户可以说"改成蓝色"）
- **V3**: V2 + FastAPI + 统一接口

---

## 🚀 快速开始

### 1. CLI 模式（推荐用于开发）

```bash
# 启动交互式会话
python3 -m multi_agent_platform.interactive_session

# 示例对话
你> 写一个关于嘎嘎龙的故事

你> /next
📄 Worker 产出:
【嘎嘎龙的冒险】
嘎嘎龙是一只绿色的小龙...

💬 满意吗？
你> 不，我希望是蓝色的龙

✓ 已根据你的要求重新生成:
【嘎嘎龙的冒险】
嘎嘎龙是一只蓝色的小龙...

满意吗？
你> 好

✅ 已接受当前产出，进入下一步
```

### 2. API 模式（推荐用于生产）

```bash
# 启动 API 服务器
python3 api.py

# 访问文档
open http://localhost:8000/docs
```

---

## 📡 API 使用示例

### Python 客户端

```python
import requests

BASE_URL = "http://localhost:8000"

# 1. 创建会话
resp = requests.post(f"{BASE_URL}/sessions", json={
    "topic": "写一个关于嘎嘎龙的故事"
})
data = resp.json()
session_id = data["session_id"]
print(f"Session ID: {session_id}")

# 2a. 自动模式（AI 审核）
resp = requests.post(f"{BASE_URL}/command", json={
    "session_id": session_id,
    "command": "/next"
})
print(resp.json()["message"])

# 2b. 交互模式（用户审核）
resp = requests.post(f"{BASE_URL}/command", json={
    "session_id": session_id,
    "command": "/next",
    "interactive": True  # 启用交互模式
})
data = resp.json()
print(data["message"])  # Worker 产出预览
print(f"Mode: {data['mode']}")  # "reviewing"

# 3. 提出修改
resp = requests.post(f"{BASE_URL}/command", json={
    "session_id": session_id,
    "command": "不，改成蓝色的龙",
    "interactive": True
})
print(resp.json()["message"])

# 4. 接受产出
resp = requests.post(f"{BASE_URL}/command", json={
    "session_id": session_id,
    "command": "好",
    "interactive": True
})
data = resp.json()
print(f"Mode: {data['mode']}")  # "idle"（已完成审核）
```

### JavaScript 客户端

```javascript
const BASE_URL = "http://localhost:8000";

// 1. 创建会话
const createResp = await fetch(`${BASE_URL}/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ topic: "写一个关于嘎嘎龙的故事" })
});
const { session_id } = await createResp.json();

// 2. 交互模式执行
const nextResp = await fetch(`${BASE_URL}/command`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    session_id,
    command: "/next",
    interactive: true
  })
});
const data = await nextResp.json();
console.log(data.message);  // Worker 产出
console.log(data.mode);     // "reviewing"

// 3. 提出修改
const feedbackResp = await fetch(`${BASE_URL}/command`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    session_id,
    command: "不，改成蓝色的龙",
    interactive: true
  })
});
const newData = await feedbackResp.json();
console.log(newData.message);  // 新产出
```

### cURL

```bash
# 1. 创建会话
SESSION_ID=$(curl -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"topic":"写一个关于嘎嘎龙的故事"}' \
  | jq -r '.session_id')

# 2. 交互模式执行
curl -X POST http://localhost:8000/command \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"command\":\"/next\",\"interactive\":true}"

# 3. 提出修改
curl -X POST http://localhost:8000/command \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"command\":\"不，改成蓝色的龙\",\"interactive\":true}"

# 4. 接受
curl -X POST http://localhost:8000/command \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"command\":\"好\",\"interactive\":true}"
```

---

## 🎮 两种模式对比

### 自动模式（默认）

**适用场景**: 批量处理、CI/CD、自动化任务

**特点**:
- AI 自动审核 Worker 产出
- 无需人工介入
- 快速完成所有任务

**API 调用**:
```json
{
  "session_id": "sess-xxx",
  "command": "/next"
  // 不设置 interactive，默认 false
}
```

### 交互模式

**适用场景**: 内容创作、需要精细控制、用户定制

**特点**:
- 用户手动审核每个产出
- 可以提出修改意见（"改成蓝色"）
- Worker 根据反馈重新生成
- 多轮对话直到满意

**API 调用**:
```json
{
  "session_id": "sess-xxx",
  "command": "/next",
  "interactive": true  // 启用交互模式
}
```

---

## 📋 可用命令

### CLI 命令

| 命令 | 说明 | 交互模式 |
|------|------|----------|
| `/plan` | 查看当前计划 | - |
| `/next` | 执行下一个任务 | ✓ 进入审核 |
| `/all` | 自动完成所有任务 | ✗ 自动模式 |
| `/help` | 显示帮助 | - |
| `/exit` | 退出 | - |
| 自然语言 | 对话或修改计划 | ✓ 如果在审核中 |

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 健康检查 |
| `/sessions` | POST | 创建会话 |
| `/sessions` | GET | 列出所有会话 |
| `/sessions/{id}/state` | GET | 获取会话状态 |
| `/sessions/{id}/plan` | GET | 获取会话计划 |
| `/command` | POST | **统一命令入口** ⭐ |

---

## 🔄 交互审核流程

### 状态转换图

```
         /next (interactive=true)
idle ─────────────────────────────> reviewing
                                         │
                                         │ 用户: "不，改成蓝色"
                                         ↓
                                    reviewing
                                         │
                                         │ 用户: "好"
                                         ↓
                                      idle
```

### 完整流程示例

```python
# 1. 执行任务
POST /command {"session_id": "...", "command": "/next", "interactive": true}
→ Response:
{
  "ok": true,
  "message": "📄 Worker 产出:\n嘎嘎龙是绿色的...\n\n💬 满意吗？",
  "mode": "reviewing",
  "context": {
    "subtask": {...},
    "worker_output": "...",
    "artifact_ref": {...}
  }
}

# 2. 用户不满意，提出修改
POST /command {"session_id": "...", "command": "不，改成蓝色", "interactive": true}
→ Response:
{
  "ok": true,
  "message": "✓ 已根据你的要求重新生成:\n嘎嘎龙是蓝色的...\n\n满意吗？",
  "mode": "reviewing",  // 仍在审核中
  "context": {...}
}

# 3. 用户满意，接受
POST /command {"session_id": "...", "command": "好", "interactive": true}
→ Response:
{
  "ok": true,
  "message": "✅ 已接受当前产出，进入下一步",
  "mode": "idle",  // 退出审核模式
  "context": null
}
```

---

## 🛠️ 故障排查

### Q: API 返回 404 "Session not found"

**A**: 确保先创建会话：
```bash
curl -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"topic":"你的主题"}'
```

### Q: 交互模式没有生效

**A**: 检查请求中是否包含 `"interactive": true`：
```json
{
  "session_id": "sess-xxx",
  "command": "/next",
  "interactive": true  // 必须显式设置
}
```

### Q: Worker 产出不符合预期

**A**: 使用交互模式，多次提出修改：
```bash
你> 不，加入更多细节
你> 不，改成幽默风格
你> 好
```

### Q: 如何查看所有会话？

**A**:
```bash
# CLI
python3 -m multi_agent_platform.interactive_session
# 启动时会显示可恢复的会话

# API
curl http://localhost:8000/sessions
```

---

## 📚 相关文档

- [完整 API 文档](API_README.md)
- [FastAPI 就绪报告](FASTAPI_READY_SUMMARY.md)
- [V2→V3 合并说明](V2_TO_V3_MERGE_SUMMARY.md)
- [交互协调器文档](ARCHITECTURE_V2.md)

---

## 🎯 最佳实践

### 1. 开发时使用 CLI

```bash
# 快速迭代，实时反馈
python3 -m multi_agent_platform.interactive_session
```

### 2. 生产环境使用 API

```bash
# 启动服务器
uvicorn api:app --host 0.0.0.0 --port 8000 --workers 4

# 或使用 Docker
docker run -p 8000:8000 multi-agent-api
```

### 3. 选择合适的模式

- **自动模式**: 批量任务、CI/CD、自动化流程
- **交互模式**: 内容创作、用户定制、质量控制

### 4. 会话管理

```python
# 创建新会话
session_id = create_session("主题")

# 执行任务
execute_command(session_id, "/all")  # 自动完成

# 或交互式
execute_command(session_id, "/next", interactive=True)
# ... 多轮对话 ...

# 查看结果
get_session_plan(session_id)
```

---

## 🎉 总结

**V3 = V2 + FastAPI + 统一接口**

- ✅ CLI 和 API 使用相同的 `execute_command()`
- ✅ 支持自动和交互两种模式
- ✅ 完整的状态持久化
- ✅ 向后兼容 V1 和 V2
- ✅ 准备好上云部署

**立即开始使用！** 🚀

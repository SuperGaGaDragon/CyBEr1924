# Multi-Agent Platform API

## 🎯 概述

基于 FastAPI 的统一 API 服务，所有逻辑通过 `execute_command` 统一处理。

## 🚀 快速开始

### 安装依赖

```bash
pip install fastapi uvicorn pydantic
```

### 启动服务器

```bash
python3 api.py
```

或使用 uvicorn：

```bash
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

### 访问文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 📡 API 端点

### 1. 健康检查

```http
GET /
```

**响应**:
```json
{
  "status": "ok",
  "message": "Multi-Agent Platform API",
  "version": "1.0.0"
}
```

### 2. 创建会话

```http
POST /sessions
Content-Type: application/json

{
  "topic": "写一个 Python 排序算法"
}
```

**响应**:
```json
{
  "session_id": "sess-20251207-xxx",
  "plan": {
    "plan_id": "plan-xxx",
    "title": "...",
    "subtasks": [...]
  },
  "state": {
    "session_id": "sess-20251207-xxx",
    "plan_id": "plan-xxx",
    "status": "idle",
    "current_subtask_id": null
  }
}
```

### 3. 列出所有会话

```http
GET /sessions
```

**响应**:
```json
{
  "latest": "sess-20251207-xxx",
  "history": ["sess-20251207-xxx", "sess-20251207-yyy"]
}
```

### 4. 获取会话状态

```http
GET /sessions/{session_id}/state
```

**响应**:
```json
{
  "session_id": "sess-20251207-xxx",
  "plan_id": "plan-xxx",
  "status": "idle",
  "current_subtask_id": null,
  "extra": {}
}
```

### 5. 获取会话计划

```http
GET /sessions/{session_id}/plan
```

**响应**:
```json
{
  "session_id": "sess-20251207-xxx",
  "plan": {
    "plan_id": "plan-xxx",
    "title": "...",
    "subtasks": [...]
  }
}
```

### 6. ⭐ 执行命令（统一入口）

```http
POST /command
Content-Type: application/json

{
  "session_id": "sess-20251207-xxx",
  "command": "/next"
}
```

**支持的命令**:
- `/plan` - 查看当前计划
- `/next` - 执行下一个子任务
- `/all` - 执行所有剩余子任务
- `当前进度如何？` - 自然语言问答

**响应**:
```json
{
  "ok": true,
  "message": "已执行一个子任务",
  "data": {
    "plan": {...},
    "state": {...}
  }
}
```

## 💡 使用示例

### Python 客户端

```python
import requests

BASE_URL = "http://localhost:8000"

# 1. 创建会话
response = requests.post(f"{BASE_URL}/sessions", json={
    "topic": "实现快速排序"
})
session_data = response.json()
session_id = session_data["session_id"]

# 2. 查看计划
response = requests.post(f"{BASE_URL}/command", json={
    "session_id": session_id,
    "command": "/plan"
})
print(response.json())

# 3. 执行下一个任务
response = requests.post(f"{BASE_URL}/command", json={
    "session_id": session_id,
    "command": "/next"
})
print(response.json())

# 4. 自然语言问答
response = requests.post(f"{BASE_URL}/command", json={
    "session_id": session_id,
    "command": "当前进度如何？"
})
print(response.json()["message"])
```

### JavaScript 客户端

```javascript
const BASE_URL = "http://localhost:8000";

// 1. 创建会话
const createSession = async (topic) => {
  const response = await fetch(`${BASE_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic })
  });
  return await response.json();
};

// 2. 执行命令
const executeCommand = async (sessionId, command) => {
  const response = await fetch(`${BASE_URL}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, command })
  });
  return await response.json();
};

// 使用
(async () => {
  const { session_id } = await createSession("写一个二叉树遍历");
  const result = await executeCommand(session_id, "/next");
  console.log(result.message);
})();
```

### cURL

```bash
# 创建会话
curl -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"topic": "实现二分查找"}'

# 执行命令
curl -X POST http://localhost:8000/command \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess-xxx", "command": "/next"}'
```

## 🏗️ 架构优势

### 统一命令处理

所有操作都通过 `execute_command` 方法处理：

```
HTTP请求 → FastAPI → execute_command() → Orchestrator
                                  ↓
                        统一的业务逻辑
```

### 无缝迁移

CLI 和 API 使用相同的逻辑：

```python
# CLI
result = orch.execute_command(session_id, "/next", plan, state)

# API
@app.post("/command")
def execute_command_endpoint(request):
    result = orch.execute_command(request.session_id, request.command, plan, state)
    return result
```

### 状态管理

- `orchestrator_state.json` - Orchestrator 状态快照
- `state.json` - Plan 状态（兼容旧版）
- `session_index.json` - 会话索引

## 🔧 部署

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t multi-agent-api .
docker run -p 8000:8000 multi-agent-api
```

### Production

```bash
# 使用 gunicorn + uvicorn workers
gunicorn api:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## 📊 监控

FastAPI 自带的 `/docs` 端点提供了完整的 API 文档和测试界面。

## 🎯 下一步

1. ✅ 基础 API 已完成
2. 🔄 添加认证（JWT）
3. 🔄 添加速率限制
4. 🔄 添加 WebSocket 支持（实时进度）
5. 🔄 添加文件上传/下载
6. 🔄 集成前端界面

## 📝 注意事项

- 当前版本是单实例，不支持并发
- 生产环境需要配置数据库持久化
- 需要配置 CORS 白名单
- 需要添加认证和授权

## 🎉 验收标准

✅ **完成的功能**:
1. 统一的 `execute_command` 入口
2. `OrchestratorState` 状态管理
3. `session_index.json` 会话索引
4. FastAPI HTTP 接口
5. CLI 和 API 共用逻辑

**准备好上云！** 🚀

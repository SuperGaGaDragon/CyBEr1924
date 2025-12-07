# 会话恢复和增强对话功能文档

## 概述

本文档描述了多智能体平台第一阶段的核心增强功能，实现了完全可控、可对话、可恢复的 MVP 系统。

## 主要功能

### 1. 增强的对话 AI (Enhanced Coordinator Dialogue)

#### 功能描述
`answer_user_question` 现在提供丰富的上下文信息，让 Coordinator AI 能够像"右侧控制台"一样回答用户问题。

#### 上下文包含：
- ✅ **当前计划概况**：所有子任务的状态
- ✅ **最近完成的子任务**：包括任务标题和协调意见
- ✅ **最近产物预览**：显示最后完成任务的输出内容（前300字符）
- ✅ **当前进行中的子任务**：正在执行的任务
- ✅ **下一个待执行的子任务**：即将开始的任务

#### 代码位置
`multi_agent_platform/run_flow.py` - `answer_user_question()` 方法

#### 示例对话
```
用户: 当前进度如何？
Coordinator: 已完成 3/10 个子任务。最近完成了"设计嘎嘎龙的基本形象"，
             当前正在进行"描述深山环境"，下一步将"设计修仙契机"。

用户: 最近完成了什么？
Coordinator: 最近完成的是"设计嘎嘎龙的基本形象"，产出了详细的
             角色形象描述，包括外观特征和性格特点...
```

#### 日志记录
所有对话都会记录到 `logs/envelopes.jsonl`，使用新增的 `coord_response` payload type。

### 2. 状态持久化 (State Persistence)

#### 功能描述
系统现在可以自动保存和恢复会话状态，实现断点续跑。

#### 核心方法

##### 2.1 `save_state(session_id, plan)`
```python
def save_state(self, session_id: str, plan: Plan) -> Path:
    """
    保存当前会话状态到 state.json
    包括：session_id, plan（完整的子任务状态）
    """
```

**保存内容：**
```json
{
  "session_id": "sess-20251207-042846-aed3cfc5",
  "plan": {
    "plan_id": "plan-bd858849",
    "title": "计划标题",
    "subtasks": [
      {
        "id": "t1",
        "title": "子任务标题",
        "status": "done",
        "notes": "协调意见"
      }
    ]
  }
}
```

**保存位置：** `sessions/{session_id}/state.json`

##### 2.2 `load_state(session_id)`
```python
def load_state(self, session_id: str) -> tuple[str, Plan] | None:
    """
    从 state.json 恢复会话状态
    返回 (session_id, plan)，如果文件不存在返回 None
    """
```

##### 2.3 `list_sessions()`
```python
def list_sessions(self) -> list[str]:
    """
    列出所有可用的 session_id（已保存 state.json 的会话）
    返回按时间倒序排列的会话列表
    """
```

#### 自动保存时机

系统会在以下时机自动保存状态：

1. **会话创建时**：`init_session()` 完成后
2. **执行子任务后**：`/next` 命令完成后
3. **批量执行中**：`/all` 命令中，每个子任务完成后

```python
# 在 interactive_session.py 中
plan = orch.run_next_pending_subtask(session_id, plan)
orch.save_state(session_id, plan)  # 自动保存
```

### 3. 交互式会话增强 (Interactive Session Enhancement)

#### 启动时的会话恢复

用户启动 `interactive_session.py` 时：

```
=== Multi-Agent Interactive Session ===

可恢复的会话：
  1. sess-20251207-042846-aed3cfc5
  2. sess-20251207-035612-a1b2c3d4
  3. sess-20251206-220430-xyz12345

输入会话编号恢复，或直接按回车新建会话
选择: 1

✅ 已恢复 session: sess-20251207-042846-aed3cfc5
Plan: 一只叫做嘎嘎龙的龙在深山中修仙的故事 (id=plan-bd858849)

- [done   ] t1: 设定嘎嘎龙的基本形象和性格特征。
- [done   ] t2: 描述嘎嘎龙所在的深山环境及其独特的修仙氛围。
- [pending] t3: 设计嘎嘎龙初次接触修仙的契机和动机。
...
```

#### 更新的命令列表

```
可用命令：
  /plan      查看当前计划
  /next      执行下一个 pending 子任务（自动保存状态）
  /all       按顺序执行剩余所有子任务（自动保存状态）
  /exit      退出会话
  /help      显示此帮助信息

普通对话输入将由协调 AI 回答，例如：
  - 当前进度如何？
  - 下一步要做什么？
  - 最近完成了什么？

💾 会话状态会自动保存到 state.json，下次启动时可恢复。
```

## 协议扩展

### 新增 Payload Type

在 `src/protocol.py` 中新增：

```python
class PayloadType(str, Enum):
    # ... existing types ...
    COORD_RESPONSE = "coord_response"  # 新增
```

**Schema：**
```json
{
  "type": "object",
  "properties": {
    "question": {"type": "string"},
    "response": {"type": "string"}
  },
  "required": ["question", "response"]
}
```

## 文件结构

```
multi_agent_platform/
├── sessions/
│   └── {session_id}/
│       ├── state.json          # 🆕 会话状态（可恢复）
│       ├── artifacts/
│       │   ├── xxx.md
│       │   └── xxx.json
│       └── logs/
│           └── envelopes.jsonl # 包含 coord_response
├── interactive_session.py      # ✅ 增强：会话恢复
├── run_flow.py                 # ✅ 增强：丰富上下文 + 状态管理
├── plan_model.py
├── message_bus.py
├── session_store.py
└── agent_runner.py

src/
└── protocol.py                 # ✅ 新增：coord_response payload type
```

## 测试

### 运行测试脚本

```bash
python3 test_recovery.py
```

**测试内容：**
1. ✅ 创建新会话
2. ✅ 保存状态到 state.json
3. ✅ 修改计划状态
4. ✅ 恢复会话
5. ✅ 验证状态正确性
6. ✅ 列出所有可恢复会话

### 预期输出

```
=== 测试会话状态保存和恢复 ===

创建新会话: 测试主题：编写一个简单的Python函数
✅ Session ID: sess-20251207-044259-580742fa
✅ 计划包含 7 个子任务

保存会话状态...
✅ 状态已保存到: .../state.json

将第一个子任务标记为完成
✅ 更新后的状态已保存

尝试恢复会话...
✅ 成功恢复 Session: sess-20251207-044259-580742fa
✅ 验证通过：第一个子任务状态正确恢复为 'done'

✅ 找到 1 个可恢复的会话
```

## 使用场景

### 场景 1：长时间任务中断恢复

```bash
# 第一次运行
$ python3 multi_agent_platform/interactive_session.py
> /all
# ... 执行了 5/10 个任务后，意外中断 ...

# 第二次运行（恢复）
$ python3 multi_agent_platform/interactive_session.py
选择: 1  # 选择之前的会话
✅ 已恢复，从第 6 个任务继续
> /all  # 继续完成剩余任务
```

### 场景 2：检查进度并对话

```bash
$ python3 multi_agent_platform/interactive_session.py
选择: 1

你> 当前进度如何？
[Coordinator] 已完成 7/10 个子任务，当前正在进行"设计内心挣扎"...

你> 最近完成了什么？
[Coordinator] 最近完成了"安排朋友和师傅角色"，引入了竹隐真人...

你> /next
▶ 正在执行下一个子任务……
✅ 子任务执行完毕
```

### 场景 3：云端部署

状态文件 `state.json` 使得系统易于部署到云端：

1. **前端查询进度**：读取 `state.json` 显示当前状态
2. **后台继续执行**：Worker 进程读取 `state.json` 恢复会话
3. **用户问答**：通过 `answer_user_question()` 实现实时对话
4. **断线重连**：用户刷新页面后，前端重新加载 `state.json`

## API 总结

### Orchestrator 新增方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `save_state()` | `session_id, plan` | `Path` | 保存会话状态 |
| `load_state()` | `session_id` | `tuple[str, Plan] \| None` | 恢复会话状态 |
| `list_sessions()` | - | `list[str]` | 列出所有会话 |
| `answer_user_question()` | `session_id, plan, user_input` | `str` | 增强版问答（含丰富上下文） |

### MessageBus 相关

| Payload Type | 用途 | 记录时机 |
|--------------|------|----------|
| `user_command` | 用户输入命令 | 每次用户输入 |
| `coord_response` | 协调 AI 回答 | 每次 `answer_user_question()` |

## 验收标准

### ✅ 完成的任务

1. ✅ **增强 answer_user_question**
   - 包含当前计划
   - 包含最后完成的子任务及其协调意见
   - 包含最后产物的预览（前300字符）
   - 包含当前进行中的子任务
   - 包含下一个待执行的子任务

2. ✅ **添加状态持久化**
   - `save_state()` 方法保存到 `state.json`
   - `load_state()` 方法从 `state.json` 恢复
   - `list_sessions()` 方法列出所有会话
   - 自动保存：会话创建、/next、/all 命令后

3. ✅ **测试完整恢复流程**
   - 创建测试脚本 `test_recovery.py`
   - 验证保存和恢复的正确性
   - 验证会话列表功能

4. ✅ **协议扩展**
   - 新增 `coord_response` payload type
   - 更新 schema 定义

5. ✅ **交互式会话增强**
   - 启动时显示可恢复会话列表
   - 用户可选择恢复或新建
   - 更新 /help 命令说明

## 下一步（未来阶段）

- 🔄 前端界面集成
- 🔄 实时进度推送（WebSocket）
- 🔄 多用户会话隔离
- 🔄 会话搜索和过滤
- 🔄 会话归档和清理

## 结论

第一阶段的所有核心功能已完成：

✅ **可控**：用户可通过命令控制执行流程
✅ **可对话**：Coordinator 提供丰富上下文的智能问答
✅ **可恢复**：完整的状态持久化和恢复机制

系统现在是一个 **完整的、可上云的 MVP**，准备进入前端集成阶段。

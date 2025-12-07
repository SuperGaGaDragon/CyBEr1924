# 新架构设计 V2 - Coordinator 作为中控

## 核心理念

**Coordinator 是唯一的控制中心**，接收用户的所有指令，协调其他 Agent。

## 架构图

```
┌──────────┐
│   用户    │
└────┬─────┘
     │ 所有交互
     ↓
┌────────────────┐
│  Coordinator   │  ← 唯一的中控
│  (控制台 AI)   │
└────┬───────┬───┘
     │       │
     ↓       ↓
┌─────────┐ ┌─────────┐
│ Planner │ │ Worker  │
│ (计划)  │ │ (执行)  │
└─────────┘ └─────────┘
```

## 通信规则

1. **用户 → Coordinator**
   - 所有用户输入都先到 Coordinator
   - 包括：问题、指令、反馈、修改要求

2. **Coordinator → Planner**
   - 初始化计划
   - 用户要求修改计划时

3. **Coordinator → Worker**
   - 执行子任务
   - 传递用户的修改要求

4. **Worker/Planner → Coordinator**
   - 报告执行结果
   - Coordinator 审核并决策

## 用户交互场景

### 场景 1：修改 Worker 产出

```
用户: /next
Coordinator: [调用 Worker 执行任务]
Coordinator: [展示产出] "嘎嘎龙是绿色的..."

用户: 不，我希望是蓝色的
Coordinator: [理解用户意图，重新调用 Worker]
Coordinator: [展示新产出] "嘎嘎龙是蓝色的..."

用户: 很好！
Coordinator: [标记任务完成，进入下一个]
```

### 场景 2：修改计划

```
用户: /plan
Coordinator: [展示当前计划]

用户: 我不需要第5个任务了，删除它
Coordinator: [调用 Planner 或自己修改计划]
Coordinator: 已删除任务 t5

用户: 在第3个任务后加一个"添加魔法能力"
Coordinator: [调用 Planner 重新生成，或自己插入]
Coordinator: 已添加新任务 t3.5: 添加魔法能力
```

### 场景 3：自由对话

```
用户: 当前进度如何？
Coordinator: 已完成 3/10，当前在做...

用户: 第2个任务做得怎么样？
Coordinator: [读取 artifact] 第2个任务是...产出是...

用户: 能不能重做第2个任务？
Coordinator: [修改 plan，将 t2 状态改为 pending]
Coordinator: 已将任务 t2 标记为待重做
```

## 实现方案

### 方案 A：Coordinator 理解自然语言并路由

```python
class Coordinator:
    def process_user_input(self, user_input: str, context: Context):
        # Coordinator 自己理解用户意图
        intent = self.understand_intent(user_input)

        if intent == "modify_current_output":
            return self.ask_worker_redo(user_input)

        elif intent == "modify_plan":
            return self.modify_plan(user_input)

        elif intent == "query_status":
            return self.answer_question(user_input)
```

### 方案 B：用户明确模式切换

```python
# 交互模式
用户: /next [interactive]
Coordinator: [展示产出]
用户: 改成蓝色
Coordinator: [重做]

# 对话模式
用户: 当前进度如何？
Coordinator: [回答]

# 计划编辑模式
用户: /edit-plan
Coordinator: 进入计划编辑模式
用户: 删除任务 5
Coordinator: 已删除
```

## 推荐实现：混合模式

```python
def main():
    while True:
        user_input = input("你> ")

        # 1. 检查是否是命令
        if user_input.startswith("/"):
            handle_command(user_input)

        # 2. 如果在审核模式，理解为对当前产出的反馈
        elif in_review_mode:
            feedback = user_input
            coordinator.process_feedback(feedback)

        # 3. 否则，当作普通对话
        else:
            answer = coordinator.answer_question(user_input)
```

## 需要的新功能

1. **Coordinator 理解用户意图**
   - 使用 LLM 分类用户输入
   - 判断是：反馈、修改计划、还是询问

2. **Planner 可被调用修改计划**
   - 添加任务
   - 删除任务
   - 修改任务描述

3. **状态机管理**
   - 当前在什么模式（执行/审核/对话）
   - 当前上下文（正在看哪个任务的产出）

## 你想要哪种方案？

请告诉我你的偏好，我来实现：

### 选项 A：智能路由（推荐）
- Coordinator 自动理解用户意图
- 无需明确命令
- 更自然，但可能误判

### 选项 B：显式模式
- 用户明确切换模式
- 清晰但略繁琐

### 选项 C：混合
- 有命令时用命令
- 其他时候智能判断

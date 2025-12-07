# 长篇写作任务优化方案

## 🎯 问题分析

### 原问题
当用户要求写长篇内容（如 1 万字小说）时，系统会出现以下问题：

1. **Planner 生成模糊超大任务**
   - 例如："按照章节计划逐步完成全文草稿"
   - Worker 无法完成这样的"无限大"任务

2. **Worker 只写示例或教程**
   - 因为任务太大，Worker 会写：
     - "以下是第一章示例..."
     - "由于篇幅限制，仅展示部分内容..."
     - "写作技巧建议..."
   - 而不是真正的小说正文

3. **缺乏分章节机制**
   - 应该一章一章生成
   - 但 Planner 没有被强制要求这样做

---

## ✅ 解决方案

### 1. 强制 Planner 分章节/分片

**核心思路**: 在 Planner 的 system prompt 中添加硬规则

**关键要求**:
- 长篇内容必须拆成小的写作子任务
- 每个子任务 ≤ 1,500-2,000 中文字 或 800-1,000 英文单词
- 小说类任务必须：
  1. 先做：主题、人物、世界观、剧情大纲
  2. 再拆：每章/每节一个独立子任务

**示例 Plan**:
```
1. 创建主题和世界观设定
2. 设计主要人物
3. 撰写剧情大纲（开端-发展-高潮-结局）
4. 撰写第一章：初遇嘎嘎龙（约 1,500 字）
5. 撰写第二章：冒险开始（约 1,500 字）
6. 撰写第三章：遇到困难（约 1,500 字）
7. ...
```

**禁止的 Plan**:
```
1. 创建主题
2. 设计人物
3. 撰写完整小说（全文）  ❌ 太大！
```

---

### 2. 专门为写作任务设定 Worker 模式

**核心思路**: Worker 必须输出"书里那样的文本"，不是教程

**关键规则**:
- ✅ 输出连续的故事文本（像书中的一章）
- ❌ 不写"写作步骤"、"技巧建议"、"大纲说明"
- ❌ 不写"由于篇幅限制"、"以下省略"、"示例章节"
- ❌ 不写"待续"、"未完待续"等元信息
- ✅ 当前任务只要求本章，不要写整本书
- ✅ 可以留悬念，但不要用解释性语句

**错误示例** (Worker 不应该写这种):
```
【第一章：初遇嘎嘎龙】

以下是第一章的示例内容：

（主角在森林中遇到嘎嘎龙...）

由于篇幅限制，本章节仅展示前半部分。完整内容请参考...

【写作提示】
- 注意描写细节
- 使用对话推动情节
...
```

**正确示例** (Worker 应该写这种):
```
第一章：初遇嘎嘎龙

清晨的阳光透过茂密的树叶，在森林地面上投下斑驳的光影。十二岁的小明背着装满冒险工具的背包，沿着蜿蜒的小路前行。

突然，一阵奇怪的声音从前方传来——"嘎嘎！嘎嘎！"

小明停下脚步，警觉地环顾四周。那声音再次响起，这次更近了。他小心翼翼地拨开灌木丛，眼前的景象让他惊呆了：一只浑身蓝色鳞片的小龙正蹲在空地上，用爪子挠着地面。

"你...你是龙？"小明结结巴巴地问。

小龙转过头，金色的眼睛盯着他，嘴里发出"嘎嘎"的声音。

（...正文继续...）

天色渐暗，小明和嘎嘎龙在森林深处找到了一个山洞。今晚，他们将在这里过夜。小明不知道的是，更大的冒险正在前方等待着他们。
```

---

### 3. Coordinator 审核标准优化

**核心思路**: Coordinator 要识别 Worker 是否真的写了正文

**ACCEPT 条件** (写作任务):
- ✅ 产出了真实的叙事内容（不是大纲或教程）
- ✅ 内容符合子任务范围（如"第一章"应该包含第一章内容）
- ✅ 长度合适（~1,500-2,000 中文字）
- ✅ 没有元评论（如"由于篇幅限制"）

**REDO 条件** (写作任务):
- ❌ 只输出了大纲、技巧或示例（不是真正内容）
- ❌ 内容太短或不完整
- ❌ Worker 试图写整本书而不是当前章节

---

## 🔧 实现细节

### Planner System Prompt (新增部分)

```
**CRITICAL RULES FOR LONG-FORM WRITING TASKS:**

When the user requests long-form content (e.g., 'novel', 'long story', '10,000+ words', 'entire book', 'complete documentation'):

1. You MUST break the plan into many small writing subtasks
2. Each writing subtask should produce NO MORE THAN 1,500-2,000 Chinese characters or 800-1,000 English words
3. For novel/story tasks, generate:
   - First: Theme, characters, world-building, plot outline
   - Then: Break the novel into chapters/sections, where EACH chapter/section is a separate subtask:
     Example:
     - 'Write Chapter 1: [title] (~1,500 characters)'
     - 'Write Chapter 2: [title] (~1,500 characters)'
     - ...

4. NEVER create vague mega-tasks like 'Complete the full draft following the chapter plan'
5. Ensure that completing ALL writing subtasks in the plan will produce the complete novel
```

### Worker System Prompt (新增部分)

```
**FOR WRITING/CREATIVE TASKS (novels, stories, articles):**

- You MUST output continuous narrative text, like a chapter in a book
- DO NOT write 'writing steps', 'technique suggestions', or 'outline explanations'
- DO NOT write meta-commentary like 'due to length limitations', 'omitted below', 'example chapter', or 'to be continued'
- The current subtask only requires THIS chapter/section - do not try to write the entire book
- If the plot requires it, you may leave cliffhangers or foreshadowing at the end, but do NOT use explanatory statements
- Write the ACTUAL content that will appear in the final work
```

### Coordinator System Prompt (新增部分)

```
**FOR WRITING SUBTASKS (chapters, stories, articles):**

- Check if the Worker produced ACTUAL narrative content (not just outlines or explanations)
- Verify the content matches the subtask scope (e.g., 'Chapter 1' should contain Chapter 1 content)
- ACCEPT if:
  - The writing is coherent and complete for this chapter/section
  - The length is appropriate (~1,500-2,000 characters for Chinese, ~800-1,000 words for English)
  - No meta-commentary like 'due to length limits' or 'example only'
- REDO if:
  - Output contains only outlines, tips, or examples instead of actual content
  - Content is way too short or incomplete
  - Worker tried to write the entire book instead of just this chapter
```

---

## 📊 预期效果

### Before (原问题)

**用户请求**: "写一个 1 万字的嘎嘎龙小说"

**Planner 输出**:
```
1. 创建主题
2. 设计人物
3. 撰写完整小说草稿
```

**Worker 执行任务 3**:
```
【嘎嘎龙的冒险 - 示例章节】

以下是第一章的示例内容：

（由于篇幅限制，仅展示前 500 字...）

【写作建议】
- 注意情节连贯性
- 丰富人物对话
...
```

**结果**: ❌ 没有真正的小说，只有示例和教程

---

### After (优化后)

**用户请求**: "写一个 1 万字的嘎嘎龙小说"

**Planner 输出**:
```
1. 创建主题和世界观设定
2. 设计主要人物档案
3. 撰写剧情大纲（三幕结构）
4. 撰写第一章：初遇嘎嘎龙（约 1,500 字）
5. 撰写第二章：冒险开始（约 1,500 字）
6. 撰写第三章：遇到困难（约 1,500 字）
7. 撰写第四章：寻找帮助（约 1,500 字）
8. 撰写第五章：决战时刻（约 1,500 字）
9. 撰写第六章：圆满结局（约 1,500 字）
10. 整理全文并进行润色
```

**Worker 执行任务 4**:
```
第一章：初遇嘎嘎龙

清晨的阳光透过茂密的树叶，在森林地面上投下斑驳的光影。十二岁的小明背着装满冒险工具的背包，沿着蜿蜒的小路前行。

（...完整的叙事内容，约 1,500 字...）

天色渐暗，小明和嘎嘎龙在森林深处找到了一个山洞。今晚，他们将在这里过夜。小明不知道的是，更大的冒险正在前方等待着他们。
```

**Coordinator 审核**:
```
ACCEPT
第一章内容完整，叙事流畅，成功建立了主角与嘎嘎龙的初次相遇场景。长度适中（约 1,500 字），为后续章节留下了悬念。
```

**Worker 执行任务 5**:
```
第二章：冒险开始

第二天清晨，小明被一阵急促的"嘎嘎"声吵醒。嘎嘎龙站在山洞口，不安地来回踱步，金色的眼睛望向远方。

"怎么了？"小明揉着眼睛问。

嘎嘎龙转过身，用爪子指向森林深处。小明顺着它的方向看去，只见天边升起了一缕黑烟...

（...完整的叙事内容，约 1,500 字...）
```

**结果**: ✅ 真正的小说内容，分章节逐步生成，最终形成完整作品

---

## 🎯 关键优势

### 1. 任务可控
- Planner 自动把大任务拆成小任务
- 每个子任务都是明确的、可执行的

### 2. 输出真实
- Worker 写真正的内容，不是示例或教程
- 用户得到的是可以直接使用的作品

### 3. 质量保证
- Coordinator 能识别"假内容"
- 确保每一章都是真实的叙事

### 4. 扩展性好
- 不仅适用于小说，也适用于长篇文档、教程、报告等
- 通过子任务粒度控制，适应不同长度需求

---

## 📝 使用示例

### 小说创作

```bash
python3 -m multi_agent_platform.interactive_session

你> 写一个 1 万字的科幻小说，关于时间旅行

# Planner 会生成:
Plan: 时间旅行科幻小说创作计划
- [pending] 1: 创建世界观设定（时间旅行规则、科技背景）
- [pending] 2: 设计主要人物（主角、配角、反派）
- [pending] 3: 撰写剧情大纲（序幕-发展-高潮-结局）
- [pending] 4: 撰写第一章：发现时间机器（约 1,500 字）
- [pending] 5: 撰写第二章：第一次穿越（约 1,500 字）
- [pending] 6: 撰写第三章：改变历史（约 1,500 字）
- [pending] 7: 撰写第四章：时间悖论（约 1,500 字）
- [pending] 8: 撰写第五章：修正时间线（约 1,500 字）
- [pending] 9: 撰写第六章：最终抉择（约 1,500 字）
- [pending] 10: 整理全文并润色

你> /all

# 系统会自动执行所有任务，每一章都是真实内容
```

### 长篇文档

```bash
你> 写一份完整的 Python 教程，面向初学者，包含所有基础知识

# Planner 会生成:
Plan: Python 基础教程
- [pending] 1: 教程大纲和目标读者定位
- [pending] 2: 第一部分：环境搭建（约 1,000 词）
- [pending] 3: 第二部分：基础语法（约 1,000 词）
- [pending] 4: 第三部分：数据类型（约 1,000 词）
- [pending] 5: 第四部分：控制流（约 1,000 词）
- [pending] 6: 第五部分：函数（约 1,000 词）
- [pending] 7: 第六部分：面向对象（约 1,000 词）
- ...
```

---

## 🔍 故障排查

### Q: Planner 仍然生成大任务怎么办？

**A**: 检查 system prompt 是否正确更新：
```python
print(orch.planner.system_prompt)
# 应该包含 "CRITICAL RULES FOR LONG-FORM WRITING TASKS"
```

### Q: Worker 仍然写示例和教程？

**A**:
1. 检查 Worker 的 system prompt
2. 在交互模式下使用用户反馈：
   ```
   你> 不，请写真正的小说内容，不要写示例或教程
   ```

### Q: 章节太短或太长？

**A**:
1. Planner 的规则已经限制每章 1,500-2,000 字
2. Coordinator 会检查长度是否合适
3. 如果需要调整，可以在 Planner prompt 中修改数字

### Q: 如何查看生成的内容？

**A**:
```bash
# 所有章节内容都保存在 artifacts 目录
ls sessions/{session_id}/artifacts/

# 每个子任务的产出都有单独的文件
cat sessions/{session_id}/artifacts/xxx.md
```

---

## 📚 相关文件

- [run_flow.py](multi_agent_platform/run_flow.py) - 包含优化后的 Agent prompts
- [interactive_session.py](multi_agent_platform/interactive_session.py) - CLI 界面
- [api.py](api.py) - API 接口

---

## 🎉 总结

**问题根源**: Planner 生成超大任务 → Worker 无法完成 → 只能写示例

**解决方案**:
1. ✅ Planner: 强制分章节/分片（每章 ≤ 1,500-2,000 字）
2. ✅ Worker: 写真正的内容（不是示例或教程）
3. ✅ Coordinator: 识别并拒绝"假内容"

**效果**:
- 用户请求 1 万字小说 → 系统生成 6-7 章
- 每章都是真实内容，可以直接阅读
- 章节累加形成完整作品

**立即生效**: 重启 CLI 或 API 后即可使用优化后的系统！🚀

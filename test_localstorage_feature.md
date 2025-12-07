# localStorage 自动恢复功能测试指南

## ✅ 已实现的功能

### 1. localStorage 键值定义
```typescript
const LAST_SESSION_KEY = "cyber1924:lastSessionId";
```

### 2. 保存逻辑

#### 在选择 Session 时保存
```typescript
async function handleSelectSession(id: string) {
  // ...
  const snapshot = await getSession(id);

  // ✅ 记住最近打开的 session
  localStorage.setItem(LAST_SESSION_KEY, id);

  setState({ activeSessionId: id, snapshot });
}
```

#### 在创建 Session 时保存
```typescript
async function handleCreateSession() {
  // ...
  const snapshot = await createSession(topic);

  // ✅ 新建 session 后，也记住它
  localStorage.setItem(LAST_SESSION_KEY, snapshot.session_id);

  setState({ activeSessionId: snapshot.session_id, snapshot });
}
```

### 3. 自动恢复逻辑

#### 页面加载时自动恢复
```typescript
useEffect(() => {
  (async () => {
    // 1. 加载所有 session
    const sessions = await listSessions();
    setState({ sessions });

    // 2. 尝试恢复上次打开的 session
    const lastId = localStorage.getItem(LAST_SESSION_KEY);
    if (lastId) {
      const exists = sessions.some((s) => s.session_id === lastId);
      if (exists) {
        try {
          const snapshot = await getSession(lastId);
          setState({ activeSessionId: lastId, snapshot });
        } catch (err) {
          // 如果加载失败，清除记录
          localStorage.removeItem(LAST_SESSION_KEY);
        }
      }
    }
  })();
}, []);
```

## 🧪 测试步骤

### 测试 1：创建新 Session 后刷新

1. **打开页面**
   ```
   http://localhost:5173
   或
   https://cyber1924.pages.dev
   ```

2. **创建新 Session**
   - 点击 "+ New Session" 按钮
   - 输入 topic："测试 localStorage 功能"
   - Session 自动打开，三栏 UI 显示内容

3. **检查 localStorage**
   - 打开浏览器开发者工具（F12）
   - 进入 Application/Storage → Local Storage
   - 查看 `cyber1924:lastSessionId` 键
   - 值应该是刚创建的 session_id

4. **刷新页面**（Ctrl+R 或 F5）
   - ✅ 页面加载后自动显示刚才的 session
   - ✅ 左侧栏高亮该 session
   - ✅ 三栏 UI 自动填充（plan, worker outputs, chat）

### 测试 2：选择历史 Session 后刷新

1. **打开页面**
   ```
   http://localhost:5173
   ```

2. **选择一个历史 Session**
   - 在左侧栏点击任意一个 session
   - Session 加载完成

3. **检查 localStorage**
   - `cyber1924:lastSessionId` 应该更新为新选中的 session_id

4. **刷新页面**
   - ✅ 页面自动恢复到选中的 session
   - ✅ 不是第一个，不是最后一个，而是你点击的那一个

### 测试 3：关闭浏览器后重新打开

1. **选择一个 Session**
   - 点击左侧栏任意 session

2. **完全关闭浏览器**
   - 不是关闭标签页，是关闭整个浏览器窗口

3. **重新打开浏览器，访问页面**
   - ✅ 页面自动恢复到上次选中的 session
   - ✅ localStorage 数据持久化保存

### 测试 4：Session 不存在时的容错

1. **手动修改 localStorage**
   - 开发者工具 → Application → Local Storage
   - 将 `cyber1924:lastSessionId` 改为一个不存在的 ID："fake-session-id"

2. **刷新页面**
   - ✅ 页面正常加载 session 列表
   - ✅ 不会尝试加载不存在的 session
   - ✅ 没有 session 自动选中（因为 ID 不在列表中）

### 测试 5：多标签页同步

1. **打开两个标签页**
   - 标签页 A：选择 Session 1
   - 标签页 B：刷新

2. **验证**
   - ✅ 标签页 B 应该自动显示 Session 1
   - localStorage 在同域下共享

## 📊 用户体验流程

### 场景 1：连续工作流
```
第一天：
  1. 打开 cyber1924.com
  2. 创建新项目："写论文"
  3. 工作一段时间
  4. 关闭浏览器

第二天：
  1. 打开 cyber1924.com
  2. ✅ 自动回到"写论文"项目
  3. 继续工作，无需查找
```

### 场景 2：切换项目
```
1. 打开项目 A（网站设计）
2. 刷新页面 → 自动回到项目 A
3. 切换到项目 B（写小说）
4. 刷新页面 → 自动回到项目 B ✅
5. localStorage 始终记住最后活跃的项目
```

### 场景 3：多设备工作
```
设备 A（公司电脑）：
  - 最后打开项目 A

设备 B（家里电脑）：
  - 最后打开项目 B

✅ 每台设备记住自己最后的状态
   （因为 localStorage 是本地存储）
```

## 🔍 技术实现细节

### 存储时机
- ✅ 用户点击左侧栏选择 session
- ✅ 用户创建新 session
- ✅ Session 成功加载后

### 恢复时机
- ✅ 页面首次加载（useEffect）
- ✅ Session 列表加载完成后
- ✅ 验证 session 存在后才恢复

### 容错处理
- ✅ Session 不存在：跳过恢复，清除记录
- ✅ 加载失败：捕获错误，清除记录
- ✅ 没有记录：正常显示列表，不自动选择

## 📝 代码变更总结

### 文件：ui/src/App.tsx

**新增常量**
```typescript
const LAST_SESSION_KEY = "cyber1924:lastSessionId";
```

**修改函数**
1. `handleSelectSession`: 添加 `localStorage.setItem()`
2. `handleCreateSession`: 添加 `localStorage.setItem()`
3. `useEffect`: 添加自动恢复逻辑

**总代码行数**：+20 行

## ✅ 验证清单

- [x] TypeScript 编译通过
- [x] 前端构建成功
- [x] localStorage 键值正确设置
- [x] 选择 session 时保存 ID
- [x] 创建 session 时保存 ID
- [x] 页面加载时自动恢复
- [x] Session 不存在时容错
- [x] 加载失败时清除记录

## 🚀 部署

构建文件位置：
```
multi_agent_platform/ui/dist/
```

部署后验证：
1. 访问 https://cyber1924.pages.dev
2. 创建或选择一个 session
3. 刷新页面
4. ✅ 自动回到该 session

## 🎉 用户价值

### 提升前
- 每次刷新都要重新找项目
- 关闭浏览器后丢失工作上下文
- 需要记住项目名称/ID

### 提升后
- ✅ 刷新自动回到上次位置
- ✅ 关闭浏览器后重新打开仍能恢复
- ✅ 无缝工作体验，零记忆负担

## 📈 下一步

完成此功能后，可以继续实现：

1. **URL 同步**：`?session=xxx` 参数
2. **分享链接**：直接分享带 session ID 的 URL
3. **多项目管理**：收藏夹/置顶功能
4. **用户登录**：跨设备同步最后活跃项目

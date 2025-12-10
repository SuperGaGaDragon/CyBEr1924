# 本地开发环境启动指南

## ✅ 已修复的问题

1. ✅ 安装了缺失的依赖：`bcrypt`, `pyjwt`, `python-multipart`
2. ✅ API服务器已启动在 http://localhost:8000
3. ✅ 前端已配置为使用本地API（.env文件已更新）
4. ✅ 前端已重新构建

## 🚀 如何启动

### 方式一：使用开发服务器（推荐用于开发）

**终端1 - 后端API（已在运行）：**
```bash
cd /Users/alex/Desktop/ai_environment
python3 api.py
```

**终端2 - 前端开发服务器：**
```bash
cd /Users/alex/Desktop/ai_environment/multi_agent_platform/ui
npm run dev
```

然后在浏览器打开：http://localhost:5173

### 方式二：使用构建后的文件

如果你想测试生产构建：
```bash
cd /Users/alex/Desktop/ai_environment/multi_agent_platform/ui
npm run preview
```

## 📋 使用前必须做的事

1. **清除浏览器缓存和LocalStorage**：
   - 打开浏览器开发者工具（F12）
   - Application → Local Storage → 删除所有 `cyber1924` 相关的项
   - Application → Session Storage → 全部清除
   - 刷新页面

2. **重新注册/登录**：
   - 点击"Register"创建新账号
   - 或使用已有账号登录

## ⚙️ 当前配置

- **API Base URL**: http://localhost:8000 (本地)
- **Frontend Dev Server**: http://localhost:5173
- **API Docs**: http://localhost:8000/docs

## 🔄 关于Railway部署

**重要：修改 .env 文件不会影响Railway部署！**

Railway部署使用自己的环境变量配置，不读取项目中的.env文件。

如果需要部署到Railway：
1. 确保Railway环境变量中设置了正确的配置
2. Frontend需要单独构建并部署（Cloudflare Pages或其他）
3. Frontend的环境变量在Cloudflare Pages中配置

## 📊 测试流程

1. 启动后端和前端（见上方）
2. 打开浏览器：http://localhost:5173
3. 清除缓存并重新登录
4. 测试完整的novel mode流程：
   - 点击 "+ New Session"
   - 输入session名称
   - 勾选 "Enable Novel Mode"
   - 点击 "Open Novel Questionnaire"
   - 完成7步问卷
   - 点击 "Done"
   - 点击 "Start Session"
   - 等待planner生成t1-t4任务

## 🐛 常见问题

### Q: 页面显示404或401错误
**A**: 清除浏览器LocalStorage并重新登录

### Q: CORS错误
**A**: 确保：
1. 后端在 localhost:8000 运行
2. .env 文件指向 http://localhost:8000
3. 重新构建前端：`npm run build`

### Q: API服务器无法启动
**A**: 检查是否安装了所有依赖：
```bash
pip3 install fastapi uvicorn bcrypt pyjwt python-multipart sqlalchemy
```

## 📝 当前运行状态

- ✅ API Server: 运行中 (PID: 查看 `ps aux | grep api.py`)
- ✅ Frontend Build: 已完成
- ✅ 配置: 本地开发模式

## 🛑 停止服务

停止API服务器：
```bash
pkill -f "python3 api.py"
```

停止前端开发服务器：
```bash
# 在运行 npm run dev 的终端按 Ctrl+C
```

# Railway 部署完成指南

## 🎯 目标

将AI环境部署到Railway云平台，实现：
- ✅ 24/7在线运行
- ✅ 本地电脑关机后仍可访问
- ✅ 自动扩展和负载均衡
- ✅ 自动SSL证书
- ✅ 数据库托管

## 📋 已准备的文件

所有必需的配置文件已创建：

1. **Procfile** - Railway启动命令
2. **railway.json** - Railway部署配置
3. **nixpacks.toml** - 构建配置
4. **.gitignore** - Git忽略文件
5. **.env.example** - 环境变量模板
6. **api.py (已更新)** - 添加了静态文件服务

## 🚀 快速开始（5分钟）

### 方法1: 使用Railway CLI（推荐）

```bash
# 1. 安装Railway CLI
npm install -g @railway/cli

# 2. 登录Railway
railway login

# 3. 初始化项目
cd /Users/alex/Desktop/ai_environment
railway init

# 4. 添加PostgreSQL
railway add --database postgres

# 5. 部署
railway up

# 6. 打开应用
railway open
```

### 方法2: 使用GitHub（最简单）

1. **推送代码到GitHub**:
   ```bash
   cd /Users/alex/Desktop/ai_environment
   git init
   git add .
   git commit -m "Initial Railway deployment"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **在Railway创建项目**:
   - 访问 https://railway.app/new
   - 选择 "Deploy from GitHub repo"
   - 选择你的仓库

3. **添加数据库**:
   - 点击 "+ New" → "Database" → "PostgreSQL"

4. **配置环境变量**:
   在 Variables 标签添加：
   ```
   OPENAI_API_KEY=your_key_here
   JWT_SECRET_KEY=random_secret_string
   ```

5. **完成！** Railway会自动部署

## 🔧 必需的环境变量

在Railway项目的 **Variables** 标签中配置：

```bash
# API密钥（至少需要一个）
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# JWT认证
JWT_SECRET_KEY=your-random-32-char-secret

# 数据库（Railway自动配置）
DATABASE_URL=${{Postgres.DATABASE_URL}}

# 邮件服务（如果使用邮件验证）
RESEND_API_KEY=re_...

# 应用设置
PORT=8080
PYTHONUNBUFFERED=1
LOG_LEVEL=INFO
```

## 🌐 访问你的应用

部署完成后，你的应用将在以下URL可用：

**主域名**: `https://cyber1924-production.up.railway.app`

Railway还会提供一个项目专属域名，类似：
`https://your-project-name.up.railway.app`

## 📊 部署后验证

访问以下端点确认部署成功：

1. **健康检查**: `https://cyber1924-production.up.railway.app/`
2. **API文档**: `https://cyber1924-production.up.railway.app/docs`
3. **前端应用**: `https://cyber1924-production.up.railway.app/` (主页)

## 🔄 更新部署

每次推送到GitHub，Railway会自动重新部署：

```bash
git add .
git commit -m "Update feature"
git push
```

或使用Railway CLI：

```bash
railway up
```

## 📁 文件结构

```
ai_environment/
├── Procfile                    # Railway启动命令
├── railway.json                # Railway配置
├── nixpacks.toml              # 构建配置
├── .gitignore                 # Git忽略规则
├── .env.example               # 环境变量示例
├── api.py                     # FastAPI应用（已更新）
├── multi_agent_platform/
│   ├── requirements.txt       # Python依赖
│   └── ui/
│       └── dist/              # 前端构建输出
├── QUICK_DEPLOY.md            # 5分钟快速部署指南
├── RAILWAY_DEPLOYMENT.md      # 详细部署文档
└── DEPLOYMENT_CHECKLIST.md    # 部署检查清单
```

## 🛠 故障排除

### 部署失败？

1. **查看日志**: Railway Dashboard → Deployments → 点击失败的部署
2. **检查环境变量**: 确认所有必需变量已设置
3. **验证依赖**: 检查 `requirements.txt` 是否完整

### 应用无法访问？

1. **检查部署状态**: 确保部署显示为 "Active"
2. **查看日志**: 查找启动错误
3. **验证端口**: Railway会自动设置 `$PORT`，确保应用使用它

### 数据库连接错误？

1. **确认PostgreSQL已添加**: 在Railway项目中应该看到数据库服务
2. **检查DATABASE_URL**: 应该自动设置为 `${{Postgres.DATABASE_URL}}`
3. **查看数据库日志**: 点击PostgreSQL服务查看状态

## 💰 成本估算

**Railway免费套餐**:
- $5 免费额度/月
- 512MB RAM
- 1GB 存储
- 共享CPU

**预估使用量**:
- 轻度使用: $0-5/月（免费）
- 中度使用: $5-15/月
- 重度使用: $15-30/月

## 📚 相关文档

- [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) - 5分钟快速部署
- [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) - 详细部署指南
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - 部署检查清单
- [Railway官方文档](https://docs.railway.app)

## 🎉 下一步

部署成功后：

1. **配置自定义域名** (可选)
   - Railway Settings → Domains → Add Custom Domain

2. **设置监控**
   - 查看Metrics了解资源使用情况
   - 配置告警通知

3. **优化性能**
   - 启用Redis缓存（可选）
   - 配置CDN（可选）

4. **备份数据**
   - 定期导出数据库
   - 使用Railway的自动备份功能

## 🆘 需要帮助？

- **Railway Discord**: https://discord.gg/railway
- **Railway文档**: https://docs.railway.app
- **项目Issues**: 在GitHub仓库创建Issue

---

**🚀 准备好了？开始部署吧！**

选择你喜欢的方法：
- 🔵 [5分钟快速部署](./QUICK_DEPLOY.md) - 适合快速上手
- 📖 [详细部署指南](./RAILWAY_DEPLOYMENT.md) - 了解每个步骤
- ✅ [部署检查清单](./DEPLOYMENT_CHECKLIST.md) - 确保万无一失

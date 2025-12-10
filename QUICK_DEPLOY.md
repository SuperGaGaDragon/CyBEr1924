# 快速部署到Railway - 5分钟指南

## 步骤1: 推送代码到GitHub (2分钟)

```bash
cd /Users/alex/Desktop/ai_environment

# 初始化git（如果还没有）
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit for Railway deployment"

# 连接到GitHub仓库（替换为你的仓库URL）
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# 推送
git push -u origin main
```

## 步骤2: 在Railway创建项目 (1分钟)

1. 访问 https://railway.app/new
2. 点击 "Deploy from GitHub repo"
3. 授权GitHub并选择你的仓库
4. Railway会自动检测Python项目并开始部署

## 步骤3: 添加数据库 (30秒)

1. 在Railway项目页面，点击 "+ New"
2. 选择 "Database" → "Add PostgreSQL"
3. 数据库会自动连接到你的应用

## 步骤4: 配置环境变量 (1分钟)

在Railway项目的 **Variables** 标签中，添加：

### 必需变量：
```
OPENAI_API_KEY=sk-...
JWT_SECRET_KEY=随机生成一个长字符串
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### 可选变量：
```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
LOG_LEVEL=INFO
```

## 步骤5: 等待部署完成 (1-2分钟)

Railway会自动：
1. 安装Python依赖
2. 构建前端
3. 启动应用服务器

完成后，你会看到一个公共URL：
```
https://cyber1924-production.up.railway.app
```

## 完成！🎉

现在你可以：
- 访问上面的URL使用应用
- 即使本地电脑关机，应用仍然在运行
- Railway会自动处理所有的服务器管理

## 常见问题

### Q: 部署失败了？
查看 **Deployments** → 点击失败的部署 → 查看日志

### Q: 如何更新代码？
只需推送到GitHub：
```bash
git add .
git commit -m "Update"
git push
```
Railway会自动重新部署！

### Q: 如何查看日志？
点击Railway项目 → **Deployments** → 选择当前部署 → 查看实时日志

### Q: 费用是多少？
Railway提供每月$5免费额度，足够运行这个应用。超出部分按使用量计费。

## 下一步

- 在Railway Settings中配置自定义域名
- 设置环境变量的生产值
- 配置监控和告警
- 查看详细文档: [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)

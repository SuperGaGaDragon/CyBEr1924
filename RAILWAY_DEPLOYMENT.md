# Railway 部署指南

本指南将帮助你将AI环境部署到Railway，使应用可以在云端运行。

## 前提条件

1. Railway账号 (https://railway.app)
2. GitHub账号 (用于连接代码仓库)
3. 必要的API密钥 (OpenAI/Anthropic等)

## 部署步骤

### 1. 准备代码仓库

首先，将代码推送到GitHub仓库：

```bash
cd /Users/alex/Desktop/ai_environment

# 初始化git仓库（如果还没有）
git init

# 添加所有文件
git add .

# 提交
git commit -m "Prepare for Railway deployment"

# 添加远程仓库（替换为你的GitHub仓库URL）
git remote add origin https://github.com/your-username/your-repo.git

# 推送
git push -u origin main
```

### 2. 在Railway创建项目

1. 访问 https://railway.app
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. 选择你的代码仓库
5. Railway会自动检测到配置文件并开始部署

### 3. 配置环境变量

在Railway项目的 Variables 标签中，添加以下环境变量：

#### 必需的环境变量：

```bash
# OpenAI API密钥（如果使用OpenAI）
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic API密钥（如果使用Claude）
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# 数据库URL（Railway会自动提供PostgreSQL）
DATABASE_URL=${{Postgres.DATABASE_URL}}

# JWT密钥（用于用户认证）
JWT_SECRET_KEY=your_random_secret_key_here

# 应用设置
PYTHONUNBUFFERED=1
PORT=8080
```

#### 可选的环境变量：

```bash
# API模型配置
OPENAI_MODEL=gpt-4-turbo-preview
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# 其他配置
LOG_LEVEL=INFO
```

### 4. 添加PostgreSQL数据库

1. 在Railway项目中，点击 "New" → "Database" → "Add PostgreSQL"
2. Railway会自动创建数据库并设置 `DATABASE_URL` 环境变量
3. 数据库会自动连接到你的应用

### 5. 配置静态文件服务

由于Railway默认只运行后端，你需要确保前端构建文件被正确提供：

在 `api.py` 中添加静态文件服务（如果还没有）：

```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# 在所有路由之后添加
if os.path.exists("ui/dist"):
    app.mount("/assets", StaticFiles(directory="ui/dist/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = f"ui/dist/{full_path}"
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse("ui/dist/index.html")
```

### 6. 获取部署URL

部署完成后，Railway会提供一个公共URL，格式为：
```
https://your-project-name.up.railway.app
```

这就是你的应用访问地址！

### 7. 更新前端配置

如果前端需要连接到Railway后端，更新前端的API配置：

在 `multi_agent_platform/ui/.env` 中：
```bash
VITE_API_BASE_URL=https://your-project-name.up.railway.app
```

重新构建前端：
```bash
cd multi_agent_platform/ui
npm run build
```

## 持久化存储

**重要提示**：Railway的文件系统是临时的，每次部署都会重置。如果需要持久化存储：

### 选项1：使用Railway Volumes

在 `railway.json` 中添加：
```json
{
  "deploy": {
    "volumes": [
      {
        "mountPath": "/app/multi_agent_platform/sessions",
        "name": "sessions-data"
      }
    ]
  }
}
```

### 选项2：使用对象存储（推荐）

将session数据存储到S3/Cloudflare R2等对象存储服务。

## 监控和日志

1. 在Railway Dashboard查看应用日志
2. 点击 "Deployments" 查看部署历史
3. 使用 "Metrics" 监控资源使用情况

## 常见问题

### Q: 部署失败怎么办？
A: 查看Railway的构建日志，通常是依赖安装或环境变量配置问题。

### Q: 如何回滚到之前的版本？
A: 在Deployments标签中，点击之前的部署，然后点击"Redeploy"。

### Q: 应用运行缓慢？
A: 检查Railway的资源配置，考虑升级到更高的套餐。

### Q: 如何设置自定义域名？
A: 在Settings → Domains中添加自定义域名并配置DNS。

## 成本估算

Railway提供免费套餐，包括：
- $5 免费额度/月
- 512MB RAM
- 1GB 存储

如需更多资源，可升级到付费套餐。

## 下一步

部署完成后：
1. 访问你的应用URL
2. 创建账号并登录
3. 开始使用AI环境！

## 技术支持

如遇问题，请查看：
- Railway文档: https://docs.railway.app
- 项目Issue: [你的GitHub仓库]/issues

# Railway 环境变量配置清单

## 必需的环境变量

在 Railway 项目设置中配置以下环境变量：

### 1. 邮件服务 (Email Verification)
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=no-reply@cyber1924.com
```

**说明**：
- `RESEND_API_KEY`: 从 [Resend.com](https://resend.com) 获取
- `EMAIL_FROM`: 发件人邮箱地址，需要在 Resend 中验证域名

### 2. 环境标识
```
ENV=production
```

**说明**：
- `ENV=production`: 生产环境，要求邮件服务必须配置
- `ENV=development`: 开发环境，自动验证用户，不发送邮件

### 3. 数据库 (Railway 自动提供)
```
DATABASE_URL=postgresql://...
```

**说明**：Railway PostgreSQL 插件会自动注入此变量

### 4. API Keys
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 5. JWT Secret
```
JWT_SECRET_KEY=your_random_secret_key_here
```

**说明**：生成一个随机字符串，用于 JWT token 签名

### 6. 服务器配置
```
PORT=8080
PYTHONUNBUFFERED=1
LOG_LEVEL=INFO
```

**说明**：
- `PORT`: Railway 会自动设置，也可以手动指定
- `PYTHONUNBUFFERED=1`: 确保日志实时输出
- `LOG_LEVEL`: 日志级别

## 验证配置

配置完成后，重启 Railway 服务，检查日志中是否出现：

```
[INFO] Resend initialized successfully (ENV=production, EMAIL_FROM=no-reply@cyber1924.com)
```

如果看到警告：
```
[WARN] RESEND_API_KEY or EMAIL_FROM not set (ENV=production); email sending will be disabled.
```

说明环境变量未正确配置。

## 测试注册功能

1. 确保 `ENV=production` 在 Railway 中配置
2. 访问前端注册页面
3. 注册新用户
4. 检查邮箱是否收到验证码
5. 使用验证码完成邮箱验证

## 开发环境配置

本地开发时，创建 `.env` 文件：

```bash
ENV=development
# 其他配置...
```

在开发模式下：
- 用户注册后自动验证，无需邮件
- 验证码会在响应消息中返回
- 适用于本地测试

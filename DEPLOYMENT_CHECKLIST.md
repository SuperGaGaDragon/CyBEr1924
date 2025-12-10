# Railway 部署检查清单

在部署到Railway之前，请确认以下所有项目：

## ✅ 代码准备

- [ ] 已创建 `.gitignore` 文件
- [ ] 已创建 `.env.example` 文件（不包含真实密钥）
- [ ] `requirements.txt` 包含所有依赖
- [ ] `Procfile` 或 `railway.json` 配置正确
- [ ] `api.py` 包含静态文件服务代码
- [ ] 前端已构建 (`cd multi_agent_platform/ui && npm run build`)

## ✅ GitHub仓库

- [ ] 代码已推送到GitHub
- [ ] 仓库可访问（公开或Railway有权限访问）
- [ ] `.env` 文件已在 `.gitignore` 中（不要上传密钥！）

## ✅ Railway配置

- [ ] 已创建Railway项目
- [ ] 已连接GitHub仓库
- [ ] 已添加PostgreSQL数据库
- [ ] 已配置环境变量：
  - [ ] `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY`
  - [ ] `JWT_SECRET_KEY`
  - [ ] `DATABASE_URL` (自动配置)
  - [ ] `RESEND_API_KEY` (如果使用邮件功能)
  - [ ] `PORT` (可选，Railway会自动设置)

## ✅ 数据库

- [ ] PostgreSQL已添加到项目
- [ ] `DATABASE_URL` 环境变量已自动设置
- [ ] 数据库迁移已配置（如果需要）

## ✅ API密钥

- [ ] OpenAI API密钥有效且有余额
- [ ] 或 Anthropic API密钥有效且有余额
- [ ] JWT密钥已生成（至少32个字符的随机字符串）
- [ ] Resend API密钥已配置（如果使用邮件验证）

## ✅ 前端配置

- [ ] `multi_agent_platform/ui/.env` 已更新为Railway URL
- [ ] 前端已重新构建
- [ ] 静态文件路径正确

## ✅ CORS配置

- [ ] `api.py` 中的CORS设置包含Railway域名
- [ ] 允许的origins包括 `https://cyber1924-production.up.railway.app`

## ✅ 部署后验证

- [ ] 访问Railway提供的URL可以打开应用
- [ ] 可以注册新用户
- [ ] 可以登录
- [ ] 可以创建session
- [ ] Worker可以正常执行任务
- [ ] 数据库连接正常
- [ ] 日志中没有错误

## ✅ 性能优化

- [ ] 前端已使用生产构建 (`npm run build`)
- [ ] Python使用 `uvicorn[standard]` 以获得更好性能
- [ ] 数据库查询已优化
- [ ] 静态文件正确缓存

## ✅ 安全检查

- [ ] 所有密钥都存储在环境变量中，不在代码里
- [ ] `.env` 文件已添加到 `.gitignore`
- [ ] CORS只允许必要的域名
- [ ] JWT密钥足够复杂
- [ ] 数据库连接使用SSL（Railway默认）

## ✅ 监控和维护

- [ ] 已设置Railway通知
- [ ] 了解如何查看部署日志
- [ ] 了解如何回滚部署
- [ ] 配置了错误监控（可选）

## 当前域名

你的应用将部署到：
```
https://cyber1924-production.up.railway.app
```

## 部署命令摘要

```bash
# 1. 推送到GitHub
git add .
git commit -m "Deploy to Railway"
git push

# 2. Railway会自动部署！
# 无需手动命令，Railway会：
# - 检测Python项目
# - 安装依赖
# - 构建前端
# - 启动服务器
```

## 故障排除

如果部署失败：

1. **检查构建日志**: Railway → Deployments → 点击失败的部署
2. **验证环境变量**: Variables标签 → 确认所有必需变量已设置
3. **检查requirements.txt**: 确保所有依赖都列出
4. **查看启动命令**: railway.json 中的startCommand是否正确
5. **数据库连接**: 确认PostgreSQL已添加且运行中

## 需要帮助？

- Railway文档: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- 项目Issues: [你的GitHub仓库]/issues

---

**准备好了吗？** 如果所有检查项都完成，你可以开始部署了！🚀

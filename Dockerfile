FROM python:3.11-slim

# 防止 pyc + 缓冲
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 把整个仓库拷进容器
WORKDIR /app
COPY . .

# 安装依赖（requirements 在子目录 multi_agent_platform 里）
RUN pip install --no-cache-dir -r multi_agent_platform/requirements.txt

# 切到真正的后端目录
WORKDIR /app/multi_agent_platform

# Railway 会注入 PORT，这里给个默认值
ENV PORT=8000

# 启动 FastAPI 服务
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT}"]

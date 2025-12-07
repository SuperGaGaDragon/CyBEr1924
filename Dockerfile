# 使用轻量级 Python 3.11
FROM python:3.11-slim

# 环境变量：不生成 pyc，立即打印日志
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 工作目录（这里有 api.py，所以必须是 /app）
WORKDIR /app

# 把整个项目复制进去
COPY . .

# 安装依赖（注意文件在 multi_agent_platform/ 里）
RUN pip install --no-cache-dir -r multi_agent_platform/requirements.txt

# Railway 自动注入 PORT 环境变量
ENV PORT=8000

# 暴露端口（Railway 识别）
EXPOSE 8000

# 启动 FastAPI（api.py 必须在工作目录 /app 下）
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT}"]

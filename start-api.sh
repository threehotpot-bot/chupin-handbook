#!/bin/bash

echo "🚀 启动出品器API (chupin-api.js) ..."

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未找到 node，请先安装 Node.js"; exit 1;
fi

# 端口占用处理（3000）
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
  echo "端口3000已被占用，尝试停止旧进程..."
  pkill -f "node.*chupin-api.js" || true
  sleep 2
fi

export ADMIN_TOKEN=${ADMIN_TOKEN:-adminpassword}
nohup node chupin-api.js > api.log 2>&1 &
API_PID=$!

echo "✅ 已启动，PID: $API_PID"
echo "📝 日志: api.log"
sleep 2
curl -s http://localhost:3000/api/health || true




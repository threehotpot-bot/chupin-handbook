#!/bin/bash

echo "🛑 停止出品器API (chupin-api.js) ..."

API_PID=$(pgrep -f "node.*chupin-api.js")
if [ -n "$API_PID" ]; then
  kill $API_PID
  echo "✅ 已停止 (PID: $API_PID)"
else
  echo "ℹ️ 未发现运行中的API进程"
fi




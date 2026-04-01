#!/bin/bash

echo "🔄 重启出品器API (chupin-api.js) ..."

DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"

./stop-api.sh
sleep 2
./start-api.sh




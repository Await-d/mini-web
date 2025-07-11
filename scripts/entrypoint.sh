#!/bin/bash

# Mini-Web 容器启动脚本
set -e

echo "=== Mini-Web 容器启动 ==="

# 检查并创建必要的目录
echo "检查目录结构..."
mkdir -p /app/data /app/logs /app/configs /tmp/rdp_screenshots

# 检查数据目录是否正确挂载
if [ ! -w "/app/data" ]; then
    echo "警告: /app/data 目录不可写，检查挂载配置"
fi

if [ ! -w "/app/logs" ]; then
    echo "警告: /app/logs 目录不可写，检查挂载配置"
fi

# 初始化数据库目录（如果为空）
if [ ! -f "/app/data/mini-web.db" ]; then
    echo "初始化数据库目录..."
    touch /app/data/mini-web.db
fi

# 设置权限
chmod 755 /app/data /app/logs /app/configs /tmp/rdp_screenshots
chown -R root:root /app/data /app/logs /app/configs

echo "目录检查完成"

# 启动 supervisor
echo "启动服务..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/mini-web.conf
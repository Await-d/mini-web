#!/bin/bash

# Mini-Web 目录预设置脚本
# 在运行 Docker 容器之前执行此脚本

set -e

BASE_PATH="${1:-/volume1/docker/1panel/apps/local/mini-web}"

echo "=== Mini-Web 目录设置 ==="
echo "基础路径: $BASE_PATH"

# 检查基础路径是否存在
if [ ! -d "$(dirname "$BASE_PATH")" ]; then
    echo "错误: 父目录 $(dirname "$BASE_PATH") 不存在"
    echo "请确保 1Panel 应用目录已正确配置"
    exit 1
fi

# 创建所有必要的目录
echo "创建目录结构..."
mkdir -p "$BASE_PATH/data"
mkdir -p "$BASE_PATH/logs"
mkdir -p "$BASE_PATH/configs"
mkdir -p "$BASE_PATH/screenshots"

# 设置目录权限
echo "设置目录权限..."
chmod 755 "$BASE_PATH"
chmod 755 "$BASE_PATH/data"
chmod 755 "$BASE_PATH/logs"
chmod 755 "$BASE_PATH/configs"
chmod 755 "$BASE_PATH/screenshots"

# 创建空的占位文件
touch "$BASE_PATH/data/.gitkeep"
touch "$BASE_PATH/logs/.gitkeep"
touch "$BASE_PATH/configs/.gitkeep"
touch "$BASE_PATH/screenshots/.gitkeep"

# 验证目录创建成功
echo "验证目录结构..."
for dir in data logs configs screenshots; do
    if [ -d "$BASE_PATH/$dir" ] && [ -w "$BASE_PATH/$dir" ]; then
        echo "✅ $dir - 目录存在且可写"
    else
        echo "❌ $dir - 目录不存在或不可写"
        exit 1
    fi
done

echo ""
echo "=== 目录设置完成 ==="
echo "目录结构:"
ls -la "$BASE_PATH"

echo ""
echo "现在可以安全地运行 Docker 容器:"
echo "docker run -d --name mini-web-container \\"
echo "  -p 8090:80 \\"
echo "  -v $BASE_PATH/data:/app/data \\"
echo "  -v $BASE_PATH/logs:/app/logs \\"
echo "  -v $BASE_PATH/configs:/app/configs \\"
echo "  -v $BASE_PATH/screenshots:/tmp/rdp_screenshots \\"
echo "  --restart always \\"
echo "  mini-web:latest"
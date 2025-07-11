#!/bin/bash

# Mini-Web 部署测试脚本
# 模拟 Drone 部署流程

set -e

echo "=== Mini-Web 部署测试 ==="

# 检查必要的命令
command -v docker >/dev/null 2>&1 || { echo "Docker 未安装"; exit 1; }

# 设置变量
IMAGE_NAME="mini-web:latest"
CONTAINER_NAME="mini-web-container"
HOST_PORT="8090"
BASE_PATH="/tmp/mini-web-test"  # 测试用临时路径

echo "1. 清理旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

echo "2. 创建目录结构..."
mkdir -p $BASE_PATH/{data,logs,configs,screenshots}
# 确保目录存在且有正确权限
chmod 755 $BASE_PATH/{data,logs,configs,screenshots}
# 创建空的占位文件以确保目录结构
touch $BASE_PATH/data/.gitkeep
touch $BASE_PATH/logs/.gitkeep
touch $BASE_PATH/configs/.gitkeep
touch $BASE_PATH/screenshots/.gitkeep

echo "3. 构建镜像..."
docker build -t $IMAGE_NAME .

echo "4. 启动容器..."
docker run -d --name $CONTAINER_NAME \
  -p $HOST_PORT:80 \
  -v $BASE_PATH/data:/app/data \
  -v $BASE_PATH/logs:/app/logs \
  -v $BASE_PATH/configs:/app/configs \
  -v $BASE_PATH/screenshots:/tmp/rdp_screenshots \
  --restart unless-stopped \
  $IMAGE_NAME

echo "5. 等待服务启动..."
sleep 10

echo "6. 健康检查..."
if curl -f http://localhost:$HOST_PORT/api/health >/dev/null 2>&1; then
  echo "✅ 服务启动成功！"
  echo "🌐 访问地址: http://localhost:$HOST_PORT"
  echo "📊 健康检查: http://localhost:$HOST_PORT/api/health"
else
  echo "❌ 服务启动失败"
  echo "📋 容器日志:"
  docker logs $CONTAINER_NAME
  exit 1
fi

echo "7. 显示容器状态..."
docker ps | grep $CONTAINER_NAME

echo "8. 显示服务进程..."
docker exec $CONTAINER_NAME supervisorctl status

echo ""
echo "=== 部署完成 ==="
echo "前端地址: http://localhost:$HOST_PORT"
echo "API地址: http://localhost:$HOST_PORT/api/"
echo "健康检查: http://localhost:$HOST_PORT/api/health"
echo ""
echo "默认账户："
echo "  管理员: admin / admin123"
echo "  用户: user / admin123"
echo ""
echo "管理命令："
echo "  查看日志: docker logs $CONTAINER_NAME"
echo "  重启服务: docker restart $CONTAINER_NAME"
echo "  停止服务: docker stop $CONTAINER_NAME"
echo "  删除容器: docker rm -f $CONTAINER_NAME"
echo "  清理测试: rm -rf $BASE_PATH"
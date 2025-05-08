#!/bin/bash
echo "正在启动Mini Web后端服务..."
echo

# 确保Go环境变量设置正确
if ! command -v go &> /dev/null; then
    echo "错误: 未找到Go环境，请确保已安装Go并设置环境变量"
    exit 1
fi

# 显示Go版本
echo "检测到Go环境:"
go version
echo

# 更新依赖
echo "更新依赖中..."
go mod tidy

# 构建和运行
echo "构建并启动服务器..."
cd cmd/server
go run main.go
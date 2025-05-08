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

# 设置FreeRDP路径环境变量
# 检查常见的安装位置
if command -v xfreerdp &> /dev/null; then
    export FREERDP_PATH=$(which xfreerdp)
    echo "已设置FreeRDP路径: $FREERDP_PATH"
elif [ -f "/usr/bin/xfreerdp" ]; then
    export FREERDP_PATH="/usr/bin/xfreerdp"
    echo "已设置FreeRDP路径: $FREERDP_PATH"
elif [ -f "/usr/local/bin/xfreerdp" ]; then
    export FREERDP_PATH="/usr/local/bin/xfreerdp"
    echo "已设置FreeRDP路径: $FREERDP_PATH"
else
    echo "警告: 未找到FreeRDP客户端，RDP连接可能无法正常工作"
    echo "请安装FreeRDP客户端:"
    echo "  Debian/Ubuntu: sudo apt install freerdp2-x11"
    echo "  CentOS/RHEL: sudo yum install freerdp"
    echo "  Fedora: sudo dnf install freerdp"
    echo "  Arch Linux: sudo pacman -S freerdp"
fi
echo

# 设置其他RDP相关配置
export RDP_SCREENSHOT_INTERVAL=1000  # 屏幕截图间隔（毫秒）
export RDP_JPEG_QUALITY=80           # JPEG压缩质量

# 下载所有依赖
echo "下载依赖中..."
go mod download github.com/gorilla/mux
go mod download github.com/golang-jwt/jwt/v5
go mod download github.com/mattn/go-sqlite3
go mod download golang.org/x/crypto
go mod tidy

# 构建和运行
echo "构建并启动服务器..."
cd cmd/server
go run main.go
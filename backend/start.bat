@echo off
chcp 65001 > nul
echo 正在启动Mini Web后端服务...
echo.

rem 确保Go环境变量设置正确
where go >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo 错误: 未找到Go环境，请确保已安装Go并设置环境变量
    pause
    exit /b 1
)

rem 显示Go版本
echo 检测到Go环境:
go version
echo.

rem 下载所有依赖
echo 下载依赖中...
go mod download github.com/gorilla/mux
go mod download github.com/golang-jwt/jwt/v5
go mod download github.com/mattn/go-sqlite3
go mod download golang.org/x/crypto
go mod tidy

rem 构建和运行
echo 构建并启动服务器...
cd cmd/server
go run main.go

pause
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

rem 设置FreeRDP路径环境变量
set "FREERDP_PATH=C:\Program Files\FreeRDP\wfreerdp.exe"
if exist "%FREERDP_PATH%" (
    echo 已设置FreeRDP路径: %FREERDP_PATH%
) else (
    echo 警告: 未找到FreeRDP客户端，将尝试查找其他路径
    
    rem 尝试其他可能的路径
    if exist "C:\Program Files (x86)\FreeRDP\wfreerdp.exe" (
        set "FREERDP_PATH=C:\Program Files (x86)\FreeRDP\wfreerdp.exe"
        echo 已找到FreeRDP路径: %FREERDP_PATH%
    ) else (
        echo 警告: 未找到FreeRDP客户端，RDP连接可能无法正常工作
        echo 请安装FreeRDP客户端: https://github.com/FreeRDP/FreeRDP/releases
    )
)
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
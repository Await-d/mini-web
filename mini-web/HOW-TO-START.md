# 如何启动 Mini Web 项目

## 前端开发服务器

### 使用命令行启动

1. 确保你已安装Node.js和Yarn
2. 打开命令行终端，进入项目根目录
3. 执行以下命令启动前端开发服务器:

```powershell
# PowerShell
cd frontend
yarn install  # 仅首次运行或依赖更新时需要
yarn dev
```

或者使用提供的脚本:

```powershell
# PowerShell
.\start-frontend-dev.ps1
```

前端服务将在 http://localhost:5173 上运行。

## 后端服务器

### 必备条件

后端服务需要Go环境支持:

1. 从 https://golang.org/dl/ 下载并安装Go
2. 确保`go`命令可在命令行中使用

### 使用命令行启动

```powershell
# PowerShell
cd backend
go mod tidy
go run cmd/server/main.go
```

或者使用提供的脚本:

```powershell
# PowerShell
.\start-backend-improved.bat
```

后端API将在 http://localhost:8080 上运行。

## 默认用户

系统预置了两个用户账号，可用于测试:

1. 管理员用户:
   - 用户名: `admin`
   - 密码: `admin123`
   - 角色: `admin`

2. 普通用户:
   - 用户名: `user`
   - 密码: `admin123`
   - 角色: `user`

## 常见问题

### 前端启动问题

如果遇到依赖相关错误，请尝试:

```powershell
cd frontend
yarn cache clean
yarn install --force
```

### 后端启动问题

1. 确保Go环境正确安装
2. 检查控制台错误信息
3. 如果遇到模块路径问题，可能需要修改`go.mod`文件中的模块路径
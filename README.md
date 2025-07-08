# Mini Web 远程连接平台

Mini Web 远程连接平台是一个基于Web的远程连接解决方案，支持RDP、SSH、VNC和Telnet等多种远程连接协议，使用户能够通过浏览器直接访问和管理远程服务器、设备和系统，无需安装任何客户端软件。

## 功能特点

- 支持多种远程连接协议（RDP、SSH、VNC、Telnet）
- 统一的Web界面，支持多会话并行操作
- 连接管理和会话记录
- 用户权限和访问控制
- 文件传输功能（SSH/SFTP）
- 安全的认证和数据传输

## 项目结构

```
mini-web/
├── frontend/            # 前端代码
│   ├── public/          # 静态资源
│   ├── src/             # 源代码
│   │   ├── assets/      # 静态资源
│   │   ├── components/  # 公共组件
│   │   ├── hooks/       # 自定义 Hooks
│   │   ├── layouts/     # 布局组件
│   │   ├── pages/       # 页面组件
│   │   ├── services/    # API 服务
│   │   └── ...
├── backend/             # 后端代码
│   ├── cmd/             # 入口命令
│   ├── internal/        # 内部包
│   │   ├── api/         # API 处理器
│   │   ├── config/      # 配置
│   │   ├── model/       # 数据模型
│   │   └── service/     # 业务逻辑
│   └── pkg/             # 可导出的包
```

## 快速开始

### 前端

1. 进入前端目录

```bash
cd mini-web/frontend
```

2. 安装依赖

```bash
yarn
```

3. 启动开发服务器

```bash
yarn dev
```

4. 打开浏览器访问 http://localhost:5173

### 后端

1. 进入后端目录

```bash
cd mini-web/backend
```

2. 启动后端服务器

```bash
go run cmd/server/main.go
```

3. 后端API将运行在 http://localhost:8080

## 已实现功能

1. **用户认证**
   - 用户登录
   - 基于JWT的认证

2. **连接管理**
   - 保存和管理连接配置
   - 支持SSH/RDP/VNC/Telnet协议

3. **终端功能**
   - SSH终端模拟

## 技术栈

### 前端
- React
- TypeScript
- Vite
- React Router
- Ant Design 5

### 后端
- Go
- Gorilla Mux（HTTP路由）
- SQLite（数据存储）
- JWT（认证）

## 默认账户

系统默认包含以下用户账户（仅用于测试）：

- 管理员账户: 
  - 用户名: `admin`
  - 密码: `admin123`

- 普通用户: 
  - 用户名: `user`
  - 密码: `admin123`

## 问题排查

如果遇到问题，请尝试：

1. 前端依赖问题：`yarn install` 重新安装依赖
2. 后端启动问题：确保Go环境正确安装
3. 数据库问题：确保SQLite数据库文件存在且有读写权限
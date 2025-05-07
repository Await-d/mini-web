# Mini Web 管理系统

Mini Web 是一个使用 React + Go 构建的现代化 Web 管理系统，提供用户身份验证和基本管理功能。

## 功能特性

- 用户认证（登录/注册）
- 用户权限管理
- 响应式设计
- 基于 JWT 的认证
- SQLite 数据库支持

## 技术栈

### 前端

- React 18
- TypeScript
- Ant Design 5
- React Router 6
- Axios

### 后端

- Go
- Gorilla Mux (HTTP 路由)
- SQLite3
- JWT

## 快速开始

### 环境要求

- Node.js 16+
- Go 1.21+
- 包管理工具: npm/yarn

### 安装与运行

1. 克隆项目

```bash
git clone https://github.com/yourusername/mini-web.git
cd mini-web
```

2. 启动应用（Windows）

```bash
# 同时启动前端和后端
run.bat

# 仅启动前端
run.bat frontend

# 仅启动后端
run.bat backend
```

3. 启动应用（Linux/macOS）

```bash
# 同时启动前端和后端
chmod +x run.sh
./run.sh

# 仅启动前端
./run.sh frontend

# 仅启动后端
./run.sh backend
```

4. 访问应用

前端: http://localhost:5173
后端API: http://localhost:8080/api

## 用户帐号

系统初始化后会创建以下用户：

- 管理员: username: `admin`, password: `admin123`
- 普通用户: username: `user`, password: `user123`

## 项目结构

```
mini-web/
├── frontend/                # 前端代码
│   ├── src/                 # 源代码
│   │   ├── components/      # 通用组件
│   │   ├── contexts/        # 上下文
│   │   ├── pages/           # 页面
│   │   ├── services/        # API服务
│   │   └── ...
│   └── ...
├── backend/                 # 后端代码
│   ├── cmd/                 # 入口程序
│   ├── internal/            # 内部包
│   │   ├── api/             # API处理器
│   │   ├── config/          # 配置
│   │   ├── middleware/      # 中间件
│   │   ├── model/           # 数据模型
│   │   └── service/         # 业务逻辑
│   └── ...
└── ...
```

## API 文档

### 认证 API

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/user/profile` - 获取用户信息
- `PUT /api/user/profile` - 更新用户信息
- `PUT /api/user/password` - 更新用户密码
- `POST /api/auth/refresh` - 刷新 Token

### 管理员 API

- `GET /api/admin/users` - 获取所有用户
- `GET /api/admin/users/{id}` - 获取指定用户

## 许可证

MIT
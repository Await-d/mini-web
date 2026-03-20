# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 项目概述

Mini Web 是一个基于 Web 的远程终端管理平台，支持多种远程连接协议（RDP、SSH、VNC、Telnet）。用户可以通过浏览器直接访问和管理远程服务器、设备和系统，无需安装客户端软件。

### 技术栈

**前端:**
- React 19.0 + TypeScript
- Vite 5.0 (构建工具)
- Ant Design 5.25 (UI 组件库)
- xterm.js (终端模拟器)
- React Router 6 (路由)
- Axios (HTTP 客户端)

**后端:**
- Go 1.23+
- Gorilla Mux (HTTP 路由)
- Gorilla WebSocket (WebSocket 支持)
- SQLite (modernc.org/sqlite)
- JWT 认证 (golang-jwt/jwt)
- 协议库: golang.org/x/crypto (SSH), go-vnc (VNC), go-telnet (Telnet)

## 项目结构

```
mini-web/
├── mini-web/
│   ├── backend/              # Go 后端
│   │   ├── cmd/server/       # 主程序入口点
│   │   ├── internal/         # 内部包
│   │   │   ├── api/          # HTTP API 处理器
│   │   │   ├── config/       # 配置管理
│   │   │   ├── middleware/   # 中间件 (认证等)
│   │   │   ├── model/        # 数据模型
│   │   │   └── service/      # 业务逻辑层
│   │   └── data/             # SQLite 数据库文件
│   ├── frontend/             # React 前端
│   │   ├── src/
│   │   │   ├── components/   # 可复用组件
│   │   │   ├── pages/        # 页面组件
│   │   │   ├── layouts/      # 布局组件
│   │   │   ├── services/     # API 服务层
│   │   │   ├── hooks/        # 自定义 React Hooks
│   │   │   ├── contexts/     # React Context
│   │   │   └── types/        # TypeScript 类型定义
│   │   └── public/           # 静态资源
│   └── docker-compose.yml    # Docker Compose 配置
├── Dockerfile                # 生产环境 Docker 镜像
└── nginx/                    # Nginx 配置 (生产环境)
```

### 架构说明

**前端架构:**
- 基于功能模块的目录组织方式
- 使用 React 19 新特性 (Actions, 资源预加载等)
- 优先使用函数组件和 Hooks
- WebSocket 用于实时终端通信
- 使用 Context API 进行全局状态管理

**后端架构:**
- RESTful API 设计
- WebSocket 用于终端会话
- JWT 基于令牌的认证
- SQLite 本地数据持久化
- 内部包结构遵循 Go 最佳实践
- 分层架构: API → Service → Model

**通信协议:**
- HTTP/HTTPS: RESTful API
- WebSocket: 终端实时数据传输
- 二进制协议: 用于增强的终端通信

## 常用开发命令

### 前端开发

```bash
cd mini-web/frontend

# 安装依赖
yarn install

# 启动开发服务器 (http://localhost:5173)
yarn dev

# 构建生产版本
yarn build

# 代码检查
yarn lint

# 预览生产构建
yarn preview
```

### 后端开发

```bash
cd mini-web/backend

# 更新依赖
go mod tidy

# 运行开发服务器 (http://localhost:8080)
go run cmd/server/main.go

# 构建可执行文件
go build -o mini-web-server ./cmd/server

# 运行构建后的可执行文件
./mini-web-server
```

### Docker 部署

```bash
# 构建并启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 查看日志
docker-compose logs -f

# 重新构建镜像
docker-compose build

# 使用预构建镜像
docker pull await2719/mini-web:latest
docker run -d --name mini-web -p 80:80 await2719/mini-web:latest
```

### 数据库管理

```bash
# 进入 SQLite 数据库
sqlite3 mini-web/backend/data/mini-web.db

# SQLite 常用命令
.tables              # 显示所有表
.schema users        # 显示表结构
SELECT * FROM users; # 查询数据
.quit                # 退出
```

## 开发工作流

### 启动开发环境

1. **启动后端:**
   ```bash
   cd mini-web/backend
   go run cmd/server/main.go
   ```
   后端将运行在 http://localhost:8080

2. **启动前端:**
   ```bash
   cd mini-web/frontend
   yarn dev
   ```
   前端将运行在 http://localhost:5173

3. **默认登录凭证:**
   - 管理员: `admin` / `admin123`
   - 普通用户: `user` / `admin123`

### 代码规范

**前端:**
- 遵循 ESLint 配置规则
- 使用 TypeScript 严格类型检查
- 组件文件使用 PascalCase (如 `UserProfile.tsx`)
- 优先使用函数组件和 Hooks
- 避免使用 `any` 类型
- 使用接口定义组件 Props

**后端:**
- 遵循 Go 官方代码风格 (使用 `gofmt`)
- 包名小写，不使用下划线
- 文件名使用下划线分隔 (如 `user_service.go`)
- 公开的函数/变量首字母大写，私有的小写
- 使用简洁的错误处理模式

### Git 提交规范

- 使用清晰的中文描述变更内容
- 功能分支使用 `feature/` 前缀
- 修复分支使用 `fix/` 前缀
- 提交前运行 lint 和格式化

## 三大核心原则

在开发此项目时，必须永远遵守以下三大原则:

### 🚫 不可使用模拟方案！！！
- 所有操作必须使用真实的数据
- 所有监控数据必须来自真实的系统指标
- 所有终端操作必须是真实的容器 exec 会话

### 🚫 不可使用简化方案！！！
- 实现完整的错误处理和边缘情况
- 实现完整的性能优化和缓存机制
- 实现完整的安全验证和权限控制

### 🚫 不可使用临时方案！！！
- 所有实现必须是生产级质量
- 所有代码必须具备长期维护性
- 所有架构必须支持未来扩展需求

## 关键功能实现

### WebSocket 终端通信
- 文件: `backend/internal/service/terminal_service.go`
- 文件: `frontend/src/pages/Terminal/`
- 支持 SSH, RDP, VNC, Telnet 协议
- 实时双向数据传输
- 二进制协议增强通信

### 用户认证系统
- JWT 令牌认证
- 密码加密存储 (bcrypt)
- 基于角色的权限控制
- 文件: `backend/internal/middleware/auth.go`

### 连接管理
- 支持多种协议配置
- 会话持久化
- 文件浏览器集成
- 文件: `backend/internal/service/connection_service.go`

### 性能监控
- 实时系统指标 (CPU, 内存, 磁盘)
- 数据库性能监控
- 网络统计
- 文件: `frontend/src/pages/Settings/`

## 环境要求

- **Go:** 1.23.0 或更高版本
- **Node.js:** 18.19.1 或更高版本
- **Yarn:** 1.22.22 或更高版本
- **Docker:** 20.10+ (生产部署)
- **Docker Compose:** 2.0+ (生产部署)

## 重要注意事项

### 安全性
- 敏感数据 (密码、密钥) 需加密存储
- 所有 API 端点需要适当的认证和授权
- 用户输入需要验证和清理
- WebSocket 连接需要认证令牌

### 性能考虑
- 大列表使用虚拟滚动
- 合理使用缓存减少 API 请求
- WebSocket 消息需要节流处理
- 避免不必要的组件重渲染

### 容器环境
- 支持 `HEADLESS=true` 无头模式
- 支持 `CONTAINER=true` 容器标识
- 数据持久化: `/app/data`, `/app/logs`, `/app/configs`
- 健康检查端点: `/api/health`

## 已知问题

参见记忆文件 `known_issues_and_tech_debt` 获取详细的已知问题和技术债务列表。

主要关注点:
- 终端标签页创建稳定性
- 文件浏览器性能优化
- 测试覆盖率提升
- API 版本控制机制

## 端口配置

- **前端开发:** http://localhost:5173
- **后端 API:** http://localhost:8080
- **生产环境:** http://localhost:80 (Nginx)

## 健康检查

```bash
# 后端健康检查
curl http://localhost:8080/api/health

# Docker 容器健康检查
docker exec mini-web curl -f http://localhost/api/health
```

## 日志查看

```bash
# 后端日志 (如果配置)
tail -f mini-web/backend/logs/app.log

# Docker 容器日志
docker logs -f mini-web-backend
docker logs -f mini-web-frontend
```

## 调试技巧

### 前端调试
- 使用 React DevTools 浏览器扩展
- 检查浏览器控制台的 WebSocket 消息
- 使用 Network 标签查看 API 请求

### 后端调试
- 检查终端输出的日志
- 使用 Delve 调试器进行断点调试
- 检查 SQLite 数据库内容验证数据

### WebSocket 调试
- 浏览器开发者工具 → Network → WS 筛选
- 检查连接状态和消息流
- 验证认证令牌传递
# Mini Web 依赖管理指南

## 前端依赖管理

### 核心依赖

Mini Web前端使用以下核心依赖：

- React 19 - 前端UI框架
- TypeScript - 类型安全的JavaScript超集
- Ant Design 5 - UI组件库
- React Router 6 - 路由管理
- Axios - HTTP客户端
- Vite - 构建和开发工具

### 依赖安装

使用Yarn作为依赖管理工具：

```bash
# 安装所有依赖
cd frontend
yarn install

# 添加新依赖
yarn add package-name

# 添加开发依赖
yarn add -D package-name

# 更新依赖
yarn upgrade package-name
```

### 依赖版本控制

- 使用`package.json`中的版本约束管理依赖版本
- 使用`yarn.lock`锁定精确版本，确保开发环境一致性
- 定期更新依赖，检查安全漏洞

### 前端构建

```bash
# 开发模式
yarn dev

# 生产构建
yarn build
```

## 后端依赖管理

### 核心依赖

Mini Web后端使用以下核心依赖：

- gorilla/mux - HTTP路由
- gorilla/websocket - WebSocket支持
- golang-jwt/jwt - JWT认证
- modernc.org/sqlite - SQLite数据库驱动
- mitchellh/go-vnc - VNC协议支持
- reiver/go-telnet - Telnet协议支持

### 依赖管理

使用Go模块系统管理依赖：

```bash
# 更新依赖
go mod tidy

# 下载依赖
go mod download

# 添加新依赖（直接在代码中import后运行）
go mod tidy
```

### 依赖版本控制

- `go.mod`文件定义了依赖版本
- `go.sum`文件锁定了依赖的精确版本和校验和
- 使用Go 1.23+ 的工作区特性管理多模块项目

### 后端构建

```bash
# 编译
go build -o mini-web-server ./cmd/server

# 运行
go run cmd/server/main.go
```

## Docker部署依赖

项目使用Docker和Docker Compose进行容器化部署，核心依赖包括：

- Docker 20.10+ - 容器运行时
- Docker Compose 2.0+ - 容器编排工具
- Nginx - Web服务器（前端）
- Alpine Linux - 基础容器镜像

### Docker构建

```bash
# 构建并启动所有服务
docker-compose up -d

# 单独构建服务
docker-compose build service-name
```

## 依赖更新策略

1. **定期更新检查**
   - 每月进行一次依赖版本检查
   - 优先更新有安全漏洞的依赖

2. **版本兼容性测试**
   - 在更新主要依赖前进行兼容性测试
   - 创建单独的分支进行测试，确认无问题后合并

3. **破坏性更改处理**
   - 对于有破坏性更改的依赖，创建迁移计划
   - 记录所有API变更和迁移步骤

4. **锁定文件管理**
   - 务必提交`yarn.lock`和`go.sum`文件到版本控制系统
   - 不要手动编辑锁定文件

## 常见问题解决

### 前端依赖问题

1. **依赖冲突**
   ```bash
   yarn why package-name  # 查看依赖树
   yarn install --force   # 强制重新安装
   ```

2. **Node版本不兼容**
   - 确保使用Node.js 18+版本
   - 考虑使用nvm管理Node版本

### 后端依赖问题

1. **Go模块缓存问题**
   ```bash
   go clean -modcache  # 清除模块缓存
   go mod tidy        # 重新整理依赖
   ```

2. **依赖版本冲突**
   - 检查`go.mod`中的replace指令
   - 考虑更新依赖到兼容版本
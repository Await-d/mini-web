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

### 方式一：Docker 部署（推荐）

#### 使用预构建镜像

1. 拉取镜像

```bash
docker pull await2719/mini-web:latest
```

2. 运行容器

```bash
docker run -d \
  --name mini-web \
  -p 80:80 \
  -v /path/to/data:/app/data \
  -v /path/to/logs:/app/logs \
  await2719/mini-web:latest
```

3. 访问应用

打开浏览器访问 http://localhost

#### 使用 Docker Compose

1. 创建 `docker-compose.yml` 文件

```yaml
version: '3.8'
services:
  mini-web:
    image: await2719/mini-web:latest
    container_name: mini-web
    ports:
      - "80:80"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./configs:/app/configs
    environment:
      - TZ=Asia/Shanghai
      - HEADLESS=true
      - CONTAINER=true
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

2. 启动服务

```bash
docker-compose up -d
```

#### 本地构建镜像

```bash
# 克隆仓库
git clone https://github.com/Await-d/mini-web.git
cd mini-web

# 构建镜像
docker build -t mini-web .

# 运行容器
docker run -d --name mini-web -p 80:80 mini-web
```

### 方式二：开发环境部署

#### 前端

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

#### 后端

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

## Docker 使用说明

### 环境变量

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `TZ` | `Asia/Shanghai` | 时区设置 |
| `HEADLESS` | `true` | 无头模式运行 |
| `CONTAINER` | `true` | 容器环境标识 |
| `SERVER_HOST` | `0.0.0.0` | 服务器监听地址 |
| `SERVER_PORT` | `8080` | 后端服务端口 |

### 数据持久化

建议挂载以下目录以实现数据持久化：

- `/app/data` - 数据库文件和用户数据
- `/app/logs` - 应用日志文件
- `/app/configs` - 配置文件
- `/tmp/rdp_screenshots` - RDP截图临时文件

### 容器管理

```bash
# 查看容器状态
docker ps -a

# 查看容器日志
docker logs mini-web

# 进入容器
docker exec -it mini-web /bin/bash

# 停止容器
docker stop mini-web

# 启动容器
docker start mini-web

# 重启容器
docker restart mini-web

# 删除容器
docker rm mini-web
```

### 健康检查

容器内置健康检查端点：`/api/health`

```bash
# 检查应用健康状态
curl http://localhost/api/health
```

### 镜像版本

- `latest` - 最新稳定版本
- `v1.x.x` - 具体版本号

可在 [Docker Hub](https://hub.docker.com/r/await2719/mini-web) 查看所有可用版本。

### 端口说明

- `80` - Nginx前端服务端口（对外）
- `8080` - Go后端API端口（内部）

## 问题排查

### 开发环境

如果遇到问题，请尝试：

1. 前端依赖问题：`yarn install` 重新安装依赖
2. 后端启动问题：确保Go环境正确安装
3. 数据库问题：确保SQLite数据库文件存在且有读写权限

### Docker 环境

1. **容器启动失败**
   ```bash
   # 查看详细错误信息
   docker logs mini-web
   ```

2. **无法访问应用**
   - 检查端口映射是否正确：`docker port mini-web`
   - 确认防火墙设置允许访问端口 80

3. **数据丢失**
   - 确保正确挂载数据目录
   - 检查目录权限是否正确

4. **性能问题**
   - 增加容器内存限制：`docker run --memory=2g ...`
   - 检查磁盘空间是否充足

### 常见问题

1. **RDP连接失败**
   - 确保目标服务器RDP服务已启用
   - 检查网络连接和防火墙设置
   - 验证用户名和密码是否正确

2. **SSH连接超时**
   - 检查SSH服务是否运行在目标端口
   - 确认SSH密钥或密码认证设置

3. **文件传输失败**
   - 检查目标服务器SFTP服务状态
   - 确认用户权限和目录访问权限
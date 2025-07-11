# Mini-Web Drone 部署说明

## 概述
本项目使用 Drone CI/CD 进行自动化部署，前后端打包在同一个 Docker 镜像中，通过 Nginx 提供前端静态文件服务并代理后端 API。

## 部署架构

### 容器结构
- **前端**: React + TypeScript + Vite 构建的静态文件
- **后端**: Go 编写的 API 服务器
- **Web服务器**: Nginx 负责静态文件服务和 API 代理
- **进程管理**: Supervisor 管理 Nginx 和后端服务

### 端口映射
- **外部端口**: 8090 (可在 .drone.yml 中修改)
- **内部端口**: 80 (Nginx)
- **后端服务**: 8080 (内部通信)

## 文件结构

```
project-root/
├── Dockerfile              # 统一构建文件
├── .drone.yml              # Drone CI/CD 配置
├── .dockerignore           # Docker 忽略文件
├── nginx/
│   └── mini-web.conf      # Nginx 配置
├── mini-web/
│   ├── frontend/          # React 前端
│   └── backend/           # Go 后端
└── DEPLOYMENT.md          # 本文档
```

## 部署流程

### 1. Drone 自动部署
当代码推送到 `master` 分支时，Drone 会自动执行部署流程：

1. **创建目录结构**
   ```bash
   /volume1/docker/1panel/apps/local/mini-web/
   ├── data/         # 数据库文件
   ├── logs/         # 应用日志
   ├── configs/      # 配置文件
   └── screenshots/  # RDP 截图临时文件
   ```

2. **构建镜像**
   - 构建前端静态文件 (React + Vite)
   - 编译后端二进制文件 (Go)
   - 打包为统一的 Docker 镜像

3. **部署容器**
   - 停止并删除旧容器
   - 启动新容器并挂载持久化目录
   - 配置自动重启策略

### 2. 手动部署

如需手动部署，可执行以下命令：

```bash
# 构建镜像
docker build -t mini-web:latest .

# 创建必要目录
mkdir -p /volume1/docker/1panel/apps/local/mini-web/{data,logs,configs,screenshots}

# 运行容器
docker run -d --name mini-web-container \
  -p 8090:80 \
  -v /volume1/docker/1panel/apps/local/mini-web/data:/app/data \
  -v /volume1/docker/1panel/apps/local/mini-web/logs:/app/logs \
  -v /volume1/docker/1panel/apps/local/mini-web/configs:/app/configs \
  -v /volume1/docker/1panel/apps/local/mini-web/screenshots:/tmp/rdp_screenshots \
  --restart always \
  mini-web:latest
```

## 配置说明

### Nginx 配置
- 静态文件服务: `/` -> 前端文件
- API 代理: `/api/` -> 后端服务 (http://127.0.0.1:8080)
- WebSocket 代理: `/ws/` -> 后端 WebSocket
- 启用 Gzip 压缩和缓存策略
- 配置安全头部

### 环境变量
容器内预设以下环境变量：
- `HEADLESS=true`: 无头模式运行
- `CONTAINER=true`: 容器环境标识
- `TZ=Asia/Shanghai`: 时区设置

### 数据持久化
以下目录被挂载到宿主机：
- `/app/data`: 数据库文件 (SQLite)
- `/app/logs`: 应用运行日志
- `/app/configs`: 应用配置文件
- `/tmp/rdp_screenshots`: RDP 截图临时文件

## 访问方式

部署完成后，可通过以下方式访问：

- **Web 界面**: `http://your-server:8090`
- **API 接口**: `http://your-server:8090/api/`
- **健康检查**: `http://your-server:8090/api/health`

### 默认账户
- **管理员**: 用户名 `admin`, 密码 `admin123`
- **普通用户**: 用户名 `user`, 密码 `admin123`

## 监控和维护

### 健康检查
容器配置了自动健康检查，每 30 秒检查一次 `/api/health` 端点。

### 日志查看
```bash
# 查看容器日志
docker logs mini-web-container

# 查看应用日志
docker exec mini-web-container tail -f /var/log/supervisor/mini-web-server.out.log

# 查看 Nginx 日志
docker exec mini-web-container tail -f /var/log/supervisor/nginx.out.log
```

### 重启服务
```bash
# 重启整个容器
docker restart mini-web-container

# 重启容器内的服务
docker exec mini-web-container supervisorctl restart all
```

## 故障排除

### 常见问题
1. **端口冲突**: 检查 8090 端口是否被占用
2. **目录权限**: 确保挂载目录有正确的读写权限
3. **镜像构建失败**: 检查 Dockerfile 和依赖是否正确

### 日志位置
- **Supervisor**: `/var/log/supervisor/supervisord.log`
- **Nginx**: `/var/log/supervisor/nginx.*.log`
- **后端应用**: `/var/log/supervisor/mini-web-server.*.log`
- **应用日志**: `/app/logs/` (挂载到宿主机)

## 自定义配置

### 修改端口
在 `.drone.yml` 中修改端口映射：
```yaml
-p 8090:80  # 改为其他端口，如 -p 9000:80
```

### 修改挂载路径
在 `.drone.yml` 中修改卷挂载：
```yaml
-v /your-custom-path/mini-web/data:/app/data
```

### 自定义 Nginx 配置
修改 `nginx/mini-web.conf` 文件并重新构建镜像。

## 版本升级

1. 提交代码到 `master` 分支
2. Drone 自动构建和部署
3. 旧容器自动停止，新容器启动
4. 数据文件保持不变（持久化挂载）
# Mini-Web Drone 部署配置

## 概述
本项目已配置完整的 Drone CI/CD 部署流程，前后端统一打包在单一 Docker 镜像中，适用于 `/volume1/docker/1panel/apps/local` 映射根地址的部署环境。

## 部署文件说明

### 主要文件
- **`Dockerfile`** - 多阶段构建配置，包含前端和后端
- **`.drone.yml`** - Drone CI/CD 配置文件
- **`nginx/mini-web.conf`** - Nginx 配置文件
- **`.dockerignore`** - Docker 构建忽略文件
- **`test-deployment.sh`** - 本地部署测试脚本
- **`DEPLOYMENT.md`** - 详细部署说明文档

### 镜像架构
```
mini-web:latest
├── 前端 (React + Vite) → /usr/share/nginx/html
├── 后端 (Go Binary) → /app/mini-web-server
├── Nginx → 静态文件服务 + API代理
└── Supervisor → 进程管理
```

## 自动部署流程

### 触发条件
- 推送到 `master` 分支
- 通过 Drone CI/CD 自动执行

### 部署步骤
1. **创建目录结构**
   ```
   /volume1/docker/1panel/apps/local/mini-web/
   ├── data/         # 数据库和数据文件
   ├── logs/         # 应用日志
   ├── configs/      # 配置文件
   └── screenshots/  # 临时截图文件
   ```

2. **构建镜像**
   - 构建前端静态文件
   - 编译后端二进制文件
   - 打包统一Docker镜像

3. **部署容器**
   - 端口映射: `8090:80`
   - 数据卷挂载
   - 自动重启策略

## 多仓库配置

### 远程仓库
项目已配置三个远程仓库：
- **origin**: Gitee - `https://gitee.com/await29/mini-web.git`
- **github**: GitHub - `https://github.com/Await-d/mini-web.git`
- **mini-web**: 私有仓库 - `http://14.103.238.12:10882/await/mini-web.git`

### 推送到所有仓库
使用便利脚本推送到所有仓库：
```bash
./push-all.sh
```

### Drone配置
- **`.drone.yml`**: 适用于 origin 和 github (master分支)
- **`.drone-mini-web.yml`**: 适用于 mini-web 仓库

### 手动推送
```bash
# 推送到特定仓库
git push origin master        # Gitee
git push github master       # GitHub
git push mini-web master # 私有仓库

# 查看所有远程仓库
git remote -v
```

## 快速开始

### 1. 配置 Drone
确保 Drone CI/CD 已正确配置并能访问代码仓库。

### 2. 推送代码
```bash
git add .
git commit -m "部署配置完成"
git push origin master
```

### 3. 访问服务
部署完成后访问：
- **Web界面**: `http://your-server:8090`
- **API接口**: `http://your-server:8090/api/`
- **健康检查**: `http://your-server:8090/api/health`

### 4. 默认账户
- 管理员: `admin` / `admin123`
- 普通用户: `user` / `admin123`

## 本地测试

### 使用测试脚本
```bash
./test-deployment.sh
```

### 手动测试
```bash
# 构建镜像
docker build -t mini-web:latest .

# 运行容器
docker run -d --name mini-web-test \
  -p 8090:80 \
  -v /tmp/mini-web-test/data:/app/data \
  -v /tmp/mini-web-test/logs:/app/logs \
  mini-web:latest

# 测试访问
curl http://localhost:8090/api/health
```

## 配置自定义

### 修改端口
在 `.drone.yml` 中修改：
```yaml
-p 8090:80  # 改为其他端口
```

### 修改挂载路径
在 `.drone.yml` 中修改：
```yaml
-v /your-path/mini-web/data:/app/data
```

### 环境变量
容器支持以下环境变量：
- `SERVER_HOST`: 服务器绑定地址 (默认: 0.0.0.0)
- `SERVER_PORT`: 服务器端口 (默认: 8080)
- `JWT_SECRET`: JWT密钥 (默认: mini-web-secret-key)
- `DB_PATH`: 数据库路径 (默认: ./data/mini-web.db)

## 监控和维护

### 查看服务状态
```bash
# 容器状态
docker ps | grep mini-web

# 服务进程
docker exec mini-web-container supervisorctl status

# 应用日志
docker logs mini-web-container
```

### 重启服务
```bash
# 重启容器
docker restart mini-web-container

# 重启内部服务
docker exec mini-web-container supervisorctl restart all
```

### 清理和重新部署
```bash
# 停止并删除容器
docker stop mini-web-container
docker rm mini-web-container

# 删除镜像
docker rmi mini-web:latest

# 重新构建部署
docker build -t mini-web:latest .
```

## 故障排除

### 常见问题
1. **构建失败**: 检查依赖文件是否存在
2. **容器启动失败**: 检查端口是否被占用
3. **API无法访问**: 检查防火墙和网络配置
4. **数据丢失**: 确保数据卷正确挂载

### 调试命令
```bash
# 进入容器
docker exec -it mini-web-container /bin/bash

# 查看配置
docker exec mini-web-container cat /etc/nginx/conf.d/default.conf

# 查看进程
docker exec mini-web-container ps aux

# 查看日志
docker exec mini-web-container tail -f /var/log/supervisor/mini-web-server.out.log
```

## 安全建议

1. **修改默认密码**: 首次部署后立即修改管理员密码
2. **配置HTTPS**: 在生产环境中使用SSL证书
3. **限制访问**: 配置防火墙规则限制访问
4. **定期备份**: 定期备份数据库和配置文件
5. **监控日志**: 定期检查应用日志

## 技术支持

如果遇到问题，请检查：
1. Drone构建日志
2. Docker容器日志
3. 应用程序日志
4. 网络连接状态

## 项目结构
```
mini-web/
├── Dockerfile              # 统一构建文件
├── .drone.yml              # Drone CI/CD配置
├── nginx/mini-web.conf     # Nginx配置
├── test-deployment.sh      # 测试脚本
├── DEPLOYMENT.md           # 详细部署说明
├── README-DEPLOYMENT.md    # 本文档
└── mini-web/
    ├── frontend/           # React前端
    └── backend/            # Go后端
```
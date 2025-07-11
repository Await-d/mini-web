# Mini-Web 故障排除指南

## 常见部署问题

### 1. 目录挂载错误

**错误信息:**
```
Error response from daemon: Bind mount failed: '/volume1/docker/1panel/apps/local/mini-web/configs' does not exists
```

**原因:** Docker 尝试挂载不存在的宿主机目录

**解决方案:**

#### 方案 A: 使用预设脚本（推荐）
```bash
# 运行目录设置脚本
chmod +x scripts/setup-directories.sh
./scripts/setup-directories.sh /volume1/docker/1panel/apps/local/mini-web
```

#### 方案 B: 手动创建目录
```bash
# 创建所有必要的目录
sudo mkdir -p /volume1/docker/1panel/apps/local/mini-web/{data,logs,configs,screenshots}

# 设置权限
sudo chmod 755 /volume1/docker/1panel/apps/local/mini-web/{data,logs,configs,screenshots}

# 创建占位文件
sudo touch /volume1/docker/1panel/apps/local/mini-web/data/.gitkeep
sudo touch /volume1/docker/1panel/apps/local/mini-web/logs/.gitkeep
sudo touch /volume1/docker/1panel/apps/local/mini-web/configs/.gitkeep
sudo touch /volume1/docker/1panel/apps/local/mini-web/screenshots/.gitkeep
```

#### 方案 C: 修改挂载路径
如果无法创建 `/volume1/docker/1panel/apps/local` 目录，可以修改为其他路径：

```bash
# 在 .drone.yml 中修改为可访问的路径
-v /tmp/mini-web/data:/app/data
-v /tmp/mini-web/logs:/app/logs
-v /tmp/mini-web/configs:/app/configs
-v /tmp/mini-web/screenshots:/tmp/rdp_screenshots
```

### 2. 权限问题

**错误信息:**
```
mkdir: cannot create directory '/volume1/docker/1panel/apps/local/mini-web': Permission denied
```

**解决方案:**
```bash
# 检查父目录权限
ls -la /volume1/docker/1panel/apps/local/

# 使用 sudo 创建目录
sudo mkdir -p /volume1/docker/1panel/apps/local/mini-web

# 修改所有者（如果需要）
sudo chown -R $USER:$USER /volume1/docker/1panel/apps/local/mini-web
```

### 3. 端口占用

**错误信息:**
```
bind: address already in use
```

**解决方案:**
```bash
# 检查端口占用
ss -tlnp | grep :8090

# 停止占用端口的进程
sudo kill -9 <PID>

# 或者修改为其他端口
docker run -p 8091:80 mini-web:latest
```

### 4. Docker 构建失败

**错误信息:**
```
failed to build: context canceled
```

**解决方案:**
```bash
# 清理 Docker 缓存
docker system prune -f

# 增加构建超时时间
docker build --timeout 600 -t mini-web:latest .

# 检查 .dockerignore 是否正确
cat .dockerignore
```

### 5. 容器启动失败

**错误信息:**
```
container exited with code 1
```

**调试步骤:**
```bash
# 查看容器日志
docker logs mini-web-container

# 进入容器调试
docker run -it --entrypoint /bin/bash mini-web:latest

# 检查服务状态
docker exec mini-web-container supervisorctl status

# 查看具体服务日志
docker exec mini-web-container tail -f /var/log/supervisor/mini-web-server.err.log
docker exec mini-web-container tail -f /var/log/supervisor/nginx.err.log
```

### 6. 数据库初始化失败

**错误信息:**
```
数据库初始化失败
```

**解决方案:**
```bash
# 检查数据目录权限
ls -la /volume1/docker/1panel/apps/local/mini-web/data/

# 删除损坏的数据库文件
rm /volume1/docker/1panel/apps/local/mini-web/data/mini-web.db

# 重启容器让其重新初始化
docker restart mini-web-container
```

### 7. 网络连接问题

**错误信息:**
```
curl: (7) Failed to connect to localhost port 8090
```

**解决方案:**
```bash
# 检查容器是否运行
docker ps | grep mini-web

# 检查端口映射
docker port mini-web-container

# 检查防火墙设置
sudo ufw status

# 测试容器内部服务
docker exec mini-web-container curl http://localhost:80/api/health
```

## 调试工具

### 容器状态检查
```bash
# 详细容器信息
docker inspect mini-web-container

# 容器资源使用
docker stats mini-web-container

# 容器进程
docker exec mini-web-container ps aux
```

### 服务状态检查
```bash
# Supervisor 服务状态
docker exec mini-web-container supervisorctl status

# Nginx 配置测试
docker exec mini-web-container nginx -t

# 后端服务健康检查
curl http://localhost:8090/api/health
```

### 日志检查
```bash
# 容器启动日志
docker logs mini-web-container

# Supervisor 日志
docker exec mini-web-container tail -f /var/log/supervisor/supervisord.log

# 应用日志
docker exec mini-web-container tail -f /var/log/supervisor/mini-web-server.out.log

# Nginx 日志
docker exec mini-web-container tail -f /var/log/supervisor/nginx.out.log
```

## 性能优化

### 1. 镜像优化
```bash
# 查看镜像大小
docker images | grep mini-web

# 清理构建缓存
docker builder prune

# 多阶段构建优化（已实现）
```

### 2. 容器资源限制
```bash
# 限制容器资源使用
docker run -d --name mini-web-container \
  --memory="512m" \
  --cpus="1.0" \
  -p 8090:80 \
  mini-web:latest
```

### 3. 卷挂载优化
```bash
# 使用命名卷替代绑定挂载（可选）
docker volume create mini-web-data
docker run -v mini-web-data:/app/data mini-web:latest
```

## 备份和恢复

### 数据备份
```bash
# 备份数据目录
tar -czf mini-web-backup-$(date +%Y%m%d).tar.gz \
  /volume1/docker/1panel/apps/local/mini-web/data/

# 备份数据库
cp /volume1/docker/1panel/apps/local/mini-web/data/mini-web.db \
   /backup/mini-web-db-$(date +%Y%m%d).db
```

### 数据恢复
```bash
# 停止容器
docker stop mini-web-container

# 恢复数据
tar -xzf mini-web-backup-20250711.tar.gz -C /

# 重启容器
docker start mini-web-container
```

## 升级流程

### 1. 备份当前版本
```bash
# 备份数据
./scripts/setup-directories.sh backup

# 导出当前镜像
docker save mini-web:latest > mini-web-backup.tar
```

### 2. 部署新版本
```bash
# 拉取最新代码
git pull origin master

# 构建新镜像
docker build -t mini-web:latest .

# 滚动更新
docker stop mini-web-container
docker rm mini-web-container
docker run -d --name mini-web-container ... mini-web:latest
```

### 3. 验证升级
```bash
# 健康检查
curl http://localhost:8090/api/health

# 功能测试
# 登录系统检查主要功能
```

## 联系支持

如果以上解决方案都无法解决问题，请：

1. 收集以下信息：
   - Docker 版本: `docker --version`
   - 系统信息: `uname -a`
   - 容器日志: `docker logs mini-web-container`
   - 错误截图

2. 检查项目文档：
   - `DEPLOYMENT.md` - 部署说明
   - `README-DEPLOYMENT.md` - 快速指南
   - `GIT-SETUP.md` - 仓库配置

3. 查看项目仓库：
   - Gitee: https://gitee.com/await29/mini-web
   - GitHub: https://github.com/Await-d/mini-web
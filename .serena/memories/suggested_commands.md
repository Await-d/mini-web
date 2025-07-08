# Mini Web 项目推荐命令

以下是开发和管理 Mini Web 项目时常用的命令列表。

## 项目启动命令

### 前端开发

```bash
# 进入前端目录
cd frontend

# 安装依赖（首次运行或依赖更新时）
yarn install

# 启动开发服务器
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
# 进入后端目录
cd backend

# 更新依赖
go mod tidy

# 运行后端服务
go run cmd/server/main.go

# 构建可执行文件
go build -o mini-web-server ./cmd/server

# 运行构建后的服务
./mini-web-server

# 测试API
./test_with_curl.bat  # Windows
```

## Docker 相关命令

```bash
# 使用 Docker Compose 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 查看日志
docker-compose logs -f

# 单独构建并启动后端
docker-compose build backend
docker-compose up -d backend

# 单独构建并启动前端
docker-compose build frontend
docker-compose up -d frontend
```

## Git 命令

```bash
# 获取最新代码
git pull

# 查看变更
git status

# 添加变更
git add .

# 提交变更
git commit -m "描述变更内容"

# 推送到远程仓库
git push

# 创建并切换到新分支
git checkout -b feature/new-feature-name

# 合并分支
git merge branch-name
```

## 系统工具命令

```bash
# 查看目录内容
ls -la

# 查找文件
find . -name "filename"

# 搜索文件内容
grep -r "search term" .

# 查看进程
ps aux | grep process-name

# 查看端口占用
netstat -tuln | grep port-number

# 杀死进程
kill -9 process-id
```

## 数据库维护命令

```bash
# 进入SQLite数据库
sqlite3 backend/data/mini-web.db

# SQLite 常用命令
.tables           # 显示所有表
.schema table_name   # 显示表结构
SELECT * FROM table_name;   # 查询数据
.quit             # 退出
```

## 日志查看命令

```bash
# 查看后端日志（如果配置了日志文件）
tail -f backend/logs/app.log

# 查看Docker容器日志
docker logs -f mini-web-backend
docker logs -f mini-web-frontend
```
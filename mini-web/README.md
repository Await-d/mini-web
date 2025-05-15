# Mini Web 远程终端管理平台

支持多种协议（RDP、SSH、Telnet）的Web远程终端管理平台，前端使用React + TypeScript，后端使用Go语言。

## 主要功能

- RDP远程桌面连接
- SSH终端连接
- Telnet终端连接
- 会话管理
- 用户权限控制
- 终端录制与回放
- 多标签页支持

## 项目结构

```
mini-web/
├── backend/             # Go语言后端
│   ├── cmd/             # 程序入口
│   ├── internal/        # 内部包
│   ├── Dockerfile       # 后端Docker配置
├── frontend/            # React前端
│   ├── src/             # 源代码
│   ├── Dockerfile       # 前端Docker配置
│   ├── nginx/           # Nginx配置
└── docker-compose.yml   # Docker Compose配置
```

## 环境要求

### 开发环境

- Go 1.19+
- Node.js 18+
- Yarn 1.22+

### 生产环境

- Docker 20.10+
- Docker Compose 2.0+

## 部署指南

### 使用Docker Compose部署（推荐）

1. **克隆仓库**

```bash
git clone https://github.com/yourname/mini-web.git
cd mini-web
```

2. **启动服务**

```bash
docker-compose up -d
```

3. **访问服务**

打开浏览器访问 `http://localhost`

### 无界面环境部署说明

本项目已针对无界面环境（如Docker容器）做了特别优化：

- RDP连接在无界面环境中使用虚拟会话模式
- 后端自动检测无界面环境并调整适当策略
- 环境变量`HEADLESS=true`和`CONTAINER=true`用于控制行为

Docker部署默认已配置为无界面模式，无需额外设置。

### 手动部署后端

1. **进入后端目录**

```bash
cd backend
```

2. **编译程序**

```bash
go build -o mini-web-server ./cmd/server
```

3. **运行程序**

```bash
./mini-web-server
```

默认监听`8080`端口。

### 手动部署前端

1. **进入前端目录**

```bash
cd frontend
```

2. **安装依赖**

```bash
yarn install
```

3. **构建前端资源**

```bash
yarn build
```

4. **使用Nginx托管**

配置Nginx将请求代理到后端API：

```nginx
server {
    listen 80;
    
    # 静态资源
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # API代理
    location /api {
        proxy_pass http://localhost:8080;
        # WebSocket支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 配置选项

### 环境变量

后端支持以下环境变量：

- `DB_TYPE`: 数据库类型（默认：sqlite）
- `DB_PATH`: SQLite数据库路径
- `LOG_LEVEL`: 日志级别（debug, info, warn, error）
- `HEADLESS`: 无界面模式（true/false）
- `CONTAINER`: 容器环境（true/false）

### Docker环境变量

在`docker-compose.yml`中可以修改环境变量：

```yaml
services:
  backend:
    environment:
      - DB_TYPE=sqlite
      - DB_PATH=/app/data/mini-web.db
      - LOG_LEVEL=info
      - HEADLESS=true
```

## RDP功能说明

RDP功能支持连接Windows远程桌面，主要特性：

- 屏幕实时更新
- 键盘和鼠标控制
- 剪贴板共享
- 多分辨率支持

### RDP无界面环境部署

在无界面环境（如Docker容器）中，RDP功能将：

1. 自动检测环境并使用虚拟会话模式
2. 提供占位图像代替实际屏幕
3. 降低屏幕刷新频率以节省资源
4. 自动重连和错误恢复

## 故障排除

### RDP连接问题

1. **无法连接到RDP服务器**
   - 检查服务器地址和端口是否正确
   - 验证网络连接和防火墙设置
   - 检查用户名和密码是否正确

2. **屏幕截图不显示**
   - 在无界面环境这是预期行为，将使用占位图像
   - 有界面环境中需要安装适当的截图工具（scrot或ImageMagick）

3. **连接缓慢**
   - 调整docker-compose.yml中的网络设置
   - 提高资源限制（CPU/内存）

## 许可证

[MIT License](LICENSE)

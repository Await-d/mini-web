# Mini Web 远程终端管理平台

## 项目概述

Mini Web是一个支持多种协议（RDP、SSH、Telnet）的Web远程终端管理平台。该平台允许用户通过Web界面连接和管理远程服务器和设备，无需安装专用客户端软件。

## 主要功能

- **RDP远程桌面连接**：连接Windows远程桌面，支持屏幕实时更新、键盘和鼠标控制、剪贴板共享
- **SSH终端连接**：连接Linux/Unix服务器终端
- **Telnet终端连接**：支持传统Telnet协议
- **会话管理**：创建、保存和管理连接会话
- **用户权限控制**：基于角色的权限系统
- **终端录制与回放**：记录和复现终端会话
- **多标签页支持**：在一个界面管理多个连接

## 技术栈

### 前端
- React 19
- TypeScript
- Vite
- Ant Design 5
- React Router 6
- Axios

### 后端
- Go 1.23+
- WebSocket支持
- JWT认证
- SQLite数据库
- VNC/RDP/SSH/Telnet协议处理库

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

## 开发环境

- Go 1.23+
- Node.js 18+
- Yarn 1.22+
- Docker 20.10+ (生产环境)
- Docker Compose 2.0+ (生产环境)

## 访问信息

项目运行后可通过以下方式访问：

- 前端开发服务器: http://localhost:5173
- 后端API: http://localhost:8080
- 生产环境: http://localhost

## 默认用户

系统预置了两个用户账号，用于测试：

1. 管理员用户:
   - 用户名: `admin`
   - 密码: `admin123`
   - 角色: `admin`

2. 普通用户:
   - 用户名: `user`
   - 密码: `admin123`
   - 角色: `user`
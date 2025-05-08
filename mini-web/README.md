# Mini Web 远程连接平台

Mini Web是一个基于Web的远程连接平台，支持SSH、RDP、VNC和Telnet等多种远程连接协议，使用户能够通过浏览器直接访问和管理远程服务器、设备和系统。

## 核心功能

- **多协议支持**：SSH、RDP、VNC和Telnet
- **Web界面**：无需安装客户端，通过浏览器直接连接
- **安全认证**：支持多种认证方式
- **会话管理**：保存和管理多个连接配置
- **文件传输**：在SSH连接中支持文件上传和下载

## 使用RDP远程桌面功能

### FreeRDP依赖安装

要使用RDP远程桌面功能，您需要安装FreeRDP客户端：

#### Windows

1. 从[FreeRDP官方GitHub](https://github.com/FreeRDP/FreeRDP/releases)下载最新版本
2. 安装到默认位置（通常是`C:\Program Files\FreeRDP`）
3. 确保`wfreerdp.exe`在系统PATH中，或通过环境变量`FREERDP_PATH`指定其路径

#### Linux

使用包管理器安装：

```bash
# Debian/Ubuntu
sudo apt install freerdp2-x11

# Fedora/RHEL
sudo dnf install freerdp

# Arch Linux
sudo pacman -S freerdp
```

#### macOS

使用Homebrew安装：

```bash
brew install freerdp
```

### 配置环境变量

如果FreeRDP不在系统PATH中，请设置以下环境变量：

```
FREERDP_PATH=C:\Program Files\FreeRDP\wfreerdp.exe  # Windows示例
FREERDP_PATH=/usr/bin/xfreerdp                      # Linux示例
```

### 性能调整

可以通过以下环境变量调整RDP连接性能：

```
RDP_SCREENSHOT_INTERVAL=2000  # 屏幕截图间隔，单位毫秒（默认1000）
RDP_JPEG_QUALITY=75           # JPEG压缩质量（默认80）
```

### 故障排除

如果遇到RDP连接问题：

1. **连接停留在"正在连接..."状态**
   - 检查FreeRDP是否正确安装
   - 确认您设置了正确的`FREERDP_PATH`环境变量
   - 查看服务器日志中的错误信息

2. **连接失败或频繁断开**
   - 确认目标服务器已启用RDP服务（通常在TCP端口3389）
   - 检查网络防火墙设置
   - 尝试降低屏幕截图频率以减少带宽使用

3. **键盘或鼠标操作无响应**
   - 尝试刷新浏览器页面
   - 检查浏览器控制台是否有JavaScript错误

## 构建与部署

### 前端

```bash
cd frontend
yarn install
yarn build
```

### 后端

```bash
cd backend
go build -o mini-web ./cmd/server
```

### Docker部署

```bash
docker-compose up -d
```

## 许可证

本项目采用MIT许可证
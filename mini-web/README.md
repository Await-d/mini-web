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
3. 使用`start.bat`启动服务，它会自动设置FreeRDP环境变量

#### Linux

1. 安装FreeRDP客户端：
   ```bash
   # Debian/Ubuntu
   sudo apt install freerdp2-x11
   
   # Fedora/RHEL
   sudo dnf install freerdp
   
   # Arch Linux
   sudo pacman -S freerdp
   ```

2. 赋予启动脚本执行权限：
   ```bash
   chmod +x start.sh
   ```

3. 使用启动脚本运行服务：
   ```bash
   ./start.sh
   ```

#### macOS

使用Homebrew安装：

```bash
brew install freerdp
export FREERDP_PATH=$(which xfreerdp)
```

### 手动配置环境变量

如果自动探测失败，可以手动设置环境变量：

#### Windows
```
set FREERDP_PATH=C:\Program Files\FreeRDP\wfreerdp.exe
```

#### Linux/macOS
```
export FREERDP_PATH=/usr/bin/xfreerdp  # 路径可能因系统而异
```

### 性能调整

可以通过以下环境变量调整RDP连接性能：

```
# Windows
set RDP_SCREENSHOT_INTERVAL=2000
set RDP_JPEG_QUALITY=75

# Linux/macOS
export RDP_SCREENSHOT_INTERVAL=2000
export RDP_JPEG_QUALITY=75
```

### 故障排除

如果遇到RDP连接问题：

1. **连接停留在"正在连接..."状态**
   - 检查FreeRDP是否正确安装
   - 确认环境变量正确设置（可在日志中查看）
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
# Windows
start.bat

# Linux/macOS
./start.sh
```

### Docker部署

```bash
docker-compose up -d
```

## 许可证

本项目采用MIT许可证
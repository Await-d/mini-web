# Mini Web 后端服务

## RDP模块更新说明

### 真实RDP连接实现

我们已经更新了RDP终端模块，实现了与真实RDP服务器的连接，而不再使用模拟数据。该实现基于以下技术：

1. 使用FreeRDP客户端通过命令行接口连接到远程RDP服务器
2. 定期捕获屏幕截图并发送到前端
3. 将前端的鼠标和键盘事件转发到RDP客户端

### 安装要求

要使用真实的RDP连接功能，你需要：

1. 安装FreeRDP客户端
   - Windows: [FreeRDP官方下载](https://github.com/FreeRDP/FreeRDP/releases)
   - Linux: `sudo apt install freerdp2-x11` 或 `sudo yum install freerdp`
   - macOS: `brew install freerdp`

2. 确保FreeRDP可执行文件在系统PATH中，或通过环境变量`FREERDP_PATH`指定其路径

### 配置选项

您可以通过以下环境变量配置RDP连接行为：

- `FREERDP_PATH`: FreeRDP客户端可执行文件的路径
- `RDP_SCREENSHOT_INTERVAL`: 屏幕截图更新间隔（毫秒），默认为1000

### 故障排除

如果遇到RDP连接问题：

1. 确认FreeRDP客户端安装正确并可访问
2. 检查服务器日志中是否有关于RDP客户端的错误
3. 确认远程服务器开启了RDP服务，通常在TCP端口3389
4. 检查防火墙设置是否允许RDP连接

### 已知限制

当前实现有以下限制：

1. 鼠标和键盘事件转发可能存在延迟
2. 不支持音频重定向
3. 屏幕截图采集可能导致较高的网络带宽使用

我们将在后续版本中继续改进这些限制。
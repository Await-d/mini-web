# RDP连接失败诊断指南

## 错误信息分析

```
dial tcp 192.168.123.5:3390: connectex: No connection could be made because the target machine actively refused it.
```

**错误含义**：目标机器(192.168.123.5)主动拒绝了对端口3390的连接请求。

## 可能原因及解决方案

### 1. RDP服务未启用

**检查方法**：
- 在目标Windows机器上，按Win+R，输入`services.msc`
- 查找"Remote Desktop Services"服务
- 确认服务状态为"正在运行"

**解决方案**：
```powershell
# 以管理员身份运行PowerShell
Enable-PSRemoting -Force
Set-Service -Name "TermService" -StartupType Automatic
Start-Service -Name "TermService"
```

### 2. RDP端口配置问题

**默认端口**：Windows RDP默认使用3389端口，但这里配置为3390端口。

**检查注册表**：
```cmd
# 检查RDP端口配置
reg query "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" /v PortNumber
```

**修改RDP端口为3390**：
1. 打开注册表编辑器(regedit)
2. 导航到：`HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp`
3. 双击"PortNumber"，选择十进制，设置为3390
4. 重启"Remote Desktop Services"服务

### 3. Windows防火墙阻止

**检查防火墙规则**：
```powershell
# 检查RDP防火墙规则
Get-NetFirewallRule -DisplayName "*remote desktop*" | Select-Object DisplayName, Enabled, Direction
```

**添加防火墙规则**：
```powershell
# 为端口3390添加防火墙规则
New-NetFirewallRule -DisplayName "RDP-Custom-3390" -Direction Inbound -Protocol TCP -LocalPort 3390 -Action Allow
```

### 4. 远程桌面设置未启用

**启用远程桌面**：
1. 右击"此电脑" → 属性
2. 点击"高级系统设置"
3. 在"远程"选项卡中，选择"启用远程桌面"
4. 取消勾选"仅允许运行使用网络级别身份验证的远程桌面的计算机连接"

**通过注册表启用**：
```cmd
reg add "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Terminal Server" /v fDenyTSConnections /t REG_DWORD /d 0 /f
```

### 5. 网络连接问题

**测试网络连通性**：
```cmd
# 在客户端机器上测试
ping 192.168.123.5
telnet 192.168.123.5 3390
```

**路由检查**：
```cmd
tracert 192.168.123.5
```

### 6. 用户权限问题

**确保用户有远程登录权限**：
```powershell
# 检查远程桌面用户组
Get-LocalGroupMember -Group "Remote Desktop Users"

# 添加用户到远程桌面用户组
Add-LocalGroupMember -Group "Remote Desktop Users" -Member "await"
```

## 推荐的诊断步骤

### 步骤1：基础网络测试
```bash
# 在客户端执行
ping 192.168.123.5
nmap -p 3390 192.168.123.5
```

### 步骤2：服务器端配置检查
在192.168.123.5服务器上执行：
```powershell
# 检查RDP服务状态
Get-Service -Name "TermService"

# 检查端口监听状态
netstat -an | findstr :3390

# 检查防火墙状态
Get-NetFirewallProfile

# 检查RDP配置
Get-WmiObject -Class Win32_TerminalServiceSetting -Namespace root\cimv2\TerminalServices
```

### 步骤3：临时测试解决方案

**临时关闭防火墙**（仅用于测试）：
```powershell
# 关闭Windows防火墙进行测试
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False
```

**使用默认3389端口测试**：
- 将连接配置中的端口改为3389
- 确认RDP服务使用默认端口

## 测试用的快速配置脚本

创建以下PowerShell脚本在目标服务器上运行：

```powershell
# RDP快速配置脚本 (需要管理员权限)

# 启用远程桌面
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -name "fDenyTSConnections" -value 0

# 启动RDP服务
Enable-PSRemoting -Force
Set-Service -Name "TermService" -StartupType Automatic
Start-Service -Name "TermService"

# 添加防火墙规则
New-NetFirewallRule -DisplayName "RDP-Custom-3390" -Direction Inbound -Protocol TCP -LocalPort 3390 -Action Allow

# 修改RDP端口为3390 (可选)
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -name "PortNumber" -value 3390

# 重启RDP服务以应用端口更改
Restart-Service -Name "TermService" -Force

Write-Host "RDP配置完成，请重启计算机以确保所有更改生效"
```

## 验证连接

配置完成后，可以使用以下方法验证：

```cmd
# 从客户端测试连接
mstsc /v:192.168.123.5:3390

# 或使用telnet测试端口
telnet 192.168.123.5 3390
```

## 备选方案

如果RDP连接仍然有问题，可以考虑：

1. **使用标准端口3389**
2. **检查是否有企业防火墙或安全软件阻止**
3. **尝试SSH连接作为替代方案**
4. **使用VNC替代RDP**

## 日志记录

启用RDP连接日志以便进一步诊断：
```powershell
# 启用详细的RDP日志
wevtutil sl Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational /e:true
wevtutil sl Microsoft-Windows-TerminalServices-LocalSessionManager/Operational /e:true
```

查看日志：
```powershell
# 查看RDP相关日志
Get-WinEvent -LogName "Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational" -MaxEvents 10
``` 
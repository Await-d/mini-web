# Agentdocs Knowledge Base — mini-web

## Architecture Decisions
- [2026-03-20] 后端使用 SQLite + Gorilla Mux，前端 React 19 + Ant Design 5 — 技术栈已定型，不做迁移 — 全局
- [2026-03-20] WebSocket 用于终端实时通信，二进制协议+gzip压缩已实现 — 影响所有终端相关开发
- [2026-03-20] RDP 当前使用 rdp_terminal_simple.go（模拟）+ WebSocket Proxy，rdp_terminal_real.go 不存在 — 需要真实实现

## Known Pitfalls
- getUserIDFromContext 永远返回 1 (stub) → auth_handler.go:212 → 改用 middleware.GetUserID(r)
- dashboard_service.go 所有统计数据硬编码假数据 → 需接 SQLite 真实查询
- system_service.go getCPUUsage/getSystemLoad 返回随机假数据 → 需读 /proc/stat
- TestEmailConfig 不发邮件直接返回 nil → 需实现真实 SMTP
- VNC 截图是空白模拟图 → vnc_terminal.go:152
- rdp_terminal_simple.go sendMockDesktopData 发送假桌面数据
- rdp_terminal_websocket_proxy.go:1168 base64 未解码直接写入 RDP 连接
- uptime 用 time.Now().Add(-7day) 伪造 → 应记录服务启动时间

## Coding Conventions
- 前端用 yarn，不用 npm
- Go 文件名下划线分隔，包名小写
- 所有 API 端点需 JWT 认证
- 三大原则：不使用模拟/简化/临时方案

## Active Workflows
- [250320-未完成功能修复方案](workflow/250320-未完成功能修复方案.md)

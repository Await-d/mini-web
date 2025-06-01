<!--
 * @Author: Await
 * @Date: 2025-05-31 16:49:50
 * @LastEditors: Await
 * @LastEditTime: 2025-06-01 18:56:08
 * @Description: 请填写简介
-->
# 更新记录

## [未发布]

### 新增功能
- 改进SSH文件列表获取为JSON格式交互 (2024-12-20, @Await)
  - 后端添加SSH命令处理器，支持结构化的文件列表获取
  - WebSocket处理器识别file_list类型的JSON命令
  - 使用特殊标记捕获ls命令输出并解析为结构化数据
  - 前端FileBrowser组件改为发送JSON格式的file_list请求
  - 处理结构化的file_list_response响应，避免解析原始终端输出
  - 提供更好的错误处理和用户体验

### 修复
- 修复SSH终端文件列表解析大量原始输出的问题

### 优化
- 优化SSH终端与前端的数据交互方式
- 提升文件浏览器的响应速度和用户体验

## [v0.1.0] - 2024-12-01

### 初始版本
- 项目基础架构搭建
- 实现SSH、RDP、VNC、Telnet多协议支持
- 用户认证和会话管理功能
- 基础的文件浏览器功能 
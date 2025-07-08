# 数据库初始化修复

## 问题描述
前端用户管理和系统设置功能无法正常使用，出现请求错误。经排查发现是数据库表缺失问题。

## 根本原因
数据库初始化代码(`internal/model/sqlite/db.go`)中缺少系统配置和日志相关表的创建语句：
- `system_configs` 表
- `system_logs` 表  
- `user_activities` 表

## 解决方案
更新了 `internal/model/sqlite/db.go` 文件的 `createTables()` 和 `seedData()` 函数：

### 1. 添加表创建语句
```go
// 系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'string',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

// 系统日志表
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    module TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    user_id INTEGER,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)

// 用户活动日志表
CREATE TABLE IF NOT EXISTS user_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
```

### 2. 添加默认系统配置数据
在 `seedData()` 函数中添加了14个默认系统配置项，包括：
- 通用设置（站点名称、描述、分页大小）
- 外观设置（主题、颜色、动画）
- 安全设置（密码策略、会话超时、两步验证）
- 系统设置（日志保留、最大连接数、备份）

### 3. 防重复插入机制
添加了配置数量检查，只有当 `system_configs` 表为空时才插入默认数据。

## 验证步骤
1. 重启后端服务使数据库更新生效
2. 检查数据库表是否正确创建
3. 测试系统配置API端点
4. 验证前端用户管理和系统设置功能

## 相关文件
- `/internal/model/sqlite/db.go` - 数据库初始化代码
- `/internal/model/sqlite/init-db.sql` - SQL初始化脚本（参考）
# 终端记录保留功能设计文档

## 1. 功能需求分析

### 1.1 核心需求
- 用户意外刷新页面或断开连接时，终端会话保持活跃状态
- 用户重新连接时可恢复到之前的会话状态
- 保留终端输入输出历史记录
- 支持手动关闭会话
- 自动清理超时未使用的会话

### 1.2 技术挑战
- WebSocket连接断开与终端会话生命周期分离
- 终端消息缓存和重放机制
- 会话状态管理和同步
- 内存使用优化和清理机制

## 2. 系统架构设计

### 2.1 核心组件
1. **TerminalSessionManager** - 终端会话管理器
2. **SessionState** - 会话状态存储
3. **MessageCache** - 消息缓存系统
4. **SessionCleanup** - 会话清理服务

### 2.2 数据结构设计

```go
// 终端会话状态
type TerminalSession struct {
    ID              string                 // 会话ID
    ConnectionID    int                    // 连接ID
    UserID          int                    // 用户ID
    Protocol        string                 // 协议类型
    Status          string                 // 会话状态: active, disconnected, closed
    CreatedAt       time.Time              // 创建时间
    LastActiveAt    time.Time              // 最后活跃时间
    ExpiresAt       time.Time              // 过期时间
    MessageHistory  []TerminalMessage      // 消息历史
    MaxHistorySize  int                    // 最大历史记录数
    process         *os.Process            // 关联的进程
    wsConnections   map[string]*websocket.Conn // WebSocket连接映射
    mutex           sync.RWMutex           // 读写锁
}

// 终端消息
type TerminalMessage struct {
    ID        string    `json:"id"`
    Type      string    `json:"type"`      // input/output/error/system
    Content   string    `json:"content"`
    Timestamp time.Time `json:"timestamp"`
    UserID    int       `json:"user_id,omitempty"`
}

// 会话配置
type SessionConfig struct {
    MaxIdleTimeout    time.Duration // 最大空闲时间
    MaxHistorySize    int           // 最大历史记录数
    CleanupInterval   time.Duration // 清理间隔
    HeartbeatInterval time.Duration // 心跳间隔
}
```

## 3. 功能实现步骤

### 3.1 第一阶段：会话管理器 (高优先级)
- 实现 TerminalSessionManager
- 会话的创建、查找、更新、删除
- 会话状态管理

### 3.2 第二阶段：WebSocket处理适配 (高优先级)
- 修改现有WebSocket处理器
- 支持会话恢复和重连
- 实现会话绑定和解绑

### 3.3 第三阶段：消息缓存系统 (高优先级)
- 实现消息历史记录
- 会话恢复时的消息重放
- 内存优化机制

### 3.4 第四阶段：自动清理功能 (中等优先级)
- 实现定时清理过期会话
- 资源回收机制
- 配置管理

### 3.5 第五阶段：前端适配 (中等优先级)
- 前端会话恢复逻辑
- 断线重连处理
- 用户界面优化

### 3.6 第六阶段：测试和优化 (中等优先级)
- 功能测试
- 性能测试
- 边界情况处理

## 4. 实现细节

### 4.1 会话生命周期管理
1. **创建会话**: 用户首次连接时创建新会话
2. **活跃状态**: WebSocket连接正常时保持活跃
3. **断开状态**: WebSocket断开但会话保持
4. **恢复状态**: 用户重新连接时恢复会话
5. **关闭状态**: 用户手动关闭或自动过期

### 4.2 消息处理流程
1. 接收用户输入 → 发送到终端进程 → 缓存消息
2. 接收终端输出 → 发送到WebSocket → 缓存消息
3. 断开连接 → 保持进程运行 → 继续缓存输出
4. 重新连接 → 发送历史消息 → 恢复实时通信

### 4.3 内存管理策略
- 限制每个会话的最大历史记录数
- 使用循环缓冲区避免内存泄漏
- 定期清理过期会话和无效连接

## 5. 配置参数

```go
const (
    DefaultMaxIdleTimeout    = 30 * time.Minute  // 默认最大空闲时间
    DefaultMaxHistorySize    = 1000              // 默认最大历史记录数
    DefaultCleanupInterval   = 5 * time.Minute   // 默认清理间隔
    DefaultHeartbeatInterval = 30 * time.Second  // 默认心跳间隔
)
```

## 6. API接口设计

### 6.1 会话管理接口
- `POST /api/terminal/sessions` - 创建终端会话
- `GET /api/terminal/sessions/{id}` - 获取会话信息
- `PUT /api/terminal/sessions/{id}/resume` - 恢复会话
- `DELETE /api/terminal/sessions/{id}` - 关闭会话

### 6.2 WebSocket接口
- `WS /ws/terminal/{sessionId}` - 连接到指定会话
- 支持会话恢复参数: `?resume=true`

## 7. 错误处理和边界情况

### 7.1 异常情况处理
- 进程意外终止的检测和处理
- 内存不足时的优雅降级
- 并发访问的线程安全处理

### 7.2 用户体验优化
- 连接状态指示
- 会话恢复提示
- 历史记录加载进度
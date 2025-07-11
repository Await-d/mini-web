package service

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/google/uuid"
)

// TerminalMessage 终端消息
type TerminalMessage struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`      // input/output/error/system
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	UserID    uint      `json:"user_id,omitempty"`
}

// PersistentTerminalSession 持久化终端会话
type PersistentTerminalSession struct {
	ID              string                           `json:"id"`
	ConnectionID    uint                            `json:"connection_id"`
	UserID          uint                            `json:"user_id"`
	Protocol        string                          `json:"protocol"`
	Status          string                          `json:"status"` // active, disconnected, closed
	CreatedAt       time.Time                       `json:"created_at"`
	LastActiveAt    time.Time                       `json:"last_active_at"`
	ExpiresAt       time.Time                       `json:"expires_at"`
	MessageHistory  []TerminalMessage               `json:"message_history"`
	MaxHistorySize  int                             `json:"max_history_size"`
	
	// 内部状态，不序列化
	process         *os.Process                     `json:"-"`
	wsConnections   map[string]*websocket.Conn      `json:"-"`
	inputChannel    chan []byte                     `json:"-"`
	outputChannel   chan []byte                     `json:"-"`
	errorChannel    chan error                      `json:"-"`
	closeChannel    chan struct{}                   `json:"-"`
	mutex           sync.RWMutex                    `json:"-"`
	Ctx             context.Context                 `json:"-"`
	Cancel          context.CancelFunc              `json:"-"`
	
	// 终端代理实例
	TerminalProxy   *TerminalSessionProxy       `json:"-"`
}

// SessionConfig 会话配置
type SessionConfig struct {
	MaxIdleTimeout    time.Duration // 最大空闲时间
	MaxHistorySize    int           // 最大历史记录数
	CleanupInterval   time.Duration // 清理间隔
	HeartbeatInterval time.Duration // 心跳间隔
}

// DefaultSessionConfig 默认会话配置
var DefaultSessionConfig = SessionConfig{
	MaxIdleTimeout:    30 * time.Minute,
	MaxHistorySize:    1000,
	CleanupInterval:   5 * time.Minute,
	HeartbeatInterval: 30 * time.Second,
}

// TerminalSessionManager 终端会话管理器
type TerminalSessionManager struct {
	sessions      map[string]*PersistentTerminalSession
	userSessions  map[uint][]string           // 用户ID -> 会话ID列表
	config        SessionConfig
	mutex         sync.RWMutex
	cleanupTicker *time.Ticker
	ctx           context.Context
	cancel        context.CancelFunc
}

// NewTerminalSessionManager 创建终端会话管理器
func NewTerminalSessionManager(config *SessionConfig) *TerminalSessionManager {
	if config == nil {
		config = &DefaultSessionConfig
	}
	
	ctx, cancel := context.WithCancel(context.Background())
	
	manager := &TerminalSessionManager{
		sessions:     make(map[string]*PersistentTerminalSession),
		userSessions: make(map[uint][]string),
		config:       *config,
		ctx:          ctx,
		cancel:       cancel,
	}
	
	// 启动清理定时器
	manager.startCleanupTimer()
	
	return manager
}

// CreateSession 创建新的终端会话
func (m *TerminalSessionManager) CreateSession(userID uint, connectionID uint, protocol string) (*PersistentTerminalSession, error) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	
	sessionID := uuid.New().String()
	now := time.Now()
	ctx, cancel := context.WithCancel(m.ctx)
	
	session := &PersistentTerminalSession{
		ID:              sessionID,
		ConnectionID:    connectionID,
		UserID:          userID,
		Protocol:        protocol,
		Status:          "active",
		CreatedAt:       now,
		LastActiveAt:    now,
		ExpiresAt:       now.Add(m.config.MaxIdleTimeout),
		MessageHistory:  make([]TerminalMessage, 0),
		MaxHistorySize:  m.config.MaxHistorySize,
		wsConnections:   make(map[string]*websocket.Conn),
		inputChannel:    make(chan []byte, 100),
		outputChannel:   make(chan []byte, 100),
		errorChannel:    make(chan error, 10),
		closeChannel:    make(chan struct{}),
		Ctx:             ctx,
		Cancel:          cancel,
	}
	
	// 存储会话
	m.sessions[sessionID] = session
	
	// 添加到用户会话列表
	if _, exists := m.userSessions[userID]; !exists {
		m.userSessions[userID] = make([]string, 0)
	}
	m.userSessions[userID] = append(m.userSessions[userID], sessionID)
	
	log.Printf("创建终端会话: ID=%s, 用户ID=%d, 连接ID=%d, 协议=%s", sessionID, userID, connectionID, protocol)
	
	return session, nil
}

// GetSession 获取会话
func (m *TerminalSessionManager) GetSession(sessionID string) (*PersistentTerminalSession, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	
	session, exists := m.sessions[sessionID]
	if !exists {
		return nil, fmt.Errorf("会话不存在: %s", sessionID)
	}
	
	return session, nil
}

// GetUserSessions 获取用户的所有会话
func (m *TerminalSessionManager) GetUserSessions(userID uint) ([]*PersistentTerminalSession, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	
	sessionIDs, exists := m.userSessions[userID]
	if !exists {
		return make([]*PersistentTerminalSession, 0), nil
	}
	
	sessions := make([]*PersistentTerminalSession, 0, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		if session, exists := m.sessions[sessionID]; exists {
			sessions = append(sessions, session)
		}
	}
	
	return sessions, nil
}

// AddWebSocketConnection 添加WebSocket连接到会话
func (m *TerminalSessionManager) AddWebSocketConnection(sessionID string, conn *websocket.Conn) error {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return err
	}
	
	session.mutex.Lock()
	defer session.mutex.Unlock()
	
	// 生成连接ID
	connID := uuid.New().String()
	session.wsConnections[connID] = conn
	
	// 更新最后活跃时间
	session.LastActiveAt = time.Now()
	session.ExpiresAt = session.LastActiveAt.Add(m.config.MaxIdleTimeout)
	session.Status = "active"
	
	log.Printf("添加WebSocket连接到会话: 会话ID=%s, 连接ID=%s", sessionID, connID)
	
	// 发送历史消息
	go m.sendHistoryMessages(session, conn)
	
	return nil
}

// RemoveWebSocketConnection 移除WebSocket连接
func (m *TerminalSessionManager) RemoveWebSocketConnection(sessionID string, conn *websocket.Conn) error {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return err
	}
	
	session.mutex.Lock()
	defer session.mutex.Unlock()
	
	// 查找并移除连接
	var connID string
	for id, c := range session.wsConnections {
		if c == conn {
			connID = id
			break
		}
	}
	
	if connID != "" {
		delete(session.wsConnections, connID)
		log.Printf("移除WebSocket连接: 会话ID=%s, 连接ID=%s", sessionID, connID)
	}
	
	// 如果没有活跃连接，更新状态
	if len(session.wsConnections) == 0 {
		session.Status = "disconnected"
		session.ExpiresAt = time.Now().Add(m.config.MaxIdleTimeout)
	}
	
	return nil
}

// AddMessage 添加消息到会话历史
func (m *TerminalSessionManager) AddMessage(sessionID string, msgType, content string) error {
	session, err := m.GetSession(sessionID)
	if err != nil {
		return err
	}
	
	session.mutex.Lock()
	defer session.mutex.Unlock()
	
	message := TerminalMessage{
		ID:        uuid.New().String(),
		Type:      msgType,
		Content:   content,
		Timestamp: time.Now(),
		UserID:    session.UserID,
	}
	
	// 添加消息到历史记录
	session.MessageHistory = append(session.MessageHistory, message)
	
	// 限制历史记录大小
	if len(session.MessageHistory) > session.MaxHistorySize {
		// 移除最旧的消息
		copy(session.MessageHistory, session.MessageHistory[1:])
		session.MessageHistory = session.MessageHistory[:session.MaxHistorySize]
	}
	
	// 广播消息给所有连接
	go m.broadcastMessage(session, message)
	
	return nil
}

// broadcastMessage 广播消息给会话的所有WebSocket连接
func (m *TerminalSessionManager) broadcastMessage(session *PersistentTerminalSession, message TerminalMessage) {
	session.mutex.RLock()
	defer session.mutex.RUnlock()
	
	for connID, conn := range session.wsConnections {
		if err := conn.WriteJSON(message); err != nil {
			log.Printf("发送消息到WebSocket连接失败: 会话ID=%s, 连接ID=%s, 错误=%v", 
				session.ID, connID, err)
			// 移除失败的连接
			delete(session.wsConnections, connID)
		}
	}
}

// sendHistoryMessages 发送历史消息到新连接
func (m *TerminalSessionManager) sendHistoryMessages(session *PersistentTerminalSession, conn *websocket.Conn) {
	session.mutex.RLock()
	defer session.mutex.RUnlock()
	
	// 发送系统消息表示开始历史记录
	systemMsg := TerminalMessage{
		ID:        uuid.New().String(),
		Type:      "system",
		Content:   fmt.Sprintf("=== 会话恢复，历史记录 (%d 条消息) ===", len(session.MessageHistory)),
		Timestamp: time.Now(),
	}
	
	if err := conn.WriteJSON(systemMsg); err != nil {
		log.Printf("发送系统消息失败: %v", err)
		return
	}
	
	// 发送历史消息
	for _, message := range session.MessageHistory {
		if err := conn.WriteJSON(message); err != nil {
			log.Printf("发送历史消息失败: %v", err)
			return
		}
	}
	
	// 发送系统消息表示结束历史记录
	endMsg := TerminalMessage{
		ID:        uuid.New().String(),
		Type:      "system",
		Content:   "=== 历史记录结束，实时模式 ===",
		Timestamp: time.Now(),
	}
	
	if err := conn.WriteJSON(endMsg); err != nil {
		log.Printf("发送结束消息失败: %v", err)
	}
}

// CloseSession 关闭会话
func (m *TerminalSessionManager) CloseSession(sessionID string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	
	session, exists := m.sessions[sessionID]
	if !exists {
		return fmt.Errorf("会话不存在: %s", sessionID)
	}
	
	session.mutex.Lock()
	defer session.mutex.Unlock()
	
	// 更新状态
	session.Status = "closed"
	
	// 关闭所有WebSocket连接
	for connID, conn := range session.wsConnections {
		conn.Close()
		delete(session.wsConnections, connID)
	}
	
	// 关闭通道
	close(session.closeChannel)
	
	// 取消上下文
	session.Cancel()
	
	// 终止进程
	if session.process != nil {
		session.process.Kill()
	}
	
	// 从管理器中移除
	delete(m.sessions, sessionID)
	
	// 从用户会话列表中移除
	if sessionIDs, exists := m.userSessions[session.UserID]; exists {
		for i, id := range sessionIDs {
			if id == sessionID {
				m.userSessions[session.UserID] = append(sessionIDs[:i], sessionIDs[i+1:]...)
				break
			}
		}
	}
	
	log.Printf("关闭终端会话: ID=%s, 用户ID=%d", sessionID, session.UserID)
	
	return nil
}

// startCleanupTimer 启动清理定时器
func (m *TerminalSessionManager) startCleanupTimer() {
	m.cleanupTicker = time.NewTicker(m.config.CleanupInterval)
	
	go func() {
		for {
			select {
			case <-m.cleanupTicker.C:
				m.cleanupExpiredSessions()
			case <-m.ctx.Done():
				m.cleanupTicker.Stop()
				return
			}
		}
	}()
}

// cleanupExpiredSessions 清理过期会话
func (m *TerminalSessionManager) cleanupExpiredSessions() {
	now := time.Now()
	expiredSessions := make([]string, 0)
	
	m.mutex.RLock()
	for sessionID, session := range m.sessions {
		if session.Status == "disconnected" && now.After(session.ExpiresAt) {
			expiredSessions = append(expiredSessions, sessionID)
		}
	}
	m.mutex.RUnlock()
	
	// 清理过期会话
	for _, sessionID := range expiredSessions {
		log.Printf("清理过期会话: ID=%s", sessionID)
		m.CloseSession(sessionID)
	}
	
	if len(expiredSessions) > 0 {
		log.Printf("清理了 %d 个过期会话", len(expiredSessions))
	}
}

// GetSessionStats 获取会话统计信息
func (m *TerminalSessionManager) GetSessionStats() map[string]interface{} {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	
	stats := map[string]interface{}{
		"total_sessions":       len(m.sessions),
		"active_sessions":      0,
		"disconnected_sessions": 0,
		"closed_sessions":      0,
		"users_with_sessions":  len(m.userSessions),
	}
	
	for _, session := range m.sessions {
		switch session.Status {
		case "active":
			stats["active_sessions"] = stats["active_sessions"].(int) + 1
		case "disconnected":
			stats["disconnected_sessions"] = stats["disconnected_sessions"].(int) + 1
		case "closed":
			stats["closed_sessions"] = stats["closed_sessions"].(int) + 1
		}
	}
	
	return stats
}

// Stop 停止会话管理器
func (m *TerminalSessionManager) Stop() {
	m.cancel()
	
	// 关闭所有会话
	m.mutex.Lock()
	sessionIDs := make([]string, 0, len(m.sessions))
	for sessionID := range m.sessions {
		sessionIDs = append(sessionIDs, sessionID)
	}
	m.mutex.Unlock()
	
	for _, sessionID := range sessionIDs {
		m.CloseSession(sessionID)
	}
	
	log.Println("终端会话管理器已停止")
}

// 全局终端会话管理器实例
var globalTerminalSessionManager *TerminalSessionManager

// GetTerminalSessionManager 获取全局终端会话管理器
func GetTerminalSessionManager() *TerminalSessionManager {
	if globalTerminalSessionManager == nil {
		globalTerminalSessionManager = NewTerminalSessionManager(nil)
	}
	return globalTerminalSessionManager
}
/*
 * @Author: Await
 * @Date: 2025-10-22
 * @Description: 基于Apache Guacamole的RDP终端会话实现
 */
package service

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"github.com/gorilla/websocket"
)

// RDPGuacamoleSession 基于Guacamole的RDP会话
type RDPGuacamoleSession struct {
	SessionID    string
	ConnectionID int
	Host         string
	Port         int
	Username     string
	Password     string
	Width        int
	Height       int
	WebSocket    *websocket.Conn
	Active       bool
	StartTime    time.Time
	LastActivity time.Time

	guacClient   *GuacamoleClient
	mutex        sync.RWMutex
	wsWriteMutex sync.Mutex
}

// createRDPTerminalSessionGuacamole 创建基于Guacamole的RDP会话
func createRDPTerminalSessionGuacamole(conn *model.Connection) (*RDPGuacamoleSession, error) {
	session := &RDPGuacamoleSession{
		SessionID:    fmt.Sprintf("rdp-guac-%d-%d", conn.ID, time.Now().Unix()),
		ConnectionID: int(conn.ID),
		Host:         conn.Host,
		Port:         conn.Port,
		Username:     conn.Username,
		Password:     conn.Password,
		Width:        1024,
		Height:       768,
		Active:       false,
		StartTime:    time.Now(),
		LastActivity: time.Now(),
	}

	return session, nil
}

// Connect 连接到RDP服务器
func (s *RDPGuacamoleSession) Connect() error {
	log.Printf("[RDP-Guac] 开始连接: %s:%d (用户: %s)", s.Host, s.Port, s.Username)

	// 获取guacd地址
	guacdHost := os.Getenv("GUACD_HOST")
	if guacdHost == "" {
		guacdHost = "localhost"
	}
	guacdPort := 4822

	// 创建Guacamole客户端
	client, err := NewGuacamoleClient(guacdHost, guacdPort)
	if err != nil {
		return fmt.Errorf("创建Guacamole客户端失败: %w", err)
	}

	s.guacClient = client

	// 设置回调
	s.guacClient.OnInstruction = s.handleGuacamoleInstruction
	s.guacClient.OnError = s.handleGuacamoleError
	s.guacClient.OnDisconnect = s.handleGuacamoleDisconnect

	// 选择RDP协议
	err = s.guacClient.SelectProtocol("rdp")
	if err != nil {
		return fmt.Errorf("选择RDP协议失败: %w", err)
	}

	// 准备连接参数
	params := GetRDPConnectionParams(s.Host, s.Port, s.Username, s.Password, s.Width, s.Height)

	// 连接到RDP服务器
	err = s.guacClient.ConnectRDP(params)
	if err != nil {
		return fmt.Errorf("连接RDP服务器失败: %w", err)
	}

	// 设置显示尺寸
	err = s.guacClient.SetDisplaySize(s.Width, s.Height)
	if err != nil {
		log.Printf("[RDP-Guac] 警告: 设置显示尺寸失败: %v", err)
	}

	// 开始接收指令
	s.guacClient.StartReceiving()

	s.Active = true
	s.LastActivity = time.Now()

	// 发送连接成功消息
	s.sendWebSocketMessage(map[string]interface{}{
		"type":      "connection_success",
		"sessionId": s.SessionID,
		"message":   "RDP连接成功 (Guacamole)",
		"timestamp": time.Now().Unix(),
	})

	log.Printf("[RDP-Guac] 连接成功: %s", s.SessionID)
	return nil
}

// handleGuacamoleInstruction 处理Guacamole指令
func (s *RDPGuacamoleSession) handleGuacamoleInstruction(inst *GuacInstruction) {
	s.LastActivity = time.Now()

	switch inst.Opcode {
	case "sync":
		// 同步指令，回显timestamp
		if len(inst.Args) > 0 {
			s.guacClient.SendInstruction("sync", inst.Args[0])
		}

	case "png", "jpeg", "webp":
		// 图像数据
		s.handleImageInstruction(inst)

	case "copy":
		// 复制图像块
		s.handleCopyInstruction(inst)

	case "size":
		// 显示尺寸变化
		log.Printf("[RDP-Guac] 显示尺寸更新: %v", inst.Args)

	case "error":
		// 错误信息
		errorMsg := "未知错误"
		if len(inst.Args) > 0 {
			errorMsg = inst.Args[0]
		}
		log.Printf("[RDP-Guac] 错误: %s", errorMsg)
		s.sendWebSocketMessage(map[string]interface{}{
			"type":    "error",
			"message": errorMsg,
		})

	case "end":
		// 连接结束
		log.Printf("[RDP-Guac] 连接结束")
		s.handleGuacamoleDisconnect()

	default:
		// 其他指令，转发到前端
		s.sendWebSocketMessage(map[string]interface{}{
			"type":   "guac_instruction",
			"opcode": inst.Opcode,
			"args":   inst.Args,
		})
	}
}

// handleImageInstruction 处理图像指令
func (s *RDPGuacamoleSession) handleImageInstruction(inst *GuacInstruction) {
	if len(inst.Args) < 6 {
		log.Printf("[RDP-Guac] 图像指令参数不足: %d", len(inst.Args))
		return
	}

	// 参数: layer, mimetype, x, y, imageData
	layer := inst.Args[0]
	x := inst.Args[2]
	y := inst.Args[3]
	imageData := inst.Args[4]

	// 发送图像到前端
	s.sendWebSocketMessage(map[string]interface{}{
		"type":   "screen_update",
		"format": inst.Opcode, // png, jpeg, webp
		"layer":  layer,
		"x":      x,
		"y":      y,
		"data":   imageData, // base64编码的图像数据
	})
}

// handleCopyInstruction 处理复制指令
func (s *RDPGuacamoleSession) handleCopyInstruction(inst *GuacInstruction) {
	// copy指令用于复制屏幕区域，提高效率
	s.sendWebSocketMessage(map[string]interface{}{
		"type": "copy",
		"args": inst.Args,
	})
}

// handleGuacamoleError 处理Guacamole错误
func (s *RDPGuacamoleSession) handleGuacamoleError(err error) {
	log.Printf("[RDP-Guac] Guacamole错误: %v", err)
	s.sendWebSocketMessage(map[string]interface{}{
		"type":    "error",
		"message": err.Error(),
	})
}

// handleGuacamoleDisconnect 处理Guacamole断开连接
func (s *RDPGuacamoleSession) handleGuacamoleDisconnect() {
	log.Printf("[RDP-Guac] Guacamole连接断开")
	s.Active = false
	s.sendWebSocketMessage(map[string]interface{}{
		"type":    "disconnected",
		"message": "RDP连接已断开",
	})
}

// HandleWebSocketMessage 处理WebSocket消息
func (s *RDPGuacamoleSession) HandleWebSocketMessage(messageType int, data []byte) error {
	if messageType != websocket.TextMessage {
		return nil
	}

	var msg map[string]interface{}
	err := json.Unmarshal(data, &msg)
	if err != nil {
		return fmt.Errorf("解析WebSocket消息失败: %w", err)
	}

	msgType, ok := msg["type"].(string)
	if !ok {
		return fmt.Errorf("消息类型缺失")
	}

	s.LastActivity = time.Now()

	switch msgType {
	case "init":
		// 初始化，开始连接
		return s.Connect()

	case "mouse":
		// 鼠标事件
		return s.handleMouseEvent(msg)

	case "key":
		// 键盘事件
		return s.handleKeyEvent(msg)

	case "resize":
		// 调整大小
		return s.handleResizeEvent(msg)

	default:
		log.Printf("[RDP-Guac] 未知消息类型: %s", msgType)
	}

	return nil
}

// handleMouseEvent 处理鼠标事件
func (s *RDPGuacamoleSession) handleMouseEvent(msg map[string]interface{}) error {
	if s.guacClient == nil {
		return fmt.Errorf("Guacamole客户端未初始化")
	}

	x, _ := msg["x"].(float64)
	y, _ := msg["y"].(float64)
	mask, _ := msg["mask"].(float64)

	return s.guacClient.SendMouse(int(x), int(y), int(mask))
}

// handleKeyEvent 处理键盘事件
func (s *RDPGuacamoleSession) handleKeyEvent(msg map[string]interface{}) error {
	if s.guacClient == nil {
		return fmt.Errorf("Guacamole客户端未初始化")
	}

	keysym, _ := msg["keysym"].(float64)
	pressed, _ := msg["pressed"].(bool)

	return s.guacClient.SendKey(int(keysym), pressed)
}

// handleResizeEvent 处理调整大小事件
func (s *RDPGuacamoleSession) handleResizeEvent(msg map[string]interface{}) error {
	if s.guacClient == nil {
		return fmt.Errorf("Guacamole客户端未初始化")
	}

	width, _ := msg["width"].(float64)
	height, _ := msg["height"].(float64)

	s.Width = int(width)
	s.Height = int(height)

	return s.guacClient.SetDisplaySize(s.Width, s.Height)
}

// sendWebSocketMessage 发送消息到WebSocket
func (s *RDPGuacamoleSession) sendWebSocketMessage(msg map[string]interface{}) {
	if s.WebSocket == nil {
		return
	}

	s.wsWriteMutex.Lock()
	defer s.wsWriteMutex.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[RDP-Guac] 序列化消息失败: %v", err)
		return
	}

	err = s.WebSocket.WriteMessage(websocket.TextMessage, data)
	if err != nil {
		log.Printf("[RDP-Guac] 发送WebSocket消息失败: %v", err)
	}
}

// SetWebSocket 设置WebSocket连接
func (s *RDPGuacamoleSession) SetWebSocket(ws *websocket.Conn) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.WebSocket = ws
}

// Close 关闭会话
func (s *RDPGuacamoleSession) Close() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	log.Printf("[RDP-Guac] 关闭会话: %s", s.SessionID)

	s.Active = false

	if s.guacClient != nil {
		s.guacClient.Close()
	}

	return nil
}

// GetSessionID 获取会话ID
func (s *RDPGuacamoleSession) GetSessionID() string {
	return s.SessionID
}

// IsActive 检查会话是否活跃
func (s *RDPGuacamoleSession) IsActive() bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.Active
}

// Read 实现io.Reader接口（用于兼容）
func (s *RDPGuacamoleSession) Read(p []byte) (n int, err error) {
	// Guacamole模式下通过WebSocket传输，不使用Read
	return 0, nil
}

// Write 实现io.Writer接口（用于兼容）
func (s *RDPGuacamoleSession) Write(p []byte) (n int, err error) {
	// Guacamole模式下通过WebSocket传输，不使用Write
	return len(p), nil
}

// WindowResize 调整窗口大小
func (s *RDPGuacamoleSession) WindowResize(rows, cols uint16) error {
	// 将rows/cols转换为像素尺寸（估算）
	width := int(cols) * 8   // 假设每字符8像素
	height := int(rows) * 16  // 假设每字符16像素

	s.Width = width
	s.Height = height

	if s.guacClient != nil {
		return s.guacClient.SetDisplaySize(width, height)
	}

	return nil
}

// IsConnected 检查是否已连接
func (s *RDPGuacamoleSession) IsConnected() bool {
	return s.Active && s.guacClient != nil
}

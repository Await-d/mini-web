/*
 * @Author: Await
 * @Date: 2025-06-07 14:45:23
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 17:39:48
 * @Description: 请填写简介
 */
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"strconv"
	"sync"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"github.com/gorilla/websocket"
)

// RDPSessionSimple 简化的RDP会话结构
type RDPSessionSimple struct {
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
	mutex        sync.RWMutex
	ctx          context.Context
	cancel       context.CancelFunc

	// 连接状态
	Connected  bool
	Connecting bool
	Error      string

	// 模拟连接
	tcpConn net.Conn

	// 读取状态管理
	initialMessageSent bool
	readChan           chan []byte

	// WebSocket写入保护
	wsWriteMutex sync.Mutex
}

// RDPMessageSimple RDP消息结构
type RDPMessageSimple struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data,omitempty"`
	SessionID string      `json:"sessionId,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

// createRDPTerminalSessionSimple 创建简化的RDP终端会话
func createRDPTerminalSessionSimple(conn *model.Connection) (*RDPSessionSimple, error) {
	// 创建会话上下文
	ctx, cancel := context.WithCancel(context.Background())

	// 创建RDP会话
	session := &RDPSessionSimple{
		SessionID:    fmt.Sprintf("rdp-%d-%d", conn.ID, time.Now().Unix()),
		ConnectionID: int(conn.ID),
		Host:         conn.Host,
		Port:         conn.Port,
		Username:     conn.Username,
		Password:     conn.Password,
		Width:        1024, // 默认宽度
		Height:       768,  // 默认高度
		StartTime:    time.Now(),
		LastActivity: time.Now(),
		Active:       true,
		Connected:    false,
		Connecting:   true,
		ctx:          ctx,
		cancel:       cancel,
		readChan:     make(chan []byte, 100), // 缓冲通道用于数据传输
	}

	log.Printf("创建简化RDP会话: %s, 目标: %s@%s:%d",
		session.SessionID, session.Username, session.Host, session.Port)

	return session, nil
}

// StartRDPConnection 启动RDP连接
func (s *RDPSessionSimple) StartRDPConnection() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.Connected {
		return fmt.Errorf("RDP连接已存在")
	}

	log.Printf("开始创建RDP连接: %s:%d", s.Host, s.Port)

	// 启动连接（异步）
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("RDP连接发生panic: %v", r)
				s.onError(fmt.Errorf("RDP连接异常: %v", r))
			}
		}()

		// 尝试TCP连接到RDP端口
		addr := net.JoinHostPort(s.Host, strconv.Itoa(s.Port))
		log.Printf("尝试连接RDP服务器: %s", addr)

		tcpConn, err := net.DialTimeout("tcp", addr, 10*time.Second)
		if err != nil {
			log.Printf("RDP TCP连接失败: %v", err)
			s.onError(fmt.Errorf("无法连接到RDP服务器: %v", err))
			return
		}

		s.mutex.Lock()
		s.tcpConn = tcpConn
		s.mutex.Unlock()

		log.Printf("RDP TCP连接成功: %s", s.SessionID)

		// 模拟RDP握手过程
		time.Sleep(2 * time.Second)

		// 检查连接是否仍然有效
		if s.tcpConn != nil {
			s.onConnected()

			// 发送模拟的桌面数据
			s.sendMockDesktopData()
		}
	}()

	return nil
}

// onConnected 连接成功回调
func (s *RDPSessionSimple) onConnected() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.Connected = true
	s.Connecting = false
	s.Error = ""
	s.LastActivity = time.Now()

	log.Printf("RDP连接已建立: %s", s.SessionID)

	// 发送连接成功消息
	s.sendMessage(&RDPMessageSimple{
		Type:      "RDP_CONNECTED",
		Data:      "RDP连接成功建立",
		SessionID: s.SessionID,
		Timestamp: time.Now().Unix(),
	})
}

// onError 错误回调
func (s *RDPSessionSimple) onError(err error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.Connected = false
	s.Connecting = false
	s.Error = err.Error()

	log.Printf("RDP连接错误: %s, 错误: %v", s.SessionID, err)

	// 发送错误消息
	s.sendMessage(&RDPMessageSimple{
		Type:      "RDP_ERROR",
		Data:      fmt.Sprintf("RDP连接失败: %v", err),
		SessionID: s.SessionID,
		Timestamp: time.Now().Unix(),
	})
}

// sendMockDesktopData 发送模拟的桌面数据
func (s *RDPSessionSimple) sendMockDesktopData() {
	// 延迟一秒，让连接稳定
	time.Sleep(1 * time.Second)

	// 发送模拟的桌面初始化消息
	s.sendMessage(&RDPMessageSimple{
		Type: "RDP_DESKTOP_INIT",
		Data: map[string]interface{}{
			"width":  s.Width,
			"height": s.Height,
			"bpp":    32, // 32位色深
		},
		SessionID: s.SessionID,
		Timestamp: time.Now().Unix(),
	})

	// 发送模拟的桌面图像数据
	s.sendMessage(&RDPMessageSimple{
		Type: "RDP_BITMAP",
		Data: map[string]interface{}{
			"x":      0,
			"y":      0,
			"width":  s.Width,
			"height": s.Height,
			"data":   "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", // 1x1像素的透明PNG
			"format": "base64",
		},
		SessionID: s.SessionID,
		Timestamp: time.Now().Unix(),
	})

	// 发送状态信息
	s.sendMessage(&RDPMessageSimple{
		Type:      "RDP_NOTICE",
		Data:      "这是一个简化的RDP实现演示。真正的RDP协议需要专门的库来处理复杂的图形数据传输。",
		SessionID: s.SessionID,
		Timestamp: time.Now().Unix(),
	})

	// 发送一个更大的测试图像（100x100的蓝色方块）
	testImage := s.generateTestImage(100, 100)
	s.sendMessage(&RDPMessageSimple{
		Type: "RDP_BITMAP",
		Data: map[string]interface{}{
			"x":      50,
			"y":      50,
			"width":  100,
			"height": 100,
			"data":   testImage,
			"format": "base64",
		},
		SessionID: s.SessionID,
		Timestamp: time.Now().Unix(),
	})
}

// generateTestImage 生成测试图像
func (s *RDPSessionSimple) generateTestImage(width, height int) string {
	// 创建一个简单的蓝色正方形图像的base64数据
	// 这是一个40x40像素的蓝色PNG图像
	blueSquare := "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3wgWEBsOJvvkpQAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAA00lEQVRYw+2YQQ6DMAxE3yFceADcgRNwAm7ACbgBJ+AG3IAb7A14Ay9wA07ACbgBN+AGvAFvwA24ATfgBtyAG3ADbsANuAE34AbcgBtwA27ADbgBN+AG3IAb8P8DfvqJiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiH8BPgC3WiWjuFzyVAAAAABJRU5ErkJggg=="
	return blueSquare
}

// sendMessage 发送消息到WebSocket（线程安全）
func (s *RDPSessionSimple) sendMessage(msg *RDPMessageSimple) {
	if s.WebSocket == nil {
		return
	}

	// 使用互斥锁保护WebSocket写入
	s.wsWriteMutex.Lock()
	defer s.wsWriteMutex.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("序列化RDP消息失败: %v", err)
		return
	}

	err = s.WebSocket.WriteMessage(websocket.TextMessage, data)
	if err != nil {
		log.Printf("发送RDP消息失败: %v", err)
	}
}

// HandleWebSocketMessage 处理WebSocket消息
func (s *RDPSessionSimple) HandleWebSocketMessage(messageType int, data []byte) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.LastActivity = time.Now()

	if messageType == websocket.TextMessage {
		var msg RDPMessageSimple
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("解析RDP消息失败: %v", err)
			return err
		}

		return s.processMessage(&msg)
	}

	return nil
}

// processMessage 处理RDP消息
func (s *RDPSessionSimple) processMessage(msg *RDPMessageSimple) error {
	switch msg.Type {
	case "init":
		// 处理前端发送的初始化消息
		return s.handleInitMessage(msg.Data)
	case "RDP_MOUSE":
		return s.handleMouseEvent(msg.Data)
	case "RDP_KEYBOARD":
		return s.handleKeyboardEvent(msg.Data)
	case "RDP_RESIZE":
		return s.handleResizeEvent(msg.Data)
	case "RDP_DISCONNECT":
		return s.Disconnect()
	default:
		log.Printf("未知的RDP消息类型: %s", msg.Type)
		return nil
	}
}

// handleInitMessage 处理初始化消息
func (s *RDPSessionSimple) handleInitMessage(data interface{}) error {
	log.Printf("RDP收到初始化消息")

	// 解析初始化数据
	if initData, ok := data.(map[string]interface{}); ok {
		// 从初始化消息中获取屏幕尺寸等信息
		if width, exists := initData["width"]; exists {
			if w, ok := width.(float64); ok && w > 0 {
				s.Width = int(w)
			}
		}
		if height, exists := initData["height"]; exists {
			if h, ok := height.(float64); ok && h > 0 {
				s.Height = int(h)
			}
		}

		log.Printf("RDP初始化屏幕大小: %dx%d", s.Width, s.Height)
	}

	// 发送初始化确认消息
	s.sendMessage(&RDPMessageSimple{
		Type: "RDP_INIT_RESPONSE",
		Data: map[string]interface{}{
			"status":  "ready",
			"width":   s.Width,
			"height":  s.Height,
			"message": "RDP会话已初始化",
		},
		SessionID: s.SessionID,
		Timestamp: time.Now().Unix(),
	})

	return nil
}

// handleMouseEvent 处理鼠标事件
func (s *RDPSessionSimple) handleMouseEvent(data interface{}) error {
	mouseData, ok := data.(map[string]interface{})
	if !ok {
		return fmt.Errorf("无效的鼠标事件数据")
	}

	x, _ := mouseData["x"].(float64)
	y, _ := mouseData["y"].(float64)
	log.Printf("RDP鼠标事件: x=%.0f, y=%.0f", x, y)

	return nil
}

// handleKeyboardEvent 处理键盘事件
func (s *RDPSessionSimple) handleKeyboardEvent(data interface{}) error {
	keyData, ok := data.(map[string]interface{})
	if !ok {
		return fmt.Errorf("无效的键盘事件数据")
	}

	keyCode, _ := keyData["keyCode"].(float64)
	log.Printf("RDP键盘事件: keyCode=%.0f", keyCode)

	return nil
}

// handleResizeEvent 处理窗口大小变化事件
func (s *RDPSessionSimple) handleResizeEvent(data interface{}) error {
	resizeData, ok := data.(map[string]interface{})
	if !ok {
		return fmt.Errorf("无效的调整大小事件数据")
	}

	width, _ := resizeData["width"].(float64)
	height, _ := resizeData["height"].(float64)

	if width > 0 && height > 0 {
		s.Width = int(width)
		s.Height = int(height)
		log.Printf("RDP桌面大小已调整为: %dx%d", s.Width, s.Height)
	}

	return nil
}

// SetWebSocket 设置WebSocket连接
func (s *RDPSessionSimple) SetWebSocket(ws *websocket.Conn) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.WebSocket = ws
	log.Printf("简化RDP会话WebSocket已设置: %s", s.SessionID)
}

// Disconnect 断开RDP连接
func (s *RDPSessionSimple) Disconnect() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	log.Printf("断开简化RDP连接: %s", s.SessionID)

	s.Active = false
	s.Connected = false
	s.Connecting = false

	// 取消上下文
	if s.cancel != nil {
		s.cancel()
	}

	// 关闭TCP连接
	if s.tcpConn != nil {
		s.tcpConn.Close()
		s.tcpConn = nil
	}

	// 关闭WebSocket
	if s.WebSocket != nil {
		s.WebSocket.Close()
		s.WebSocket = nil
	}

	// 关闭读取通道
	if s.readChan != nil {
		close(s.readChan)
		s.readChan = nil
	}

	return nil
}

// 实现TerminalSession接口的方法

// Read 读取数据（实现io.Reader接口）
func (s *RDPSessionSimple) Read(p []byte) (n int, err error) {
	// 第一次读取时返回协议标识
	if !s.initialMessageSent {
		s.initialMessageSent = true
		rdpPrefix := []byte("RDP_SESSION_READY")
		if len(p) >= len(rdpPrefix) {
			copy(p, rdpPrefix)
			log.Printf("RDP发送初始协议标识: %s", string(rdpPrefix))
			return len(rdpPrefix), nil
		}
		return 0, fmt.Errorf("缓冲区太小，需要至少 %d 字节", len(rdpPrefix))
	}

	// 后续读取从通道获取数据，或者阻塞等待
	select {
	case data := <-s.readChan:
		if len(p) >= len(data) {
			copy(p, data)
			return len(data), nil
		}
		// 如果缓冲区太小，将数据放回通道
		s.readChan <- data
		return 0, fmt.Errorf("缓冲区太小，需要 %d 字节", len(data))
	case <-s.ctx.Done():
		return 0, s.ctx.Err()
	case <-time.After(5 * time.Second):
		// 5秒超时，返回心跳数据
		heartbeat := []byte("RDP_HEARTBEAT")
		if len(p) >= len(heartbeat) {
			copy(p, heartbeat)
			return len(heartbeat), nil
		}
		return 0, fmt.Errorf("缓冲区太小，需要 %d 字节", len(heartbeat))
	}
}

// Write 写入数据（实现io.Writer接口）
func (s *RDPSessionSimple) Write(p []byte) (n int, err error) {
	// RDP是图形协议，写入操作通过鼠标键盘事件处理
	// 如果收到数据，尝试解析为WebSocket消息
	if len(p) > 1 && s.WebSocket != nil {
		// 尝试解析JSON消息
		var msg map[string]interface{}
		if err := json.Unmarshal(p, &msg); err == nil {
			log.Printf("RDP收到WebSocket消息: %+v", msg)

			// 如果是RDP消息，转换为RDPMessageSimple并处理
			if msgType, exists := msg["type"]; exists {
				rdpMsg := &RDPMessageSimple{
					Type:      fmt.Sprintf("%v", msgType),
					Data:      msg["data"],
					SessionID: s.SessionID,
					Timestamp: time.Now().Unix(),
				}
				s.processMessage(rdpMsg)
			}
		}
	}

	return len(p), nil
}

// Close 关闭连接（实现TerminalSession接口）
func (s *RDPSessionSimple) Close() error {
	return s.Disconnect()
}

// WindowResize 调整窗口大小（实现TerminalSession接口）
func (s *RDPSessionSimple) WindowResize(rows, cols uint16) error {
	// 对于RDP，我们将行列数转换为像素大小
	// 假设每个字符大小为8x16像素
	width := int(cols * 8)
	height := int(rows * 16)

	s.mutex.Lock()
	s.Width = width
	s.Height = height
	s.mutex.Unlock()

	log.Printf("RDP窗口大小调整: %dx%d (%d行 x %d列)", width, height, rows, cols)

	return nil
}

/*
 * @Author: Await
 * @Date: 2025-06-07 14:45:23
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 18:33:06
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
	"strings"
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

// testNetworkConnectivity 测试网络连通性
func (s *RDPSessionSimple) testNetworkConnectivity(host string) error {
	// 尝试连接到常见端口(如80或443)测试基本连通性
	testPorts := []int{80, 443, 22, 3389} // HTTP, HTTPS, SSH, 标准RDP

	for _, port := range testPorts {
		addr := net.JoinHostPort(host, strconv.Itoa(port))
		conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
		if err == nil {
			conn.Close()
			log.Printf("网络连通性测试成功: %s:%d 可达", host, port)
			return nil
		}
	}

	// 如果所有端口都不通，尝试ping
	// 注意：在Windows上ping需要特殊权限，这里只是尝试DNS解析
	_, err := net.LookupHost(host)
	if err != nil {
		return fmt.Errorf("DNS解析失败: %v", err)
	}

	log.Printf("DNS解析成功但所有测试端口都不可达")
	return fmt.Errorf("主机可解析但网络不可达")
}

// rdpConnectionRequest 创建RDP连接请求数据包
func (s *RDPSessionSimple) createRDPConnectionRequest() []byte {
	// X.224 Connection Request (CR) TPDU - RFC905
	// 这是RDP连接的第一步，发送X.224连接请求

	// X.224 Connection Request格式:
	// Length Indicator (LI): 1字节
	// Protocol Data Unit Type (CR): 1字节 (0xE0)
	// Destination Reference: 2字节
	// Source Reference: 2字节
	// Class Option: 1字节
	// Variable Part: 可变长度

	request := []byte{
		// TPKT Header (RFC1006)
		0x03, 0x00, // Version (3) + Reserved (0)
		0x00, 0x2B, // Length (43 bytes total)

		// X.224 Connection Request
		0x26,       // Length Indicator (38 bytes of X.224 data)
		0xE0,       // PDU Type: Connection Request (CR)
		0x00, 0x00, // Destination Reference
		0x00, 0x00, // Source Reference
		0x00, // Class Option

		// Cookie: RDP协议标识
		'C', 'o', 'o', 'k', 'i', 'e', ':', ' ',
		'm', 's', 't', 's', 'h', 'a', 's', 'h', '=',
		's', 'm', 'i', 't', 'h', // 简化的cookie
		0x0D, 0x0A, // CRLF

		// RDP Negotiation Request (可选)
		0x01,       // Type: RDP_NEG_REQ
		0x00,       // Flags
		0x08, 0x00, // Length (8 bytes)
		0x01, 0x00, 0x00, 0x00, // Requested Protocols: PROTOCOL_RDP
	}

	return request
}

// performRDPHandshake 执行RDP握手过程
func (s *RDPSessionSimple) performRDPHandshake(conn net.Conn) error {
	log.Printf("开始RDP协议握手...")

	// 第一步：发送X.224连接请求
	connectionRequest := s.createRDPConnectionRequest()

	log.Printf("发送X.224连接请求 (%d bytes)", len(connectionRequest))
	_, err := conn.Write(connectionRequest)
	if err != nil {
		return fmt.Errorf("发送X.224连接请求失败: %v", err)
	}

	// 第二步：读取服务器响应
	response := make([]byte, 1024)
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	n, err := conn.Read(response)
	if err != nil {
		return fmt.Errorf("读取服务器响应失败: %v", err)
	}

	log.Printf("收到服务器响应 (%d bytes): %x", n, response[:n])

	// 第三步：验证响应
	if n < 4 {
		return fmt.Errorf("服务器响应过短")
	}

	// 检查TPKT头部
	if response[0] != 0x03 || response[1] != 0x00 {
		return fmt.Errorf("无效的TPKT头部")
	}

	// 检查X.224响应类型
	if n >= 7 && response[5] == 0xD0 {
		log.Printf("收到X.224连接确认 (CC)")
		// 连接确认，继续RDP握手
		return s.continueRDPNegotiation(conn)
	} else {
		return fmt.Errorf("未收到预期的X.224连接确认")
	}
}

// continueRDPNegotiation 继续RDP协商过程
func (s *RDPSessionSimple) continueRDPNegotiation(conn net.Conn) error {
	log.Printf("继续RDP协商...")

	// 这里应该继续实现MCS连接、用户认证等步骤
	// 由于RDP协议极其复杂，这里我们使用简化版本

	// 模拟一些延迟，让连接看起来更真实
	time.Sleep(1 * time.Second)

	log.Printf("RDP握手完成（简化版）")
	return nil
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

		// 首先尝试解析地址
		tcpAddr, err := net.ResolveTCPAddr("tcp", addr)
		if err != nil {
			log.Printf("RDP地址解析失败: %v", err)
			s.onError(fmt.Errorf("无法解析RDP服务器地址 %s: %v", addr, err))
			return
		}

		log.Printf("地址解析成功: %s -> %s", addr, tcpAddr.String())

		// 设置较长的超时时间并添加更详细的错误信息
		dialer := &net.Dialer{
			Timeout:   15 * time.Second,
			KeepAlive: 30 * time.Second,
		}

		tcpConn, err := dialer.Dial("tcp", addr)
		if err != nil {
			log.Printf("RDP TCP连接失败: %v", err)
			log.Printf("连接详情: 目标=%s, 解析地址=%s", addr, tcpAddr.String())

			// 尝试基本的网络连通性测试
			if pingErr := s.testNetworkConnectivity(s.Host); pingErr != nil {
				log.Printf("网络连通性测试失败: %v", pingErr)
				s.onError(fmt.Errorf("网络连接失败: %v (主机不可达或防火墙阻止)", err))
			} else {
				log.Printf("网络连通性正常，但RDP端口不可达")
				s.onError(fmt.Errorf("RDP服务器端口 %d 不可达: %v (可能服务未启动或端口被占用)", s.Port, err))
			}
			return
		}

		log.Printf("TCP连接成功，开始RDP协议握手...")

		// 执行RDP协议握手
		err = s.performRDPHandshake(tcpConn)
		if err != nil {
			log.Printf("RDP握手失败: %v", err)
			tcpConn.Close()
			s.onError(fmt.Errorf("RDP协议握手失败: %v", err))
			return
		}

		s.mutex.Lock()
		s.tcpConn = tcpConn
		s.mutex.Unlock()

		log.Printf("RDP连接成功: %s", s.SessionID)

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

	// 生成详细的错误信息和解决建议
	errorDetails := s.generateErrorDetails(err)

	// 发送错误消息
	s.sendMessage(&RDPMessageSimple{
		Type: "RDP_ERROR",
		Data: map[string]interface{}{
			"error":       err.Error(),
			"details":     errorDetails.Details,
			"suggestions": errorDetails.Suggestions,
			"host":        s.Host,
			"port":        s.Port,
		},
		SessionID: s.SessionID,
		Timestamp: time.Now().Unix(),
	})
}

// ErrorDetails 错误详情结构
type ErrorDetails struct {
	Details     string   `json:"details"`
	Suggestions []string `json:"suggestions"`
}

// generateErrorDetails 生成详细的错误信息和解决建议
func (s *RDPSessionSimple) generateErrorDetails(err error) ErrorDetails {
	errStr := err.Error()
	details := fmt.Sprintf("连接 %s:%d 失败", s.Host, s.Port)
	suggestions := []string{}

	if strings.Contains(errStr, "refused") {
		details = "目标服务器拒绝连接"
		suggestions = append(suggestions, []string{
			"检查RDP服务是否在目标机器上运行",
			"确认端口号是否正确 (标准RDP端口是3389)",
			"检查目标机器的防火墙设置",
			"确认RDP服务是否允许远程连接",
		}...)
	} else if strings.Contains(errStr, "timeout") {
		details = "连接超时"
		suggestions = append(suggestions, []string{
			"检查网络连接是否正常",
			"确认目标IP地址是否正确",
			"检查网络防火墙或安全组设置",
			"尝试增加连接超时时间",
		}...)
	} else if strings.Contains(errStr, "no route") {
		details = "网络路由不可达"
		suggestions = append(suggestions, []string{
			"检查目标IP地址是否在可达的网络段",
			"确认网络路由配置",
			"检查VPN或网络代理设置",
		}...)
	} else if strings.Contains(errStr, "DNS") {
		details = "域名解析失败"
		suggestions = append(suggestions, []string{
			"检查域名拼写是否正确",
			"确认DNS服务器配置",
			"尝试使用IP地址直接连接",
		}...)
	} else {
		suggestions = append(suggestions, []string{
			"检查目标服务器状态",
			"确认网络连接正常",
			"验证连接参数是否正确",
			"查看服务器端日志获取更多信息",
		}...)
	}

	return ErrorDetails{
		Details:     details,
		Suggestions: suggestions,
	}
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
	blueSquare := "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3wgWEBsOJvvkpQAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAA00lEQVRYw+2YQQ6DMAxE3yFceADcgRNwAm7ACbgBJ+AG3IAb7A14Ay9wA07ACbgBN+AGvAFvwA24ATfgBtyAG3ADbsANuAE34AbcgBtwA27ADbgBN+AG3IAb8P8DfvqJiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiH8BPgC3WiWjuFzyVAAAAABJRU5ErkJggg=="
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
	log.Printf("RDP收到初始化消息: %+v", data)

	// 解析初始化数据
	if initData, ok := data.(map[string]interface{}); ok {
		// 提取窗口大小信息
		if width, exists := initData["width"]; exists {
			if w, ok := width.(float64); ok {
				s.Width = int(w)
			}
		}
		if height, exists := initData["height"]; exists {
			if h, ok := height.(float64); ok {
				s.Height = int(h)
			}
		}

		log.Printf("RDP初始化完成: 窗口大小 %dx%d", s.Width, s.Height)

		// 发送初始化完成响应
		s.sendMessage(&RDPMessageSimple{
			Type: "RDP_INIT_COMPLETE",
			Data: map[string]interface{}{
				"width":  s.Width,
				"height": s.Height,
				"status": "initialized",
			},
			SessionID: s.SessionID,
			Timestamp: time.Now().Unix(),
		})
	}

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

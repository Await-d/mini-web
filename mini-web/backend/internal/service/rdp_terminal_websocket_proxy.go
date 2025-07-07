/*
 * @Author: Await
 * @Date: 2025-06-07 18:04:56
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 21:40:25
 * @Description: 请填写简介
 */
/*
 * @Author: Await
 * @Date: 2025-06-07 19:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 19:16:50
 * @Description: 基于WebSocket代理的RDP终端实现
 */
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// RDPServerType 定义RDP服务器类型
type RDPServerType int

const (
	ServerTypeUnknown RDPServerType = iota
	ServerTypeWindows               // Windows RDP服务器
	ServerTypeXRDP                  // Linux xrdp服务器
	ServerTypeFreeRDP               // FreeRDP服务器
)

// String 返回服务器类型的字符串表示
func (t RDPServerType) String() string {
	switch t {
	case ServerTypeWindows:
		return "Windows RDP"
	case ServerTypeXRDP:
		return "Linux XRDP"
	case ServerTypeFreeRDP:
		return "FreeRDP"
	default:
		return "Unknown"
	}
}

// RDPWebSocketProxy 基于WebSocket代理的RDP会话结构
type RDPWebSocketProxy struct {
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

	// 网络连接
	RDPConn   net.Conn
	Connected bool

	// WebSocket写入锁
	wsWriteMutex sync.Mutex

	// 服务器类型检测
	ServerType    RDPServerType
	ServerVersion string
}

// GetSessionID 获取会话ID
func (s *RDPWebSocketProxy) GetSessionID() string {
	return s.SessionID
}

// IsActive 检查会话是否活跃
func (s *RDPWebSocketProxy) IsActive() bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.Active
}

// IsConnected 检查是否已连接
func (s *RDPWebSocketProxy) IsConnected() bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.Connected
}

func (s *RDPWebSocketProxy) Write(data []byte) (int, error) {
	log.Printf("🔽 RDP代理Write接收数据: 长度=%d", len(data))

	// 打印数据的十六进制表示和ASCII表示
	if len(data) > 0 {
		if len(data) <= 200 { // 只打印前200字节
			log.Printf("📄 完整数据内容 (hex): %x", data)
			log.Printf("📄 完整数据内容 (ascii): %q", string(data))
		} else {
			log.Printf("📄 数据前100字节 (hex): %x", data[:100])
			log.Printf("📄 数据前100字节 (ascii): %q", string(data[:100]))
			log.Printf("📄 数据后50字节 (hex): %x", data[len(data)-50:])
		}
	}

	// 检查是否为JSON消息（以{开头）
	if len(data) > 0 && data[0] == '{' {
		log.Printf("🔍 检测到JSON消息，不发送给RDP服务器")
		// 这是JSON消息，不应该发送给RDP服务器
		// 解析并处理JSON消息
		var message map[string]interface{}
		if err := json.Unmarshal(data, &message); err == nil {
			log.Printf("✅ JSON解析成功: %v", message)
			s.HandleWebSocketMessage(message)
			return len(data), nil // 返回成功，但不实际发送给RDP
		}
		// 如果JSON解析失败，记录日志并返回成功
		log.Printf("❌ RDP代理收到无效JSON消息: %s", string(data))
		return len(data), nil
	}

	// 对于二进制数据，发送给RDP服务器
	if s.RDPConn != nil {
		log.Printf("🔄 发送二进制数据到RDP服务器: %d字节", len(data))
		n, err := s.RDPConn.Write(data)
		if err != nil {
			log.Printf("❌ 发送到RDP服务器失败: %v", err)
		} else {
			log.Printf("✅ 成功发送到RDP服务器: %d/%d字节", n, len(data))
		}
		return n, err
	}

	log.Printf("❌ RDP连接未建立，无法发送数据")
	return 0, fmt.Errorf("RDP连接未建立")
}

func (s *RDPWebSocketProxy) Read(buffer []byte) (int, error) {
	if s.RDPConn != nil {
		return s.RDPConn.Read(buffer)
	}
	return 0, fmt.Errorf("RDP连接未建立")
}

func (s *RDPWebSocketProxy) WindowResize(rows, cols uint16) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.Width = int(cols)
	s.Height = int(rows)
	log.Printf("RDP WebSocket代理窗口大小调整: %dx%d", s.Width, s.Height)
	return nil
}

func (s *RDPWebSocketProxy) Close() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.Active = false
	if s.cancel != nil {
		s.cancel()
	}
	if s.RDPConn != nil {
		s.RDPConn.Close()
	}
	log.Printf("RDP WebSocket代理会话关闭: %s", s.SessionID)
	return nil
}

func (s *RDPWebSocketProxy) SetWebSocket(ws *websocket.Conn) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.WebSocket = ws
}

// detectServerType 检测RDP服务器类型
func (s *RDPWebSocketProxy) detectServerType(conn net.Conn) (RDPServerType, error) {
	log.Printf("🔍 检测RDP服务器类型...")

	// 发送基础X.224连接请求进行探测
	x224ConnRequest := []byte{
		// TPKT头部 (4字节)
		0x03, 0x00, 0x00, 0x13, // Version=3, Length=19

		// X.224 Connection Request (15字节)
		0x0E,       // Length Indicator = 14
		0xE0,       // PDU Type = Connection Request
		0x00, 0x00, // Destination Reference
		0x00, 0x00, // Source Reference
		0x00, // Class and Options

		// RDP NEG DATA (8字节)
		0x01,       // Type = RDP_NEG_REQ
		0x00,       // Flags
		0x08, 0x00, // Length = 8
		0x00, 0x00, 0x00, 0x00, // Requested Protocols = Standard RDP
	}

	// 发送连接请求
	_, err := conn.Write(x224ConnRequest)
	if err != nil {
		return ServerTypeUnknown, fmt.Errorf("发送探测请求失败: %v", err)
	}

	// 读取响应并分析
	responseBuffer := make([]byte, 1024)
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	n, err := conn.Read(responseBuffer)
	if err != nil {
		return ServerTypeUnknown, fmt.Errorf("读取探测响应失败: %v", err)
	}

	if n > 0 {
		log.Printf("📥 服务器探测响应: 长度=%d, 数据=%x", n, responseBuffer[:n])

		// 分析响应特征
		if n >= 19 {
			// 检查RDP协商响应
			protocolFlags := responseBuffer[15:19]
			protocolID := fmt.Sprintf("%02x%02x%02x%02x", protocolFlags[0], protocolFlags[1], protocolFlags[2], protocolFlags[3])
			log.Printf("🔍 协议标识: %s", protocolID)

			// 检查响应特征判断服务器类型
			if n >= 8 && responseBuffer[5] == 0xD0 {
				// 有效的X.224连接确认

				// 使用配置系统识别服务器类型
				detectedType := IdentifyServerTypeByProtocol(protocolID)
				config := GetConfigForServerType(detectedType)

				log.Printf("🎯 基于协议标识 %s 检测到: %s", protocolID, config.Name)
				log.Printf("📝 服务器配置: %s", config.Description)

				return detectedType, nil
			}
		}
	}

	// 如果无法确定，默认使用XRDP（因为目标是Ubuntu）
	log.Printf("❓ 无法确定服务器类型，默认使用XRDP配置")
	return ServerTypeXRDP, nil
}

// generateMCSConnectInitial 根据服务器类型生成MCS连接初始PDU
func (s *RDPWebSocketProxy) generateMCSConnectInitial(serverType RDPServerType) []byte {
	log.Printf("📝 为服务器类型 %s 生成MCS连接初始PDU", serverType.String())

	if serverType == ServerTypeXRDP {
		// XRDP极简版本 - 基础的客户端信息交换
		log.Printf("🐧 生成XRDP极简握手数据")
		return []byte{
			// TPKT头部
			0x03, 0x00, 0x00, 0x2C, // Version=3, Length=44 (极简版本)

			// X.224 Data PDU
			0x02, 0xF0, 0x80, // LI=2, PDU Type=Data, EOT=1

			// 极简MCS Connect Initial（去掉复杂的ASN.1结构）
			0x7F, 0x65, 0x82, 0x00, 0x20, // 简化的MCS头部，长度=32

			// 基础域选择器
			0x04, 0x01, 0x01, // callingDomainSelector
			0x04, 0x01, 0x01, // calledDomainSelector
			0x01, 0x01, 0xFF, // upwardFlag = TRUE

			// 极简参数集（单一参数集）
			0x30, 0x08, // SEQUENCE, length=8
			0x02, 0x01, 0x01, // maxChannelIds = 1
			0x02, 0x01, 0x01, // maxUserIds = 1
			0x02, 0x01, 0x02, // protocolVersion = 2

			// 基础客户端信息
			0x04, 0x08, // userData length=8
			0x01, 0xC0, 0x00, 0x04, // CS_CORE, length=4
			0x00, 0x05, 0x00, 0x04, // RDP 5.0 基础版本
		}
	}

	// Windows RDP的原始完整版本（保留原来的实现）
	return []byte{
		// TPKT头部
		0x03, 0x00, 0x00, 0xF0, // Version=3, Length=240

		// X.224 Data PDU
		0x02, 0xF0, 0x80, // LI=2, PDU Type=Data, EOT=1

		// MCS Connect Initial PDU (基础版本)
		0x7F, 0x65, 0x82, 0x00, 0xE4, // MCS-Connect-Initial identifier and length=228
		0x04, 0x01, 0x01, // callingDomainSelector
		0x04, 0x01, 0x01, // calledDomainSelector
		0x01, 0x01, 0xFF, // upwardFlag = TRUE

		// targetParameters DomainParameters (标准参数)
		0x30, 0x1A, // SEQUENCE
		0x02, 0x01, 0x22, // maxChannelIds = 34
		0x02, 0x01, 0x02, // maxUserIds = 2
		0x02, 0x01, 0x00, // maxTokenIds = 0
		0x02, 0x01, 0x01, // numPriorities = 1
		0x02, 0x01, 0x00, // minThroughput = 0
		0x02, 0x01, 0x01, // maxHeight = 1
		0x02, 0x02, 0xFF, 0xFF, // maxMCSPDUsize = 65535
		0x02, 0x01, 0x02, // protocolVersion = 2

		// minimumParameters DomainParameters
		0x30, 0x1A, // SEQUENCE
		0x02, 0x01, 0x01, // maxChannelIds = 1
		0x02, 0x01, 0x01, // maxUserIds = 1
		0x02, 0x01, 0x01, // maxTokenIds = 1
		0x02, 0x01, 0x01, // numPriorities = 1
		0x02, 0x01, 0x00, // minThroughput = 0
		0x02, 0x01, 0x01, // maxHeight = 1
		0x02, 0x02, 0x04, 0x20, // maxMCSPDUsize = 1056
		0x02, 0x01, 0x02, // protocolVersion = 2

		// maximumParameters DomainParameters
		0x30, 0x1A, // SEQUENCE
		0x02, 0x01, 0xFF, // maxChannelIds = 255
		0x02, 0x01, 0xFF, // maxUserIds = 255
		0x02, 0x01, 0xFF, // maxTokenIds = 255
		0x02, 0x01, 0x01, // numPriorities = 1
		0x02, 0x01, 0x00, // minThroughput = 0
		0x02, 0x01, 0x01, // maxHeight = 1
		0x02, 0x02, 0xFF, 0xFF, // maxMCSPDUsize = 65535
		0x02, 0x01, 0x02, // protocolVersion = 2

		// userData GCC Conference Create Request
		0x04, 0x82, 0x00, 0x9B, // userData OCTET STRING length=155

		// Client Core Data
		0x01, 0xC0, 0x00, 0x4A, // Header: type=CS_CORE, length=74
		0x00, 0x08, 0x00, 0x10, // version 8.16
		0x00, 0x04, 0x00, 0x03, // desktopWidth=1024, desktopHeight=768
		0x00, 0xCA, 0x01, 0x00, // colorDepth=0x01CA (16 bit)
		0x00, 0x09, 0x04, 0x00, // SASSequence, kbdLayout
		0x00, 0x00, 0x00, 0x00, // clientBuild
		0x52, 0x00, 0x44, 0x00, 0x50, 0x00, 0x43, 0x00, // clientName: "RDPCLIENT"
		0x4C, 0x00, 0x49, 0x00, 0x45, 0x00, 0x4E, 0x00,
		0x54, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00,
		0x02, 0xC0, 0x00, 0x0C, // Header: type=CS_SECURITY, length=12
		0x00, 0x00, 0x00, 0x00, // encryptionMethods=0
		0x00, 0x00, 0x00, 0x00, // extEncryptionMethods=0

		// Additional channel data placeholder
		0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x2C, // CS_NET
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00,
		0x04, 0xC0, 0x00, 0x08, // CS_CLUSTER
		0x00, 0x00, 0x00, 0x00,
	}
}

// NewRDPWebSocketProxy 创建新的RDP WebSocket代理会话
func NewRDPWebSocketProxy(sessionID string, connectionID int, host string, port int, username, password string, width, height int) *RDPWebSocketProxy {
	ctx, cancel := context.WithCancel(context.Background())

	return &RDPWebSocketProxy{
		SessionID:    sessionID,
		ConnectionID: connectionID,
		Host:         host,
		Port:         port,
		Username:     username,
		Password:     password,
		Width:        width,
		Height:       height,
		Active:       true,
		StartTime:    time.Now(),
		LastActivity: time.Now(),
		ctx:          ctx,
		cancel:       cancel,
		Connected:    false,
		ServerType:   ServerTypeUnknown, // 初始化为未知类型
	}
}

// StartRDPConnection 启动RDP连接（代理模式）
func (s *RDPWebSocketProxy) StartRDPConnection() error {
	log.Printf("启动RDP WebSocket代理连接: %s@%s:%d", s.Username, s.Host, s.Port)

	// 发送初始化完成消息
	s.sendInitializationComplete()

	// 发送RDP连接状态信息
	s.sendRDPConnectionInfo()

	// 开始连接循环
	go s.connectionLoop()

	return nil
}

// connectionLoop 连接循环
func (s *RDPWebSocketProxy) connectionLoop() {
	for {
		select {
		case <-s.ctx.Done():
			log.Printf("RDP WebSocket代理连接循环结束: %s", s.SessionID)
			return
		default:
			// 尝试建立RDP连接
			if !s.Connected {
				if err := s.connectToRDP(); err != nil {
					log.Printf("RDP连接失败，等待重试: %v", err)
					s.sendConnectionError(err)
					time.Sleep(5 * time.Second)
					continue
				}
			}

			// 如果连接成功，开始数据代理并等待连接断开
			if s.Connected {
				s.proxyDataBlocking() // 使用阻塞版本，等待连接断开
				// 连接断开后，等待一段时间再重连
				time.Sleep(3 * time.Second)
			}
		}
	}
}

// connectToRDP 连接到RDP服务器
func (s *RDPWebSocketProxy) connectToRDP() error {
	address := fmt.Sprintf("%s:%d", s.Host, s.Port)
	log.Printf("🔗 尝试连接RDP服务器: %s (用户: %s)", address, s.Username)

	// 建立TCP连接
	conn, err := net.DialTimeout("tcp", address, 10*time.Second)
	if err != nil {
		log.Printf("❌ TCP连接失败: %v", err)
		return fmt.Errorf("无法连接到RDP服务器: %v", err)
	}

	log.Printf("✅ TCP连接建立成功: %s", address)

	// 获取本地和远程地址信息
	if localAddr := conn.LocalAddr(); localAddr != nil {
		log.Printf("📍 本地地址: %s", localAddr.String())
	}
	if remoteAddr := conn.RemoteAddr(); remoteAddr != nil {
		log.Printf("📍 远程地址: %s", remoteAddr.String())
	}

	// 执行RDP协议握手
	tlsConn, err := s.performRDPHandshake(conn)
	if err != nil {
		log.Printf("❌ RDP协议握手失败: %v", err)
		conn.Close()
		return fmt.Errorf("RDP协议握手失败: %v", err)
	}
	conn = tlsConn // 使用可能已升级为TLS的连接

	s.mutex.Lock()
	s.RDPConn = conn
	s.Connected = true
	s.LastActivity = time.Now()
	s.mutex.Unlock()

	log.Printf("🎉 RDP WebSocket代理连接成功: %s", address)
	s.sendConnectionSuccess()

	return nil
}

// performRDPHandshake 执行RDP协议握手
func (s *RDPWebSocketProxy) performRDPHandshake(conn net.Conn) (net.Conn, error) {
	log.Printf("🤝 开始RDP协议握手...")

	// 步骤1: 检测服务器类型
	serverType, err := s.detectServerType(conn)
	if err != nil {
		log.Printf("⚠️ 服务器类型检测失败，使用默认XRDP配置: %v", err)
		serverType = ServerTypeXRDP
	}

	s.ServerType = serverType

	// 获取服务器配置
	config := GetConfigForServerType(serverType)
	log.Printf("🎯 使用服务器配置: %s", config.Name)
	log.Printf("📋 握手流程: 简化=%t, TLS支持=%t", config.MCSFlowSimplified, config.SupportsTLS)

	// 注意：detectServerType已经完成了X.224握手，直接进行MCS握手

	// 步骤2: 发送MCS连接初始PDU（根据服务器类型生成）
	mcsConnectInitial := s.generateMCSConnectInitial(serverType)

	log.Printf("📤 发送MCS连接初始PDU: 长度=%d", len(mcsConnectInitial))
	log.Printf("📤 MCS连接初始PDU (hex): %x", mcsConnectInitial)

	_, err = conn.Write(mcsConnectInitial)
	if err != nil {
		return conn, fmt.Errorf("发送MCS连接初始PDU失败: %v", err)
	}

	// 读取MCS连接响应 (使用配置中的超时时间)
	responseBuffer := make([]byte, 1024)
	conn.SetReadDeadline(time.Now().Add(config.DefaultTimeout))
	n, err := conn.Read(responseBuffer)
	if err != nil {
		// 如果是XRDP服务器且遇到EOF，尝试容错处理
		if serverType == ServerTypeXRDP && (err.Error() == "EOF" || err.Error() == "read tcp: connection reset by peer") {
			log.Printf("🐧 XRDP服务器MCS握手失败（%v），尝试容错处理...", err)

			// 关闭当前连接
			conn.Close()

			// 重新建立连接
			address := fmt.Sprintf("%s:%d", s.Host, s.Port)
			newConn, reconnectErr := net.DialTimeout("tcp", address, 10*time.Second)
			if reconnectErr != nil {
				return conn, fmt.Errorf("XRDP重连失败: %v", reconnectErr)
			}

			log.Printf("🔄 XRDP重新连接成功，尝试基础X.224握手...")

			// 只发送基础X.224连接请求（不包含RDP协商）
			basicX224 := []byte{
				0x03, 0x00, 0x00, 0x0B, // TPKT header, length=11
				0x06,       // X.224 length=6
				0xE0,       // X.224 Connection Request
				0x00, 0x00, // dst ref
				0x00, 0x00, // src ref
				0x00, // class
			}

			_, writeErr := newConn.Write(basicX224)
			if writeErr != nil {
				newConn.Close()
				return conn, fmt.Errorf("XRDP基础X.224发送失败: %v", writeErr)
			}

			log.Printf("📤 XRDP基础X.224请求: %x", basicX224)

			// 读取X.224连接确认
			x224ResponseBuffer := make([]byte, 512)
			newConn.SetReadDeadline(time.Now().Add(10 * time.Second))
			x224ResponseLength, x224ReadErr := newConn.Read(x224ResponseBuffer)
			if x224ReadErr != nil {
				newConn.Close()
				return conn, fmt.Errorf("XRDP基础X.224握手读取失败: %v", x224ReadErr)
			}

			log.Printf("📥 XRDP基础X.224响应: 长度=%d, 数据=%x", x224ResponseLength, x224ResponseBuffer[:x224ResponseLength])

			// 验证X.224连接确认
			if x224ResponseLength >= 7 && x224ResponseBuffer[5] == 0xD0 { // X.224 Connection Confirm
				log.Printf("✅ XRDP基础X.224握手成功")

				// 步骤4: 发送标准RDP Client Info PDU（包含认证信息）
				log.Printf("🔐 发送标准RDP Client Info PDU...")

				// 构建标准的Client Info PDU
				username := []byte(s.Username)
				password := []byte(s.Password)
				domain := []byte("") // 空域名

				// Client Info结构
				clientInfo := []byte{
					// TPKT头部 (动态计算长度)
					0x03, 0x00, 0x00, 0x00, // 长度稍后填写

					// X.224 Data PDU
					0x02, 0xF0, 0x80,

					// RDP Security Header
					0x64, 0x00, // Flags (SEC_INFO_PKT)
					0x00, 0x00, // Reserved

					// Client Info PDU
					0x00, 0x00, 0x00, 0x00, // Code Page (0 = default)
					0x00, 0x00, 0x00, 0x00, // Flags

					// Username length (Unicode)
					byte(len(username) * 2), 0x00,
					// Password length (Unicode)
					byte(len(password) * 2), 0x00,
					// Domain length (Unicode)
					byte(len(domain) * 2), 0x00,

					// Alternative shell length
					0x00, 0x00,
					// Working directory length
					0x00, 0x00,
				}

				// 添加用户名 (转换为Unicode UTF-16LE)
				for _, b := range username {
					clientInfo = append(clientInfo, b, 0x00)
				}

				// 添加密码 (转换为Unicode UTF-16LE)
				for _, b := range password {
					clientInfo = append(clientInfo, b, 0x00)
				}

				// 添加域名 (空的Unicode字符串)

				// 添加Alternative shell (空)
				// 添加Working directory (空)

				// 计算并设置TPKT长度
				totalLength := len(clientInfo)
				clientInfo[2] = byte(totalLength >> 8)
				clientInfo[3] = byte(totalLength & 0xFF)

				log.Printf("📤 发送RDP Client Info PDU: 长度=%d", len(clientInfo))
				log.Printf("📤 Client Info PDU (hex): %x", clientInfo)

				_, clientInfoErr := newConn.Write(clientInfo)
				if clientInfoErr != nil {
					return conn, fmt.Errorf("发送RDP Client Info PDU失败: %v", clientInfoErr)
				}

				// 等待服务器的License PDU或其他响应
				licenseBuffer := make([]byte, 2048)
				newConn.SetReadDeadline(time.Now().Add(15 * time.Second))
				licenseN, licenseErr := newConn.Read(licenseBuffer)
				if licenseErr != nil {
					log.Printf("⚠️ 读取License/认证响应失败: %v，尝试继续", licenseErr)
				} else {
					log.Printf("📥 License/认证响应: 长度=%d, 数据=%x", licenseN, licenseBuffer[:licenseN])

					// 检查响应类型
					if licenseN >= 7 {
						rdpSecHeader := licenseBuffer[7:9]
						if rdpSecHeader[0] == 0x80 && rdpSecHeader[1] == 0x00 {
							log.Printf("✅ 收到License服务器证书")
						} else if rdpSecHeader[0] == 0x02 && rdpSecHeader[1] == 0x00 {
							log.Printf("✅ 收到License请求")
						} else {
							log.Printf("📄 收到其他RDP响应: %02x%02x", rdpSecHeader[0], rdpSecHeader[1])
						}
					}
				}

				// 发送Client Random (License阶段)
				clientRandom := []byte{
					0x03, 0x00, 0x00, 0x47, // TPKT, length=71
					0x02, 0xF0, 0x80, // X.224 Data
					0x10, 0x00, // Flags (SEC_LICENSE_PKT)
					0x00, 0x00, // Reserved
					// License Preamble
					0x13,       // bMsgType (LICENSE_REQUEST)
					0x00,       // bVersion
					0x37, 0x00, // wMsgSize = 55
					// Client Random (32 bytes)
					0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
					0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
					0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
					0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F, 0x20,
					// PreMaster Secret length
					0x00, 0x00,
					// Client User Name length
					byte(len(username)), 0x00,
					// Client Machine Name length
					0x08, 0x00,
				}

				// 添加用户名
				clientRandom = append(clientRandom, username...)
				// 添加机器名 (8字节)
				clientRandom = append(clientRandom, []byte("RDPCLIENT")[:8]...)

				log.Printf("📤 发送Client Random: %x", clientRandom)
				_, randomErr := newConn.Write(clientRandom)
				if randomErr != nil {
					log.Printf("⚠️ 发送Client Random失败: %v，尝试继续", randomErr)
				}

				// 对于XRDP，在Client Random后需要处理许可交换
				log.Printf("🔑 XRDP许可交换处理...")

				// 等待并读取服务器的许可请求
				licenseBuffer2 := make([]byte, 1024)
				newConn.SetReadDeadline(time.Now().Add(5 * time.Second))
				licenseLength2, licenseErr2 := newConn.Read(licenseBuffer2)
				if licenseErr2 != nil {
					log.Printf("⚠️ 读取许可请求失败: %v，尝试发送许可响应", licenseErr2)
				} else {
					log.Printf("📥 收到许可请求: 长度=%d", licenseLength2)
				}

				// 发送Client License Information（许可信息响应）
				licenseInfo := []byte{
					0x03, 0x00, 0x00, 0x12, // TPKT Header (18 bytes)
					0x02, 0xF0, 0x80, // X.224 Data PDU
					0x68, 0x00, 0x01, // License Information
					0x03, 0x00, 0x00, 0x00, // License Type: No License
					0x02, 0x00, 0x00, 0x00, // License Data Length: 2
					0x00, 0x00, // Empty License Data
				}

				_, licenseInfoErr := newConn.Write(licenseInfo)
				if licenseInfoErr != nil {
					log.Printf("⚠️ 发送许可信息失败: %v", licenseInfoErr)
				} else {
					log.Printf("✅ 许可信息发送成功")
				}

				// 等待服务器处理许可
				time.Sleep(300 * time.Millisecond)

				log.Printf("🎯 XRDP服务器：许可交换完成，进入长期稳定等待模式")
				log.Printf("⚡ XRDP使用简化流程，跳过标准初始化消息避免连接中止")

				// XRDP在许可交换后需要较长的稳定期
				// 它期望连接保持静默状态直到收到真实的用户输入
				log.Printf("🎯 XRDP等待模式：许可交换完成，进入长期静默等待状态")
				log.Printf("📝 重要：XRDP需要5秒稳定期，避免过早的数据读取操作")

				// 给XRDP更长的稳定时间，避免过早的读取操作引起断开
				time.Sleep(5000 * time.Millisecond)

				log.Printf("✅ XRDP稳定期完成，连接已就绪，等待用户交互激活")
				return newConn, nil
			} else {
				newConn.Close()
				return conn, fmt.Errorf("XRDP基础X.224握手验证失败，期望0xD0，收到: %x", x224ResponseBuffer[:x224ResponseLength])
			}
		}

		// 其他错误情况
		return conn, fmt.Errorf("读取MCS连接响应失败: %v", err)
	}

	if n > 0 {
		log.Printf("📥 收到MCS连接响应: 长度=%d", n)
		log.Printf("📥 MCS响应 (hex): %x", responseBuffer[:n])

		// 验证MCS连接响应
		if n < 8 {
			return conn, fmt.Errorf("MCS连接响应太短: %d字节", n)
		}

		// 根据服务器配置处理响应
		if config.MCSFlowSimplified {
			// 简化流程的服务器（XRDP等）
			if n == 8 && responseBuffer[0] == 0x01 {
				log.Printf("🐧 %s返回简化响应: %x", config.Name, responseBuffer[:n])
				log.Printf("✅ 简化握手，继续进行...")
			} else if responseBuffer[0] == 0x03 && responseBuffer[1] == 0x00 {
				log.Printf("✅ %s标准MCS连接响应", config.Name)
			} else {
				log.Printf("⚠️ %s响应格式未知，尝试继续: %x", config.Name, responseBuffer[:n])
			}
		} else {
			// 标准流程的服务器（Windows RDP）
			if n == 8 && responseBuffer[0] == 0x01 {
				log.Printf("⚠️ %s收到错误响应: %x", config.Name, responseBuffer[:n])
				return conn, fmt.Errorf("MCS连接被服务器拒绝，响应: %x", responseBuffer[:n])
			}

			// 验证正常的MCS Connect Response
			if responseBuffer[0] != 0x03 || responseBuffer[1] != 0x00 {
				log.Printf("⚠️ %s异常响应，可能表明协议不兼容", config.Name)
			}
		}
	}

	// 根据配置决定是否使用简化握手
	if config.MCSFlowSimplified {
		log.Printf("🚀 %s：使用简化握手流程", config.Name)

		// 对于XRDP，如果MCS失败，尝试直接进行RDP层握手
		if serverType == ServerTypeXRDP {
			log.Printf("🐧 XRDP检测到连接断开，尝试直接RDP握手...")

			// 重新建立连接
			address := fmt.Sprintf("%s:%d", s.Host, s.Port)
			newConn, err := net.DialTimeout("tcp", address, 10*time.Second)
			if err != nil {
				return conn, fmt.Errorf("XRDP重连失败: %v", err)
			}

			log.Printf("🔄 XRDP重新连接成功，尝试基础X.224握手...")

			// 只发送基础X.224连接请求
			basicX224 := []byte{
				0x03, 0x00, 0x00, 0x0B, // TPKT header, length=11
				0x06,       // X.224 length=6
				0xE0,       // X.224 Connection Request
				0x00, 0x00, // dst ref
				0x00, 0x00, // src ref
				0x00, // class
			}

			_, err = newConn.Write(basicX224)
			if err != nil {
				newConn.Close()
				return conn, fmt.Errorf("XRDP基础X.224发送失败: %v", err)
			}

			log.Printf("📤 XRDP基础X.224请求: %x", basicX224)

			// 读取X.224连接确认
			responseBuffer := make([]byte, 512)
			newConn.SetReadDeadline(time.Now().Add(10 * time.Second))
			n, err := newConn.Read(responseBuffer)
			if err != nil {
				newConn.Close()
				log.Printf("⚠️ XRDP基础握手读取失败: %v", err)
				// 但继续尝试使用原连接
			} else {
				log.Printf("📥 XRDP基础X.224响应: 长度=%d, 数据=%x", n, responseBuffer[:n])
				if n >= 7 && responseBuffer[5] == 0xD0 { // X.224 Connection Confirm
					log.Printf("✅ XRDP基础X.224握手成功")

					// 发送简单的客户端信息
					clientInfo := []byte{
						0x03, 0x00, 0x00, 0x14, // TPKT header, length=20
						0x02, 0xF0, 0x80, // X.224 Data
						// 极简客户端数据
						0x01, 0xC0, 0x00, 0x08, // CS_CORE
						0x00, 0x04, 0x00, 0x08, // RDP 4.0
						0x00, 0x00, 0x00, 0x00, // 基础标志
					}

					_, err = newConn.Write(clientInfo)
					if err == nil {
						log.Printf("📤 XRDP客户端信息: %x", clientInfo)
						log.Printf("✅ XRDP极简握手完成")
						return newConn, nil
					}
				}
				newConn.Close()
			}
		}

		// 添加短暂延迟确保服务器准备就绪
		time.Sleep(200 * time.Millisecond)
		log.Printf("✅ %s握手完成，连接建立", config.Name)
		return conn, nil
	}

	// 以下是标准RDP的完整握手流程
	log.Printf("🔄 %s：使用标准握手流程", config.Name)

	// 添加短暂延迟确保服务器准备就绪
	time.Sleep(100 * time.Millisecond)

	// 继续RDP握手 - 发送MCS Erect Domain Request
	log.Printf("📤 发送MCS Erect Domain Request...")
	mcsErectDomain := []byte{
		0x03, 0x00, 0x00, 0x0C, // TPKT Header (12 bytes total)
		0x02, 0xF0, 0x80, // X.224 Data Header
		0x04, 0x01, 0x00, 0x01, 0x00, // MCS Erect Domain Request PDU
	}

	_, err = conn.Write(mcsErectDomain)
	if err != nil {
		return conn, fmt.Errorf("发送MCS Erect Domain Request失败: %v", err)
	}
	log.Printf("📤 MCS Erect Domain Request (hex): %x", mcsErectDomain)

	// 添加延迟
	time.Sleep(50 * time.Millisecond)

	// 发送MCS Attach User Request (标准格式)
	log.Printf("📤 发送MCS Attach User Request...")
	mcsAttachUser := []byte{
		0x03, 0x00, 0x00, 0x08, // TPKT Header (8 bytes total)
		0x02, 0xF0, 0x80, // X.224 Data Header
		0x28, // MCS Attach User Request PDU
	}

	_, err = conn.Write(mcsAttachUser)
	if err != nil {
		return conn, fmt.Errorf("发送MCS Attach User Request失败: %v", err)
	}
	log.Printf("📤 MCS Attach User Request (hex): %x", mcsAttachUser)

	// 读取MCS Attach User Confirm
	conn.SetReadDeadline(time.Now().Add(config.DefaultTimeout))
	n, err = conn.Read(responseBuffer)
	if err != nil {
		return conn, fmt.Errorf("读取MCS Attach User Confirm失败: %v", err)
	}

	if n > 0 {
		log.Printf("📥 收到MCS Attach User Confirm: 长度=%d", n)
		log.Printf("📥 MCS Attach User Confirm (hex): %x", responseBuffer[:n])
	}

	log.Printf("✅ %s标准握手完成，连接建立", config.Name)
	return conn, nil
}

// proxyData 代理数据传输 (非阻塞版本)
func (s *RDPWebSocketProxy) proxyData() {
	if s.RDPConn == nil {
		return
	}

	// 从RDP服务器读取数据并发送到WebSocket
	go func() {
		buffer := make([]byte, 4096)
		for {
			if s.RDPConn == nil {
				break
			}

			n, err := s.RDPConn.Read(buffer)
			if err != nil {
				log.Printf("从RDP服务器读取数据失败: %v", err)
				s.handleConnectionLoss()
				break
			}

			if n > 0 {
				s.sendDataToWebSocket(buffer[:n])
				s.mutex.Lock()
				s.LastActivity = time.Now()
				s.mutex.Unlock()
			}
		}
	}()
}

// proxyDataBlocking 代理数据传输 (阻塞版本，等待连接断开)
func (s *RDPWebSocketProxy) proxyDataBlocking() {
	if s.RDPConn == nil {
		return
	}

	log.Printf("开始RDP数据代理，会话: %s", s.SessionID)

	// 对于XRDP，使用特殊的温和读取策略
	if s.ServerType == ServerTypeXRDP {
		log.Printf("🚀 XRDP服务器：使用温和读取策略，等待客户端输入事件触发桌面传输")
		log.Printf("📝 提示：请在前端点击鼠标或移动鼠标来激活XRDP桌面")

		// XRDP需要额外的稳定时间，避免过早的读取操作
		log.Printf("⏰ XRDP额外稳定期：等待3秒避免过早读取...")
		time.Sleep(3000 * time.Millisecond)
		log.Printf("✅ XRDP额外稳定期完成，开始温和读取...")
	}

	// 阻塞读取RDP服务器数据直到连接断开
	buffer := make([]byte, 4096)
	for {
		// 检查上下文是否已取消
		select {
		case <-s.ctx.Done():
			log.Printf("RDP数据代理被取消: %s", s.SessionID)
			return
		default:
		}

		if s.RDPConn == nil {
			log.Printf("RDP连接已断开: %s", s.SessionID)
			break
		}

		// 对XRDP使用更长的读取超时，避免频繁的读取尝试
		var readTimeout time.Duration
		if s.ServerType == ServerTypeXRDP {
			readTimeout = 60 * time.Second // XRDP使用更长的超时
		} else {
			readTimeout = 30 * time.Second // 标准RDP使用正常超时
		}

		s.RDPConn.SetReadDeadline(time.Now().Add(readTimeout))

		n, err := s.RDPConn.Read(buffer)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				// 超时错误，对XRDP使用更温和的处理
				if s.ServerType == ServerTypeXRDP {
					log.Printf("🕐 XRDP读取超时（正常），保持连接等待...")
					// 对XRDP，超时是正常的，添加小延迟后继续
					time.Sleep(1000 * time.Millisecond)
				} else {
					log.Printf("🕐 RDP读取超时，继续等待...")
				}
				continue
			}
			log.Printf("❌ 从RDP服务器读取数据失败: %v", err)
			s.handleConnectionLoss()
			break
		}

		if n > 0 {
			log.Printf("🔼 从RDP服务器接收数据: 长度=%d", n)

			// 打印接收到的数据
			if n <= 200 { // 只打印前200字节
				log.Printf("📥 RDP服务器数据 (hex): %x", buffer[:n])
				log.Printf("📥 RDP服务器数据 (ascii): %q", string(buffer[:n]))
			} else {
				log.Printf("📥 RDP数据前100字节 (hex): %x", buffer[:100])
				log.Printf("📥 RDP数据前100字节 (ascii): %q", string(buffer[:100]))
				log.Printf("📥 RDP数据后50字节 (hex): %x", buffer[n-50:n])
			}

			s.sendDataToWebSocket(buffer[:n])
			s.mutex.Lock()
			s.LastActivity = time.Now()
			s.mutex.Unlock()
		}
	}

	log.Printf("RDP数据代理结束: %s", s.SessionID)
}

// handleConnectionLoss 处理连接丢失
func (s *RDPWebSocketProxy) handleConnectionLoss() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	s.Connected = false
	if s.RDPConn != nil {
		s.RDPConn.Close()
		s.RDPConn = nil
	}

	log.Printf("RDP连接丢失，准备重连: %s", s.SessionID)
}

// WebSocket消息发送方法
func (s *RDPWebSocketProxy) sendInitializationComplete() {
	message := map[string]interface{}{
		"type":      "init_complete",
		"sessionId": s.SessionID,
		"width":     s.Width,
		"height":    s.Height,
		"timestamp": time.Now().UnixMilli(),
	}
	s.sendJSONMessage(message)
}

func (s *RDPWebSocketProxy) sendRDPConnectionInfo() {
	message := map[string]interface{}{
		"type":        "rdp_info",
		"sessionId":   s.SessionID,
		"status":      "connecting",
		"host":        s.Host,
		"port":        s.Port,
		"protocol":    "rdp",
		"description": "正在建立RDP连接...",
		"timestamp":   time.Now().UnixMilli(),
	}
	s.sendJSONMessage(message)
}

func (s *RDPWebSocketProxy) sendConnectionSuccess() {
	message := map[string]interface{}{
		"type":        "rdp_connected",
		"sessionId":   s.SessionID,
		"status":      "connected",
		"description": "RDP连接成功建立",
		"timestamp":   time.Now().UnixMilli(),
	}
	s.sendJSONMessage(message)
}

func (s *RDPWebSocketProxy) sendConnectionError(err error) {
	message := map[string]interface{}{
		"type":        "rdp_error",
		"sessionId":   s.SessionID,
		"status":      "error",
		"error":       err.Error(),
		"description": "RDP连接失败",
		"timestamp":   time.Now().UnixMilli(),
	}
	s.sendJSONMessage(message)
}

func (s *RDPWebSocketProxy) sendDataToWebSocket(data []byte) {
	if s.WebSocket == nil {
		log.Printf("❌ WebSocket未连接，无法发送数据")
		return
	}

	log.Printf("🔄 发送数据到WebSocket: 长度=%d", len(data))

	// 打印发送到WebSocket的数据
	if len(data) <= 200 {
		log.Printf("📤 发送到WebSocket (hex): %x", data)
		log.Printf("📤 发送到WebSocket (ascii): %q", string(data))
	} else {
		log.Printf("📤 WebSocket数据前100字节 (hex): %x", data[:100])
		log.Printf("📤 WebSocket数据前100字节 (ascii): %q", string(data[:100]))
		log.Printf("📤 WebSocket数据后50字节 (hex): %x", data[len(data)-50:])
	}

	s.wsWriteMutex.Lock()
	defer s.wsWriteMutex.Unlock()

	if err := s.WebSocket.WriteMessage(websocket.BinaryMessage, data); err != nil {
		log.Printf("❌ 发送数据到WebSocket失败: %v", err)
	} else {
		log.Printf("✅ 成功发送到WebSocket: %d字节", len(data))
	}
}

func (s *RDPWebSocketProxy) sendJSONMessage(message map[string]interface{}) {
	if s.WebSocket == nil {
		return
	}

	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("序列化JSON消息失败: %v", err)
		return
	}

	s.wsWriteMutex.Lock()
	defer s.wsWriteMutex.Unlock()

	if err := s.WebSocket.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("发送JSON消息到WebSocket失败: %v", err)
	}
}

// HandleWebSocketMessage 处理来自WebSocket的消息
func (s *RDPWebSocketProxy) HandleWebSocketMessage(message map[string]interface{}) {
	msgType, ok := message["type"].(string)
	if !ok {
		log.Printf("无效的消息类型")
		return
	}

	switch msgType {
	case "init":
		s.handleInitMessage(message)
	case "rdp_data":
		s.handleRDPDataMessage(message)
	case "resize":
		s.handleResizeMessage(message)
	default:
		log.Printf("未知的消息类型: %s", msgType)
	}
}

func (s *RDPWebSocketProxy) handleInitMessage(message map[string]interface{}) {
	log.Printf("RDP WebSocket代理收到初始化消息")

	if width, ok := message["width"].(float64); ok {
		s.Width = int(width)
	}
	if height, ok := message["height"].(float64); ok {
		s.Height = int(height)
	}

	s.sendInitializationComplete()
}

func (s *RDPWebSocketProxy) handleRDPDataMessage(message map[string]interface{}) {
	if dataStr, ok := message["data"].(string); ok && s.RDPConn != nil {
		// 这里应该解码base64数据并发送到RDP服务器
		// 简化实现，实际应用中需要更复杂的数据处理
		s.RDPConn.Write([]byte(dataStr))
	}
}

func (s *RDPWebSocketProxy) handleResizeMessage(message map[string]interface{}) {
	if width, ok := message["width"].(float64); ok {
		s.Width = int(width)
	}
	if height, ok := message["height"].(float64); ok {
		s.Height = int(height)
	}
	log.Printf("RDP WebSocket代理窗口大小调整: %dx%d", s.Width, s.Height)
}

// DetectServerType 检测RDP服务器类型（公共方法，用于测试）
func (s *RDPWebSocketProxy) DetectServerType(conn net.Conn) (RDPServerType, error) {
	return s.detectServerType(conn)
}

// PerformRDPHandshake 执行RDP协议握手（公共方法，用于测试）
func (s *RDPWebSocketProxy) PerformRDPHandshake(conn net.Conn) (net.Conn, error) {
	return s.performRDPHandshake(conn)
}

// sendDesktopUpdateRequest 发送桌面更新请求，激活XRDP的桌面传输
func (s *RDPWebSocketProxy) sendDesktopUpdateRequest(conn net.Conn) error {
	// 构建Refresh Rect PDU，请求整个桌面更新
	refreshRect := []byte{
		0x03, 0x00, 0x00, 0x17, // TPKT Header (23 bytes)
		0x02, 0xF0, 0x80, // X.224 Data PDU
		0x68, 0x00, // RDP Security Header (无加密)
		0x01, 0x00, // Flags
		// Refresh Rect PDU
		0x0F,       // Update Type: UPDATETYPE_ORDERS
		0x00,       // Reserved
		0x00, 0x01, // Number of rectangles: 1
		// Rectangle (整个屏幕)
		0x00, 0x00, // Left: 0
		0x00, 0x00, // Top: 0
		byte(s.Width & 0xFF), byte((s.Width >> 8) & 0xFF), // Right: Width
		byte(s.Height & 0xFF), byte((s.Height >> 8) & 0xFF), // Bottom: Height
	}

	_, err := conn.Write(refreshRect)
	if err != nil {
		return fmt.Errorf("发送桌面更新请求失败: %v", err)
	}

	log.Printf("📺 发送桌面更新请求: %x", refreshRect)
	return nil
}

// sendInitialInputEvent 发送初始输入事件，确保XRDP会话活跃
func (s *RDPWebSocketProxy) sendInitialInputEvent(conn net.Conn) error {
	// 构建一个简单的鼠标移动事件
	mouseEvent := []byte{
		0x03, 0x00, 0x00, 0x13, // TPKT Header (19 bytes)
		0x02, 0xF0, 0x80, // X.224 Data PDU
		0x68, 0x00, // RDP Security Header
		0x01, 0x00, // Flags
		// Input Event PDU
		0x01,       // Message Type: TS_INPUT_EVENT
		0x00,       // Reserved
		0x01, 0x00, // Number of events: 1
		// Mouse Event
		0x00, 0x00, // Time (relative)
		0x80, 0x01, // Message Type: INPUT_EVENT_MOUSE, Flags: MOUSE_FLAG_MOVE
		0x01, 0x00, 0x01, 0x00, // X=1, Y=1 (minimal move)
	}

	_, err := conn.Write(mouseEvent)
	if err != nil {
		return fmt.Errorf("发送初始输入事件失败: %v", err)
	}

	log.Printf("🖱️ 发送初始鼠标事件: %x", mouseEvent)
	return nil
}

package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"gitee.com/await29/mini-web/internal/middleware"
	"gitee.com/await29/mini-web/internal/model"
	"gitee.com/await29/mini-web/internal/service"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// 添加WebSocket升级器
var upgrader = websocket.Upgrader{
	ReadBufferSize:  2 * 1024 * 1024, // 2MB
	WriteBufferSize: 2 * 1024 * 1024, // 2MB
	CheckOrigin: func(r *http.Request) bool {
		// 在生产环境中应该检查来源
		return true
	},
}

// ConnectionHandler 连接处理器
type ConnectionHandler struct {
	connService     *service.ConnectionService
	binaryProtocol  *service.BinaryProtocolHandler
	specialDetector *service.SpecialCommandDetector
}

// NewConnectionHandler 创建连接处理器实例
func NewConnectionHandler(connService *service.ConnectionService) *ConnectionHandler {
	return &ConnectionHandler{
		connService:     connService,
		binaryProtocol:  service.NewBinaryProtocolHandler(),
		specialDetector: service.NewSpecialCommandDetector(),
	}
}

// CreateConnection 创建连接
func (h *ConnectionHandler) CreateConnection(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 解析请求
	var req model.ConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证必填字段
	if req.Name == "" || req.Protocol == "" || req.Host == "" || req.Port == 0 {
		sendErrorResponse(w, http.StatusBadRequest, "名称、协议、主机和端口不能为空")
		return
	}

	// 创建连接
	conn, err := h.connService.CreateConnection(userID, &req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidProtocol) {
			sendErrorResponse(w, http.StatusBadRequest, "无效的协议类型")
			return
		}
		sendErrorResponse(w, http.StatusInternalServerError, "创建连接失败: "+err.Error())
		return
	}

	// 构建响应
	response := model.ConnectionResponse{
		ID:          conn.ID,
		Name:        conn.Name,
		Protocol:    conn.Protocol,
		Host:        conn.Host,
		Port:        conn.Port,
		Username:    conn.Username,
		Group:       conn.Group,
		Description: conn.Description,
		LastUsed:    conn.LastUsed,
		CreatedBy:   conn.CreatedBy,
		CreatedAt:   conn.CreatedAt,
		UpdatedAt:   conn.UpdatedAt,
	}

	sendSuccessResponse(w, "创建连接成功", response)
}

// UpdateConnection 更新连接
func (h *ConnectionHandler) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取连接ID
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的连接ID")
		return
	}

	// 解析请求
	var req model.ConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证必填字段
	if req.Name == "" || req.Protocol == "" || req.Host == "" || req.Port == 0 {
		sendErrorResponse(w, http.StatusBadRequest, "名称、协议、主机和端口不能为空")
		return
	}

	// 更新连接
	conn, err := h.connService.UpdateConnection(userID, uint(id), &req)
	if err != nil {
		if errors.Is(err, service.ErrConnectionNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "连接不存在")
			return
		}
		if errors.Is(err, service.ErrInvalidProtocol) {
			sendErrorResponse(w, http.StatusBadRequest, "无效的协议类型")
			return
		}
		sendErrorResponse(w, http.StatusInternalServerError, "更新连接失败: "+err.Error())
		return
	}

	// 构建响应
	response := model.ConnectionResponse{
		ID:          conn.ID,
		Name:        conn.Name,
		Protocol:    conn.Protocol,
		Host:        conn.Host,
		Port:        conn.Port,
		Username:    conn.Username,
		Group:       conn.Group,
		Description: conn.Description,
		LastUsed:    conn.LastUsed,
		CreatedBy:   conn.CreatedBy,
		CreatedAt:   conn.CreatedAt,
		UpdatedAt:   conn.UpdatedAt,
	}

	sendSuccessResponse(w, "更新连接成功", response)
}

// DeleteConnection 删除连接
func (h *ConnectionHandler) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取连接ID
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的连接ID")
		return
	}

	// 删除连接
	if err := h.connService.DeleteConnection(userID, uint(id)); err != nil {
		if errors.Is(err, service.ErrConnectionNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "连接不存在")
			return
		}
		sendErrorResponse(w, http.StatusInternalServerError, "删除连接失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "删除连接成功", nil)
}

// GetConnection 获取连接详情
func (h *ConnectionHandler) GetConnection(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取连接ID
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的连接ID")
		return
	}

	// 获取连接
	conn, err := h.connService.GetConnection(userID, uint(id))
	if err != nil {
		if errors.Is(err, service.ErrConnectionNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "连接不存在")
			return
		}
		sendErrorResponse(w, http.StatusInternalServerError, "获取连接失败: "+err.Error())
		return
	}

	// 构建响应
	response := model.ConnectionResponse{
		ID:          conn.ID,
		Name:        conn.Name,
		Protocol:    conn.Protocol,
		Host:        conn.Host,
		Port:        conn.Port,
		Username:    conn.Username,
		Group:       conn.Group,
		Description: conn.Description,
		LastUsed:    conn.LastUsed,
		CreatedBy:   conn.CreatedBy,
		CreatedAt:   conn.CreatedAt,
		UpdatedAt:   conn.UpdatedAt,
	}

	sendSuccessResponse(w, "获取连接成功", response)
}

// GetUserConnections 获取用户的所有连接
func (h *ConnectionHandler) GetUserConnections(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取用户连接列表
	connections, err := h.connService.GetUserConnections(userID)
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取连接列表失败: "+err.Error())
		return
	}

	// 构建响应
	var connectionResponses []model.ConnectionResponse
	for _, conn := range connections {
		response := model.ConnectionResponse{
			ID:          conn.ID,
			Name:        conn.Name,
			Protocol:    conn.Protocol,
			Host:        conn.Host,
			Port:        conn.Port,
			Username:    conn.Username,
			Group:       conn.Group,
			Description: conn.Description,
			LastUsed:    conn.LastUsed,
			CreatedBy:   conn.CreatedBy,
			CreatedAt:   conn.CreatedAt,
			UpdatedAt:   conn.UpdatedAt,
		}
		connectionResponses = append(connectionResponses, response)
	}

	// 如果没有连接，返回空数组
	if connectionResponses == nil {
		connectionResponses = []model.ConnectionResponse{}
	}

	sendSuccessResponse(w, "获取连接列表成功", connectionResponses)
}

// TestConnection 测试连接
func (h *ConnectionHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 解析请求
	var req model.ConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 创建临时连接对象
	conn := &model.Connection{
		Protocol:  req.Protocol,
		Host:      req.Host,
		Port:      req.Port,
		Username:  req.Username,
		Password:  req.Password,
		CreatedBy: userID,
	}

	// 测试连接
	if err := h.connService.TestConnection(conn); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "连接测试失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "连接测试成功", nil)
}

// CreateSession 创建会话
func (h *ConnectionHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取连接ID
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的连接ID")
		return
	}

	// 获取客户端IP
	clientIP := r.RemoteAddr
	if forwardedFor := r.Header.Get("X-Forwarded-For"); forwardedFor != "" {
		clientIP = forwardedFor
	}

	// 创建会话
	session, err := h.connService.CreateSession(userID, uint(id), clientIP)
	if err != nil {
		if errors.Is(err, service.ErrConnectionNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "连接不存在")
			return
		}
		sendErrorResponse(w, http.StatusInternalServerError, "创建会话失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "创建会话成功", session)
}

// CloseSession 关闭会话
func (h *ConnectionHandler) CloseSession(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取会话ID
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的会话ID")
		return
	}

	// 关闭会话
	if err := h.connService.CloseSession(userID, uint(id)); err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "关闭会话失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "关闭会话成功", nil)
}

// GetUserSessions 获取用户的所有会话
func (h *ConnectionHandler) GetUserSessions(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取用户会话列表
	sessions, err := h.connService.GetUserSessions(userID)
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取会话列表失败: "+err.Error())
		return
	}

	// 如果没有会话，返回空数组
	if sessions == nil {
		sessions = []*model.Session{}
	}

	sendSuccessResponse(w, "获取会话列表成功", sessions)
}

// GetActiveSessions 获取用户的活动会话
func (h *ConnectionHandler) GetActiveSessions(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取活动会话列表
	sessions, err := h.connService.GetActiveSessions(userID)
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取活动会话列表失败: "+err.Error())
		return
	}

	// 如果没有会话，返回空数组
	if sessions == nil {
		sessions = []*model.Session{}
	}

	sendSuccessResponse(w, "获取活动会话列表成功", sessions)
}

// HandleTerminalWebSocket 处理终端WebSocket连接
func (h *ConnectionHandler) HandleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	// 添加非常详细的日志
	log.Printf("==========================================")
	log.Printf("收到终端WebSocket连接请求: %s %s%s", r.Method, r.URL.Path, r.URL.RawQuery)
	log.Printf("请求头:")
	for name, values := range r.Header {
		for _, value := range values {
			log.Printf("  %s: %s", name, value)
		}
	}
	log.Printf("==========================================")

	// 设置CORS头
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Sec-WebSocket-Key, Sec-WebSocket-Extensions, Sec-WebSocket-Version")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	// 使用全局定义的upgrader，不再定义本地upgrader

	// 简化逻辑：直接尝试升级WebSocket连接
	log.Printf("尝试直接升级WebSocket连接...")

	// 首先检查URL查询参数中的令牌
	urlToken := r.URL.Query().Get("token")
	var userID uint
	var ok bool

	if urlToken != "" {
		log.Printf("从URL查询参数中获取到令牌")
		// 验证URL中的令牌
		claims, err := middleware.ValidateToken(urlToken)
		if err == nil && claims.UserID > 0 {
			userID = claims.UserID
			ok = true
			log.Printf("URL令牌验证成功, 用户ID: %d", userID)
		} else if err != nil {
			log.Printf("URL令牌验证失败: %v", err)
		}
	}

	// 如果URL中没有有效令牌，尝试从请求头获取
	if !ok {
		userID, ok = middleware.GetUserID(r)
		if !ok {
			log.Printf("WebSocket连接认证失败：用户ID未找到")
			sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
			return
		}
	}

	// 获取参数
	vars := mux.Vars(r)
	protocol := vars["protocol"]
	sessionIDStr := vars["sessionId"]

	log.Printf("收到WebSocket连接请求: 协议=%s, 会话ID=%s, 用户ID=%d", protocol, sessionIDStr, userID)

	// 验证协议
	if !service.IsValidProtocol(protocol) {
		log.Printf("无效的协议类型: %s", protocol)
		sendErrorResponse(w, http.StatusBadRequest, "无效的协议类型")
		return
	}

	// 解析会话ID
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		log.Printf("无效的会话ID: %s, 错误: %v", sessionIDStr, err)
		sendErrorResponse(w, http.StatusBadRequest, "无效的会话ID")
		return
	}

	// 验证会话
	session, err := h.connService.GetSessionByID(userID, uint(sessionID))
	if err != nil {
		log.Printf("会话验证失败: ID=%d, 用户ID=%d, 错误: %v", sessionID, userID, err)
		sendErrorResponse(w, http.StatusNotFound, "会话不存在或已结束")
		return
	}

	log.Printf("会话验证成功: ID=%d, 连接ID=%d", session.ID, session.ConnectionID)

	// 获取连接信息
	connectionInfo, err := h.connService.GetConnection(userID, session.ConnectionID)
	if err != nil {
		log.Printf("获取连接信息失败: 连接ID=%d, 错误: %v", session.ConnectionID, err)
		sendErrorResponse(w, http.StatusNotFound, "连接信息不存在")
		return
	}

	log.Printf("获取连接信息成功: ID=%d, 协议=%s, 主机=%s, 端口=%d",
		connectionInfo.ID, connectionInfo.Protocol, connectionInfo.Host, connectionInfo.Port)

	// 升级HTTP连接为WebSocket
	log.Printf("尝试升级HTTP连接为WebSocket...")

	// 设置响应头，确保CORS支持
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	// 打印请求头信息以便调试
	log.Printf("请求头信息:")
	for name, values := range r.Header {
		log.Printf("  %s: %v", name, values)
	}

	// 配置升级器，明确允许所有来源
	upgrader.CheckOrigin = func(r *http.Request) bool {
		log.Printf("WebSocket CheckOrigin被调用，来源: %s", r.Header.Get("Origin"))
		return true // 允许所有来源
	}

	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("升级WebSocket连接失败: %v", err)
		http.Error(w, fmt.Sprintf("升级WebSocket连接失败: %v", err), http.StatusInternalServerError)
		return
	}
	log.Printf("WebSocket连接升级成功!")
	defer wsConn.Close()

	log.Printf("WebSocket连接升级成功")

	// 创建终端会话
	log.Printf("尝试创建终端会话: 协议=%s", protocol)
	terminal, err := h.connService.CreateTerminalSession(protocol, connectionInfo)
	if err != nil {
		log.Printf("创建终端会话失败: 协议=%s, 错误: %v", protocol, err)
		wsConn.WriteMessage(websocket.TextMessage, []byte("创建终端会话失败: "+err.Error()))
		return
	}
	defer terminal.Close()

	log.Printf("终端会话创建成功，开始处理WebSocket通信")

	// 处理WebSocket连接
	h.handleTerminalSession(wsConn, terminal)
}

// handleTerminalSession 处理终端会话的WebSocket通信
func (h *ConnectionHandler) handleTerminalSession(wsConn *websocket.Conn, terminal service.TerminalSession) {
	var once sync.Once
	done := make(chan struct{})
	errChan := make(chan error, 2)       // 用于传递错误
	activeChan := make(chan struct{}, 2) // 用于活跃性检测

	log.Printf("开始处理终端会话WebSocket通信")

	// 向终端发送一条测试消息
	log.Printf("向终端发送测试消息")
	terminal.Write([]byte{0}) // 发送空消息

	// 从终端读取初始响应
	buf := make([]byte, 512)
	n, err := terminal.Read(buf)
	if err != nil {
		log.Printf("读取终端初始响应时出错: %v", err)
	} else {
		log.Printf("收到终端初始响应: %d 字节", n)
		if n > 0 {
			log.Printf("初始响应内容预览: %s", string(buf[:min(n, 100)]))
		}
	}

	// 判断是否为图形协议
	isGraphical := false
	protocol := ""

	if n > 4 {
		prefix := string(buf[:4])
		log.Printf("终端响应前缀: %s", prefix)

		if prefix == "RDP_" {
			isGraphical = true
			protocol = model.ProtocolRDP
			log.Printf("检测到RDP图形协议")
		} else if prefix == "VNC_" {
			isGraphical = true
			protocol = model.ProtocolVNC
			log.Printf("检测到VNC图形协议")
		}
	}

	log.Printf("处理终端会话: 协议=%s, 图形模式=%v", protocol, isGraphical)

	// 如果是图形协议，发送一个初始化消息
	if isGraphical {
		initMsg := struct {
			Type     string `json:"type"`
			Protocol string `json:"protocol"`
		}{
			Type:     "init",
			Protocol: protocol,
		}

		initData, _ := json.Marshal(initMsg)
		log.Printf("发送图形协议初始化消息: %s", string(initData))

		if err := wsConn.WriteMessage(websocket.TextMessage, initData); err != nil {
			log.Printf("发送初始化消息失败: %v", err)
			return
		} else {
			log.Printf("初始化消息发送成功")
		}
	}

	// 设置超时检测器
	timeout := 3 * time.Minute // 3分钟无活动则超时
	lastActivity := time.Now()

	// 活动检测计时器
	activityTimer := time.NewTicker(10 * time.Second)
	defer activityTimer.Stop()

	// 添加ping-pong机制检测连接状态
	pingTimer := time.NewTicker(30 * time.Second)
	defer pingTimer.Stop()

	// 设置pong处理器
	wsConn.SetPongHandler(func(appData string) error {
		log.Printf("收到pong响应: %s", appData)
		// 更新活动时间
		select {
		case activeChan <- struct{}{}:
		default:
		}
		return nil
	})

	// 从WebSocket读取数据并写入终端
	go func() {
		defer once.Do(func() {
			log.Printf("WebSocket读取协程结束")
			close(done)
		})

		log.Printf("启动WebSocket读取协程")

		for {
			// 设置读取超时
			wsConn.SetReadDeadline(time.Now().Add(1 * time.Minute))

			messageType, p, err := wsConn.ReadMessage()
			if err != nil {
				log.Printf("读取WebSocket消息错误: %v", err)
				errChan <- err
				return
			}

			// 更新活动时间
			select {
			case activeChan <- struct{}{}:
			default:
			}

			log.Printf("收到WebSocket消息: 类型=%d, 大小=%d字节", messageType, len(p))

			// 检查是否为二进制协议消息
			if messageType == websocket.BinaryMessage && h.binaryProtocol.IsProtocolMessage(p) {
				// 处理二进制协议消息
				protocolMsg, err := h.binaryProtocol.DecodeMessage(p)
				if err != nil {
					log.Printf("解析二进制协议消息失败: %v", err)
					continue
				}

				log.Printf("解析二进制协议消息成功: 类型=%d", protocolMsg.Header.MessageType)

				// 处理协议协商
				if protocolMsg.Header.MessageType == service.MessageTypeProtocolNegotiation {
					if negotiationData, ok := protocolMsg.JSONData.(map[string]interface{}); ok {
						// 转换为协议协商结构
						var clientNegotiation service.ProtocolNegotiation
						if negotiationBytes, err := json.Marshal(negotiationData); err == nil {
							if err := json.Unmarshal(negotiationBytes, &clientNegotiation); err == nil {
								log.Printf("收到客户端协议协商: %+v", clientNegotiation)

								// 处理协议协商并发送响应
								serverNegotiation, err := h.binaryProtocol.HandleProtocolNegotiation(&clientNegotiation)
								if err == nil {
									responseData, err := h.binaryProtocol.EncodeMessage(serverNegotiation, nil, service.CompressionNone)
									if err == nil {
										// 设置消息类型为协议协商
										responseData[4] = service.MessageTypeProtocolNegotiation
										wsConn.WriteMessage(websocket.BinaryMessage, responseData)
										log.Printf("发送协议协商响应成功")
									}
								}
							}
						}
					}
					continue
				}

				// 处理心跳消息
				if protocolMsg.Header.MessageType == service.MessageTypeHeartbeat {
					log.Printf("收到心跳消息")
					// 可以回复心跳响应
					if heartbeatData, err := h.binaryProtocol.CreateHeartbeatMessage(); err == nil {
						wsConn.WriteMessage(websocket.BinaryMessage, heartbeatData)
					}
					continue
				}

				// 处理其他协议消息
				if protocolMsg.JSONData != nil {
					// 检查是否是命令数据
					if jsonMap, ok := protocolMsg.JSONData.(map[string]interface{}); ok {
						// 检查是否是command类型消息
						if msgType, hasType := jsonMap["type"]; hasType && msgType == "command" {
							if content, hasContent := jsonMap["content"]; hasContent {
								if contentStr, isString := content.(string); isString {
									// 清理日志显示，但保持原始数据传递给终端
									cleanContentForLog := strings.TrimSpace(contentStr)
									log.Printf("处理二进制协议命令: %s", cleanContentForLog)

									// 详细记录发送给终端的字节数据
									terminalBytes := []byte(contentStr)
									log.Printf("发送给终端的字节数据: 长度=%d, 内容=%v", len(terminalBytes), terminalBytes)
									log.Printf("发送给终端的字符串表示: %q", contentStr)

									// 检查是否是sudo密码输入（简单的方式：检查是否只包含字母数字且没有空格）
									isSudoPassword := false
									if !strings.Contains(cleanContentForLog, " ") &&
										len(cleanContentForLog) > 5 &&
										len(cleanContentForLog) < 50 &&
										!strings.HasPrefix(cleanContentForLog, "sudo") &&
										!strings.HasPrefix(cleanContentForLog, "su ") {
										// 可能是密码，添加小延迟确保sudo已准备好
										log.Printf("检测到可能的sudo密码输入，添加100ms延迟")
										time.Sleep(100 * time.Millisecond)
										isSudoPassword = true
									}

									// 直接将命令内容传递给终端（保留原始的\r\n）
									if _, err := terminal.Write(terminalBytes); err != nil {
										log.Printf("向终端写入命令失败: %v", err)
									} else if isSudoPassword {
										log.Printf("sudo密码已发送，等待系统处理")
									}
									continue
								}
							}
						}
					}

					// 如果有JSON数据但不是command类型，按JSON处理
					if jsonBytes, err := json.Marshal(protocolMsg.JSONData); err == nil {
						p = jsonBytes
						messageType = websocket.TextMessage
					}
				} else if protocolMsg.BinaryData != nil {
					// 如果有二进制数据，直接传递给终端
					log.Printf("处理二进制数据: %d字节", len(protocolMsg.BinaryData))
					if _, err := terminal.Write(protocolMsg.BinaryData); err != nil {
						log.Printf("向终端写入二进制数据失败: %v", err)
					}
					continue
				}
			}

			if messageType == websocket.TextMessage {
				// 文本消息处理
				if len(p) < 1000 {
					log.Printf("文本消息内容: %s", string(p))
				} else {
					log.Printf("文本消息内容过长，仅记录前1000字节: %s...", string(p[:1000]))
				}

				// 检查是否是JSON格式
				if strings.HasPrefix(string(p), "{") && strings.HasSuffix(string(p), "}") {
					// 尝试解析JSON命令
					var cmd struct {
						Type string          `json:"type"`
						Data json.RawMessage `json:"data"`
					}

					if err := json.Unmarshal(p, &cmd); err == nil {
						log.Printf("解析JSON命令成功: %s", cmd.Type)

						// 处理特殊命令
						switch cmd.Type {
						case "file_list":
							// 处理文件列表请求
							var fileListData struct {
								Path      string `json:"path"`
								RequestId string `json:"requestId,omitempty"`
							}
							if err := json.Unmarshal(cmd.Data, &fileListData); err == nil {
								log.Printf("收到文件列表请求: 路径=%s, 请求ID=%s", fileListData.Path, fileListData.RequestId)

								// 检查是否是SSH终端
								if sshTerminal, ok := terminal.(*service.SSHTerminalSession); ok {
									// 检查命令处理器是否可用
									commandHandler := sshTerminal.GetCommandHandler()
									if commandHandler == nil {
										log.Printf("SSH命令处理器不可用")
										response := struct {
											Type string `json:"type"`
											Data struct {
												Path      string `json:"path"`
												Error     string `json:"error"`
												RequestId string `json:"requestId,omitempty"`
											} `json:"data"`
										}{
											Type: "file_list_response",
											Data: struct {
												Path      string `json:"path"`
												Error     string `json:"error"`
												RequestId string `json:"requestId,omitempty"`
											}{
												Path:      fileListData.Path,
												Error:     "SSH命令处理器不可用",
												RequestId: fileListData.RequestId,
											},
										}
										if responseBytes, err := json.Marshal(response); err == nil {
											wsConn.WriteMessage(websocket.TextMessage, responseBytes)
										}
										return
									}

									// 使用SSH命令处理器获取文件列表
									go func() {
										fileListResp, err := commandHandler.ExecuteFileListCommand(fileListData.Path)
										var responseBytes []byte

										if err != nil {
											log.Printf("执行文件列表命令失败: %v", err)
											response := struct {
												Type string `json:"type"`
												Data struct {
													Path      string `json:"path"`
													Error     string `json:"error"`
													RequestId string `json:"requestId,omitempty"`
												} `json:"data"`
											}{
												Type: "file_list_response",
												Data: struct {
													Path      string `json:"path"`
													Error     string `json:"error"`
													RequestId string `json:"requestId,omitempty"`
												}{
													Path:      fileListData.Path,
													Error:     fmt.Sprintf("命令执行失败: %v", err),
													RequestId: fileListData.RequestId,
												},
											}
											responseBytes, _ = json.Marshal(response)
										} else {
											// 构建响应
											response := struct {
												Type string `json:"type"`
												Data struct {
													Path      string             `json:"path"`
													Files     []service.FileInfo `json:"files"`
													Error     string             `json:"error,omitempty"`
													RequestId string             `json:"requestId,omitempty"`
												} `json:"data"`
											}{
												Type: "file_list_response",
												Data: struct {
													Path      string             `json:"path"`
													Files     []service.FileInfo `json:"files"`
													Error     string             `json:"error,omitempty"`
													RequestId string             `json:"requestId,omitempty"`
												}{
													Path:      fileListResp.Path,
													Files:     fileListResp.Files,
													Error:     fileListResp.Error,
													RequestId: fileListData.RequestId,
												},
											}
											responseBytes, _ = json.Marshal(response)
										}

										// 发送响应 - 使用统一的发送方法
										if len(responseBytes) > 0 {
											err := h.sendFileListResponse(wsConn, responseBytes, fileListData.RequestId, len(fileListResp.Files))
											if err != nil {
												log.Printf("发送文件列表响应最终失败: %v", err)

												// 尝试发送错误响应
												errorResponse := struct {
													Type string `json:"type"`
													Data struct {
														Path      string `json:"path"`
														Error     string `json:"error"`
														RequestId string `json:"requestId,omitempty"`
													} `json:"data"`
												}{
													Type: "file_list_response",
													Data: struct {
														Path      string `json:"path"`
														Error     string `json:"error"`
														RequestId string `json:"requestId,omitempty"`
													}{
														Path:      fileListData.Path,
														Error:     "网络传输失败，请重试",
														RequestId: fileListData.RequestId,
													},
												}
												if errorBytes, marshalErr := json.Marshal(errorResponse); marshalErr == nil {
													wsConn.SetWriteDeadline(time.Now().Add(5 * time.Second))
													wsConn.WriteMessage(websocket.TextMessage, errorBytes)
												}
											}
										} else {
											log.Printf("序列化响应失败")
										}
									}()
								} else {
									log.Printf("不是SSH终端，无法处理文件列表请求")
									response := struct {
										Type string `json:"type"`
										Data struct {
											Path      string `json:"path"`
											Error     string `json:"error"`
											RequestId string `json:"requestId,omitempty"`
										} `json:"data"`
									}{
										Type: "file_list_response",
										Data: struct {
											Path      string `json:"path"`
											Error     string `json:"error"`
											RequestId string `json:"requestId,omitempty"`
										}{
											Path:      fileListData.Path,
											Error:     "仅SSH终端支持文件列表功能",
											RequestId: fileListData.RequestId,
										},
									}
									if responseBytes, err := json.Marshal(response); err == nil {
										wsConn.WriteMessage(websocket.TextMessage, responseBytes)
									}
								}
							} else {
								log.Printf("解析文件列表请求数据失败: %v", err)
							}
						case "resize":
							// 支持两种不同格式的调整大小命令
							// 1. {type: "resize", width: X, height: Y}
							// 2. {type: "resize", cols: X, rows: Y}
							var resizeData struct {
								Width  int `json:"width"`
								Height int `json:"height"`
								Cols   int `json:"cols"`
								Rows   int `json:"rows"`
							}

							if err := json.Unmarshal(cmd.Data, &resizeData); err == nil {
								// 优先使用cols/rows格式
								if resizeData.Cols > 0 && resizeData.Rows > 0 {
									log.Printf("收到终端调整大小命令: 列=%d, 行=%d",
										resizeData.Cols, resizeData.Rows)
									terminal.WindowResize(uint16(resizeData.Rows), uint16(resizeData.Cols))
								} else if resizeData.Width > 0 && resizeData.Height > 0 {
									// 兼容width/height格式
									log.Printf("收到终端调整大小命令: 宽度=%d, 高度=%d",
										resizeData.Width, resizeData.Height)
									terminal.WindowResize(uint16(resizeData.Height), uint16(resizeData.Width))
								} else {
									log.Printf("收到的调整大小命令数据不完整: %+v", resizeData)
								}
							} else {
								log.Printf("解析调整大小命令失败: %v, 原始消息: %s", err, string(cmd.Data))
							}
						case "file_view":
							// 处理文件查看请求
							var fileViewData struct {
								Path      string `json:"path"`
								RequestId string `json:"requestId,omitempty"`
								FileType  string `json:"fileType,omitempty"`
								MaxSize   int64  `json:"maxSize,omitempty"`
							}
							if err := json.Unmarshal(cmd.Data, &fileViewData); err == nil {
								log.Printf("收到文件查看请求: 路径=%s, 请求ID=%s, 文件类型=%s",
									fileViewData.Path, fileViewData.RequestId, fileViewData.FileType)

								// 检查是否是SSH终端
								if sshTerminal, ok := terminal.(*service.SSHTerminalSession); ok {
									// 检查命令处理器是否可用
									commandHandler := sshTerminal.GetCommandHandler()
									if commandHandler == nil {
										log.Printf("SSH命令处理器不可用")
										h.sendFileViewError(wsConn, fileViewData.RequestId, "SSH命令处理器不可用")
										return
									}

									// 使用SSH命令处理器获取文件内容
									go func() {
										fileViewResp, err := commandHandler.ExecuteFileViewCommand(fileViewData.Path, fileViewData.FileType, fileViewData.MaxSize)

										if err != nil {
											log.Printf("执行文件查看命令失败: %v", err)
											h.sendFileViewError(wsConn, fileViewData.RequestId, fmt.Sprintf("命令执行失败: %v", err))
										} else {
											// 发送成功响应
											h.sendFileViewResponse(wsConn, fileViewData.RequestId, fileViewResp)
										}
									}()
								} else {
									log.Printf("不是SSH终端，无法处理文件查看请求")
									h.sendFileViewError(wsConn, fileViewData.RequestId, "仅SSH终端支持文件查看功能")
								}
							} else {
								log.Printf("解析文件查看请求数据失败: %v", err)
								h.sendFileViewError(wsConn, fileViewData.RequestId, "请求数据格式错误")
							}
						case "file_save":
							// 处理文件保存请求
							var fileSaveData struct {
								Path      string `json:"path"`
								Content   string `json:"content"`
								RequestId string `json:"requestId,omitempty"`
								Encoding  string `json:"encoding,omitempty"`
							}
							if err := json.Unmarshal(cmd.Data, &fileSaveData); err == nil {
								log.Printf("收到文件保存请求: 路径=%s, 请求ID=%s, 编码=%s, 内容长度=%d",
									fileSaveData.Path, fileSaveData.RequestId, fileSaveData.Encoding, len(fileSaveData.Content))

								// 检查是否是SSH终端
								if sshTerminal, ok := terminal.(*service.SSHTerminalSession); ok {
									// 检查命令处理器是否可用
									commandHandler := sshTerminal.GetCommandHandler()
									if commandHandler == nil {
										log.Printf("SSH命令处理器不可用")
										h.sendFileSaveError(wsConn, fileSaveData.RequestId, "SSH命令处理器不可用")
										return
									}

									// 使用SSH命令处理器保存文件
									go func() {
										err := commandHandler.ExecuteFileSaveCommand(fileSaveData.Path, fileSaveData.Content, fileSaveData.Encoding)

										if err != nil {
											log.Printf("执行文件保存命令失败: %v", err)
											h.sendFileSaveError(wsConn, fileSaveData.RequestId, fmt.Sprintf("文件保存失败: %v", err))
										} else {
											log.Printf("文件保存成功: %s", fileSaveData.Path)
											h.sendFileSaveResponse(wsConn, fileSaveData.RequestId)
										}
									}()
								} else {
									log.Printf("不是SSH终端，无法处理文件保存请求")
									h.sendFileSaveError(wsConn, fileSaveData.RequestId, "仅SSH终端支持文件保存功能")
								}
							} else {
								log.Printf("解析文件保存请求数据失败: %v", err)
								h.sendFileSaveError(wsConn, fileSaveData.RequestId, "请求数据格式错误")
							}
						case "file_create":
							// 处理文件创建请求
							var fileCreateData struct {
								Path      string `json:"path"`
								Content   string `json:"content,omitempty"`
								RequestId string `json:"requestId,omitempty"`
							}
							if err := json.Unmarshal(cmd.Data, &fileCreateData); err == nil {
								log.Printf("收到文件创建请求: 路径=%s, 请求ID=%s, 内容长度=%d",
									fileCreateData.Path, fileCreateData.RequestId, len(fileCreateData.Content))

								// 检查是否是SSH终端
								if sshTerminal, ok := terminal.(*service.SSHTerminalSession); ok {
									// 检查命令处理器是否可用
									commandHandler := sshTerminal.GetCommandHandler()
									if commandHandler == nil {
										log.Printf("SSH命令处理器不可用")
										h.sendFileCreateError(wsConn, fileCreateData.RequestId, "SSH命令处理器不可用")
										return
									}

									// 使用SSH命令处理器创建文件
									go func() {
										err := commandHandler.ExecuteFileCreateCommand(fileCreateData.Path, fileCreateData.Content)

										if err != nil {
											log.Printf("执行文件创建命令失败: %v", err)
											h.sendFileCreateError(wsConn, fileCreateData.RequestId, fmt.Sprintf("文件创建失败: %v", err))
										} else {
											log.Printf("文件创建成功: %s", fileCreateData.Path)
											h.sendFileCreateResponse(wsConn, fileCreateData.RequestId)
										}
									}()
								} else {
									log.Printf("不是SSH终端，无法处理文件创建请求")
									h.sendFileCreateError(wsConn, fileCreateData.RequestId, "仅SSH终端支持文件创建功能")
								}
							} else {
								log.Printf("解析文件创建请求数据失败: %v", err)
								h.sendFileCreateError(wsConn, fileCreateData.RequestId, "请求数据格式错误")
							}
						case "folder_create":
							// 处理文件夹创建请求
							var folderCreateData struct {
								Path      string `json:"path"`
								RequestId string `json:"requestId,omitempty"`
							}
							if err := json.Unmarshal(cmd.Data, &folderCreateData); err == nil {
								log.Printf("收到文件夹创建请求: 路径=%s, 请求ID=%s",
									folderCreateData.Path, folderCreateData.RequestId)

								// 检查是否是SSH终端
								if sshTerminal, ok := terminal.(*service.SSHTerminalSession); ok {
									// 检查命令处理器是否可用
									commandHandler := sshTerminal.GetCommandHandler()
									if commandHandler == nil {
										log.Printf("SSH命令处理器不可用")
										h.sendFolderCreateError(wsConn, folderCreateData.RequestId, "SSH命令处理器不可用")
										return
									}

									// 使用SSH命令处理器创建文件夹
									go func() {
										err := commandHandler.ExecuteFolderCreateCommand(folderCreateData.Path)

										if err != nil {
											log.Printf("执行文件夹创建命令失败: %v", err)
											h.sendFolderCreateError(wsConn, folderCreateData.RequestId, fmt.Sprintf("文件夹创建失败: %v", err))
										} else {
											log.Printf("文件夹创建成功: %s", folderCreateData.Path)
											h.sendFolderCreateResponse(wsConn, folderCreateData.RequestId)
										}
									}()
								} else {
									log.Printf("不是SSH终端，无法处理文件夹创建请求")
									h.sendFolderCreateError(wsConn, folderCreateData.RequestId, "仅SSH终端支持文件夹创建功能")
								}
							} else {
								log.Printf("解析文件夹创建请求数据失败: %v", err)
								h.sendFolderCreateError(wsConn, folderCreateData.RequestId, "请求数据格式错误")
							}
						case "file_upload":
							// 处理文件上传请求
							var fileUploadData struct {
								Path        string `json:"path"`
								FileName    string `json:"fileName"`
								Content     string `json:"content"`     // base64编码的文件内容
								TotalSize   int64  `json:"totalSize"`   // 文件总大小
								ChunkIndex  int    `json:"chunkIndex"`  // 当前分片索引
								TotalChunks int    `json:"totalChunks"` // 总分片数
								RequestId   string `json:"requestId,omitempty"`
							}
							if err := json.Unmarshal(cmd.Data, &fileUploadData); err == nil {
								log.Printf("收到文件上传请求: 路径=%s, 文件名=%s, 分片=%d/%d, 总大小=%d, 请求ID=%s",
									fileUploadData.Path, fileUploadData.FileName, fileUploadData.ChunkIndex+1,
									fileUploadData.TotalChunks, fileUploadData.TotalSize, fileUploadData.RequestId)

								// 解码base64内容
								content, err := base64.StdEncoding.DecodeString(fileUploadData.Content)
								if err != nil {
									log.Printf("解码文件内容失败: %v", err)
									h.sendFileUploadError(wsConn, fileUploadData.RequestId, "文件内容解码失败")
									continue
								}

								// 检查是否是SSH终端
								if sshTerminal, ok := terminal.(*service.SSHTerminalSession); ok {
									// 检查命令处理器是否可用
									commandHandler := sshTerminal.GetCommandHandler()
									if commandHandler == nil {
										log.Printf("SSH命令处理器不可用")
										h.sendFileUploadError(wsConn, fileUploadData.RequestId, "SSH命令处理器不可用")
										continue
									}

									// 异步执行文件上传命令
									go func() {
										err := commandHandler.ExecuteFileUploadCommand(
											fileUploadData.Path,
											content,
											fileUploadData.FileName,
											fileUploadData.TotalSize,
											fileUploadData.ChunkIndex,
											fileUploadData.TotalChunks,
										)

										if err != nil {
											log.Printf("文件上传失败: %v", err)
											h.sendFileUploadError(wsConn, fileUploadData.RequestId, fmt.Sprintf("上传失败: %v", err))
										} else {
											log.Printf("文件分片上传成功")
											h.sendFileUploadResponse(wsConn, fileUploadData.RequestId, fileUploadData.ChunkIndex, fileUploadData.TotalChunks)
										}
									}()
								} else {
									log.Printf("不是SSH终端，无法处理文件上传请求")
									h.sendFileUploadError(wsConn, fileUploadData.RequestId, "仅SSH终端支持文件上传功能")
								}
							} else {
								log.Printf("解析文件上传请求数据失败: %v", err)
								h.sendFileUploadError(wsConn, fileUploadData.RequestId, "请求数据格式错误")
							}
						case "screenshot":
							log.Printf("收到屏幕截图请求")
							// 将截图请求传递给终端处理
							n, err := terminal.Write(p)
							if err != nil {
								log.Printf("写入终端屏幕截图请求错误: %v", err)
								errChan <- err
							} else {
								log.Printf("屏幕截图请求已传递给终端: %d字节", n)
							}
						default:
							// 其他命令直接传递给终端
							log.Printf("将JSON命令传递给终端: %s", cmd.Type)
							n, err := terminal.Write(p)
							if err != nil {
								log.Printf("写入终端错误: %v", err)
								errChan <- err
							} else {
								log.Printf("写入终端成功: %d/%d 字节", n, len(p))
							}
						}
					} else {
						// 非JSON格式文本，直接传递
						log.Printf("非JSON格式文本，直接传递给终端")
						n, err := terminal.Write(p)
						if err != nil {
							log.Printf("写入终端错误: %v", err)
							errChan <- err
						} else {
							log.Printf("写入终端成功: %d/%d 字节", n, len(p))
						}
					}
				} else {
					// 非JSON格式文本，直接传递
					log.Printf("非JSON格式文本，直接传递给终端")
					n, err := terminal.Write(p)
					if err != nil {
						log.Printf("写入终端错误: %v", err)
						errChan <- err
					} else {
						log.Printf("写入终端成功: %d/%d 字节", n, len(p))
					}
				}
			} else if messageType == websocket.BinaryMessage {
				// 二进制消息处理
				log.Printf("收到二进制消息: %d字节，前几个字节值: %v", len(p), p[:min(len(p), 16)])

				// 将二进制数据直接传递给终端
				n, err := terminal.Write(p)
				if err != nil {
					log.Printf("写入终端错误: %v", err)
					errChan <- err
					return
				}
				log.Printf("二进制数据写入终端成功: %d/%d 字节", n, len(p))
			}
		}
	}()

	// 从终端读取数据并写入WebSocket
	go func() {
		defer once.Do(func() {
			log.Printf("终端读取协程结束")
			close(done)
		})

		log.Printf("启动终端读取协程")

		buf := make([]byte, 1024*1024*2) // 增加缓冲区大小到2MB以处理大型图形数据
		for {
			// 设置读取截止时间
			deadline := time.Now().Add(30 * time.Second)
			if err := wsConn.SetReadDeadline(deadline); err != nil {
				log.Printf("设置WebSocket写入超时失败: %v", err)
			}

			n, err := terminal.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("读取终端输出错误: %v", err)
					errChan <- err
				} else {
					log.Printf("终端连接已关闭 (EOF)")
					errChan <- err
				}
				return
			}

			// 更新活动时间
			select {
			case activeChan <- struct{}{}:
			default:
			}

			// 声明特殊命令变量，初始化为nil
			var specialCommand *service.SpecialCommandInfo

			if n > 0 {
				log.Printf("从终端读取了 %d 字节数据", n)

				// 检查数据前缀用于调试
				if n > 4 {
					prefix := string(buf[:min(4, n)])
					log.Printf("终端数据前缀: %s", prefix)

					// 对于图形协议消息，记录更详细的信息
					if prefix == "RDP_" || prefix == "VNC_" {
						parts := bytes.SplitN(buf[:n], []byte(":"), 2)
						if len(parts) > 0 {
							msgType := string(parts[0])
							log.Printf("终端输出图形消息: 类型=%s, 总长度=%d字节", msgType, n)

							// 对于屏幕截图消息，额外记录信息
							if msgType == "RDP_SCREENSHOT" || msgType == "VNC_SCREENSHOT" {
								parts := bytes.SplitN(buf[:n], []byte(":"), 4)
								if len(parts) >= 4 {
									width := string(parts[1])
									height := string(parts[2])
									dataLen := n - len(parts[0]) - len(parts[1]) - len(parts[2]) - 3 // 减去分隔符的长度
									log.Printf("屏幕截图数据: 类型=%s, 宽度=%s, 高度=%s, 数据长度=%d字节",
										msgType, width, height, dataLen)
								}
							}
						}
					} else if n < 100 {
						// 对于小型非图形数据，记录全部内容
						log.Printf("终端输出文本内容: %s", string(buf[:n]))
					}

					// 检测特殊命令（仅对文本输出）
					// 只对非图形协议的文本输出进行特殊命令检测
					if prefix != "RDP_" && prefix != "VNC_" {
						outputText := string(buf[:n])
						specialCommand = h.specialDetector.DetectSpecialCommand(outputText)
						if specialCommand.Type != service.SpecialCommandNormal {
							log.Printf("检测到特殊命令: 类型=%s, 提示=%s, 掩码=%v",
								specialCommand.Type, specialCommand.Prompt, specialCommand.Masked)
						}
					}
				}
			}

			// 确定发送的消息类型
			msgType := websocket.BinaryMessage

			// 对于图形协议，使用文本消息传输特定前缀的数据
			if n > 4 {
				prefix := string(buf[:min(4, n)])
				if prefix == "RDP_" || prefix == "VNC_" {
					msgType = websocket.TextMessage
					log.Printf("使用文本消息类型发送图形协议数据: %s...", prefix)
				}
			}

			// 尝试使用二进制协议发送数据
			var finalData []byte
			var finalMsgType int
			var protocolUsed bool

			// 准备发送的数据 - 先尝试使用二进制协议包装
			metadata := map[string]interface{}{
				"type": "terminal-output",
				"size": n,
			}

			// 检查是否为图形协议
			if n > 4 {
				prefix := string(buf[:min(4, n)])
				if prefix == "RDP_" || prefix == "VNC_" {
					metadata["protocol"] = strings.ToLower(prefix[:3])
					metadata["graphic"] = true
				}
			}

			// 如果检测到特殊命令，添加特殊信息
			if specialCommand != nil && specialCommand.Type != service.SpecialCommandNormal {
				metadata["special"] = map[string]interface{}{
					"type":        string(specialCommand.Type),
					"prompt":      specialCommand.Prompt,
					"masked":      specialCommand.Masked,
					"expectInput": specialCommand.ExpectInput,
					"timeout":     specialCommand.Timeout,
					"description": specialCommand.Description,
				}
			}

			// 尝试使用二进制协议编码
			if encodedData, err := h.binaryProtocol.EncodeMessage(metadata, buf[:n], service.CompressionNone); err == nil {
				finalData = encodedData
				finalMsgType = websocket.BinaryMessage
				protocolUsed = true
				log.Printf("使用二进制协议发送数据: 原始大小=%d, 编码后大小=%d", n, len(encodedData))
				if specialCommand != nil && specialCommand.Type != service.SpecialCommandNormal {
					log.Printf("包含特殊命令信息: %s", specialCommand.Type)
				}
			} else {
				log.Printf("二进制协议编码失败，回退到原始方式: %v", err)
			}

			// 如果二进制协议失败或不适用，使用原始方式
			if !protocolUsed {
				finalData = buf[:n]
				finalMsgType = msgType
			}

			// 设置写入超时
			wsConn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := wsConn.WriteMessage(finalMsgType, finalData); err != nil {
				log.Printf("写入WebSocket错误: %v", err)
				errChan <- err
				return
			}

			if protocolUsed {
				log.Printf("成功发送 %d 字节二进制协议数据到WebSocket客户端（原始数据 %d 字节）", len(finalData), n)
			} else {
				log.Printf("成功发送 %d 字节数据到WebSocket客户端", n)
			}
		}
	}()

	// 监控循环
	log.Printf("启动监控循环...")
	for {
		select {
		case <-done:
			log.Printf("终端会话处理已完成")
			return
		case err := <-errChan:
			log.Printf("检测到错误: %v，正在关闭会话", err)
			return
		case <-activeChan:
			// 更新最后活动时间
			lastActivity = time.Now()
		case <-activityTimer.C:
			// 检查是否超时
			if time.Since(lastActivity) > timeout {
				log.Printf("会话超时: 超过 %v 无活动，正在关闭", timeout)
				wsConn.WriteMessage(websocket.TextMessage, []byte("会话超时，连接将被关闭"))
				return
			}
		case <-pingTimer.C:
			// 发送ping检测连接状态
			log.Printf("发送ping检测连接状态")
			wsConn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := wsConn.WriteMessage(websocket.PingMessage, []byte("ping")); err != nil {
				log.Printf("发送ping失败，连接可能已断开: %v", err)
				return
			}
		}
	}
}

// sendSegmentedResponse 发送分段响应
func (h *ConnectionHandler) sendSegmentedResponse(wsConn *websocket.Conn, data []byte, requestId string) error {
	const segmentSize = 16384 // 16KB 每段，更保守的大小
	totalSize := len(data)
	totalSegments := (totalSize + segmentSize - 1) / segmentSize // 向上取整

	log.Printf("开始分段传输: 总大小=%d字节, 分段大小=%d字节, 总分段数=%d", totalSize, segmentSize, totalSegments)

	for i := 0; i < totalSegments; i++ {
		start := i * segmentSize
		end := start + segmentSize
		if end > totalSize {
			end = totalSize
		}

		segmentData := data[start:end]
		isComplete := (i == totalSegments-1)

		// 构建分段消息
		segmentMessage := struct {
			Type string `json:"type"`
			Data struct {
				RequestId     string `json:"requestId"`
				SegmentId     int    `json:"segmentId"`
				TotalSegments int    `json:"totalSegments"`
				Data          string `json:"data"`
				IsComplete    bool   `json:"isComplete"`
			} `json:"data"`
		}{
			Type: "file_list_segment",
			Data: struct {
				RequestId     string `json:"requestId"`
				SegmentId     int    `json:"segmentId"`
				TotalSegments int    `json:"totalSegments"`
				Data          string `json:"data"`
				IsComplete    bool   `json:"isComplete"`
			}{
				RequestId:     requestId,
				SegmentId:     i,
				TotalSegments: totalSegments,
				Data:          string(segmentData),
				IsComplete:    isComplete,
			},
		}

		segmentBytes, err := json.Marshal(segmentMessage)
		if err != nil {
			return fmt.Errorf("序列化分段消息失败: %v", err)
		}

		// 检查WebSocket连接状态
		if wsConn == nil {
			return fmt.Errorf("WebSocket连接为空")
		}

		// 设置写入超时
		writeTimeout := 10 * time.Second
		wsConn.SetWriteDeadline(time.Now().Add(writeTimeout))

		// 发送分段消息
		log.Printf("发送分段 %d/%d: 数据长度=%d字节", i+1, totalSegments, len(segmentData))
		err = wsConn.WriteMessage(websocket.TextMessage, segmentBytes)
		if err != nil {
			log.Printf("发送分段 %d 失败: %v", i, err)
			return fmt.Errorf("发送分段 %d 失败: %v", i, err)
		}

		// 在分段之间添加延迟，防止网络拥塞
		if i < totalSegments-1 {
			time.Sleep(50 * time.Millisecond) // 增加延迟到50ms
		}
	}

	log.Printf("分段传输完成: 共发送 %d 个分段", totalSegments)
	return nil
}

// sendFileListResponse 统一的文件列表响应发送方法
func (h *ConnectionHandler) sendFileListResponse(wsConn *websocket.Conn, responseBytes []byte, requestId string, fileCount int) error {
	if wsConn == nil {
		return fmt.Errorf("WebSocket连接为空")
	}

	log.Printf("准备发送文件列表响应，文件数量: %d, 请求ID: %s, 响应大小: %d字节",
		fileCount, requestId, len(responseBytes))

	// 检查WebSocket连接状态
	if wsConn.UnderlyingConn() == nil {
		log.Printf("WebSocket底层连接已断开")
		return fmt.Errorf("WebSocket底层连接已断开")
	}

	// 设置阈值：对于小数据也使用分段，避免网络问题
	const maxDirectSize = 8192 // 8KB 阈值，更保守

	if len(responseBytes) > maxDirectSize {
		// 使用分段传输
		log.Printf("响应数据较大 (%d 字节)，使用分段传输", len(responseBytes))
		return h.sendSegmentedResponse(wsConn, responseBytes, requestId)
	} else {
		// 直接发送，但增加重试机制
		log.Printf("使用直接传输，数据大小: %d 字节", len(responseBytes))

		maxRetries := 3
		for attempt := 1; attempt <= maxRetries; attempt++ {
			// 设置写入超时
			writeTimeout := 15 * time.Second
			wsConn.SetWriteDeadline(time.Now().Add(writeTimeout))

			err := wsConn.WriteMessage(websocket.TextMessage, responseBytes)
			if err == nil {
				log.Printf("文件列表响应发送成功 (尝试 %d/%d)", attempt, maxRetries)
				return nil
			}

			log.Printf("发送失败 (尝试 %d/%d): %v", attempt, maxRetries, err)

			if attempt < maxRetries {
				// 等待后重试
				time.Sleep(time.Duration(attempt*500) * time.Millisecond)
				log.Printf("等待 %d 毫秒后重试...", attempt*500)
			}
		}

		log.Printf("直接发送失败，转为分段传输")
		return h.sendSegmentedResponse(wsConn, responseBytes, requestId)
	}
}

// sendFileViewResponse 发送文件查看成功响应
func (h *ConnectionHandler) sendFileViewResponse(wsConn *websocket.Conn, requestId string, fileViewResp *service.FileViewResponse) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			FileType  string `json:"fileType"`
			Content   string `json:"content"`
			Encoding  string `json:"encoding,omitempty"`
			MimeType  string `json:"mimeType,omitempty"`
			Error     string `json:"error,omitempty"`
		} `json:"data"`
	}{
		Type: "file_view_response",
		Data: struct {
			RequestId string `json:"requestId"`
			FileType  string `json:"fileType"`
			Content   string `json:"content"`
			Encoding  string `json:"encoding,omitempty"`
			MimeType  string `json:"mimeType,omitempty"`
			Error     string `json:"error,omitempty"`
		}{
			RequestId: requestId,
			FileType:  fileViewResp.FileType,
			Content:   fileViewResp.Content,
			Encoding:  fileViewResp.Encoding,
			MimeType:  fileViewResp.MimeType,
			Error:     fileViewResp.Error,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件查看响应失败: %v", err)
		h.sendFileViewError(wsConn, requestId, "序列化响应失败")
		return
	}

	// 对于大文件也使用分段传输
	const maxDirectSize = 8192
	if len(responseBytes) > maxDirectSize {
		log.Printf("文件查看响应数据较大 (%d 字节)，使用分段传输", len(responseBytes))
		if err := h.sendSegmentedFileViewResponse(wsConn, responseBytes, requestId); err != nil {
			log.Printf("分段发送文件查看响应失败: %v", err)
			h.sendFileViewError(wsConn, requestId, "传输失败")
		}
	} else {
		// 直接发送
		wsConn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
			log.Printf("发送文件查看响应失败: %v", err)
			h.sendFileViewError(wsConn, requestId, "网络传输失败")
		} else {
			log.Printf("文件查看响应发送成功，请求ID: %s", requestId)
		}
	}
}

// sendFileViewError 发送文件查看错误响应
func (h *ConnectionHandler) sendFileViewError(wsConn *websocket.Conn, requestId string, errorMsg string) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			FileType  string `json:"fileType"`
			Content   string `json:"content"`
			Error     string `json:"error"`
		} `json:"data"`
	}{
		Type: "file_view_response",
		Data: struct {
			RequestId string `json:"requestId"`
			FileType  string `json:"fileType"`
			Content   string `json:"content"`
			Error     string `json:"error"`
		}{
			RequestId: requestId,
			FileType:  "",
			Content:   "",
			Error:     errorMsg,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件查看错误响应失败: %v", err)
		return
	}

	wsConn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件查看错误响应失败: %v", err)
	} else {
		log.Printf("文件查看错误响应发送成功，请求ID: %s, 错误: %s", requestId, errorMsg)
	}
}

// sendSegmentedFileViewResponse 发送分段的文件查看响应
func (h *ConnectionHandler) sendSegmentedFileViewResponse(wsConn *websocket.Conn, data []byte, requestId string) error {
	const segmentSize = 16384 // 16KB 每段
	totalSize := len(data)
	totalSegments := (totalSize + segmentSize - 1) / segmentSize

	log.Printf("开始分段传输文件查看响应: 总大小=%d字节, 分段大小=%d字节, 总分段数=%d", totalSize, segmentSize, totalSegments)

	for i := 0; i < totalSegments; i++ {
		start := i * segmentSize
		end := start + segmentSize
		if end > totalSize {
			end = totalSize
		}

		segmentData := data[start:end]
		isComplete := (i == totalSegments-1)

		// 构建分段消息
		segmentMessage := struct {
			Type string `json:"type"`
			Data struct {
				RequestId     string `json:"requestId"`
				SegmentId     int    `json:"segmentId"`
				TotalSegments int    `json:"totalSegments"`
				Data          string `json:"data"`
				IsComplete    bool   `json:"isComplete"`
			} `json:"data"`
		}{
			Type: "file_view_segment",
			Data: struct {
				RequestId     string `json:"requestId"`
				SegmentId     int    `json:"segmentId"`
				TotalSegments int    `json:"totalSegments"`
				Data          string `json:"data"`
				IsComplete    bool   `json:"isComplete"`
			}{
				RequestId:     requestId,
				SegmentId:     i,
				TotalSegments: totalSegments,
				Data:          string(segmentData),
				IsComplete:    isComplete,
			},
		}

		segmentBytes, err := json.Marshal(segmentMessage)
		if err != nil {
			return fmt.Errorf("序列化文件查看分段消息失败: %v", err)
		}

		// 设置写入超时
		wsConn.SetWriteDeadline(time.Now().Add(10 * time.Second))

		// 发送分段消息
		log.Printf("发送文件查看分段 %d/%d: 数据长度=%d字节", i+1, totalSegments, len(segmentData))
		err = wsConn.WriteMessage(websocket.TextMessage, segmentBytes)
		if err != nil {
			log.Printf("发送文件查看分段 %d 失败: %v", i, err)
			return fmt.Errorf("发送文件查看分段 %d 失败: %v", i, err)
		}

		// 在分段之间添加延迟，防止网络拥塞
		if i < totalSegments-1 {
			time.Sleep(50 * time.Millisecond)
		}
	}

	log.Printf("文件查看分段传输完成: 共发送 %d 个分段", totalSegments)
	return nil
}

// min 返回两个整数中的较小值（Go 1.14+已内置此函数，兼容早期版本）
// sendFileSaveResponse 发送文件保存成功响应
func (h *ConnectionHandler) sendFileSaveResponse(wsConn *websocket.Conn, requestId string) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
		} `json:"data"`
	}{
		Type: "file_save_response",
		Data: struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
		}{
			RequestId: requestId,
			Success:   true,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件保存响应失败: %v", err)
		return
	}

	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件保存响应失败: %v", err)
	} else {
		log.Printf("文件保存响应发送成功: %s", requestId)
	}
}

// sendFileSaveError 发送文件保存错误响应
func (h *ConnectionHandler) sendFileSaveError(wsConn *websocket.Conn, requestId string, errorMsg string) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
			Error     string `json:"error"`
		} `json:"data"`
	}{
		Type: "file_save_response",
		Data: struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
			Error     string `json:"error"`
		}{
			RequestId: requestId,
			Success:   false,
			Error:     errorMsg,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件保存错误响应失败: %v", err)
		return
	}

	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件保存错误响应失败: %v", err)
	} else {
		log.Printf("文件保存错误响应发送成功: %s - %s", requestId, errorMsg)
	}
}

// sendFileCreateResponse 发送文件创建成功响应
func (h *ConnectionHandler) sendFileCreateResponse(wsConn *websocket.Conn, requestId string) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
		} `json:"data"`
	}{
		Type: "file_create_response",
		Data: struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
		}{
			RequestId: requestId,
			Success:   true,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件创建响应失败: %v", err)
		return
	}

	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件创建响应失败: %v", err)
	} else {
		log.Printf("文件创建响应发送成功: %s", requestId)
	}
}

// sendFileCreateError 发送文件创建错误响应
func (h *ConnectionHandler) sendFileCreateError(wsConn *websocket.Conn, requestId string, errorMsg string) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
			Error     string `json:"error"`
		} `json:"data"`
	}{
		Type: "file_create_response",
		Data: struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
			Error     string `json:"error"`
		}{
			RequestId: requestId,
			Success:   false,
			Error:     errorMsg,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件创建错误响应失败: %v", err)
		return
	}

	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件创建错误响应失败: %v", err)
	} else {
		log.Printf("文件创建错误响应发送成功: %s - %s", requestId, errorMsg)
	}
}

// sendFolderCreateResponse 发送文件夹创建成功响应
func (h *ConnectionHandler) sendFolderCreateResponse(wsConn *websocket.Conn, requestId string) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
		} `json:"data"`
	}{
		Type: "folder_create_response",
		Data: struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
		}{
			RequestId: requestId,
			Success:   true,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件夹创建响应失败: %v", err)
		return
	}

	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件夹创建响应失败: %v", err)
	} else {
		log.Printf("文件夹创建响应发送成功: %s", requestId)
	}
}

// sendFolderCreateError 发送文件夹创建错误响应
func (h *ConnectionHandler) sendFolderCreateError(wsConn *websocket.Conn, requestId string, errorMsg string) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
			Error     string `json:"error"`
		} `json:"data"`
	}{
		Type: "folder_create_response",
		Data: struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
			Error     string `json:"error"`
		}{
			RequestId: requestId,
			Success:   false,
			Error:     errorMsg,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件夹创建错误响应失败: %v", err)
		return
	}

	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件夹创建错误响应失败: %v", err)
	} else {
		log.Printf("文件夹创建错误响应发送成功: %s - %s", requestId, errorMsg)
	}
}

// sendFileUploadResponse 发送文件上传成功响应
func (h *ConnectionHandler) sendFileUploadResponse(wsConn *websocket.Conn, requestId string, chunkIndex int, totalChunks int) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId   string  `json:"requestId"`
			Success     bool    `json:"success"`
			ChunkIndex  int     `json:"chunkIndex"`
			TotalChunks int     `json:"totalChunks"`
			Progress    float64 `json:"progress"`
			IsComplete  bool    `json:"isComplete"`
		} `json:"data"`
	}{
		Type: "file_upload_response",
		Data: struct {
			RequestId   string  `json:"requestId"`
			Success     bool    `json:"success"`
			ChunkIndex  int     `json:"chunkIndex"`
			TotalChunks int     `json:"totalChunks"`
			Progress    float64 `json:"progress"`
			IsComplete  bool    `json:"isComplete"`
		}{
			RequestId:   requestId,
			Success:     true,
			ChunkIndex:  chunkIndex,
			TotalChunks: totalChunks,
			Progress:    float64(chunkIndex+1) / float64(totalChunks) * 100,
			IsComplete:  chunkIndex+1 >= totalChunks,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件上传响应失败: %v", err)
		return
	}

	// 检查WebSocket连接状态
	if wsConn == nil {
		log.Printf("WebSocket连接为空，无法发送文件上传响应")
		return
	}

	// 设置写入超时
	wsConn.SetWriteDeadline(time.Now().Add(5 * time.Second))

	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件上传响应失败: %v", err)
		// 连接可能已断开，记录但不要抛出错误
	} else {
		log.Printf("文件上传响应已发送: 分片 %d/%d, 进度: %.1f%%",
			chunkIndex+1, totalChunks, float64(chunkIndex+1)/float64(totalChunks)*100)
	}
}

// sendFileUploadError 发送文件上传错误响应
func (h *ConnectionHandler) sendFileUploadError(wsConn *websocket.Conn, requestId string, errorMsg string) {
	response := struct {
		Type string `json:"type"`
		Data struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
			Error     string `json:"error"`
		} `json:"data"`
	}{
		Type: "file_upload_response",
		Data: struct {
			RequestId string `json:"requestId"`
			Success   bool   `json:"success"`
			Error     string `json:"error"`
		}{
			RequestId: requestId,
			Success:   false,
			Error:     errorMsg,
		},
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		log.Printf("序列化文件上传错误响应失败: %v", err)
		return
	}

	// 检查WebSocket连接状态
	if wsConn == nil {
		log.Printf("WebSocket连接为空，无法发送文件上传错误响应")
		return
	}

	// 设置较短的写入超时，避免长时间阻塞
	wsConn.SetWriteDeadline(time.Now().Add(3 * time.Second))

	if err := wsConn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		log.Printf("发送文件上传错误响应失败: %v", err)
		// 连接可能已断开，记录但不要抛出错误
	} else {
		log.Printf("文件上传错误响应已发送: %s", errorMsg)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

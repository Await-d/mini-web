package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"

	"gitee.com/await29/mini-web/internal/middleware"
	"gitee.com/await29/mini-web/internal/model"
	"gitee.com/await29/mini-web/internal/service"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// 添加WebSocket升级器
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// 在生产环境中应该检查来源
		return true
	},
}

// ConnectionHandler 连接处理器
type ConnectionHandler struct {
	connService *service.ConnectionService
}

// NewConnectionHandler 创建连接处理器实例
func NewConnectionHandler(connService *service.ConnectionService) *ConnectionHandler {
	return &ConnectionHandler{connService: connService}
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
	
	// 配置简化的升级器 - 只用于测试基本连通性
	var upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			log.Printf("CheckOrigin被调用: Origin=%s", r.Header.Get("Origin"))
			return true // 允许所有来源
		},
	}
	
	// 简化逻辑：直接尝试升级WebSocket连接
	log.Printf("尝试直接升级WebSocket连接...")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("升级WebSocket连接失败: %v", err)
		return
	}
	defer conn.Close()
	
	// 发送测试消息并进入简单的回显模式
	log.Printf("WebSocket连接升级成功，进入回显模式")
	conn.WriteMessage(websocket.TextMessage, []byte("WebSocket连接成功！这是一个测试消息。"))
	
	// 简单的消息回显循环
	for {
		messageType, p, err := conn.ReadMessage()
		if err != nil {
			log.Printf("读取消息错误: %v", err)
			break
		}
		log.Printf("收到消息: %s", string(p))
		
		// 回显相同的消息
		if err := conn.WriteMessage(messageType, p); err != nil {
			log.Printf("发送消息错误: %v", err)
			break
		}
	}
	
	log.Printf("WebSocket连接已关闭")
	
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
	
	// 向终端发送一条消息以获取协议信息
	terminal.Write([]byte{0}) // 发送空消息
	
	// 从第一个响应中解析协议类型
	buf := make([]byte, 128)
	n, _ := terminal.Read(buf)
	// protocolInfo := string(buf[:n])  // 注释掉未使用的变量
	
	// 判断是否为图形协议
	isGraphical := false
	protocol := ""
	
	if n > 4 {
		prefix := string(buf[:4])
		if prefix == "RDP_" {
			isGraphical = true
			protocol = model.ProtocolRDP
		} else if prefix == "VNC_" {
			isGraphical = true
			protocol = model.ProtocolVNC
		}
	}
	
	log.Printf("处理终端会话: 协议=%s, 图形模式=%v", protocol, isGraphical)

	// 如果是图形协议，发送一个初始化消息
	if isGraphical {
		initMsg := struct {
			Type string `json:"type"`
			Protocol string `json:"protocol"`
		}{
			Type: "init",
			Protocol: protocol,
		}
		
		initData, _ := json.Marshal(initMsg)
		if err := wsConn.WriteMessage(websocket.TextMessage, initData); err != nil {
			log.Printf("发送初始化消息失败: %v", err)
		}
	}

	// 从WebSocket读取数据并写入终端
	go func() {
		defer once.Do(func() { close(done) })

		for {
			messageType, p, err := wsConn.ReadMessage()
			if err != nil {
				log.Printf("读取WebSocket消息错误: %v", err)
				return
			}

			if messageType == websocket.TextMessage || messageType == websocket.BinaryMessage {
				// 图形协议可能需要特殊处理
				if isGraphical && messageType == websocket.TextMessage {
					// 解析客户端命令
					var cmd struct {
						Type string `json:"type"`
						Data json.RawMessage `json:"data"`
					}
					
					if err := json.Unmarshal(p, &cmd); err == nil {
						log.Printf("收到图形协议命令: %s", cmd.Type)
						
						// 这里可以添加特殊命令处理
						switch cmd.Type {
						case "resize":
							var resizeData struct {
								Width int `json:"width"`
								Height int `json:"height"`
							}
							if err := json.Unmarshal(cmd.Data, &resizeData); err == nil {
								terminal.WindowResize(uint16(resizeData.Height), uint16(resizeData.Width))
							}
							continue // 处理过特殊命令后不再向终端写入
						}
					}
				}
				
				if _, err := terminal.Write(p); err != nil {
					log.Printf("写入终端错误: %v", err)
					return
				}
			}
		}
	}()

	// 从终端读取数据并写入WebSocket
	go func() {
		defer once.Do(func() { close(done) })

		buf := make([]byte, 16384) // 增加缓冲区大小以处理图形数据
		for {
			n, err := terminal.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("读取终端输出错误: %v", err)
				}
				return
			}
			
			// 确定发送的消息类型
			msgType := websocket.BinaryMessage
			
			// 对于图形协议，如果接收到的数据以特定前缀开始，使用文本消息
			if isGraphical && n > 4 {
				prefix := string(buf[:4])
				if prefix == "RDP_" || prefix == "VNC_" {
					msgType = websocket.TextMessage
				}
			}

			if err := wsConn.WriteMessage(msgType, buf[:n]); err != nil {
				log.Printf("写入WebSocket错误: %v", err)
				return
			}
		}
	}()

	// 等待结束
	<-done
}

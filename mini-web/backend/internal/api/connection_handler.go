package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
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
	errChan := make(chan error, 2) // 用于传递错误
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

			if messageType == websocket.TextMessage {
				// 文本消息处理
				if len(p) < 1000 {
					log.Printf("文本消息内容: %s", string(p))
				} else {
					log.Printf("文本消息内容过长，仅记录前1000字节: %s...", string(p[:1000]))
				}
				
				// 尝试解析JSON命令
				var cmd struct {
					Type string          `json:"type"`
					Data json.RawMessage `json:"data"`
				}
				
				if err := json.Unmarshal(p, &cmd); err == nil {
					log.Printf("解析JSON命令成功: %s", cmd.Type)
					
					// 处理特殊命令
					switch cmd.Type {
					case "resize":
						var resizeData struct {
							Width  int `json:"width"`
							Height int `json:"height"`
						}
						if err := json.Unmarshal(cmd.Data, &resizeData); err == nil {
							log.Printf("收到终端调整大小命令: 宽度=%d, 高度=%d", 
								resizeData.Width, resizeData.Height)
							terminal.WindowResize(uint16(resizeData.Height), uint16(resizeData.Width))
						} else {
							log.Printf("解析调整大小命令失败: %v", err)
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

			// 设置写入超时
			wsConn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := wsConn.WriteMessage(msgType, buf[:n]); err != nil {
				log.Printf("写入WebSocket错误: %v", err)
				errChan <- err
				return
			}
			
			log.Printf("成功发送 %d 字节数据到WebSocket客户端", n)
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
		}
	}
}

// min 返回两个整数中的较小值（Go 1.14+已内置此函数，兼容早期版本）
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

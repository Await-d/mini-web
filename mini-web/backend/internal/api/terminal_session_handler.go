package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	"gitee.com/await29/mini-web/internal/middleware"
	"gitee.com/await29/mini-web/internal/service"
)

// TerminalSessionHandler 终端会话处理器
type TerminalSessionHandler struct {
	connService    *service.ConnectionService
	sessionManager *service.TerminalSessionManager
}

// NewTerminalSessionHandler 创建终端会话处理器
func NewTerminalSessionHandler(connService *service.ConnectionService) *TerminalSessionHandler {
	return &TerminalSessionHandler{
		connService:    connService,
		sessionManager: service.GetTerminalSessionManager(),
	}
}

// CreateTerminalSession 创建终端会话
func (h *TerminalSessionHandler) CreateTerminalSession(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 解析请求参数
	var req struct {
		ConnectionID uint   `json:"connection_id"`
		Protocol     string `json:"protocol"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证连接是否存在且属于用户
	connectionInfo, err := h.connService.GetConnection(userID, req.ConnectionID)
	if err != nil {
		sendErrorResponse(w, http.StatusNotFound, "连接不存在")
		return
	}

	// 使用连接中的实际协议
	actualProtocol := connectionInfo.Protocol
	if req.Protocol != "" && req.Protocol != actualProtocol {
		log.Printf("警告: 请求协议(%s)与连接协议(%s)不匹配，使用连接协议", req.Protocol, actualProtocol)
	}

	// 创建终端会话
	session, err := h.sessionManager.CreateSession(userID, req.ConnectionID, actualProtocol)
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "创建会话失败: "+err.Error())
		return
	}

	// 返回会话信息
	response := map[string]interface{}{
		"session_id":    session.ID,
		"connection_id": session.ConnectionID,
		"protocol":      session.Protocol,
		"status":        session.Status,
		"created_at":    session.CreatedAt,
		"expires_at":    session.ExpiresAt,
	}

	sendSuccessResponse(w, "会话创建成功", response)
}

// GetTerminalSession 获取终端会话信息
func (h *TerminalSessionHandler) GetTerminalSession(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取会话ID
	vars := mux.Vars(r)
	sessionID := vars["id"]

	session, err := h.sessionManager.GetSession(sessionID)
	if err != nil {
		sendErrorResponse(w, http.StatusNotFound, "会话不存在")
		return
	}

	// 验证会话是否属于用户
	if session.UserID != userID {
		sendErrorResponse(w, http.StatusForbidden, "无权访问此会话")
		return
	}

	response := map[string]interface{}{
		"session_id":    session.ID,
		"connection_id": session.ConnectionID,
		"protocol":      session.Protocol,
		"status":        session.Status,
		"created_at":    session.CreatedAt,
		"last_active":   session.LastActiveAt,
		"expires_at":    session.ExpiresAt,
		"message_count": len(session.MessageHistory),
	}

	sendSuccessResponse(w, "获取会话信息成功", response)
}

// GetUserTerminalSessions 获取用户的所有终端会话
func (h *TerminalSessionHandler) GetUserTerminalSessions(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	sessions, err := h.sessionManager.GetUserSessions(userID)
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取会话列表失败: "+err.Error())
		return
	}

	// 构建响应数据
	sessionList := make([]map[string]interface{}, 0, len(sessions))
	for _, session := range sessions {
		sessionData := map[string]interface{}{
			"session_id":    session.ID,
			"connection_id": session.ConnectionID,
			"protocol":      session.Protocol,
			"status":        session.Status,
			"created_at":    session.CreatedAt,
			"last_active":   session.LastActiveAt,
			"expires_at":    session.ExpiresAt,
			"message_count": len(session.MessageHistory),
		}
		sessionList = append(sessionList, sessionData)
	}

	sendSuccessResponse(w, "获取会话列表成功", sessionList)
}

// CloseTerminalSession 关闭终端会话
func (h *TerminalSessionHandler) CloseTerminalSession(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 获取会话ID
	vars := mux.Vars(r)
	sessionID := vars["id"]

	session, err := h.sessionManager.GetSession(sessionID)
	if err != nil {
		sendErrorResponse(w, http.StatusNotFound, "会话不存在")
		return
	}

	// 验证会话是否属于用户
	if session.UserID != userID {
		sendErrorResponse(w, http.StatusForbidden, "无权访问此会话")
		return
	}

	// 关闭会话
	if err := h.sessionManager.CloseSession(sessionID); err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "关闭会话失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "会话关闭成功", nil)
}

// HandleTerminalWebSocketWithSession 处理带会话管理的终端WebSocket连接
func (h *TerminalSessionHandler) HandleTerminalWebSocketWithSession(w http.ResponseWriter, r *http.Request) {
	log.Printf("==========================================")
	log.Printf("收到终端WebSocket会话连接请求: %s %s%s", r.Method, r.URL.Path, r.URL.RawQuery)
	log.Printf("==========================================")

	// 设置CORS头
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	// 获取用户ID
	urlToken := r.URL.Query().Get("token")
	var userID uint
	var ok bool

	if urlToken != "" {
		// 验证URL中的令牌
		claims, err := middleware.ValidateToken(urlToken)
		if err == nil && claims.UserID > 0 {
			userID = claims.UserID
			ok = true
			log.Printf("URL令牌验证成功, 用户ID: %d", userID)
		} else {
			log.Printf("URL令牌验证失败: %v", err)
		}
	}

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
	sessionID := vars["sessionId"]
	
	// 检查是否为恢复会话
	resume := r.URL.Query().Get("resume") == "true"

	log.Printf("WebSocket会话连接: 会话ID=%s, 用户ID=%d, 恢复模式=%v", sessionID, userID, resume)

	// 升级到WebSocket连接
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("升级WebSocket连接失败: %v", err)
		return
	}
	defer wsConn.Close()

	log.Printf("WebSocket连接升级成功")

	// 处理会话连接
	if err := h.handleSessionWebSocket(sessionID, userID, wsConn, resume); err != nil {
		log.Printf("处理会话WebSocket失败: %v", err)
		wsConn.WriteMessage(websocket.TextMessage, []byte("连接失败: "+err.Error()))
	}
}

// handleSessionWebSocket 处理会话WebSocket连接
func (h *TerminalSessionHandler) handleSessionWebSocket(sessionID string, userID uint, wsConn *websocket.Conn, resume bool) error {
	// 获取或创建会话
	var session *service.PersistentTerminalSession
	var err error

	if resume {
		// 恢复现有会话
		session, err = h.sessionManager.GetSession(sessionID)
		if err != nil {
			return fmt.Errorf("恢复会话失败: %w", err)
		}

		// 验证会话是否属于用户
		if session.UserID != userID {
			return fmt.Errorf("无权访问此会话")
		}

		log.Printf("恢复会话: ID=%s, 状态=%s", sessionID, session.Status)
	} else {
		// 检查会话是否已存在
		session, err = h.sessionManager.GetSession(sessionID)
		if err != nil {
			return fmt.Errorf("会话不存在: %w", err)
		}

		// 验证会话是否属于用户
		if session.UserID != userID {
			return fmt.Errorf("无权访问此会话")
		}

		log.Printf("连接到现有会话: ID=%s, 状态=%s", sessionID, session.Status)
	}

	// 将WebSocket连接添加到会话
	if err := h.sessionManager.AddWebSocketConnection(sessionID, wsConn); err != nil {
		return fmt.Errorf("添加WebSocket连接失败: %w", err)
	}

	// 如果会话还没有关联的终端进程，需要创建
	if session.Status == "disconnected" || session.Status == "active" {
		if err := h.ensureTerminalProcess(session); err != nil {
			log.Printf("确保终端进程失败: %v", err)
			// 不返回错误，继续处理，可能是历史消息会话
		}
	}

	// 处理WebSocket消息
	h.handleWebSocketMessages(session, wsConn)

	// 移除WebSocket连接
	h.sessionManager.RemoveWebSocketConnection(sessionID, wsConn)

	return nil
}

// ensureTerminalProcess 确保会话有关联的终端进程
func (h *TerminalSessionHandler) ensureTerminalProcess(session *service.PersistentTerminalSession) error {
	// 如果已经有代理进程，跳过
	if session.Status == "active" && session.TerminalProxy != nil {
		return nil
	}

	// 获取连接信息
	connectionInfo, err := h.connService.GetConnection(session.UserID, session.ConnectionID)
	if err != nil {
		return fmt.Errorf("获取连接信息失败: %w", err)
	}

	// 创建终端会话代理
	proxy, err := service.NewTerminalSessionProxy(session, connectionInfo, h.sessionManager)
	if err != nil {
		return fmt.Errorf("创建终端会话代理失败: %w", err)
	}

	// 保存代理引用
	session.TerminalProxy = proxy
	session.Status = "active"

	log.Printf("终端会话代理创建成功: 会话ID=%s", session.ID)

	return nil
}



// handleWebSocketMessages 处理WebSocket消息
func (h *TerminalSessionHandler) handleWebSocketMessages(session *service.PersistentTerminalSession, wsConn *websocket.Conn) {
	for {
		select {
		case <-session.Ctx.Done():
			return
		default:
			messageType, p, err := wsConn.ReadMessage()
			if err != nil {
				log.Printf("读取WebSocket消息错误: %v", err)
				return
			}

			if messageType == websocket.TextMessage {
				// 处理文本消息
				var msg struct {
					Type    string `json:"type"`
					Content string `json:"content"`
				}

				if err := json.Unmarshal(p, &msg); err != nil {
					// 如果不是JSON格式，当作普通输入处理
					input := string(p)
					
					// 通过代理发送输入到终端
					if session.TerminalProxy != nil {
						if err := session.TerminalProxy.SendInput(input); err != nil {
							log.Printf("发送输入到终端失败: %v", err)
							h.sessionManager.AddMessage(session.ID, "error", "发送输入失败: "+err.Error())
						}
					} else {
						log.Printf("警告: 会话没有关联的终端代理: %s", session.ID)
					}
				} else {
					// 处理结构化消息
					switch msg.Type {
					case "input":
						// 通过代理发送输入到终端
						if session.TerminalProxy != nil {
							if err := session.TerminalProxy.SendInput(msg.Content); err != nil {
								log.Printf("发送结构化输入到终端失败: %v", err)
								h.sessionManager.AddMessage(session.ID, "error", "发送输入失败: "+err.Error())
							}
						} else {
							log.Printf("警告: 会话没有关联的终端代理: %s", session.ID)
						}
					case "heartbeat":
						// 心跳消息，发送响应
						response := map[string]string{
							"type": "heartbeat_response",
							"time": fmt.Sprintf("%d", time.Now().Unix()),
						}
						if respData, err := json.Marshal(response); err == nil {
							wsConn.WriteMessage(websocket.TextMessage, respData)
						}
					case "close":
						// 客户端请求关闭会话
						log.Printf("客户端请求关闭会话: %s", session.ID)
						return
					}
				}
			}
		}
	}
}

// GetSessionStats 获取会话统计信息
func (h *TerminalSessionHandler) GetSessionStats(w http.ResponseWriter, r *http.Request) {
	// 获取用户ID
	userID, ok := middleware.GetUserID(r)
	if !ok {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 管理员可以查看全局统计，普通用户只能查看自己的
	role, _ := middleware.GetUserRole(r)
	
	var stats map[string]interface{}
	if role == "admin" {
		stats = h.sessionManager.GetSessionStats()
	} else {
		// 获取用户会话统计
		userSessions, _ := h.sessionManager.GetUserSessions(userID)
		userStats := map[string]interface{}{
			"user_sessions": len(userSessions),
			"active_sessions": 0,
			"disconnected_sessions": 0,
		}
		
		for _, session := range userSessions {
			switch session.Status {
			case "active":
				userStats["active_sessions"] = userStats["active_sessions"].(int) + 1
			case "disconnected":
				userStats["disconnected_sessions"] = userStats["disconnected_sessions"].(int) + 1
			}
		}
		
		stats = userStats
	}

	sendSuccessResponse(w, "获取统计信息成功", stats)
}
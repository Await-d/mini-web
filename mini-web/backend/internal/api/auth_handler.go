package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"gitee.com/await29/mini-web/internal/model"
	"gitee.com/await29/mini-web/internal/service"
)

// AuthHandler 认证处理器
type AuthHandler struct {
	authService *service.AuthService
}

// NewAuthHandler 创建认证处理器实例
func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Login 处理用户登录
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	// 解析请求
	var req model.UserLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证请求
	if req.Username == "" || req.Password == "" {
		sendErrorResponse(w, http.StatusBadRequest, "用户名和密码不能为空")
		return
	}

	// 调用服务进行登录
	response, err := h.authService.Login(req.Username, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			sendErrorResponse(w, http.StatusUnauthorized, "用户名或密码错误")
			return
		}
		// 其他错误
		sendErrorResponse(w, http.StatusInternalServerError, "登录失败: "+err.Error())
		return
	}

	// 登录成功
	sendSuccessResponse(w, "登录成功", response)
}

// Register 处理用户注册
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	// 解析请求
	var req model.UserRegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证请求
	if req.Username == "" || req.Password == "" || req.Email == "" {
		sendErrorResponse(w, http.StatusBadRequest, "用户名、邮箱和密码不能为空")
		return
	}

	// 调用服务进行注册
	user, err := h.authService.Register(&req)
	if err != nil {
		if errors.Is(err, service.ErrUserAlreadyExists) {
			sendErrorResponse(w, http.StatusConflict, "用户名或邮箱已存在")
			return
		}
		// 其他错误
		sendErrorResponse(w, http.StatusInternalServerError, "注册失败: "+err.Error())
		return
	}

	// 注册成功
	sendSuccessResponse(w, "注册成功", user)
}

// GetUserInfo 获取用户信息
func (h *AuthHandler) GetUserInfo(w http.ResponseWriter, r *http.Request) {
	// 从上下文中获取用户ID
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 调用服务获取用户信息
	user, err := h.authService.GetUserInfo(userID)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "用户不存在")
			return
		}
		// 其他错误
		sendErrorResponse(w, http.StatusInternalServerError, "获取用户信息失败: "+err.Error())
		return
	}

	// 返回用户信息
	sendSuccessResponse(w, "获取用户信息成功", user)
}

// UpdateUserInfo 更新用户信息
func (h *AuthHandler) UpdateUserInfo(w http.ResponseWriter, r *http.Request) {
	// 从上下文中获取用户ID
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 解析请求
	var req model.UserUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 调用服务更新用户信息
	user, err := h.authService.UpdateUserInfo(userID, &req)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "用户不存在")
			return
		}
		// 其他错误
		sendErrorResponse(w, http.StatusInternalServerError, "更新用户信息失败: "+err.Error())
		return
	}

	// 返回更新后的用户信息
	sendSuccessResponse(w, "更新用户信息成功", user)
}

// UpdatePassword 更新用户密码
func (h *AuthHandler) UpdatePassword(w http.ResponseWriter, r *http.Request) {
	// 从上下文中获取用户ID
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 解析请求
	var req model.UserPasswordUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证请求
	if req.OldPassword == "" || req.NewPassword == "" {
		sendErrorResponse(w, http.StatusBadRequest, "旧密码和新密码不能为空")
		return
	}

	// 调用服务更新密码
	if err := h.authService.UpdatePassword(userID, &req); err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "用户不存在")
			return
		}
		// 其他错误
		sendErrorResponse(w, http.StatusInternalServerError, "更新密码失败: "+err.Error())
		return
	}

	// 返回更新成功消息
	sendSuccessResponse(w, "更新密码成功", nil)
}

// RefreshToken 刷新令牌
func (h *AuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	// 从上下文中获取用户ID
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	// 调用服务刷新令牌
	token, expireTime, err := h.authService.RefreshToken(userID)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "用户不存在")
			return
		}
		// 其他错误
		sendErrorResponse(w, http.StatusInternalServerError, "刷新令牌失败: "+err.Error())
		return
	}

	// 返回新令牌
	sendSuccessResponse(w, "刷新令牌成功", map[string]interface{}{
		"token":  token,
		"expire": expireTime.Unix(),
	})
}

// 辅助函数

// getUserIDFromContext 从请求上下文中获取用户ID
func getUserIDFromContext(r *http.Request) (uint, error) {
	// 在实际应用中，这个函数应该从JWT中间件设置的上下文中获取用户ID
	// 这里简单模拟一下
	// 实际实现需要根据你的认证中间件来调整
	
	// 从Authorization头获取令牌
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return 0, errors.New("缺少授权头")
	}

	// 期望格式: "Bearer {token}"
	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return 0, errors.New("授权头格式无效")
	}

	// 这里简单返回1，实际应用中应该从令牌中解析用户ID
	// 真实实现应该使用JWT令牌解析
	return 1, nil
}

// sendSuccessResponse 发送成功响应
func sendSuccessResponse(w http.ResponseWriter, message string, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := model.ResponseData{
		Code:    200,
		Message: message,
		Data:    data,
	}
	json.NewEncoder(w).Encode(response)
}

// sendErrorResponse 发送错误响应
func sendErrorResponse(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	response := model.ResponseData{
		Code:    status,
		Message: message,
	}
	json.NewEncoder(w).Encode(response)
}
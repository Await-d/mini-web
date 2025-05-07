package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"gitee.com/await29/mini-web/internal/model"
)

// UserHandler 用户相关处理器
type UserHandler struct {
	// 后期可以添加service
}

// NewUserHandler 创建用户处理器
func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

// GetUsers 获取用户列表
func (h *UserHandler) GetUsers(w http.ResponseWriter, r *http.Request) {
	// 模拟用户数据
	users := []model.User{
		{
			ID:       1,
			Username: "admin",
			Email:    "admin@example.com",
			Nickname: "管理员",
			Avatar:   "https://randomuser.me/api/portraits/men/1.jpg",
			Role:     "admin",
			Status:   "active",
		},
		{
			ID:       2,
			Username: "user1",
			Email:    "user1@example.com",
			Nickname: "用户1",
			Avatar:   "https://randomuser.me/api/portraits/women/2.jpg",
			Role:     "user",
			Status:   "active",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取用户列表成功",
		"data":    users,
		"total":   len(users),
	})
}

// GetUserByID 根据ID获取用户
func (h *UserHandler) GetUserByID(w http.ResponseWriter, r *http.Request) {
	// 从URL获取用户ID
	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "无效的用户ID",
		})
		return
	}

	// 模拟查询用户
	user := model.User{
		ID:       uint(id),
		Username: "user" + idStr,
		Email:    "user" + idStr + "@example.com",
		Nickname: "用户" + idStr,
		Avatar:   "https://randomuser.me/api/portraits/men/" + idStr + ".jpg",
		Role:     "user",
		Status:   "active",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取用户信息成功",
		"data":    user,
	})
}

// Login 用户登录
func (h *UserHandler) Login(w http.ResponseWriter, r *http.Request) {
	// 解析请求
	var req model.UserLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "无效的请求参数",
		})
		return
	}

	// 模拟验证用户名和密码
	if req.Username != "admin" || req.Password != "admin123" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    401,
			"message": "用户名或密码错误",
		})
		return
	}

	// 登录成功返回token和用户信息
	user := model.User{
		ID:       1,
		Username: "admin",
		Email:    "admin@example.com",
		Nickname: "管理员",
		Avatar:   "https://randomuser.me/api/portraits/men/1.jpg",
		Role:     "admin",
		Status:   "active",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "登录成功",
		"data": model.UserLoginResponse{
			Token:  "mock_token_12345",
			User:   user,
			Expire: 1714588800, // 模拟过期时间
		},
	})
}
package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"gitee.com/await29/mini-web/internal/service"
	"github.com/gorilla/mux"
)

// UserHandler 用户相关处理器
type UserHandler struct {
	userService     *service.UserService
	activityRepo    model.UserActivityRepository
}

// NewUserHandler 创建用户处理器
func NewUserHandler(userService *service.UserService, activityRepo model.UserActivityRepository) *UserHandler {
	return &UserHandler{
		userService:  userService,
		activityRepo: activityRepo,
	}
}

// GetUsers 获取用户列表
func (h *UserHandler) GetUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.userService.GetUsers()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    500,
			Message: "获取用户列表失败: " + err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    200,
		Message: "获取用户列表成功",
		Data: map[string]interface{}{
			"list":  users,
			"total": len(users),
		},
	})
}

// GetUserByID 根据ID获取用户
func (h *UserHandler) GetUserByID(w http.ResponseWriter, r *http.Request) {
	// 从URL路径获取用户ID
	vars := mux.Vars(r)
	idStr, ok := vars["id"]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "缺少用户ID参数",
		})
		return
	}

	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "无效的用户ID",
		})
		return
	}

	user, err := h.userService.GetUserByID(uint(id))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(err.Error(), "用户不存在") {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    404,
				Message: err.Error(),
			})
		} else {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    500,
				Message: "获取用户信息失败: " + err.Error(),
			})
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    200,
		Message: "获取用户信息成功",
		Data:    user,
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

// CreateUser 创建用户
func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req model.UserCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "无效的请求参数",
		})
		return
	}

	// 验证必填字段
	if req.Username == "" || req.Email == "" || req.Password == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "用户名、邮箱和密码不能为空",
		})
		return
	}

	// 设置默认值
	if req.Role == "" {
		req.Role = "user"
	}
	if req.Status == "" {
		req.Status = "active"
	}
	if req.Nickname == "" {
		req.Nickname = req.Username
	}

	user := &model.User{
		Username: req.Username,
		Email:    req.Email,
		Password: req.Password,
		Nickname: req.Nickname,
		Role:     req.Role,
		Status:   req.Status,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err := h.userService.CreateUser(user)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    409,
			Message: err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    201,
		Message: "用户创建成功",
		Data:    user,
	})
}

// UpdateUser 更新用户
func (h *UserHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	// 从URL路径获取用户ID
	vars := mux.Vars(r)
	idStr, ok := vars["id"]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "缺少用户ID参数",
		})
		return
	}

	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "无效的用户ID",
		})
		return
	}

	var req model.UserUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "无效的请求参数",
		})
		return
	}

	// 获取现有用户信息
	existingUser, err := h.userService.GetUserByID(uint(id))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(err.Error(), "用户不存在") {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    404,
				Message: err.Error(),
			})
		} else {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    500,
				Message: "获取用户信息失败: " + err.Error(),
			})
		}
		return
	}

	// 更新字段（只更新非空字段）
	if req.Username != "" {
		existingUser.Username = req.Username
	}
	if req.Email != "" {
		existingUser.Email = req.Email
	}
	if req.Nickname != "" {
		existingUser.Nickname = req.Nickname
	}
	if req.Avatar != "" {
		existingUser.Avatar = req.Avatar
	}
	if req.Role != "" {
		existingUser.Role = req.Role
	}
	if req.Status != "" {
		existingUser.Status = req.Status
	}
	existingUser.UpdatedAt = time.Now()

	err = h.userService.UpdateUser(existingUser)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    500,
			Message: "更新用户失败: " + err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    200,
		Message: "用户更新成功",
		Data:    existingUser,
	})
}

// DeleteUser 删除用户
func (h *UserHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	// 从URL路径获取用户ID
	vars := mux.Vars(r)
	idStr, ok := vars["id"]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "缺少用户ID参数",
		})
		return
	}

	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "无效的用户ID",
		})
		return
	}

	err = h.userService.DeleteUser(uint(id))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(err.Error(), "用户不存在") {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    404,
				Message: err.Error(),
			})
		} else if strings.Contains(err.Error(), "不能删除管理员用户") {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    403,
				Message: err.Error(),
			})
		} else {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    500,
				Message: "删除用户失败: " + err.Error(),
			})
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    200,
		Message: "用户删除成功",
	})
}

// BatchUpdateUsers 批量操作用户
func (h *UserHandler) BatchUpdateUsers(w http.ResponseWriter, r *http.Request) {
	var req model.UserBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "无效的请求参数",
		})
		return
	}

	if len(req.UserIDs) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "用户ID列表不能为空",
		})
		return
	}

	var err error
	switch req.Operation {
	case "enable":
		err = h.userService.BatchUpdateUserStatus(req.UserIDs, "active")
	case "disable":
		err = h.userService.BatchUpdateUserStatus(req.UserIDs, "inactive")
	case "delete":
		err = h.userService.BatchDeleteUsers(req.UserIDs)
	default:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "不支持的操作类型",
		})
		return
	}

	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(err.Error(), "不能删除管理员用户") {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    403,
				Message: err.Error(),
			})
		} else {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    500,
				Message: "批量操作失败: " + err.Error(),
			})
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    200,
		Message: "批量操作成功",
	})
}

// UploadAvatar 上传用户头像
func (h *UserHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	// 从URL路径获取用户ID
	vars := mux.Vars(r)
	idStr, ok := vars["id"]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "缺少用户ID参数",
		})
		return
	}

	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "无效的用户ID",
		})
		return
	}

	// 检查用户是否存在
	user, err := h.userService.GetUserByID(uint(id))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(err.Error(), "用户不存在") {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    404,
				Message: err.Error(),
			})
		} else {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    500,
				Message: "获取用户信息失败: " + err.Error(),
			})
		}
		return
	}

	// 限制文件大小 (5MB)
	r.ParseMultipartForm(5 << 20)

	// 获取上传的文件
	file, handler, err := r.FormFile("avatar")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "获取上传文件失败: " + err.Error(),
		})
		return
	}
	defer file.Close()

	// 验证文件类型
	contentType := handler.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "只支持图片文件",
		})
		return
	}

	// 创建上传目录
	uploadDir := "./uploads/avatars"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    500,
			Message: "创建上传目录失败: " + err.Error(),
		})
		return
	}

	// 生成文件名
	fileExt := filepath.Ext(handler.Filename)
	if fileExt == "" {
		// 根据Content-Type确定扩展名
		switch contentType {
		case "image/jpeg":
			fileExt = ".jpg"
		case "image/png":
			fileExt = ".png"
		case "image/gif":
			fileExt = ".gif"
		default:
			fileExt = ".jpg"
		}
	}
	fileName := fmt.Sprintf("user_%d_%d%s", id, time.Now().Unix(), fileExt)
	filePath := filepath.Join(uploadDir, fileName)

	// 创建目标文件
	dst, err := os.Create(filePath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    500,
			Message: "创建目标文件失败: " + err.Error(),
		})
		return
	}
	defer dst.Close()

	// 复制文件内容
	_, err = io.Copy(dst, file)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    500,
			Message: "保存文件失败: " + err.Error(),
		})
		return
	}

	// 删除旧头像文件（如果存在）
	if user.Avatar != "" && strings.HasPrefix(user.Avatar, "/uploads/avatars/") {
		oldFilePath := "." + user.Avatar
		if _, err := os.Stat(oldFilePath); err == nil {
			os.Remove(oldFilePath)
		}
	}

	// 更新用户头像URL
	avatarURL := fmt.Sprintf("/uploads/avatars/%s", fileName)
	user.Avatar = avatarURL
	user.UpdatedAt = time.Now()

	err = h.userService.UpdateUser(user)
	if err != nil {
		// 如果更新数据库失败，删除已上传的文件
		os.Remove(filePath)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    500,
			Message: "更新用户头像失败: " + err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    200,
		Message: "头像上传成功",
		Data: map[string]interface{}{
			"avatar_url": avatarURL,
			"user":       user,
		},
	})
}

// GetUserActivities 获取用户活动日志
func (h *UserHandler) GetUserActivities(w http.ResponseWriter, r *http.Request) {
	// 从URL路径获取用户ID
	vars := mux.Vars(r)
	idStr, ok := vars["id"]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "缺少用户ID参数",
		})
		return
	}

	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    400,
			Message: "无效的用户ID",
		})
		return
	}

	// 检查用户是否存在
	_, err = h.userService.GetUserByID(uint(id))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(err.Error(), "用户不存在") {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    404,
				Message: err.Error(),
			})
		} else {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.ResponseData{
				Code:    500,
				Message: "获取用户信息失败: " + err.Error(),
			})
		}
		return
	}

	// 获取分页参数
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("page_size")
	
	page := 1
	pageSize := 20
	
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	
	if pageSizeStr != "" {
		if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 && ps <= 100 {
			pageSize = ps
		}
	}
	
	offset := (page - 1) * pageSize

	// 获取活动日志
	activities, err := h.activityRepo.GetByUserID(uint(id), pageSize, offset)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    500,
			Message: "获取活动日志失败: " + err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    200,
		Message: "获取活动日志成功",
		Data: map[string]interface{}{
			"list":      activities,
			"page":      page,
			"page_size": pageSize,
			"total":     len(activities),
		},
	})
}

// GetAllActivities 获取所有活动日志
func (h *UserHandler) GetAllActivities(w http.ResponseWriter, r *http.Request) {
	// 获取分页参数
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("page_size")
	
	page := 1
	pageSize := 20
	
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	
	if pageSizeStr != "" {
		if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 && ps <= 100 {
			pageSize = ps
		}
	}
	
	offset := (page - 1) * pageSize

	// 获取活动日志
	activities, err := h.activityRepo.GetAll(pageSize, offset)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ResponseData{
			Code:    500,
			Message: "获取活动日志失败: " + err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ResponseData{
		Code:    200,
		Message: "获取活动日志成功",
		Data: map[string]interface{}{
			"list":      activities,
			"page":      page,
			"page_size": pageSize,
			"total":     len(activities),
		},
	})
}

// logUserActivity 记录用户活动（辅助方法）
func (h *UserHandler) logUserActivity(userID uint, action, resource, details string, r *http.Request) {
	// 获取IP地址
	ipAddress := r.Header.Get("X-Forwarded-For")
	if ipAddress == "" {
		ipAddress = r.Header.Get("X-Real-IP")
	}
	if ipAddress == "" {
		ipAddress = r.RemoteAddr
	}

	// 获取User Agent
	userAgent := r.Header.Get("User-Agent")

	// 创建活动日志
	log := &model.UserActivityLog{
		UserID:    userID,
		Action:    action,
		Resource:  resource,
		Details:   details,
		IPAddress: ipAddress,
		UserAgent: userAgent,
		CreatedAt: time.Now(),
	}

	// 记录日志（忽略错误，不影响主要业务流程）
	h.activityRepo.Create(log)
}
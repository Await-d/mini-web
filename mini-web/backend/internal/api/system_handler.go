package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"gitee.com/await29/mini-web/internal/service"
	"github.com/gorilla/mux"
)

// SystemHandler 系统处理器
type SystemHandler struct {
	systemService *service.SystemService
}

// NewSystemHandler 创建系统处理器实例
func NewSystemHandler(systemService *service.SystemService) *SystemHandler {
	return &SystemHandler{systemService: systemService}
}

// GetAllConfigs 获取所有系统配置
func (h *SystemHandler) GetAllConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := h.systemService.GetAllConfigs()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取系统配置失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取系统配置成功", configs)
}

// GetConfigsByCategory 根据分类获取系统配置
func (h *SystemHandler) GetConfigsByCategory(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	category := vars["category"]

	if category == "" {
		sendErrorResponse(w, http.StatusBadRequest, "分类参数不能为空")
		return
	}

	configs, err := h.systemService.GetConfigsByCategory(category)
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取系统配置失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取系统配置成功", configs)
}

// GetConfig 获取指定系统配置
func (h *SystemHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]

	if key == "" {
		sendErrorResponse(w, http.StatusBadRequest, "配置键不能为空")
		return
	}

	config, err := h.systemService.GetConfig(key)
	if err != nil {
		if errors.Is(err, service.ErrConfigNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "配置不存在")
			return
		}
		sendErrorResponse(w, http.StatusInternalServerError, "获取系统配置失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取系统配置成功", config)
}

// UpdateConfig 更新系统配置
func (h *SystemHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]

	if key == "" {
		sendErrorResponse(w, http.StatusBadRequest, "配置键不能为空")
		return
	}

	// 解析请求
	var req model.SystemConfigUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证请求
	if req.Value == "" {
		sendErrorResponse(w, http.StatusBadRequest, "配置值不能为空")
		return
	}

	// 获取用户ID和IP地址
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	ipAddress := getClientIP(r)

	// 更新配置
	config, err := h.systemService.UpdateConfig(key, &req, userID, ipAddress)
	if err != nil {
		if errors.Is(err, service.ErrConfigNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "配置不存在")
			return
		}
		sendErrorResponse(w, http.StatusInternalServerError, "更新系统配置失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "更新系统配置成功", config)
}

// BatchUpdateConfigs 批量更新系统配置
func (h *SystemHandler) BatchUpdateConfigs(w http.ResponseWriter, r *http.Request) {
	// 解析请求
	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证请求
	if len(req) == 0 {
		sendErrorResponse(w, http.StatusBadRequest, "更新数据不能为空")
		return
	}

	// 获取用户ID和IP地址
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	ipAddress := getClientIP(r)

	// 批量更新配置
	if err := h.systemService.BatchUpdateConfigs(req, userID, ipAddress); err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "批量更新系统配置失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "批量更新系统配置成功", nil)
}

// CreateConfig 创建系统配置
func (h *SystemHandler) CreateConfig(w http.ResponseWriter, r *http.Request) {
	// 解析请求
	var req model.SystemConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证请求
	if req.Key == "" || req.Value == "" || req.Category == "" {
		sendErrorResponse(w, http.StatusBadRequest, "配置键、值和分类不能为空")
		return
	}

	// 获取用户ID和IP地址
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	ipAddress := getClientIP(r)

	// 创建配置
	config, err := h.systemService.CreateConfig(&req, userID, ipAddress)
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "创建系统配置失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "创建系统配置成功", config)
}

// DeleteConfig 删除系统配置
func (h *SystemHandler) DeleteConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]

	if key == "" {
		sendErrorResponse(w, http.StatusBadRequest, "配置键不能为空")
		return
	}

	// 获取用户ID和IP地址
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	ipAddress := getClientIP(r)

	// 删除配置
	if err := h.systemService.DeleteConfig(key, userID, ipAddress); err != nil {
		if errors.Is(err, service.ErrConfigNotFound) {
			sendErrorResponse(w, http.StatusNotFound, "配置不存在")
			return
		}
		sendErrorResponse(w, http.StatusInternalServerError, "删除系统配置失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "删除系统配置成功", nil)
}

// GetLogs 获取系统日志
func (h *SystemHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	// 解析查询参数
	query := r.URL.Query()
	
	limit, _ := strconv.Atoi(query.Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	offset, _ := strconv.Atoi(query.Get("offset"))
	if offset < 0 {
		offset = 0
	}

	level := query.Get("level")
	module := query.Get("module")
	startTimeStr := query.Get("start_time")
	endTimeStr := query.Get("end_time")

	var logs []*model.SystemLog
	var err error

	// 根据查询条件获取日志
	if startTimeStr != "" && endTimeStr != "" {
		startTime, err1 := time.Parse("2006-01-02", startTimeStr)
		endTime, err2 := time.Parse("2006-01-02", endTimeStr)
		if err1 != nil || err2 != nil {
			sendErrorResponse(w, http.StatusBadRequest, "时间格式无效，请使用 YYYY-MM-DD 格式")
			return
		}
		logs, err = h.systemService.GetLogsByDateRange(startTime, endTime, limit, offset)
	} else if level != "" {
		logs, err = h.systemService.GetLogsByLevel(level, limit, offset)
	} else if module != "" {
		logs, err = h.systemService.GetLogsByModule(module, limit, offset)
	} else {
		logs, err = h.systemService.GetLogs(limit, offset)
	}

	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取系统日志失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取系统日志成功", map[string]interface{}{
		"list":   logs,
		"limit":  limit,
		"offset": offset,
	})
}

// DeleteLog 删除系统日志
func (h *SystemHandler) DeleteLog(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]

	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的日志ID")
		return
	}

	// 获取用户ID和IP地址
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	ipAddress := getClientIP(r)

	// 删除日志
	if err := h.systemService.DeleteLog(uint(id), userID, ipAddress); err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "删除系统日志失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "删除系统日志成功", nil)
}

// ClearLogs 清除系统日志
func (h *SystemHandler) ClearLogs(w http.ResponseWriter, r *http.Request) {
	// 解析请求
	var req struct {
		StartTime string `json:"start_time"`
		EndTime   string `json:"end_time"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证时间格式
	startTime, err := time.Parse("2006-01-02", req.StartTime)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "开始时间格式无效，请使用 YYYY-MM-DD 格式")
		return
	}

	endTime, err := time.Parse("2006-01-02", req.EndTime)
	if err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "结束时间格式无效，请使用 YYYY-MM-DD 格式")
		return
	}

	// 获取用户ID和IP地址
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	ipAddress := getClientIP(r)

	// 清除日志
	if err := h.systemService.ClearLogs(startTime, endTime, userID, ipAddress); err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "清除系统日志失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "清除系统日志成功", nil)
}

// GetLogStats 获取日志统计信息
func (h *SystemHandler) GetLogStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.systemService.GetLogStats()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取日志统计失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取日志统计成功", stats)
}

// 辅助函数

// GetPerformanceMetrics 获取性能监控数据
func (h *SystemHandler) GetPerformanceMetrics(w http.ResponseWriter, r *http.Request) {
	metrics, err := h.systemService.GetPerformanceMetrics()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取性能监控数据失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取性能监控数据成功", metrics)
}

// GetSystemInfo 获取系统信息
func (h *SystemHandler) GetSystemInfo(w http.ResponseWriter, r *http.Request) {
	info, err := h.systemService.GetSystemInfo()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取系统信息失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取系统信息成功", info)
}

// TestEmailConfig 测试邮件配置
func (h *SystemHandler) TestEmailConfig(w http.ResponseWriter, r *http.Request) {
	// 解析请求
	var req struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Username string `json:"username"`
		Password string `json:"password"`
		To       string `json:"to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, http.StatusBadRequest, "无效的请求参数")
		return
	}

	// 验证请求
	if req.Host == "" || req.Username == "" || req.To == "" {
		sendErrorResponse(w, http.StatusBadRequest, "邮件服务器配置不完整")
		return
	}

	// 获取用户ID和IP地址
	userID, err := getUserIDFromContext(r)
	if err != nil {
		sendErrorResponse(w, http.StatusUnauthorized, "未授权访问")
		return
	}

	ipAddress := getClientIP(r)

	// 测试邮件配置
	if err := h.systemService.TestEmailConfig(req.Host, req.Port, req.Username, req.Password, req.To, userID, ipAddress); err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "邮件配置测试失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "邮件配置测试成功", nil)
}

// getClientIP 获取客户端IP地址
func getClientIP(r *http.Request) string {
	// 尝试从各种头部获取真实IP
	ip := r.Header.Get("X-Forwarded-For")
	if ip != "" {
		return ip
	}

	ip = r.Header.Get("X-Real-IP")
	if ip != "" {
		return ip
	}

	ip = r.Header.Get("X-Client-IP")
	if ip != "" {
		return ip
	}

	// 回退到RemoteAddr
	return r.RemoteAddr
}
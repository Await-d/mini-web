package api

import (
	"net/http"

	"gitee.com/await29/mini-web/internal/service"
)

// DashboardHandler Dashboard处理器
type DashboardHandler struct {
	dashboardService *service.DashboardService
}

// NewDashboardHandler 创建Dashboard处理器实例
func NewDashboardHandler(dashboardService *service.DashboardService) *DashboardHandler {
	return &DashboardHandler{dashboardService: dashboardService}
}

// GetDashboardStats 获取Dashboard统计数据
func (h *DashboardHandler) GetDashboardStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.dashboardService.GetDashboardStats()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取Dashboard统计数据失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取Dashboard统计数据成功", stats)
}

// GetSystemStatus 获取系统状态
func (h *DashboardHandler) GetSystemStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.dashboardService.GetSystemStatus()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取系统状态失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取系统状态成功", status)
}

// GetRecentActivities 获取最近活动
func (h *DashboardHandler) GetRecentActivities(w http.ResponseWriter, r *http.Request) {
	activities, err := h.dashboardService.GetRecentActivities()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取最近活动失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取最近活动成功", activities)
}

// GetConnectionStats 获取连接统计
func (h *DashboardHandler) GetConnectionStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.dashboardService.GetConnectionStats()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取连接统计失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取连接统计成功", stats)
}

// GetUserStats 获取用户统计
func (h *DashboardHandler) GetUserStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.dashboardService.GetUserStats()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取用户统计失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取用户统计成功", stats)
}

// GetSessionStats 获取会话统计
func (h *DashboardHandler) GetSessionStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.dashboardService.GetSessionStats()
	if err != nil {
		sendErrorResponse(w, http.StatusInternalServerError, "获取会话统计失败: "+err.Error())
		return
	}

	sendSuccessResponse(w, "获取会话统计成功", stats)
}
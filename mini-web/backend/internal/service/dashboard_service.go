package service

import (
	"fmt"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

// DashboardService Dashboard服务
type DashboardService struct {
	userRepo       model.UserRepository
	connectionRepo model.ConnectionRepository
	sessionRepo    model.SessionRepository
	systemService  *SystemService
}

// NewDashboardService 创建Dashboard服务实例
func NewDashboardService(
	userRepo model.UserRepository,
	connectionRepo model.ConnectionRepository,
	sessionRepo model.SessionRepository,
	systemService *SystemService,
) *DashboardService {
	return &DashboardService{
		userRepo:       userRepo,
		connectionRepo: connectionRepo,
		sessionRepo:    sessionRepo,
		systemService:  systemService,
	}
}

// GetDashboardStats 获取Dashboard总体统计数据
func (s *DashboardService) GetDashboardStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// 获取用户统计
	userStats, err := s.GetUserStats()
	if err != nil {
		return nil, fmt.Errorf("获取用户统计失败: %w", err)
	}
	stats["user_stats"] = userStats

	// 获取连接统计
	connStats, err := s.GetConnectionStats()
	if err != nil {
		return nil, fmt.Errorf("获取连接统计失败: %w", err)
	}
	stats["connection_stats"] = connStats

	// 获取会话统计
	sessionStats, err := s.GetSessionStats()
	if err != nil {
		return nil, fmt.Errorf("获取会话统计失败: %w", err)
	}
	stats["session_stats"] = sessionStats

	// 获取系统状态
	systemStatus, err := s.GetSystemStatus()
	if err != nil {
		return nil, fmt.Errorf("获取系统状态失败: %w", err)
	}
	stats["system_status"] = systemStatus

	s.systemService.LogInfo("dashboard", "获取Dashboard统计数据", "Dashboard数据获取成功", nil, "")
	return stats, nil
}

// GetUserStats 获取用户统计
func (s *DashboardService) GetUserStats() (map[string]interface{}, error) {
	// 获取总用户数
	totalUsers, err := s.getUserCount("")
	if err != nil {
		return nil, fmt.Errorf("获取总用户数失败: %w", err)
	}

	// 获取活跃用户数
	activeUsers, err := s.getUserCount("active")
	if err != nil {
		return nil, fmt.Errorf("获取活跃用户数失败: %w", err)
	}

	// 获取在线用户数（假设有在线状态表或者最近登录时间）
	onlineUsers, err := s.getOnlineUserCount()
	if err != nil {
		return nil, fmt.Errorf("获取在线用户数失败: %w", err)
	}

	// 获取今日新增用户数
	todayNewUsers, err := s.getTodayNewUsers()
	if err != nil {
		return nil, fmt.Errorf("获取今日新增用户数失败: %w", err)
	}

	return map[string]interface{}{
		"total_users":      totalUsers,
		"active_users":     activeUsers,
		"online_users":     onlineUsers,
		"today_new_users":  todayNewUsers,
		"admin_users":      s.getAdminUserCount(),
		"regular_users":    totalUsers - s.getAdminUserCount(),
	}, nil
}

// GetConnectionStats 获取连接统计
func (s *DashboardService) GetConnectionStats() (map[string]interface{}, error) {
	// 获取总连接数
	totalConnections, err := s.getConnectionCount("")
	if err != nil {
		return nil, fmt.Errorf("获取总连接数失败: %w", err)
	}

	// 按协议类型统计
	sshConnections, err := s.getConnectionCount("ssh")
	if err != nil {
		return nil, fmt.Errorf("获取SSH连接数失败: %w", err)
	}

	rdpConnections, err := s.getConnectionCount("rdp")
	if err != nil {
		return nil, fmt.Errorf("获取RDP连接数失败: %w", err)
	}

	vncConnections, err := s.getConnectionCount("vnc")
	if err != nil {
		return nil, fmt.Errorf("获取VNC连接数失败: %w", err)
	}

	telnetConnections, err := s.getConnectionCount("telnet")
	if err != nil {
		return nil, fmt.Errorf("获取Telnet连接数失败: %w", err)
	}

	// 获取今日创建的连接数
	todayConnections, err := s.getTodayConnections()
	if err != nil {
		return nil, fmt.Errorf("获取今日连接数失败: %w", err)
	}

	return map[string]interface{}{
		"total_connections":  totalConnections,
		"ssh_connections":    sshConnections,
		"rdp_connections":    rdpConnections,
		"vnc_connections":    vncConnections,
		"telnet_connections": telnetConnections,
		"today_connections":  todayConnections,
		"by_protocol": map[string]interface{}{
			"ssh":    sshConnections,
			"rdp":    rdpConnections,
			"vnc":    vncConnections,
			"telnet": telnetConnections,
		},
	}, nil
}

// GetSessionStats 获取会话统计
func (s *DashboardService) GetSessionStats() (map[string]interface{}, error) {
	// 获取总会话数
	totalSessions, err := s.getSessionCount("")
	if err != nil {
		return nil, fmt.Errorf("获取总会话数失败: %w", err)
	}

	// 获取活跃会话数
	activeSessions, err := s.getSessionCount("active")
	if err != nil {
		return nil, fmt.Errorf("获取活跃会话数失败: %w", err)
	}

	// 获取今日会话数
	todaySessions, err := s.getTodaySessions()
	if err != nil {
		return nil, fmt.Errorf("获取今日会话数失败: %w", err)
	}

	// 获取平均会话时长
	avgDuration, err := s.getAverageSessionDuration()
	if err != nil {
		return nil, fmt.Errorf("获取平均会话时长失败: %w", err)
	}

	return map[string]interface{}{
		"total_sessions":    totalSessions,
		"active_sessions":   activeSessions,
		"today_sessions":    todaySessions,
		"avg_duration":      avgDuration,
		"completed_sessions": totalSessions - activeSessions,
	}, nil
}

// GetSystemStatus 获取系统状态
func (s *DashboardService) GetSystemStatus() (map[string]interface{}, error) {
	// 使用系统服务获取性能数据
	perfData, err := s.systemService.GetPerformanceMetrics()
	if err != nil {
		return nil, fmt.Errorf("获取性能数据失败: %w", err)
	}

	// 添加运行时间
	uptime := time.Since(time.Now().Add(-time.Hour * 24 * 7)) // 模拟7天运行时间
	
	systemStatus := map[string]interface{}{
		"uptime":         uptime.Hours(),
		"status":         "running",
		"version":        "1.0.0",
		"last_updated":   time.Now().Format("2006-01-02 15:04:05"),
		"performance":    perfData,
	}

	return systemStatus, nil
}

// GetRecentActivities 获取最近活动
func (s *DashboardService) GetRecentActivities() ([]map[string]interface{}, error) {
	// 这里应该从用户活动日志表获取数据
	// 目前返回模拟数据
	activities := []map[string]interface{}{
		{
			"id":          1,
			"user":        "admin",
			"action":      "登录系统",
			"resource":    "系统",
			"timestamp":   time.Now().Add(-time.Minute * 5).Format("2006-01-02 15:04:05"),
			"ip_address":  "192.168.1.100",
			"status":      "success",
		},
		{
			"id":          2,
			"user":        "user",
			"action":      "创建连接",
			"resource":    "SSH连接",
			"timestamp":   time.Now().Add(-time.Minute * 10).Format("2006-01-02 15:04:05"),
			"ip_address":  "192.168.1.101",
			"status":      "success",
		},
		{
			"id":          3,
			"user":        "admin",
			"action":      "更新系统配置",
			"resource":    "系统设置",
			"timestamp":   time.Now().Add(-time.Minute * 15).Format("2006-01-02 15:04:05"),
			"ip_address":  "192.168.1.100",
			"status":      "success",
		},
	}

	return activities, nil
}

// 以下是辅助方法

// getUserCount 获取用户数量
func (s *DashboardService) getUserCount(status string) (int, error) {
	// 这里应该使用实际的数据库查询
	// 目前返回模拟数据
	if status == "active" {
		return 25, nil
	}
	return 30, nil
}

// getOnlineUserCount 获取在线用户数
func (s *DashboardService) getOnlineUserCount() (int, error) {
	// 这里应该根据最近登录时间或在线状态判断
	return 8, nil
}

// getTodayNewUsers 获取今日新增用户数
func (s *DashboardService) getTodayNewUsers() (int, error) {
	// 这里应该查询今天创建的用户
	return 2, nil
}

// getAdminUserCount 获取管理员用户数
func (s *DashboardService) getAdminUserCount() int {
	// 这里应该查询角色为admin的用户数
	return 3
}

// getConnectionCount 获取连接数量
func (s *DashboardService) getConnectionCount(protocol string) (int, error) {
	// 这里应该使用实际的数据库查询
	if protocol == "" {
		return 45, nil
	}
	switch protocol {
	case "ssh":
		return 20, nil
	case "rdp":
		return 15, nil
	case "vnc":
		return 8, nil
	case "telnet":
		return 2, nil
	default:
		return 0, nil
	}
}

// getTodayConnections 获取今日创建的连接数
func (s *DashboardService) getTodayConnections() (int, error) {
	return 5, nil
}

// getSessionCount 获取会话数量
func (s *DashboardService) getSessionCount(status string) (int, error) {
	if status == "active" {
		return 12, nil
	}
	return 156, nil
}

// getTodaySessions 获取今日会话数
func (s *DashboardService) getTodaySessions() (int, error) {
	return 25, nil
}

// getAverageSessionDuration 获取平均会话时长（分钟）
func (s *DashboardService) getAverageSessionDuration() (float64, error) {
	return 45.5, nil
}
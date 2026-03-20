package service

import (
	"fmt"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

var serverStartTime = time.Now()

type DashboardService struct {
	userRepo       model.UserRepository
	connectionRepo model.ConnectionRepository
	sessionRepo    model.SessionRepository
	activityRepo   model.UserActivityRepository
	systemService  *SystemService
}

func NewDashboardService(
	userRepo model.UserRepository,
	connectionRepo model.ConnectionRepository,
	sessionRepo model.SessionRepository,
	activityRepo model.UserActivityRepository,
	systemService *SystemService,
) *DashboardService {
	return &DashboardService{
		userRepo:       userRepo,
		connectionRepo: connectionRepo,
		sessionRepo:    sessionRepo,
		activityRepo:   activityRepo,
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
		"total_users":     totalUsers,
		"active_users":    activeUsers,
		"online_users":    onlineUsers,
		"today_new_users": todayNewUsers,
		"admin_users":     s.getAdminUserCount(),
		"regular_users":   totalUsers - s.getAdminUserCount(),
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
		"total_sessions":     totalSessions,
		"active_sessions":    activeSessions,
		"today_sessions":     todaySessions,
		"avg_duration":       avgDuration,
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

	systemStatus := map[string]interface{}{
		"uptime":       time.Since(serverStartTime).Hours(),
		"status":       "running",
		"version":      "1.0.0",
		"last_updated": time.Now().Format("2006-01-02 15:04:05"),
		"performance":  perfData,
	}

	return systemStatus, nil
}

func (s *DashboardService) GetRecentActivities() ([]map[string]interface{}, error) {
	logs, err := s.activityRepo.GetAll(20, 0)
	if err != nil {
		return nil, fmt.Errorf("获取活动日志失败: %w", err)
	}
	activities := make([]map[string]interface{}, 0, len(logs))
	for _, l := range logs {
		activities = append(activities, map[string]interface{}{
			"id":         l.ID,
			"user_id":    l.UserID,
			"action":     l.Action,
			"resource":   l.Resource,
			"timestamp":  l.CreatedAt.Format("2006-01-02 15:04:05"),
			"ip_address": l.IPAddress,
			"status":     "success",
		})
	}
	return activities, nil
}

func (s *DashboardService) getUserCount(status string) (int, error) {
	users, err := s.userRepo.GetAll()
	if err != nil {
		return 0, err
	}
	if status == "" {
		return len(users), nil
	}
	count := 0
	for _, u := range users {
		if u.Status == status {
			count++
		}
	}
	return count, nil
}

func (s *DashboardService) getOnlineUserCount() (int, error) {
	users, err := s.userRepo.GetAll()
	if err != nil {
		return 0, err
	}
	threshold := time.Now().Add(-15 * time.Minute)
	count := 0
	for _, u := range users {
		if u.LastLoginAt != nil && u.LastLoginAt.After(threshold) {
			count++
		}
	}
	return count, nil
}

func (s *DashboardService) getTodayNewUsers() (int, error) {
	users, err := s.userRepo.GetAll()
	if err != nil {
		return 0, err
	}
	today := time.Now().Truncate(24 * time.Hour)
	count := 0
	for _, u := range users {
		if u.CreatedAt.After(today) {
			count++
		}
	}
	return count, nil
}

func (s *DashboardService) getAdminUserCount() int {
	users, err := s.userRepo.GetAll()
	if err != nil {
		return 0
	}
	count := 0
	for _, u := range users {
		if u.Role == "admin" {
			count++
		}
	}
	return count
}

func (s *DashboardService) getConnectionCount(protocol string) (int, error) {
	conns, err := s.connectionRepo.GetAll()
	if err != nil {
		return 0, err
	}
	if protocol == "" {
		return len(conns), nil
	}
	count := 0
	for _, c := range conns {
		if c.Protocol == protocol {
			count++
		}
	}
	return count, nil
}

func (s *DashboardService) getTodayConnections() (int, error) {
	conns, err := s.connectionRepo.GetAll()
	if err != nil {
		return 0, err
	}
	today := time.Now().Truncate(24 * time.Hour)
	count := 0
	for _, c := range conns {
		if c.CreatedAt.After(today) {
			count++
		}
	}
	return count, nil
}

func (s *DashboardService) getSessionCount(status string) (int, error) {
	var sessions []*model.Session
	var err error
	if status == "active" {
		sessions, err = s.sessionRepo.GetAllActive()
	} else {
		sessions, err = s.sessionRepo.GetAll()
	}
	if err != nil {
		return 0, err
	}
	return len(sessions), nil
}

func (s *DashboardService) getTodaySessions() (int, error) {
	sessions, err := s.sessionRepo.GetAll()
	if err != nil {
		return 0, err
	}
	today := time.Now().Truncate(24 * time.Hour)
	count := 0
	for _, sess := range sessions {
		if sess.StartTime.After(today) {
			count++
		}
	}
	return count, nil
}

func (s *DashboardService) getAverageSessionDuration() (float64, error) {
	sessions, err := s.sessionRepo.GetAll()
	if err != nil {
		return 0, err
	}
	if len(sessions) == 0 {
		return 0, nil
	}
	var totalMinutes float64
	count := 0
	for _, sess := range sessions {
		if sess.Duration > 0 {
			totalMinutes += float64(sess.Duration)
			count++
		}
	}
	if count == 0 {
		return 0, nil
	}
	return totalMinutes / float64(count), nil
}

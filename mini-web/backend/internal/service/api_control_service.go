package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"gitee.com/await29/mini-web/internal/model/sqlite"
)

// APIControlService API访问控制服务
type APIControlService struct {
	rateLimitMap sync.Map // IP -> RateLimitInfo
	config       *sqlite.APIConfig
	configMutex  sync.RWMutex
}

// RateLimitInfo 速率限制信息
type RateLimitInfo struct {
	MinuteCount int
	HourCount   int
	DayCount    int
	LastMinute  int64
	LastHour    int64
	LastDay     int64
}

// NewAPIControlService 创建API访问控制服务实例
func NewAPIControlService() *APIControlService {
	service := &APIControlService{}
	service.loadConfig()
	return service
}

// loadConfig 加载配置
func (s *APIControlService) loadConfig() {
	config, err := sqlite.GetAPIConfig()
	if err != nil {
		// 使用默认配置
		config = &sqlite.APIConfig{
			RateLimitEnabled:   true,
			RequestsPerMin:     60,
			RequestsPerHour:    1000,
			RequestsPerDay:     10000,
			IPWhitelistEnabled: false,
			IPBlacklistEnabled: true,
			APIKeyRequired:     false,
			IsEnabled:          true,
		}
	}
	
	s.configMutex.Lock()
	s.config = config
	s.configMutex.Unlock()
}

// ReloadConfig 重新加载配置
func (s *APIControlService) ReloadConfig() error {
	config, err := sqlite.GetAPIConfig()
	if err != nil {
		return fmt.Errorf("加载API配置失败: %w", err)
	}
	
	s.configMutex.Lock()
	s.config = config
	s.configMutex.Unlock()
	
	return nil
}

// CheckAccess 检查API访问权限
func (s *APIControlService) CheckAccess(r *http.Request) error {
	s.configMutex.RLock()
	config := s.config
	s.configMutex.RUnlock()
	
	if !config.IsEnabled {
		return nil // 访问控制未启用
	}
	
	clientIP := s.getClientIP(r)
	
	// 检查IP黑名单
	if config.IPBlacklistEnabled {
		if blocked, err := s.checkIPBlacklist(clientIP); err != nil {
			return fmt.Errorf("检查IP黑名单失败: %w", err)
		} else if blocked {
			return fmt.Errorf("IP地址 %s 已被禁止访问", clientIP)
		}
	}
	
	// 检查IP白名单
	if config.IPWhitelistEnabled {
		if allowed, err := s.checkIPWhitelist(clientIP); err != nil {
			return fmt.Errorf("检查IP白名单失败: %w", err)
		} else if !allowed {
			return fmt.Errorf("IP地址 %s 不在允许的访问列表中", clientIP)
		}
	}
	
	// 检查速率限制
	if config.RateLimitEnabled {
		if exceeded, err := s.checkRateLimit(clientIP, config); err != nil {
			return fmt.Errorf("检查速率限制失败: %w", err)
		} else if exceeded {
			return fmt.Errorf("请求频率超过限制，请稍后再试")
		}
	}
	
	// 检查API密钥
	if config.APIKeyRequired {
		if err := s.validateAPIKey(r); err != nil {
			return fmt.Errorf("API密钥验证失败: %w", err)
		}
	}
	
	return nil
}

// getClientIP 获取客户端IP地址
func (s *APIControlService) getClientIP(r *http.Request) string {
	// 检查X-Forwarded-For头
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}
	
	// 检查X-Real-IP头
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	
	// 使用RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	
	return ip
}

// checkIPBlacklist 检查IP是否在黑名单中
func (s *APIControlService) checkIPBlacklist(ip string) (bool, error) {
	blacklist, err := sqlite.GetIPBlacklist()
	if err != nil {
		return false, err
	}
	
	for _, item := range blacklist {
		if !item.IsEnabled {
			continue
		}
		
		if s.matchIP(ip, item.IPAddress) {
			// 检查是否已过期
			if item.ExpiresAt != "" {
				expiresAt, err := time.Parse("2006-01-02 15:04:05", item.ExpiresAt)
				if err == nil && time.Now().After(expiresAt) {
					continue // 已过期，跳过
				}
			}
			return true, nil
		}
	}
	
	return false, nil
}

// checkIPWhitelist 检查IP是否在白名单中
func (s *APIControlService) checkIPWhitelist(ip string) (bool, error) {
	whitelist, err := sqlite.GetIPWhitelist()
	if err != nil {
		return false, err
	}
	
	for _, item := range whitelist {
		if item.IsEnabled && s.matchIP(ip, item.IPAddress) {
			return true, nil
		}
	}
	
	return false, nil
}

// matchIP 检查IP是否匹配（支持CIDR格式）
func (s *APIControlService) matchIP(clientIP, ruleIP string) bool {
	// 精确匹配
	if clientIP == ruleIP {
		return true
	}
	
	// CIDR匹配
	if strings.Contains(ruleIP, "/") {
		_, cidr, err := net.ParseCIDR(ruleIP)
		if err != nil {
			return false
		}
		
		ip := net.ParseIP(clientIP)
		if ip == nil {
			return false
		}
		
		return cidr.Contains(ip)
	}
	
	// 通配符匹配（简单实现）
	if strings.Contains(ruleIP, "*") {
		// 这里可以使用正则表达式进行更复杂的匹配
		return strings.HasPrefix(clientIP, strings.Split(ruleIP, "*")[0])
	}
	
	return false
}

// checkRateLimit 检查速率限制
func (s *APIControlService) checkRateLimit(ip string, config *sqlite.APIConfig) (bool, error) {
	now := time.Now()
	currentMinute := now.Unix() / 60
	currentHour := now.Unix() / 3600
	currentDay := now.Unix() / 86400
	
	// 获取或创建速率限制信息
	var info *RateLimitInfo
	if value, exists := s.rateLimitMap.Load(ip); exists {
		info = value.(*RateLimitInfo)
	} else {
		info = &RateLimitInfo{}
		s.rateLimitMap.Store(ip, info)
	}
	
	// 重置计数器（如果时间窗口已过）
	if info.LastMinute != currentMinute {
		info.MinuteCount = 0
		info.LastMinute = currentMinute
	}
	
	if info.LastHour != currentHour {
		info.HourCount = 0
		info.LastHour = currentHour
	}
	
	if info.LastDay != currentDay {
		info.DayCount = 0
		info.LastDay = currentDay
	}
	
	// 检查限制
	if config.RequestsPerMin > 0 && info.MinuteCount >= config.RequestsPerMin {
		return true, nil
	}
	
	if config.RequestsPerHour > 0 && info.HourCount >= config.RequestsPerHour {
		return true, nil
	}
	
	if config.RequestsPerDay > 0 && info.DayCount >= config.RequestsPerDay {
		return true, nil
	}
	
	// 增加计数
	info.MinuteCount++
	info.HourCount++
	info.DayCount++
	
	return false, nil
}

// validateAPIKey 验证API密钥
func (s *APIControlService) validateAPIKey(r *http.Request) error {
	// 从头部获取API密钥
	apiKey := r.Header.Get("X-API-Key")
	if apiKey == "" {
		// 尝试从查询参数获取
		apiKey = r.URL.Query().Get("api_key")
	}
	
	if apiKey == "" {
		return fmt.Errorf("缺少API密钥")
	}
	
	// 验证API密钥
	key, err := sqlite.ValidateAPIKey(apiKey)
	if err != nil {
		return err
	}
	
	// 更新使用次数
	if err := sqlite.UpdateAPIKeyUsage(key.ID); err != nil {
		// 记录错误但不阻止请求
		fmt.Printf("更新API密钥使用次数失败: %v\n", err)
	}
	
	// 将API密钥信息设置到请求上下文中（如果需要的话）
	// context.WithValue(r.Context(), "api_key", key)
	
	return nil
}

// GenerateAPIKey 生成API密钥
func (s *APIControlService) GenerateAPIKey() (string, string, error) {
	// 生成密钥
	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		return "", "", fmt.Errorf("生成密钥失败: %w", err)
	}
	key := hex.EncodeToString(keyBytes)
	
	// 生成密钥（更短的版本用于显示）
	secretBytes := make([]byte, 16)
	if _, err := rand.Read(secretBytes); err != nil {
		return "", "", fmt.Errorf("生成密钥失败: %w", err)
	}
	secret := hex.EncodeToString(secretBytes)
	
	return key, secret, nil
}

// LogAPIRequest 记录API请求
func (s *APIControlService) LogAPIRequest(r *http.Request, statusCode, responseTime int, requestSize, responseSize int) error {
	clientIP := s.getClientIP(r)
	userAgent := r.UserAgent()
	
	// 获取API密钥ID（如果有的话）
	apiKeyID := 0
	if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
		if key, err := sqlite.ValidateAPIKey(apiKey); err == nil {
			apiKeyID = key.ID
		}
	}
	
	// 获取用户ID（如果有的话）
	userID := 0
	// 这里可以从JWT token或session中获取用户ID
	
	log := &sqlite.APIAccessLog{
		IPAddress:    clientIP,
		UserAgent:    userAgent,
		Method:       r.Method,
		Path:         r.URL.Path,
		StatusCode:   statusCode,
		ResponseTime: responseTime,
		APIKeyID:     apiKeyID,
		UserID:       userID,
		RequestSize:  requestSize,
		ResponseSize: responseSize,
	}
	
	return sqlite.LogAPIAccess(log)
}

// GetAccessStatistics 获取访问统计信息
func (s *APIControlService) GetAccessStatistics(days int) (map[string]interface{}, error) {
	// 这里可以实现更复杂的统计逻辑
	stats := map[string]interface{}{
		"total_requests":    0,
		"successful_requests": 0,
		"failed_requests":   0,
		"top_ips":          []string{},
		"top_endpoints":    []string{},
		"avg_response_time": 0,
	}
	
	// 实际实现中应该查询数据库获取真实统计数据
	// 这里返回模拟数据
	stats["total_requests"] = 1234
	stats["successful_requests"] = 1100
	stats["failed_requests"] = 134
	stats["avg_response_time"] = 250
	
	return stats, nil
}

// CleanupExpiredEntries 清理过期的条目
func (s *APIControlService) CleanupExpiredEntries() error {
	// 清理过期的黑名单条目
	blacklist, err := sqlite.GetIPBlacklist()
	if err != nil {
		return fmt.Errorf("获取IP黑名单失败: %w", err)
	}
	
	now := time.Now()
	for _, item := range blacklist {
		if item.ExpiresAt != "" {
			expiresAt, err := time.Parse("2006-01-02 15:04:05", item.ExpiresAt)
			if err == nil && now.After(expiresAt) {
				if err := sqlite.RemoveIPFromBlacklist(item.ID); err != nil {
					fmt.Printf("删除过期IP黑名单失败: %v\n", err)
				}
			}
		}
	}
	
	// 清理速率限制缓存中的过期条目
	s.rateLimitMap.Range(func(key, value interface{}) bool {
		info := value.(*RateLimitInfo)
		currentHour := now.Unix() / 3600
		
		// 如果超过1小时没有活动，删除条目
		if currentHour-info.LastHour > 1 {
			s.rateLimitMap.Delete(key)
		}
		
		return true
	})
	
	return nil
}

// ValidateIPAddress 验证IP地址格式
func (s *APIControlService) ValidateIPAddress(ip string) error {
	// 检查是否为有效的IP地址
	if net.ParseIP(ip) != nil {
		return nil
	}
	
	// 检查是否为有效的CIDR格式
	if _, _, err := net.ParseCIDR(ip); err == nil {
		return nil
	}
	
	// 检查通配符格式（简单验证）
	if strings.Contains(ip, "*") {
		parts := strings.Split(ip, ".")
		if len(parts) == 4 {
			for _, part := range parts {
				if part != "*" {
					if num, err := strconv.Atoi(part); err != nil || num < 0 || num > 255 {
						return fmt.Errorf("无效的IP地址格式")
					}
				}
			}
			return nil
		}
	}
	
	return fmt.Errorf("无效的IP地址格式")
}

// GetCurrentRateLimitStatus 获取当前速率限制状态
func (s *APIControlService) GetCurrentRateLimitStatus(ip string) map[string]interface{} {
	status := map[string]interface{}{
		"requests_per_min":  0,
		"requests_per_hour": 0,
		"requests_per_day":  0,
		"limits": map[string]interface{}{
			"min":  s.config.RequestsPerMin,
			"hour": s.config.RequestsPerHour,
			"day":  s.config.RequestsPerDay,
		},
	}
	
	if value, exists := s.rateLimitMap.Load(ip); exists {
		info := value.(*RateLimitInfo)
		status["requests_per_min"] = info.MinuteCount
		status["requests_per_hour"] = info.HourCount
		status["requests_per_day"] = info.DayCount
	}
	
	return status
}
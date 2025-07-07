package service

import (
	"errors"
	"fmt"
	"log"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

var (
	// ErrConfigNotFound 配置不存在错误
	ErrConfigNotFound = errors.New("配置不存在")
)

// SystemService 系统服务
type SystemService struct {
	configRepo model.SystemConfigRepository
	logRepo    model.SystemLogRepository
}

// NewSystemService 创建系统服务实例
func NewSystemService(configRepo model.SystemConfigRepository, logRepo model.SystemLogRepository) *SystemService {
	return &SystemService{
		configRepo: configRepo,
		logRepo:    logRepo,
	}
}

// GetAllConfigs 获取所有系统配置
func (s *SystemService) GetAllConfigs() ([]*model.SystemConfig, error) {
	configs, err := s.configRepo.GetAll()
	if err != nil {
		s.LogError("system", "获取系统配置失败", err.Error(), nil, "")
		return nil, fmt.Errorf("获取系统配置失败: %w", err)
	}

	s.LogInfo("system", "获取系统配置成功", fmt.Sprintf("获取到%d个配置项", len(configs)), nil, "")
	return configs, nil
}

// GetConfigsByCategory 根据分类获取系统配置
func (s *SystemService) GetConfigsByCategory(category string) ([]*model.SystemConfig, error) {
	configs, err := s.configRepo.GetByCategory(category)
	if err != nil {
		s.LogError("system", "获取系统配置失败", err.Error(), nil, "")
		return nil, fmt.Errorf("获取系统配置失败: %w", err)
	}

	return configs, nil
}

// GetConfig 获取指定配置
func (s *SystemService) GetConfig(key string) (*model.SystemConfig, error) {
	config, err := s.configRepo.GetByKey(key)
	if err != nil {
		s.LogError("system", "获取系统配置失败", err.Error(), nil, "")
		return nil, fmt.Errorf("获取系统配置失败: %w", err)
	}
	if config == nil {
		return nil, ErrConfigNotFound
	}

	return config, nil
}

// UpdateConfig 更新系统配置
func (s *SystemService) UpdateConfig(key string, req *model.SystemConfigUpdateRequest, userID uint, ipAddress string) (*model.SystemConfig, error) {
	// 获取现有配置
	config, err := s.configRepo.GetByKey(key)
	if err != nil {
		s.LogError("system", "获取系统配置失败", err.Error(), &userID, ipAddress)
		return nil, fmt.Errorf("获取系统配置失败: %w", err)
	}
	if config == nil {
		s.LogError("system", "配置不存在", fmt.Sprintf("配置键: %s", key), &userID, ipAddress)
		return nil, ErrConfigNotFound
	}

	// 记录旧值
	oldValue := config.Value

	// 更新配置
	config.Value = req.Value
	if req.Description != "" {
		config.Description = req.Description
	}

	if err := s.configRepo.Update(config); err != nil {
		s.LogError("system", "更新系统配置失败", err.Error(), &userID, ipAddress)
		return nil, fmt.Errorf("更新系统配置失败: %w", err)
	}

	// 记录操作日志
	s.LogInfo("system", "更新系统配置",
		fmt.Sprintf("配置键: %s, 旧值: %s, 新值: %s", key, oldValue, config.Value),
		&userID, ipAddress)

	return config, nil
}

// BatchUpdateConfigs 批量更新系统配置
func (s *SystemService) BatchUpdateConfigs(updates map[string]string, userID uint, ipAddress string) error {
	var configs []*model.SystemConfig

	// 获取要更新的配置
	for key, value := range updates {
		config, err := s.configRepo.GetByKey(key)
		if err != nil {
			s.LogError("system", "获取系统配置失败", err.Error(), &userID, ipAddress)
			return fmt.Errorf("获取系统配置失败: %w", err)
		}
		if config == nil {
			s.LogWarn("system", "配置不存在，跳过更新", fmt.Sprintf("配置键: %s", key), &userID, ipAddress)
			continue
		}

		config.Value = value
		configs = append(configs, config)
	}

	// 批量更新
	if err := s.configRepo.BatchUpdate(configs); err != nil {
		s.LogError("system", "批量更新系统配置失败", err.Error(), &userID, ipAddress)
		return fmt.Errorf("批量更新系统配置失败: %w", err)
	}

	// 记录操作日志
	s.LogInfo("system", "批量更新系统配置",
		fmt.Sprintf("更新了%d个配置项", len(configs)),
		&userID, ipAddress)

	return nil
}

// CreateConfig 创建系统配置
func (s *SystemService) CreateConfig(req *model.SystemConfigRequest, userID uint, ipAddress string) (*model.SystemConfig, error) {
	// 检查配置是否已存在
	existing, err := s.configRepo.GetByKey(req.Key)
	if err != nil {
		s.LogError("system", "检查系统配置失败", err.Error(), &userID, ipAddress)
		return nil, fmt.Errorf("检查系统配置失败: %w", err)
	}
	if existing != nil {
		s.LogError("system", "配置已存在", fmt.Sprintf("配置键: %s", req.Key), &userID, ipAddress)
		return nil, errors.New("配置已存在")
	}

	// 创建新配置
	config := &model.SystemConfig{
		Key:         req.Key,
		Value:       req.Value,
		Description: req.Description,
		Category:    req.Category,
		Type:        req.Type,
	}

	if err := s.configRepo.Create(config); err != nil {
		s.LogError("system", "创建系统配置失败", err.Error(), &userID, ipAddress)
		return nil, fmt.Errorf("创建系统配置失败: %w", err)
	}

	// 记录操作日志
	s.LogInfo("system", "创建系统配置",
		fmt.Sprintf("配置键: %s, 值: %s", config.Key, config.Value),
		&userID, ipAddress)

	return config, nil
}

// DeleteConfig 删除系统配置
func (s *SystemService) DeleteConfig(key string, userID uint, ipAddress string) error {
	// 检查配置是否存在
	config, err := s.configRepo.GetByKey(key)
	if err != nil {
		s.LogError("system", "获取系统配置失败", err.Error(), &userID, ipAddress)
		return fmt.Errorf("获取系统配置失败: %w", err)
	}
	if config == nil {
		return ErrConfigNotFound
	}

	if err := s.configRepo.Delete(key); err != nil {
		s.LogError("system", "删除系统配置失败", err.Error(), &userID, ipAddress)
		return fmt.Errorf("删除系统配置失败: %w", err)
	}

	// 记录操作日志
	s.LogInfo("system", "删除系统配置",
		fmt.Sprintf("配置键: %s", key),
		&userID, ipAddress)

	return nil
}

// GetLogs 获取系统日志
func (s *SystemService) GetLogs(limit, offset int) ([]*model.SystemLog, error) {
	logs, err := s.logRepo.GetAll(limit, offset)
	if err != nil {
		return nil, fmt.Errorf("获取系统日志失败: %w", err)
	}

	return logs, nil
}

// GetLogsByLevel 根据级别获取系统日志
func (s *SystemService) GetLogsByLevel(level string, limit, offset int) ([]*model.SystemLog, error) {
	logs, err := s.logRepo.GetByLevel(level, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("获取系统日志失败: %w", err)
	}

	return logs, nil
}

// GetLogsByModule 根据模块获取系统日志
func (s *SystemService) GetLogsByModule(module string, limit, offset int) ([]*model.SystemLog, error) {
	logs, err := s.logRepo.GetByModule(module, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("获取系统日志失败: %w", err)
	}

	return logs, nil
}

// GetLogsByDateRange 根据时间范围获取系统日志
func (s *SystemService) GetLogsByDateRange(startTime, endTime time.Time, limit, offset int) ([]*model.SystemLog, error) {
	logs, err := s.logRepo.GetByDateRange(startTime, endTime, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("获取系统日志失败: %w", err)
	}

	return logs, nil
}

// DeleteLog 删除系统日志
func (s *SystemService) DeleteLog(id uint, userID uint, ipAddress string) error {
	if err := s.logRepo.Delete(id); err != nil {
		s.LogError("system", "删除系统日志失败", err.Error(), &userID, ipAddress)
		return fmt.Errorf("删除系统日志失败: %w", err)
	}

	s.LogInfo("system", "删除系统日志",
		fmt.Sprintf("日志ID: %d", id),
		&userID, ipAddress)

	return nil
}

// ClearLogs 清除指定时间范围的日志
func (s *SystemService) ClearLogs(startTime, endTime time.Time, userID uint, ipAddress string) error {
	if err := s.logRepo.DeleteByDateRange(startTime, endTime); err != nil {
		s.LogError("system", "清除系统日志失败", err.Error(), &userID, ipAddress)
		return fmt.Errorf("清除系统日志失败: %w", err)
	}

	s.LogInfo("system", "清除系统日志",
		fmt.Sprintf("时间范围: %s 到 %s", startTime.Format("2006-01-02"), endTime.Format("2006-01-02")),
		&userID, ipAddress)

	return nil
}

// GetLogStats 获取日志统计信息
func (s *SystemService) GetLogStats() (map[string]interface{}, error) {
	stats, err := s.logRepo.GetStats()
	if err != nil {
		return nil, fmt.Errorf("获取日志统计失败: %w", err)
	}

	return stats, nil
}

// 日志记录辅助方法

// LogInfo 记录信息日志
func (s *SystemService) LogInfo(module, message, details string, userID *uint, ipAddress string) {
	s.createLog("info", module, message, details, userID, ipAddress)
}

// LogWarn 记录警告日志
func (s *SystemService) LogWarn(module, message, details string, userID *uint, ipAddress string) {
	s.createLog("warn", module, message, details, userID, ipAddress)
}

// LogError 记录错误日志
func (s *SystemService) LogError(module, message, details string, userID *uint, ipAddress string) {
	s.createLog("error", module, message, details, userID, ipAddress)
}

// LogDebug 记录调试日志
func (s *SystemService) LogDebug(module, message, details string, userID *uint, ipAddress string) {
	s.createLog("debug", module, message, details, userID, ipAddress)
}

// createLog 创建日志记录
func (s *SystemService) createLog(level, module, message, details string, userID *uint, ipAddress string) {
	logEntry := &model.SystemLog{
		Level:     level,
		Module:    module,
		Message:   message,
		Details:   details,
		UserID:    userID,
		IPAddress: ipAddress,
	}

	if err := s.logRepo.Create(logEntry); err != nil {
		log.Printf("创建系统日志失败: %v", err)
	}
}
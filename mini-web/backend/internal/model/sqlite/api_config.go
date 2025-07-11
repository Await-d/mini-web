package sqlite

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// APIConfig API访问配置结构
type APIConfig struct {
	ID               int    `json:"id" db:"id"`
	Name             string `json:"name" db:"name"`
	Description      string `json:"description" db:"description"`
	RateLimitEnabled bool   `json:"rate_limit_enabled" db:"rate_limit_enabled"`
	RequestsPerMin   int    `json:"requests_per_min" db:"requests_per_min"`
	RequestsPerHour  int    `json:"requests_per_hour" db:"requests_per_hour"`
	RequestsPerDay   int    `json:"requests_per_day" db:"requests_per_day"`
	IPWhitelistEnabled bool `json:"ip_whitelist_enabled" db:"ip_whitelist_enabled"`
	IPBlacklistEnabled bool `json:"ip_blacklist_enabled" db:"ip_blacklist_enabled"`
	APIKeyRequired   bool   `json:"api_key_required" db:"api_key_required"`
	IsEnabled        bool   `json:"is_enabled" db:"is_enabled"`
	CreatedAt        string `json:"created_at" db:"created_at"`
	UpdatedAt        string `json:"updated_at" db:"updated_at"`
}

// APIKey API密钥结构
type APIKey struct {
	ID          int    `json:"id" db:"id"`
	Name        string `json:"name" db:"name"`
	KeyValue    string `json:"key_value" db:"key_value"`
	SecretValue string `json:"secret_value" db:"secret_value"`
	UserID      int    `json:"user_id" db:"user_id"`
	Permissions string `json:"permissions" db:"permissions"` // JSON格式的权限列表
	ExpiresAt   string `json:"expires_at" db:"expires_at"`
	LastUsedAt  string `json:"last_used_at" db:"last_used_at"`
	UsageCount  int    `json:"usage_count" db:"usage_count"`
	IsEnabled   bool   `json:"is_enabled" db:"is_enabled"`
	CreatedAt   string `json:"created_at" db:"created_at"`
	UpdatedAt   string `json:"updated_at" db:"updated_at"`
}

// IPWhitelist IP白名单结构
type IPWhitelist struct {
	ID          int    `json:"id" db:"id"`
	IPAddress   string `json:"ip_address" db:"ip_address"`
	Description string `json:"description" db:"description"`
	IsEnabled   bool   `json:"is_enabled" db:"is_enabled"`
	CreatedAt   string `json:"created_at" db:"created_at"`
	UpdatedAt   string `json:"updated_at" db:"updated_at"`
}

// IPBlacklist IP黑名单结构
type IPBlacklist struct {
	ID          int    `json:"id" db:"id"`
	IPAddress   string `json:"ip_address" db:"ip_address"`
	Reason      string `json:"reason" db:"reason"`
	BlockedAt   string `json:"blocked_at" db:"blocked_at"`
	ExpiresAt   string `json:"expires_at" db:"expires_at"`
	IsEnabled   bool   `json:"is_enabled" db:"is_enabled"`
	CreatedAt   string `json:"created_at" db:"created_at"`
	UpdatedAt   string `json:"updated_at" db:"updated_at"`
}

// APIAccessLog API访问日志结构
type APIAccessLog struct {
	ID          int    `json:"id" db:"id"`
	IPAddress   string `json:"ip_address" db:"ip_address"`
	UserAgent   string `json:"user_agent" db:"user_agent"`
	Method      string `json:"method" db:"method"`
	Path        string `json:"path" db:"path"`
	StatusCode  int    `json:"status_code" db:"status_code"`
	ResponseTime int   `json:"response_time" db:"response_time"` // 毫秒
	APIKeyID    int    `json:"api_key_id" db:"api_key_id"`
	UserID      int    `json:"user_id" db:"user_id"`
	RequestSize int    `json:"request_size" db:"request_size"`
	ResponseSize int   `json:"response_size" db:"response_size"`
	CreatedAt   string `json:"created_at" db:"created_at"`
}

// GetAPIConfig 获取API访问配置
func GetAPIConfig() (*APIConfig, error) {
	query := `
		SELECT id, name, description, rate_limit_enabled, requests_per_min, 
		       requests_per_hour, requests_per_day, ip_whitelist_enabled, 
		       ip_blacklist_enabled, api_key_required, is_enabled, 
		       created_at, updated_at
		FROM api_configs 
		ORDER BY id DESC 
		LIMIT 1
	`
	
	config := &APIConfig{}
	err := DB.QueryRow(query).Scan(
		&config.ID, &config.Name, &config.Description, &config.RateLimitEnabled,
		&config.RequestsPerMin, &config.RequestsPerHour, &config.RequestsPerDay,
		&config.IPWhitelistEnabled, &config.IPBlacklistEnabled, &config.APIKeyRequired,
		&config.IsEnabled, &config.CreatedAt, &config.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			// 返回默认配置
			return &APIConfig{
				Name:               "默认API访问配置",
				Description:        "系统默认的API访问控制配置",
				RateLimitEnabled:   true,
				RequestsPerMin:     60,
				RequestsPerHour:    1000,
				RequestsPerDay:     10000,
				IPWhitelistEnabled: false,
				IPBlacklistEnabled: true,
				APIKeyRequired:     false,
				IsEnabled:          true,
			}, nil
		}
		return nil, fmt.Errorf("获取API配置失败: %w", err)
	}
	
	return config, nil
}

// CreateOrUpdateAPIConfig 创建或更新API配置
func CreateOrUpdateAPIConfig(config *APIConfig) error {
	// 检查是否已存在配置
	existingConfig, err := GetAPIConfig()
	if err != nil {
		return fmt.Errorf("检查现有配置失败: %w", err)
	}
	
	if existingConfig.ID > 0 {
		// 更新现有配置
		query := `
			UPDATE api_configs 
			SET name = ?, description = ?, rate_limit_enabled = ?, requests_per_min = ?,
			    requests_per_hour = ?, requests_per_day = ?, ip_whitelist_enabled = ?,
			    ip_blacklist_enabled = ?, api_key_required = ?, is_enabled = ?,
			    updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`
		
		_, err = DB.Exec(query,
			config.Name, config.Description, config.RateLimitEnabled,
			config.RequestsPerMin, config.RequestsPerHour, config.RequestsPerDay,
			config.IPWhitelistEnabled, config.IPBlacklistEnabled, config.APIKeyRequired,
			config.IsEnabled, existingConfig.ID)
		
		if err != nil {
			return fmt.Errorf("更新API配置失败: %w", err)
		}
		
		config.ID = existingConfig.ID
		log.Printf("API配置已更新，ID: %d", existingConfig.ID)
	} else {
		// 创建新配置
		query := `
			INSERT INTO api_configs (name, description, rate_limit_enabled, requests_per_min,
			                        requests_per_hour, requests_per_day, ip_whitelist_enabled,
			                        ip_blacklist_enabled, api_key_required, is_enabled,
			                        created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		`
		
		result, err := DB.Exec(query,
			config.Name, config.Description, config.RateLimitEnabled,
			config.RequestsPerMin, config.RequestsPerHour, config.RequestsPerDay,
			config.IPWhitelistEnabled, config.IPBlacklistEnabled, config.APIKeyRequired,
			config.IsEnabled)
		
		if err != nil {
			return fmt.Errorf("创建API配置失败: %w", err)
		}
		
		id, _ := result.LastInsertId()
		config.ID = int(id)
		log.Printf("API配置已创建，ID: %d", id)
	}
	
	return nil
}

// GetAPIKeys 获取API密钥列表
func GetAPIKeys() ([]APIKey, error) {
	query := `
		SELECT id, name, key_value, secret_value, user_id, permissions, 
		       expires_at, last_used_at, usage_count, is_enabled, 
		       created_at, updated_at
		FROM api_keys
		ORDER BY created_at DESC
	`
	
	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询API密钥失败: %w", err)
	}
	defer rows.Close()
	
	var keys []APIKey
	for rows.Next() {
		var key APIKey
		err := rows.Scan(&key.ID, &key.Name, &key.KeyValue, &key.SecretValue,
			&key.UserID, &key.Permissions, &key.ExpiresAt, &key.LastUsedAt,
			&key.UsageCount, &key.IsEnabled, &key.CreatedAt, &key.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("扫描API密钥失败: %w", err)
		}
		keys = append(keys, key)
	}
	
	return keys, nil
}

// CreateAPIKey 创建API密钥
func CreateAPIKey(key *APIKey) error {
	query := `
		INSERT INTO api_keys (name, key_value, secret_value, user_id, permissions,
		                     expires_at, usage_count, is_enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query, key.Name, key.KeyValue, key.SecretValue,
		key.UserID, key.Permissions, key.ExpiresAt, key.IsEnabled)
	if err != nil {
		return fmt.Errorf("创建API密钥失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	key.ID = int(id)
	log.Printf("API密钥已创建，ID: %d", id)
	
	return nil
}

// UpdateAPIKey 更新API密钥
func UpdateAPIKey(key *APIKey) error {
	query := `
		UPDATE api_keys 
		SET name = ?, permissions = ?, expires_at = ?, is_enabled = ?,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	
	_, err := DB.Exec(query, key.Name, key.Permissions, key.ExpiresAt,
		key.IsEnabled, key.ID)
	if err != nil {
		return fmt.Errorf("更新API密钥失败: %w", err)
	}
	
	log.Printf("API密钥已更新，ID: %d", key.ID)
	return nil
}

// DeleteAPIKey 删除API密钥
func DeleteAPIKey(id int) error {
	query := "DELETE FROM api_keys WHERE id = ?"
	result, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("删除API密钥失败: %w", err)
	}
	
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("API密钥不存在，ID: %d", id)
	}
	
	log.Printf("API密钥已删除，ID: %d", id)
	return nil
}

// GetIPWhitelist 获取IP白名单
func GetIPWhitelist() ([]IPWhitelist, error) {
	query := `
		SELECT id, ip_address, description, is_enabled, created_at, updated_at
		FROM ip_whitelist
		ORDER BY created_at DESC
	`
	
	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询IP白名单失败: %w", err)
	}
	defer rows.Close()
	
	var list []IPWhitelist
	for rows.Next() {
		var item IPWhitelist
		err := rows.Scan(&item.ID, &item.IPAddress, &item.Description,
			&item.IsEnabled, &item.CreatedAt, &item.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("扫描IP白名单失败: %w", err)
		}
		list = append(list, item)
	}
	
	return list, nil
}

// AddIPToWhitelist 添加IP到白名单
func AddIPToWhitelist(item *IPWhitelist) error {
	query := `
		INSERT INTO ip_whitelist (ip_address, description, is_enabled, created_at, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query, item.IPAddress, item.Description, item.IsEnabled)
	if err != nil {
		return fmt.Errorf("添加IP白名单失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	item.ID = int(id)
	log.Printf("IP白名单已添加，ID: %d, IP: %s", id, item.IPAddress)
	
	return nil
}

// RemoveIPFromWhitelist 从白名单移除IP
func RemoveIPFromWhitelist(id int) error {
	query := "DELETE FROM ip_whitelist WHERE id = ?"
	result, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("删除IP白名单失败: %w", err)
	}
	
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("IP白名单不存在，ID: %d", id)
	}
	
	log.Printf("IP白名单已删除，ID: %d", id)
	return nil
}

// GetIPBlacklist 获取IP黑名单
func GetIPBlacklist() ([]IPBlacklist, error) {
	query := `
		SELECT id, ip_address, reason, blocked_at, expires_at, is_enabled, 
		       created_at, updated_at
		FROM ip_blacklist
		ORDER BY created_at DESC
	`
	
	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询IP黑名单失败: %w", err)
	}
	defer rows.Close()
	
	var list []IPBlacklist
	for rows.Next() {
		var item IPBlacklist
		err := rows.Scan(&item.ID, &item.IPAddress, &item.Reason, &item.BlockedAt,
			&item.ExpiresAt, &item.IsEnabled, &item.CreatedAt, &item.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("扫描IP黑名单失败: %w", err)
		}
		list = append(list, item)
	}
	
	return list, nil
}

// AddIPToBlacklist 添加IP到黑名单
func AddIPToBlacklist(item *IPBlacklist) error {
	query := `
		INSERT INTO ip_blacklist (ip_address, reason, blocked_at, expires_at, 
		                         is_enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query, item.IPAddress, item.Reason, item.BlockedAt,
		item.ExpiresAt, item.IsEnabled)
	if err != nil {
		return fmt.Errorf("添加IP黑名单失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	item.ID = int(id)
	log.Printf("IP黑名单已添加，ID: %d, IP: %s", id, item.IPAddress)
	
	return nil
}

// RemoveIPFromBlacklist 从黑名单移除IP
func RemoveIPFromBlacklist(id int) error {
	query := "DELETE FROM ip_blacklist WHERE id = ?"
	result, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("删除IP黑名单失败: %w", err)
	}
	
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("IP黑名单不存在，ID: %d", id)
	}
	
	log.Printf("IP黑名单已删除，ID: %d", id)
	return nil
}

// LogAPIAccess 记录API访问日志
func LogAPIAccess(log *APIAccessLog) error {
	query := `
		INSERT INTO api_access_logs (ip_address, user_agent, method, path, status_code,
		                           response_time, api_key_id, user_id, request_size,
		                           response_size, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query, log.IPAddress, log.UserAgent, log.Method, log.Path,
		log.StatusCode, log.ResponseTime, log.APIKeyID, log.UserID,
		log.RequestSize, log.ResponseSize)
	if err != nil {
		return fmt.Errorf("记录API访问日志失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	log.ID = int(id)
	
	return nil
}

// GetAPIAccessLogs 获取API访问日志
func GetAPIAccessLogs(limit, offset int, filters map[string]interface{}) ([]APIAccessLog, error) {
	query := `
		SELECT id, ip_address, user_agent, method, path, status_code,
		       response_time, api_key_id, user_id, request_size, response_size, created_at
		FROM api_access_logs
		WHERE 1=1
	`
	args := []interface{}{}
	
	// 添加过滤条件
	if ipAddress, ok := filters["ip_address"]; ok && ipAddress != "" {
		query += " AND ip_address LIKE ?"
		args = append(args, "%"+ipAddress.(string)+"%")
	}
	
	if method, ok := filters["method"]; ok && method != "" {
		query += " AND method = ?"
		args = append(args, method)
	}
	
	if statusCode, ok := filters["status_code"]; ok && statusCode != 0 {
		query += " AND status_code = ?"
		args = append(args, statusCode)
	}
	
	if startTime, ok := filters["start_time"]; ok && startTime != "" {
		query += " AND created_at >= ?"
		args = append(args, startTime)
	}
	
	if endTime, ok := filters["end_time"]; ok && endTime != "" {
		query += " AND created_at <= ?"
		args = append(args, endTime)
	}
	
	query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)
	
	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询API访问日志失败: %w", err)
	}
	defer rows.Close()
	
	var logs []APIAccessLog
	for rows.Next() {
		var log APIAccessLog
		err := rows.Scan(&log.ID, &log.IPAddress, &log.UserAgent, &log.Method,
			&log.Path, &log.StatusCode, &log.ResponseTime, &log.APIKeyID,
			&log.UserID, &log.RequestSize, &log.ResponseSize, &log.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("扫描API访问日志失败: %w", err)
		}
		logs = append(logs, log)
	}
	
	return logs, nil
}

// UpdateAPIKeyUsage 更新API密钥使用情况
func UpdateAPIKeyUsage(keyID int) error {
	query := `
		UPDATE api_keys 
		SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	
	_, err := DB.Exec(query, keyID)
	if err != nil {
		return fmt.Errorf("更新API密钥使用情况失败: %w", err)
	}
	
	return nil
}

// ValidateAPIKey 验证API密钥
func ValidateAPIKey(keyValue string) (*APIKey, error) {
	query := `
		SELECT id, name, key_value, secret_value, user_id, permissions, 
		       expires_at, last_used_at, usage_count, is_enabled, 
		       created_at, updated_at
		FROM api_keys
		WHERE key_value = ? AND is_enabled = 1
	`
	
	key := &APIKey{}
	err := DB.QueryRow(query, keyValue).Scan(
		&key.ID, &key.Name, &key.KeyValue, &key.SecretValue,
		&key.UserID, &key.Permissions, &key.ExpiresAt, &key.LastUsedAt,
		&key.UsageCount, &key.IsEnabled, &key.CreatedAt, &key.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("无效的API密钥")
		}
		return nil, fmt.Errorf("验证API密钥失败: %w", err)
	}
	
	// 检查是否过期
	if key.ExpiresAt != "" {
		expiresAt, err := time.Parse("2006-01-02 15:04:05", key.ExpiresAt)
		if err == nil && time.Now().After(expiresAt) {
			return nil, fmt.Errorf("API密钥已过期")
		}
	}
	
	return key, nil
}
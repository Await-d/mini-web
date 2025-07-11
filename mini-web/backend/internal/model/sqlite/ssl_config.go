package sqlite

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// SSLConfig SSL配置结构
type SSLConfig struct {
	ID          int    `json:"id" db:"id"`
	Name        string `json:"name" db:"name"`
	Domain      string `json:"domain" db:"domain"`
	CertPath    string `json:"cert_path" db:"cert_path"`
	KeyPath     string `json:"key_path" db:"key_path"`
	CertContent string `json:"cert_content" db:"cert_content"`
	KeyContent  string `json:"key_content" db:"key_content"`
	Issuer      string `json:"issuer" db:"issuer"`
	Subject     string `json:"subject" db:"subject"`
	NotBefore   string `json:"not_before" db:"not_before"`
	NotAfter    string `json:"not_after" db:"not_after"`
	IsEnabled   bool   `json:"is_enabled" db:"is_enabled"`
	IsDefault   bool   `json:"is_default" db:"is_default"`
	CreatedAt   string `json:"created_at" db:"created_at"`
	UpdatedAt   string `json:"updated_at" db:"updated_at"`
}

// SSLCertInfo SSL证书信息
type SSLCertInfo struct {
	Subject     string    `json:"subject"`
	Issuer      string    `json:"issuer"`
	NotBefore   time.Time `json:"not_before"`
	NotAfter    time.Time `json:"not_after"`
	DNSNames    []string  `json:"dns_names"`
	SerialNumber string   `json:"serial_number"`
	IsValid     bool      `json:"is_valid"`
	DaysUntilExpiry int   `json:"days_until_expiry"`
}

// GetSSLConfigs 获取所有SSL配置
func GetSSLConfigs() ([]SSLConfig, error) {
	query := `
		SELECT id, name, domain, cert_path, key_path, cert_content, key_content,
		       issuer, subject, not_before, not_after, is_enabled, is_default,
		       created_at, updated_at
		FROM ssl_configs
		ORDER BY is_default DESC, created_at DESC
	`
	
	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询SSL配置失败: %w", err)
	}
	defer rows.Close()
	
	var configs []SSLConfig
	for rows.Next() {
		var config SSLConfig
		err := rows.Scan(
			&config.ID, &config.Name, &config.Domain, &config.CertPath,
			&config.KeyPath, &config.CertContent, &config.KeyContent,
			&config.Issuer, &config.Subject, &config.NotBefore, &config.NotAfter,
			&config.IsEnabled, &config.IsDefault, &config.CreatedAt, &config.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描SSL配置失败: %w", err)
		}
		configs = append(configs, config)
	}
	
	return configs, nil
}

// GetSSLConfigByID 根据ID获取SSL配置
func GetSSLConfigByID(id int) (*SSLConfig, error) {
	query := `
		SELECT id, name, domain, cert_path, key_path, cert_content, key_content,
		       issuer, subject, not_before, not_after, is_enabled, is_default,
		       created_at, updated_at
		FROM ssl_configs
		WHERE id = ?
	`
	
	config := &SSLConfig{}
	err := DB.QueryRow(query, id).Scan(
		&config.ID, &config.Name, &config.Domain, &config.CertPath,
		&config.KeyPath, &config.CertContent, &config.KeyContent,
		&config.Issuer, &config.Subject, &config.NotBefore, &config.NotAfter,
		&config.IsEnabled, &config.IsDefault, &config.CreatedAt, &config.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("SSL配置不存在，ID: %d", id)
		}
		return nil, fmt.Errorf("获取SSL配置失败: %w", err)
	}
	
	return config, nil
}

// GetDefaultSSLConfig 获取默认SSL配置
func GetDefaultSSLConfig() (*SSLConfig, error) {
	query := `
		SELECT id, name, domain, cert_path, key_path, cert_content, key_content,
		       issuer, subject, not_before, not_after, is_enabled, is_default,
		       created_at, updated_at
		FROM ssl_configs
		WHERE is_default = 1 AND is_enabled = 1
		LIMIT 1
	`
	
	config := &SSLConfig{}
	err := DB.QueryRow(query).Scan(
		&config.ID, &config.Name, &config.Domain, &config.CertPath,
		&config.KeyPath, &config.CertContent, &config.KeyContent,
		&config.Issuer, &config.Subject, &config.NotBefore, &config.NotAfter,
		&config.IsEnabled, &config.IsDefault, &config.CreatedAt, &config.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("未找到默认SSL配置")
		}
		return nil, fmt.Errorf("获取默认SSL配置失败: %w", err)
	}
	
	return config, nil
}

// CreateSSLConfig 创建SSL配置
func CreateSSLConfig(config *SSLConfig) error {
	// 如果设置为默认配置，先取消其他默认配置
	if config.IsDefault {
		_, err := DB.Exec("UPDATE ssl_configs SET is_default = 0")
		if err != nil {
			return fmt.Errorf("更新默认SSL配置状态失败: %w", err)
		}
	}
	
	query := `
		INSERT INTO ssl_configs (name, domain, cert_path, key_path, cert_content, key_content,
		                        issuer, subject, not_before, not_after, is_enabled, is_default,
		                        created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query,
		config.Name, config.Domain, config.CertPath, config.KeyPath,
		config.CertContent, config.KeyContent, config.Issuer, config.Subject,
		config.NotBefore, config.NotAfter, config.IsEnabled, config.IsDefault,
	)
	
	if err != nil {
		return fmt.Errorf("创建SSL配置失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	config.ID = int(id)
	log.Printf("SSL配置已创建，ID: %d", id)
	
	return nil
}

// UpdateSSLConfig 更新SSL配置
func UpdateSSLConfig(config *SSLConfig) error {
	// 如果设置为默认配置，先取消其他默认配置
	if config.IsDefault {
		_, err := DB.Exec("UPDATE ssl_configs SET is_default = 0 WHERE id != ?", config.ID)
		if err != nil {
			return fmt.Errorf("更新默认SSL配置状态失败: %w", err)
		}
	}
	
	query := `
		UPDATE ssl_configs 
		SET name = ?, domain = ?, cert_path = ?, key_path = ?, cert_content = ?, key_content = ?,
		    issuer = ?, subject = ?, not_before = ?, not_after = ?, is_enabled = ?, is_default = ?,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	
	_, err := DB.Exec(query,
		config.Name, config.Domain, config.CertPath, config.KeyPath,
		config.CertContent, config.KeyContent, config.Issuer, config.Subject,
		config.NotBefore, config.NotAfter, config.IsEnabled, config.IsDefault,
		config.ID,
	)
	
	if err != nil {
		return fmt.Errorf("更新SSL配置失败: %w", err)
	}
	
	log.Printf("SSL配置已更新，ID: %d", config.ID)
	return nil
}

// DeleteSSLConfig 删除SSL配置
func DeleteSSLConfig(id int) error {
	// 检查是否为默认配置
	config, err := GetSSLConfigByID(id)
	if err != nil {
		return err
	}
	
	if config.IsDefault {
		return fmt.Errorf("不能删除默认SSL配置")
	}
	
	query := "DELETE FROM ssl_configs WHERE id = ?"
	result, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("删除SSL配置失败: %w", err)
	}
	
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("SSL配置不存在，ID: %d", id)
	}
	
	log.Printf("SSL配置已删除，ID: %d", id)
	return nil
}

// EnableSSLConfig 启用SSL配置
func EnableSSLConfig(id int) error {
	query := "UPDATE ssl_configs SET is_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
	_, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("启用SSL配置失败: %w", err)
	}
	
	log.Printf("SSL配置已启用，ID: %d", id)
	return nil
}

// DisableSSLConfig 禁用SSL配置
func DisableSSLConfig(id int) error {
	// 检查是否为默认配置
	config, err := GetSSLConfigByID(id)
	if err != nil {
		return err
	}
	
	if config.IsDefault {
		return fmt.Errorf("不能禁用默认SSL配置")
	}
	
	query := "UPDATE ssl_configs SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
	_, err = DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("禁用SSL配置失败: %w", err)
	}
	
	log.Printf("SSL配置已禁用，ID: %d", id)
	return nil
}

// SetDefaultSSLConfig 设置默认SSL配置
func SetDefaultSSLConfig(id int) error {
	// 开启事务
	tx, err := DB.Begin()
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	defer tx.Rollback()
	
	// 取消所有默认配置
	_, err = tx.Exec("UPDATE ssl_configs SET is_default = 0")
	if err != nil {
		return fmt.Errorf("取消默认SSL配置失败: %w", err)
	}
	
	// 设置新的默认配置
	_, err = tx.Exec("UPDATE ssl_configs SET is_default = 1, is_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("设置默认SSL配置失败: %w", err)
	}
	
	// 提交事务
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	
	log.Printf("默认SSL配置已设置，ID: %d", id)
	return nil
}

// GetExpiringSSLConfigs 获取即将过期的SSL证书（30天内）
func GetExpiringSSLConfigs() ([]SSLConfig, error) {
	query := `
		SELECT id, name, domain, cert_path, key_path, cert_content, key_content,
		       issuer, subject, not_before, not_after, is_enabled, is_default,
		       created_at, updated_at
		FROM ssl_configs
		WHERE is_enabled = 1 AND datetime(not_after) BETWEEN datetime('now') AND datetime('now', '+30 days')
		ORDER BY not_after ASC
	`
	
	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询即将过期的SSL证书失败: %w", err)
	}
	defer rows.Close()
	
	var configs []SSLConfig
	for rows.Next() {
		var config SSLConfig
		err := rows.Scan(
			&config.ID, &config.Name, &config.Domain, &config.CertPath,
			&config.KeyPath, &config.CertContent, &config.KeyContent,
			&config.Issuer, &config.Subject, &config.NotBefore, &config.NotAfter,
			&config.IsEnabled, &config.IsDefault, &config.CreatedAt, &config.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描即将过期的SSL证书失败: %w", err)
		}
		configs = append(configs, config)
	}
	
	return configs, nil
}
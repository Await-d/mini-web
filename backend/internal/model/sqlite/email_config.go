package sqlite

import (
	"database/sql"
	"fmt"
	"log"
)

// EmailConfig 邮件配置结构
type EmailConfig struct {
	ID          int    `json:"id" db:"id"`
	SMTPHost    string `json:"smtp_host" db:"smtp_host"`
	SMTPPort    int    `json:"smtp_port" db:"smtp_port"`
	Username    string `json:"username" db:"username"`
	Password    string `json:"password" db:"password"`
	FromEmail   string `json:"from_email" db:"from_email"`
	FromName    string `json:"from_name" db:"from_name"`
	EnableTLS   bool   `json:"enable_tls" db:"enable_tls"`
	EnableSSL   bool   `json:"enable_ssl" db:"enable_ssl"`
	TestEmail   string `json:"test_email" db:"test_email"`
	IsEnabled   bool   `json:"is_enabled" db:"is_enabled"`
	CreatedAt   string `json:"created_at" db:"created_at"`
	UpdatedAt   string `json:"updated_at" db:"updated_at"`
}

// EmailTemplate 邮件模板结构
type EmailTemplate struct {
	ID        int    `json:"id" db:"id"`
	Name      string `json:"name" db:"name"`
	Subject   string `json:"subject" db:"subject"`
	Body      string `json:"body" db:"body"`
	Type      string `json:"type" db:"type"` // welcome, reset_password, notification
	IsDefault bool   `json:"is_default" db:"is_default"`
	CreatedAt string `json:"created_at" db:"created_at"`
	UpdatedAt string `json:"updated_at" db:"updated_at"`
}

// GetEmailConfig 获取邮件配置
func GetEmailConfig() (*EmailConfig, error) {
	query := `
		SELECT id, smtp_host, smtp_port, username, password, from_email, from_name,
		       enable_tls, enable_ssl, test_email, is_enabled, created_at, updated_at
		FROM email_configs 
		ORDER BY id DESC 
		LIMIT 1
	`
	
	config := &EmailConfig{}
	err := DB.QueryRow(query).Scan(
		&config.ID, &config.SMTPHost, &config.SMTPPort, &config.Username,
		&config.Password, &config.FromEmail, &config.FromName, &config.EnableTLS,
		&config.EnableSSL, &config.TestEmail, &config.IsEnabled,
		&config.CreatedAt, &config.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			// 返回默认配置
			return &EmailConfig{
				SMTPHost:  "smtp.gmail.com",
				SMTPPort:  587,
				EnableTLS: true,
				EnableSSL: false,
				IsEnabled: false,
			}, nil
		}
		return nil, fmt.Errorf("获取邮件配置失败: %w", err)
	}
	
	return config, nil
}

// CreateOrUpdateEmailConfig 创建或更新邮件配置
func CreateOrUpdateEmailConfig(config *EmailConfig) error {
	// 检查是否已存在配置
	existingConfig, err := GetEmailConfig()
	if err != nil {
		return fmt.Errorf("检查现有配置失败: %w", err)
	}
	
	if existingConfig.ID > 0 {
		// 更新现有配置
		query := `
			UPDATE email_configs 
			SET smtp_host = ?, smtp_port = ?, username = ?, password = ?, 
			    from_email = ?, from_name = ?, enable_tls = ?, enable_ssl = ?,
			    test_email = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`
		
		_, err = DB.Exec(query, config.SMTPHost, config.SMTPPort, config.Username,
			config.Password, config.FromEmail, config.FromName, config.EnableTLS,
			config.EnableSSL, config.TestEmail, config.IsEnabled, existingConfig.ID)
		
		if err != nil {
			return fmt.Errorf("更新邮件配置失败: %w", err)
		}
		
		log.Printf("邮件配置已更新，ID: %d", existingConfig.ID)
	} else {
		// 创建新配置
		query := `
			INSERT INTO email_configs (smtp_host, smtp_port, username, password, 
			                          from_email, from_name, enable_tls, enable_ssl,
			                          test_email, is_enabled, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		`
		
		result, err := DB.Exec(query, config.SMTPHost, config.SMTPPort, config.Username,
			config.Password, config.FromEmail, config.FromName, config.EnableTLS,
			config.EnableSSL, config.TestEmail, config.IsEnabled)
		
		if err != nil {
			return fmt.Errorf("创建邮件配置失败: %w", err)
		}
		
		id, _ := result.LastInsertId()
		log.Printf("邮件配置已创建，ID: %d", id)
	}
	
	return nil
}

// GetEmailTemplates 获取邮件模板列表
func GetEmailTemplates() ([]EmailTemplate, error) {
	query := `
		SELECT id, name, subject, body, type, is_default, created_at, updated_at
		FROM email_templates
		ORDER BY type, is_default DESC, name
	`
	
	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询邮件模板失败: %w", err)
	}
	defer rows.Close()
	
	var templates []EmailTemplate
	for rows.Next() {
		var template EmailTemplate
		err := rows.Scan(&template.ID, &template.Name, &template.Subject,
			&template.Body, &template.Type, &template.IsDefault,
			&template.CreatedAt, &template.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("扫描邮件模板失败: %w", err)
		}
		templates = append(templates, template)
	}
	
	return templates, nil
}

// GetEmailTemplateByType 根据类型获取邮件模板
func GetEmailTemplateByType(templateType string) (*EmailTemplate, error) {
	query := `
		SELECT id, name, subject, body, type, is_default, created_at, updated_at
		FROM email_templates
		WHERE type = ? AND is_default = 1
		LIMIT 1
	`
	
	template := &EmailTemplate{}
	err := DB.QueryRow(query, templateType).Scan(
		&template.ID, &template.Name, &template.Subject, &template.Body,
		&template.Type, &template.IsDefault, &template.CreatedAt, &template.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("未找到类型为 %s 的邮件模板", templateType)
		}
		return nil, fmt.Errorf("获取邮件模板失败: %w", err)
	}
	
	return template, nil
}

// CreateEmailTemplate 创建邮件模板
func CreateEmailTemplate(template *EmailTemplate) error {
	// 如果设置为默认模板，先取消同类型的其他默认模板
	if template.IsDefault {
		_, err := DB.Exec("UPDATE email_templates SET is_default = 0 WHERE type = ?", template.Type)
		if err != nil {
			return fmt.Errorf("更新默认模板状态失败: %w", err)
		}
	}
	
	query := `
		INSERT INTO email_templates (name, subject, body, type, is_default, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query, template.Name, template.Subject, template.Body,
		template.Type, template.IsDefault)
	if err != nil {
		return fmt.Errorf("创建邮件模板失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	template.ID = int(id)
	log.Printf("邮件模板已创建，ID: %d", id)
	
	return nil
}

// UpdateEmailTemplate 更新邮件模板
func UpdateEmailTemplate(template *EmailTemplate) error {
	// 如果设置为默认模板，先取消同类型的其他默认模板
	if template.IsDefault {
		_, err := DB.Exec("UPDATE email_templates SET is_default = 0 WHERE type = ? AND id != ?", 
			template.Type, template.ID)
		if err != nil {
			return fmt.Errorf("更新默认模板状态失败: %w", err)
		}
	}
	
	query := `
		UPDATE email_templates 
		SET name = ?, subject = ?, body = ?, type = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	
	_, err := DB.Exec(query, template.Name, template.Subject, template.Body,
		template.Type, template.IsDefault, template.ID)
	if err != nil {
		return fmt.Errorf("更新邮件模板失败: %w", err)
	}
	
	log.Printf("邮件模板已更新，ID: %d", template.ID)
	return nil
}

// DeleteEmailTemplate 删除邮件模板
func DeleteEmailTemplate(id int) error {
	query := "DELETE FROM email_templates WHERE id = ?"
	result, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("删除邮件模板失败: %w", err)
	}
	
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("邮件模板不存在，ID: %d", id)
	}
	
	log.Printf("邮件模板已删除，ID: %d", id)
	return nil
}
package sqlite

import (
	"database/sql"
	"fmt"
	"log"
)

type EmailConfig struct {
	ID        int    `json:"id" db:"id"`
	SMTPHost  string `json:"smtp_host" db:"smtp_host"`
	SMTPPort  int    `json:"smtp_port" db:"smtp_port"`
	Username  string `json:"username" db:"username"`
	Password  string `json:"password" db:"password"`
	FromEmail string `json:"from_email" db:"from_email"`
	FromName  string `json:"from_name" db:"from_name"`
	EnableTLS bool   `json:"enable_tls" db:"enable_tls"`
	EnableSSL bool   `json:"enable_ssl" db:"enable_ssl"`
	TestEmail string `json:"test_email" db:"test_email"`
	IsEnabled bool   `json:"is_enabled" db:"is_enabled"`
	CreatedAt string `json:"created_at" db:"created_at"`
	UpdatedAt string `json:"updated_at" db:"updated_at"`
}

type EmailTemplate struct {
	ID        int    `json:"id" db:"id"`
	Name      string `json:"name" db:"name"`
	Subject   string `json:"subject" db:"subject"`
	Body      string `json:"body" db:"body"`
	Type      string `json:"type" db:"type"`
	IsDefault bool   `json:"is_default" db:"is_default"`
	CreatedAt string `json:"created_at" db:"created_at"`
	UpdatedAt string `json:"updated_at" db:"updated_at"`
}

func GetEmailConfig() (*EmailConfig, error) {
	query := `
		SELECT id, smtp_host, smtp_port, username, password, from_email, from_name,
		       enable_tls, enable_ssl, test_email, is_enabled, created_at, updated_at
		FROM email_configs
		ORDER BY id DESC
		LIMIT 1
	`

	cfg := &EmailConfig{}
	err := DB.QueryRow(query).Scan(
		&cfg.ID,
		&cfg.SMTPHost,
		&cfg.SMTPPort,
		&cfg.Username,
		&cfg.Password,
		&cfg.FromEmail,
		&cfg.FromName,
		&cfg.EnableTLS,
		&cfg.EnableSSL,
		&cfg.TestEmail,
		&cfg.IsEnabled,
		&cfg.CreatedAt,
		&cfg.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return &EmailConfig{
				SMTPPort:  587,
				EnableTLS: true,
				EnableSSL: false,
				IsEnabled: false,
			}, nil
		}
		return nil, fmt.Errorf("获取邮件配置失败: %w", err)
	}

	return cfg, nil
}

func CreateOrUpdateEmailConfig(cfg *EmailConfig) error {
	existing, err := GetEmailConfig()
	if err != nil {
		return fmt.Errorf("检查邮件配置失败: %w", err)
	}

	if existing.ID > 0 {
		query := `
			UPDATE email_configs
			SET smtp_host = ?, smtp_port = ?, username = ?, password = ?, from_email = ?, from_name = ?,
			    enable_tls = ?, enable_ssl = ?, test_email = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`
		_, err = DB.Exec(
			query,
			cfg.SMTPHost,
			cfg.SMTPPort,
			cfg.Username,
			cfg.Password,
			cfg.FromEmail,
			cfg.FromName,
			cfg.EnableTLS,
			cfg.EnableSSL,
			cfg.TestEmail,
			cfg.IsEnabled,
			existing.ID,
		)
		if err != nil {
			return fmt.Errorf("更新邮件配置失败: %w", err)
		}
		cfg.ID = existing.ID
		return nil
	}

	query := `
		INSERT INTO email_configs (
			smtp_host, smtp_port, username, password, from_email, from_name,
			enable_tls, enable_ssl, test_email, is_enabled, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`

	result, err := DB.Exec(
		query,
		cfg.SMTPHost,
		cfg.SMTPPort,
		cfg.Username,
		cfg.Password,
		cfg.FromEmail,
		cfg.FromName,
		cfg.EnableTLS,
		cfg.EnableSSL,
		cfg.TestEmail,
		cfg.IsEnabled,
	)
	if err != nil {
		return fmt.Errorf("创建邮件配置失败: %w", err)
	}

	id, _ := result.LastInsertId()
	cfg.ID = int(id)
	log.Printf("邮件配置已创建，ID: %d", id)

	return nil
}

func GetEmailTemplates() ([]EmailTemplate, error) {
	query := `
		SELECT id, name, subject, body, type, is_default, created_at, updated_at
		FROM email_templates
		ORDER BY is_default DESC, created_at DESC
	`

	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询邮件模板失败: %w", err)
	}
	defer rows.Close()

	templates := make([]EmailTemplate, 0)
	for rows.Next() {
		var tpl EmailTemplate
		err := rows.Scan(
			&tpl.ID,
			&tpl.Name,
			&tpl.Subject,
			&tpl.Body,
			&tpl.Type,
			&tpl.IsDefault,
			&tpl.CreatedAt,
			&tpl.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描邮件模板失败: %w", err)
		}
		templates = append(templates, tpl)
	}

	return templates, nil
}

func CreateEmailTemplate(tpl *EmailTemplate) error {
	if tpl.IsDefault {
		if _, err := DB.Exec("UPDATE email_templates SET is_default = 0 WHERE type = ?", tpl.Type); err != nil {
			return fmt.Errorf("重置默认模板失败: %w", err)
		}
	}

	query := `
		INSERT INTO email_templates (name, subject, body, type, is_default, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`
	result, err := DB.Exec(query, tpl.Name, tpl.Subject, tpl.Body, tpl.Type, tpl.IsDefault)
	if err != nil {
		return fmt.Errorf("创建邮件模板失败: %w", err)
	}
	id, _ := result.LastInsertId()
	tpl.ID = int(id)

	return nil
}

func UpdateEmailTemplate(tpl *EmailTemplate) error {
	if tpl.IsDefault {
		if _, err := DB.Exec("UPDATE email_templates SET is_default = 0 WHERE type = ? AND id != ?", tpl.Type, tpl.ID); err != nil {
			return fmt.Errorf("重置默认模板失败: %w", err)
		}
	}

	query := `
		UPDATE email_templates
		SET name = ?, subject = ?, body = ?, type = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	result, err := DB.Exec(query, tpl.Name, tpl.Subject, tpl.Body, tpl.Type, tpl.IsDefault, tpl.ID)
	if err != nil {
		return fmt.Errorf("更新邮件模板失败: %w", err)
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("邮件模板不存在，ID: %d", tpl.ID)
	}

	return nil
}

func DeleteEmailTemplate(id int) error {
	result, err := DB.Exec("DELETE FROM email_templates WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("删除邮件模板失败: %w", err)
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("邮件模板不存在，ID: %d", id)
	}

	return nil
}

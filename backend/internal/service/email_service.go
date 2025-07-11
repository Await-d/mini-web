package service

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"mini-web/backend/internal/model/sqlite"
)

// EmailService 邮件服务
type EmailService struct{}

// NewEmailService 创建邮件服务实例
func NewEmailService() *EmailService {
	return &EmailService{}
}

// SendTestEmail 发送测试邮件
func (s *EmailService) SendTestEmail(config *sqlite.EmailConfig, toEmail string) error {
	if !config.IsEnabled {
		return fmt.Errorf("邮件服务未启用")
	}
	
	// 验证邮件配置
	if err := s.validateEmailConfig(config); err != nil {
		return fmt.Errorf("邮件配置验证失败: %w", err)
	}
	
	// 构造测试邮件内容
	subject := "Mini Web 邮件配置测试"
	body := fmt.Sprintf(`
Dear User,

This is a test email from Mini Web Management System.

If you receive this email, it means your email configuration is working correctly.

Configuration Details:
- SMTP Host: %s
- SMTP Port: %d
- From Email: %s
- From Name: %s
- TLS Enabled: %t
- SSL Enabled: %t

Best regards,
Mini Web Team

---
This is an automated test email. Please do not reply.
Sent at: %s
	`, config.SMTPHost, config.SMTPPort, config.FromEmail, config.FromName, 
	   config.EnableTLS, config.EnableSSL, time.Now().Format("2006-01-02 15:04:05"))
	
	// 发送邮件
	return s.SendEmail(config, toEmail, subject, body)
}

// SendEmail 发送邮件
func (s *EmailService) SendEmail(config *sqlite.EmailConfig, to, subject, body string) error {
	if !config.IsEnabled {
		return fmt.Errorf("邮件服务未启用")
	}
	
	// 验证配置
	if err := s.validateEmailConfig(config); err != nil {
		return err
	}
	
	// 构建邮件头
	from := config.FromEmail
	if config.FromName != "" {
		from = fmt.Sprintf("%s <%s>", config.FromName, config.FromEmail)
	}
	
	headers := make(map[string]string)
	headers["From"] = from
	headers["To"] = to
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/plain; charset=UTF-8"
	headers["Date"] = time.Now().Format(time.RFC1123Z)
	
	// 构建邮件内容
	message := ""
	for key, value := range headers {
		message += fmt.Sprintf("%s: %s\r\n", key, value)
	}
	message += "\r\n" + body
	
	// 建立SMTP连接
	host := fmt.Sprintf("%s:%d", config.SMTPHost, config.SMTPPort)
	
	// 根据配置选择连接方式
	if config.EnableSSL {
		return s.sendWithSSL(config, host, to, []byte(message))
	} else if config.EnableTLS {
		return s.sendWithTLS(config, host, to, []byte(message))
	} else {
		return s.sendPlain(config, host, to, []byte(message))
	}
}

// sendWithTLS 使用TLS发送邮件
func (s *EmailService) sendWithTLS(config *sqlite.EmailConfig, host, to string, message []byte) error {
	// 连接SMTP服务器
	conn, err := net.DialTimeout("tcp", host, 30*time.Second)
	if err != nil {
		return fmt.Errorf("连接SMTP服务器失败: %w", err)
	}
	defer conn.Close()
	
	// 创建SMTP客户端
	client, err := smtp.NewClient(conn, config.SMTPHost)
	if err != nil {
		return fmt.Errorf("创建SMTP客户端失败: %w", err)
	}
	defer client.Quit()
	
	// 启动TLS
	tlsConfig := &tls.Config{
		ServerName:         config.SMTPHost,
		InsecureSkipVerify: false,
	}
	
	if err = client.StartTLS(tlsConfig); err != nil {
		return fmt.Errorf("启动TLS失败: %w", err)
	}
	
	// 认证
	if config.Username != "" && config.Password != "" {
		auth := smtp.PlainAuth("", config.Username, config.Password, config.SMTPHost)
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP认证失败: %w", err)
		}
	}
	
	// 发送邮件
	return s.sendMessage(client, config.FromEmail, to, message)
}

// sendWithSSL 使用SSL发送邮件
func (s *EmailService) sendWithSSL(config *sqlite.EmailConfig, host, to string, message []byte) error {
	// SSL连接
	tlsConfig := &tls.Config{
		ServerName:         config.SMTPHost,
		InsecureSkipVerify: false,
	}
	
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 30 * time.Second}, "tcp", host, tlsConfig)
	if err != nil {
		return fmt.Errorf("SSL连接失败: %w", err)
	}
	defer conn.Close()
	
	// 创建SMTP客户端
	client, err := smtp.NewClient(conn, config.SMTPHost)
	if err != nil {
		return fmt.Errorf("创建SMTP客户端失败: %w", err)
	}
	defer client.Quit()
	
	// 认证
	if config.Username != "" && config.Password != "" {
		auth := smtp.PlainAuth("", config.Username, config.Password, config.SMTPHost)
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP认证失败: %w", err)
		}
	}
	
	// 发送邮件
	return s.sendMessage(client, config.FromEmail, to, message)
}

// sendPlain 使用明文连接发送邮件
func (s *EmailService) sendPlain(config *sqlite.EmailConfig, host, to string, message []byte) error {
	// 建立明文连接
	conn, err := net.DialTimeout("tcp", host, 30*time.Second)
	if err != nil {
		return fmt.Errorf("连接SMTP服务器失败: %w", err)
	}
	defer conn.Close()
	
	// 创建SMTP客户端
	client, err := smtp.NewClient(conn, config.SMTPHost)
	if err != nil {
		return fmt.Errorf("创建SMTP客户端失败: %w", err)
	}
	defer client.Quit()
	
	// 认证
	if config.Username != "" && config.Password != "" {
		auth := smtp.PlainAuth("", config.Username, config.Password, config.SMTPHost)
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP认证失败: %w", err)
		}
	}
	
	// 发送邮件
	return s.sendMessage(client, config.FromEmail, to, message)
}

// sendMessage 发送邮件消息
func (s *EmailService) sendMessage(client *smtp.Client, from, to string, message []byte) error {
	// 设置发件人
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("设置发件人失败: %w", err)
	}
	
	// 设置收件人
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("设置收件人失败: %w", err)
	}
	
	// 获取数据写入器
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("获取数据写入器失败: %w", err)
	}
	defer writer.Close()
	
	// 写入邮件内容
	if _, err := writer.Write(message); err != nil {
		return fmt.Errorf("写入邮件内容失败: %w", err)
	}
	
	return nil
}

// validateEmailConfig 验证邮件配置
func (s *EmailService) validateEmailConfig(config *sqlite.EmailConfig) error {
	if config.SMTPHost == "" {
		return fmt.Errorf("SMTP主机不能为空")
	}
	
	if config.SMTPPort <= 0 || config.SMTPPort > 65535 {
		return fmt.Errorf("SMTP端口必须在1-65535之间")
	}
	
	if config.FromEmail == "" {
		return fmt.Errorf("发件人邮箱不能为空")
	}
	
	if !strings.Contains(config.FromEmail, "@") {
		return fmt.Errorf("发件人邮箱格式不正确")
	}
	
	return nil
}

// TestConnection 测试SMTP连接
func (s *EmailService) TestConnection(config *sqlite.EmailConfig) error {
	// 验证配置
	if err := s.validateEmailConfig(config); err != nil {
		return err
	}
	
	host := fmt.Sprintf("%s:%d", config.SMTPHost, config.SMTPPort)
	
	// 尝试连接
	conn, err := net.DialTimeout("tcp", host, 10*time.Second)
	if err != nil {
		return fmt.Errorf("无法连接到SMTP服务器 %s: %w", host, err)
	}
	defer conn.Close()
	
	// 创建SMTP客户端进行进一步测试
	client, err := smtp.NewClient(conn, config.SMTPHost)
	if err != nil {
		return fmt.Errorf("无法创建SMTP客户端: %w", err)
	}
	defer client.Quit()
	
	// 如果配置了TLS，测试TLS连接
	if config.EnableTLS {
		tlsConfig := &tls.Config{
			ServerName:         config.SMTPHost,
			InsecureSkipVerify: false,
		}
		
		if err = client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("TLS连接失败: %w", err)
		}
	}
	
	// 如果配置了认证信息，测试认证
	if config.Username != "" && config.Password != "" {
		auth := smtp.PlainAuth("", config.Username, config.Password, config.SMTPHost)
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP认证失败，请检查用户名和密码: %w", err)
		}
	}
	
	return nil
}

// SendNotificationEmail 发送通知邮件
func (s *EmailService) SendNotificationEmail(templateType, toEmail string, data map[string]string) error {
	// 获取邮件配置
	config, err := sqlite.GetEmailConfig()
	if err != nil {
		return fmt.Errorf("获取邮件配置失败: %w", err)
	}
	
	if !config.IsEnabled {
		return fmt.Errorf("邮件服务未启用")
	}
	
	// 获取邮件模板
	template, err := sqlite.GetEmailTemplateByType(templateType)
	if err != nil {
		return fmt.Errorf("获取邮件模板失败: %w", err)
	}
	
	// 替换模板变量
	subject := s.replaceTemplateVariables(template.Subject, data)
	body := s.replaceTemplateVariables(template.Body, data)
	
	// 发送邮件
	return s.SendEmail(config, toEmail, subject, body)
}

// replaceTemplateVariables 替换模板变量
func (s *EmailService) replaceTemplateVariables(content string, data map[string]string) string {
	for key, value := range data {
		placeholder := fmt.Sprintf("{{%s}}", key)
		content = strings.ReplaceAll(content, placeholder, value)
	}
	return content
}

// GetCommonEmailVariables 获取通用邮件变量
func (s *EmailService) GetCommonEmailVariables() map[string]string {
	return map[string]string{
		"site_name":    "Mini Web Management System",
		"site_url":     "http://localhost:5173",
		"support_email": "support@example.com",
		"current_year": strconv.Itoa(time.Now().Year()),
		"current_date": time.Now().Format("2006-01-02"),
		"current_time": time.Now().Format("2006-01-02 15:04:05"),
	}
}
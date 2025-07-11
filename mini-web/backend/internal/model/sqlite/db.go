package sqlite

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// DB 全局数据库连接
var DB *sql.DB

// InitDB 初始化SQLite数据库
func InitDB() error {
	// 确保data目录存在
	dataDir := "./data"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("创建数据目录失败: %w", err)
	}

	dbPath := filepath.Join(dataDir, "mini-web.db")
	log.Printf("数据库路径: %s", dbPath)

	// 打开数据库连接
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("打开数据库连接失败: %w", err)
	}

	// 测试连接
	if err := db.Ping(); err != nil {
		return fmt.Errorf("数据库连接测试失败: %w", err)
	}

	// 设置连接池参数
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	// 创建表
	if err := createTables(db); err != nil {
		return fmt.Errorf("创建表失败: %w", err)
	}

	// 初始化示例数据
	if err := seedData(db); err != nil {
		return fmt.Errorf("初始化数据失败: %w", err)
	}

	// 保存数据库连接
	DB = db
	log.Println("数据库初始化成功")
	return nil
}

// createTables 创建表结构
func createTables(db *sql.DB) error {
	// 用户表
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		nickname TEXT,
		avatar TEXT,
		role TEXT NOT NULL DEFAULT 'user',
		status TEXT NOT NULL DEFAULT 'active',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("创建用户表失败: %w", err)
	}

	// 连接表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS connections (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		protocol TEXT NOT NULL,
		host TEXT NOT NULL,
		port INTEGER NOT NULL,
		username TEXT,
		password TEXT,
		private_key TEXT,
		group_name TEXT,
		description TEXT,
		last_used TIMESTAMP,
		created_by INTEGER NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`)
	if err != nil {
		return fmt.Errorf("创建连接表失败: %w", err)
	}

	// 会话表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		connection_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		end_time TIMESTAMP,
		duration INTEGER DEFAULT 0,
		status TEXT NOT NULL,
		client_ip TEXT,
		server_ip TEXT,
		log_path TEXT,
		FOREIGN KEY (connection_id) REFERENCES connections(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	)`)
	if err != nil {
		return fmt.Errorf("创建会话表失败: %w", err)
	}

	// 系统配置表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS system_configs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		key TEXT UNIQUE NOT NULL,
		value TEXT NOT NULL,
		description TEXT,
		category TEXT NOT NULL,
		type TEXT NOT NULL DEFAULT 'string',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("创建系统配置表失败: %w", err)
	}

	// 系统日志表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS system_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		level TEXT NOT NULL,
		module TEXT NOT NULL,
		message TEXT NOT NULL,
		details TEXT,
		user_id INTEGER,
		ip_address TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id)
	)`)
	if err != nil {
		return fmt.Errorf("创建系统日志表失败: %w", err)
	}

	// 用户活动日志表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS user_activities (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		action TEXT NOT NULL,
		resource TEXT NOT NULL,
		details TEXT,
		ip_address TEXT,
		user_agent TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id)
	)`)
	if err != nil {
		return fmt.Errorf("创建用户活动日志表失败: %w", err)
	}

	// 邮件配置表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS email_configs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		smtp_host TEXT NOT NULL,
		smtp_port INTEGER NOT NULL DEFAULT 587,
		username TEXT,
		password TEXT,
		from_email TEXT NOT NULL,
		from_name TEXT,
		enable_tls BOOLEAN NOT NULL DEFAULT 1,
		enable_ssl BOOLEAN NOT NULL DEFAULT 0,
		test_email TEXT,
		is_enabled BOOLEAN NOT NULL DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("创建邮件配置表失败: %w", err)
	}

	// 邮件模板表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS email_templates (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		subject TEXT NOT NULL,
		body TEXT NOT NULL,
		type TEXT NOT NULL,
		is_default BOOLEAN NOT NULL DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("创建邮件模板表失败: %w", err)
	}

	// SSL配置表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS ssl_configs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		domain TEXT NOT NULL,
		cert_path TEXT,
		key_path TEXT,
		cert_content TEXT NOT NULL,
		key_content TEXT NOT NULL,
		issuer TEXT,
		subject TEXT,
		not_before TEXT,
		not_after TEXT,
		is_enabled BOOLEAN NOT NULL DEFAULT 0,
		is_default BOOLEAN NOT NULL DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("创建SSL配置表失败: %w", err)
	}

	// API访问配置表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS api_configs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		description TEXT,
		rate_limit_enabled BOOLEAN NOT NULL DEFAULT 1,
		requests_per_min INTEGER NOT NULL DEFAULT 60,
		requests_per_hour INTEGER NOT NULL DEFAULT 1000,
		requests_per_day INTEGER NOT NULL DEFAULT 10000,
		ip_whitelist_enabled BOOLEAN NOT NULL DEFAULT 0,
		ip_blacklist_enabled BOOLEAN NOT NULL DEFAULT 1,
		api_key_required BOOLEAN NOT NULL DEFAULT 0,
		is_enabled BOOLEAN NOT NULL DEFAULT 1,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("创建API访问配置表失败: %w", err)
	}

	// API密钥表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS api_keys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		key_value TEXT NOT NULL UNIQUE,
		secret_value TEXT NOT NULL,
		user_id INTEGER,
		permissions TEXT,
		expires_at TEXT,
		last_used_at TEXT,
		usage_count INTEGER NOT NULL DEFAULT 0,
		is_enabled BOOLEAN NOT NULL DEFAULT 1,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id)
	)`)
	if err != nil {
		return fmt.Errorf("创建API密钥表失败: %w", err)
	}

	// IP白名单表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS ip_whitelist (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ip_address TEXT NOT NULL,
		description TEXT,
		is_enabled BOOLEAN NOT NULL DEFAULT 1,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("创建IP白名单表失败: %w", err)
	}

	// IP黑名单表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS ip_blacklist (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ip_address TEXT NOT NULL,
		reason TEXT,
		blocked_at TEXT,
		expires_at TEXT,
		is_enabled BOOLEAN NOT NULL DEFAULT 1,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("创建IP黑名单表失败: %w", err)
	}

	// API访问日志表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS api_access_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ip_address TEXT NOT NULL,
		user_agent TEXT,
		method TEXT NOT NULL,
		path TEXT NOT NULL,
		status_code INTEGER NOT NULL,
		response_time INTEGER,
		api_key_id INTEGER,
		user_id INTEGER,
		request_size INTEGER,
		response_size INTEGER,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (api_key_id) REFERENCES api_keys(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	)`)
	if err != nil {
		return fmt.Errorf("创建API访问日志表失败: %w", err)
	}

	log.Println("表结构创建成功")
	return nil
}

// seedData 初始化示例数据
func seedData(db *sql.DB) error {
	// 检查用户表是否为空
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		return fmt.Errorf("查询用户数量失败: %w", err)
	}

	// 如果已有数据，则不初始化
	if count > 0 {
		log.Println("数据库已有数据，跳过初始化")
		return nil
	}

	// 添加默认用户 (密码均为: admin123)
	_, err = db.Exec(`
	INSERT INTO users (username, email, password, nickname, avatar, role, status)
	VALUES 
		('admin', 'admin@example.com', '$2a$10$Y9OgUhM7qQMY3ZtCjRFumufLzD8j7/7L2pWPrr3JQdGF8Md3ezhiu', '管理员', 'https://randomuser.me/api/portraits/men/1.jpg', 'admin', 'active'),
		('user', 'user@example.com', '$2a$10$Y9OgUhM7qQMY3ZtCjRFumufLzD8j7/7L2pWPrr3JQdGF8Md3ezhiu', '普通用户', 'https://randomuser.me/api/portraits/women/1.jpg', 'user', 'active')
	`)
	if err != nil {
		return fmt.Errorf("添加默认用户失败: %w", err)
	}

	// 添加示例连接数据
	_, err = db.Exec(`
	INSERT INTO connections (
		name, protocol, host, port, username, password, 
		group_name, description, created_by
	)
	VALUES 
		('本地SSH服务器', 'ssh', '127.0.0.1', 22, 'root', '', 
		'开发服务器', '本地测试SSH服务器', 1),
		('示例RDP服务器', 'rdp', '192.168.1.100', 3389, 'administrator', '', 
		'测试服务器', 'Windows测试服务器', 1),
		('示例VNC服务器', 'vnc', '192.168.1.101', 5900, 'user', '', 
		'测试服务器', 'Linux VNC服务器', 1),
		('路由器Telnet', 'telnet', '192.168.1.1', 23, 'admin', '', 
		'网络设备', '办公室路由器', 1)
	`)
	if err != nil {
		return fmt.Errorf("添加示例连接数据失败: %w", err)
	}

	// 添加默认系统配置（只有当系统配置表为空时才插入）
	var configCount int
	err = db.QueryRow("SELECT COUNT(*) FROM system_configs").Scan(&configCount)
	if err != nil {
		return fmt.Errorf("查询系统配置数量失败: %w", err)
	}
	
	if configCount == 0 {
		_, err = db.Exec(`
		INSERT INTO system_configs (key, value, description, category, type)
		VALUES 
			('site_name', 'Mini Web 管理系统', '系统名称', 'general', 'string'),
			('site_description', '一个基于React和Go的Web管理系统', '系统描述', 'general', 'string'),
			('page_size', '10', '默认分页大小', 'general', 'number'),
			('theme', 'light', '主题模式', 'appearance', 'string'),
			('primary_color', '#1677ff', '主题色', 'appearance', 'string'),
			('compact_mode', 'false', '紧凑模式', 'appearance', 'boolean'),
			('animation_enabled', 'true', '启用动画', 'appearance', 'boolean'),
			('password_policy', 'medium', '密码策略', 'security', 'string'),
			('session_timeout', '30', '会话超时时间（分钟）', 'security', 'number'),
			('login_attempts', '5', '最大登录失败次数', 'security', 'number'),
			('two_factor_auth', 'false', '启用两步验证', 'security', 'boolean'),
			('log_retention_days', '30', '日志保留天数', 'system', 'number'),
			('max_connections', '100', '最大连接数', 'system', 'number'),
			('backup_enabled', 'true', '启用自动备份', 'system', 'boolean')
		`)
		if err != nil {
			return fmt.Errorf("添加默认系统配置失败: %w", err)
		}
		log.Println("默认系统配置添加成功")
	} else {
		log.Println("系统配置已存在，跳过初始化")
	}

	// 添加默认邮件模板（只有当邮件模板表为空时才插入）
	var templateCount int
	err = db.QueryRow("SELECT COUNT(*) FROM email_templates").Scan(&templateCount)
	if err != nil {
		return fmt.Errorf("查询邮件模板数量失败: %w", err)
	}
	
	if templateCount == 0 {
		_, err = db.Exec(`
		INSERT INTO email_templates (name, subject, body, type, is_default)
		VALUES 
			('用户欢迎邮件', '欢迎使用 {{site_name}}', 
			 '亲爱的 {{user_name}}，

欢迎注册 {{site_name}}！

您的账户已成功创建，现在可以登录系统开始使用了。

如有任何问题，请联系我们：{{support_email}}

{{site_name}} 团队
{{current_date}}', 
			 'welcome', 1),
			('密码重置邮件', '{{site_name}} - 密码重置请求', 
			 '您好 {{user_name}}，

我们收到了重置您账户密码的请求。

请点击下面的链接重置密码：
{{reset_link}}

如果您没有请求重置密码，请忽略此邮件。

此链接将在24小时后失效。

{{site_name}} 团队
{{current_date}}', 
			 'reset_password', 1),
			('安全通知邮件', '{{site_name}} - 安全通知', 
			 '您好 {{user_name}}，

您的账户在 {{login_time}} 从 {{login_ip}} 登录。

如果这不是您的操作，请立即联系我们。

{{site_name}} 团队
{{current_date}}', 
			 'security_notification', 1),
			('系统通知邮件', '{{site_name}} - 系统通知', 
			 '您好 {{user_name}}，

这是来自 {{site_name}} 的系统通知。

通知内容：{{notification_content}}

如有疑问，请联系技术支持：{{support_email}}

{{site_name}} 团队
{{current_date}}', 
			 'system_notification', 1)
		`)
		if err != nil {
			return fmt.Errorf("添加默认邮件模板失败: %w", err)
		}
		log.Println("默认邮件模板添加成功")
	} else {
		log.Println("邮件模板已存在，跳过初始化")
	}

	log.Println("示例数据初始化成功")
	return nil
}

// CloseDB 关闭数据库连接
func CloseDB() {
	if DB != nil {
		DB.Close()
		log.Println("数据库连接关闭")
	}
}
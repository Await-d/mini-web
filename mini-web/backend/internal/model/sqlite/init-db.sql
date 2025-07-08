-- 用户表
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
);

-- 初始用户数据 (密码为bcrypt加密的"admin123")
INSERT OR IGNORE INTO users (username, email, password, nickname, avatar, role, status)
VALUES 
    ('admin', 'admin@example.com', '$2a$10$Y9OgUhM7qQMY3ZtCjRFumufLzD8j7/7L2pWPrr3JQdGF8Md3ezhiu', '管理员', 'https://randomuser.me/api/portraits/men/1.jpg', 'admin', 'active'),
    ('user', 'user@example.com', '$2a$10$Y9OgUhM7qQMY3ZtCjRFumufLzD8j7/7L2pWPrr3JQdGF8Md3ezhiu', '普通用户', 'https://randomuser.me/api/portraits/women/1.jpg', 'user', 'active');

-- 连接表
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
);

-- 会话表
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
);

-- 示例连接数据
INSERT OR IGNORE INTO connections (
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
     '网络设备', '办公室路由器', 1);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'string',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 系统日志表
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
);

-- 默认系统配置
INSERT OR IGNORE INTO system_configs (key, value, description, category, type)
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
    ('backup_enabled', 'true', '启用自动备份', 'system', 'boolean');

-- 用户活动日志表
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
);
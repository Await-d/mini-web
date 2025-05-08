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
package model

import "time"

// 连接协议类型
const (
	ProtocolRDP    = "rdp"
	ProtocolSSH    = "ssh"
	ProtocolVNC    = "vnc"
	ProtocolTelnet = "telnet"
)

// Connection 远程连接配置模型
type Connection struct {
	ID          uint      `json:"id"`
	Name        string    `json:"name"`         // 连接名称
	Protocol    string    `json:"protocol"`     // 连接协议：rdp, ssh, vnc, telnet
	Host        string    `json:"host"`         // 主机地址
	Port        int       `json:"port"`         // 端口
	Username    string    `json:"username"`     // 用户名
	Password    string    `json:"-"`            // 密码，不在JSON中返回
	PrivateKey  string    `json:"-"`            // SSH私钥，不在JSON中返回
	Group       string    `json:"group"`        // 分组
	Description string    `json:"description"`  // 描述
	LastUsed    time.Time `json:"last_used"`    // 上次使用时间
	CreatedBy   uint      `json:"created_by"`   // 创建者ID
	CreatedAt   time.Time `json:"created_at"`   // 创建时间
	UpdatedAt   time.Time `json:"updated_at"`   // 更新时间
}

// ConnectionRequest 连接请求
type ConnectionRequest struct {
	Name        string `json:"name"`
	Protocol    string `json:"protocol"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	Password    string `json:"password,omitempty"`
	PrivateKey  string `json:"private_key,omitempty"`
	Group       string `json:"group"`
	Description string `json:"description"`
}

// ConnectionResponse 连接响应
type ConnectionResponse struct {
	ID          uint      `json:"id"`
	Name        string    `json:"name"`
	Protocol    string    `json:"protocol"`
	Host        string    `json:"host"`
	Port        int       `json:"port"`
	Username    string    `json:"username"`
	Group       string    `json:"group"`
	Description string    `json:"description"`
	LastUsed    time.Time `json:"last_used"`
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ConnectionListResponse 连接列表响应
type ConnectionListResponse struct {
	PageInfo
	List []ConnectionResponse `json:"list"`
}

// Session 会话模型
type Session struct {
	ID           uint      `json:"id"`
	ConnectionID uint      `json:"connection_id"`
	UserID       uint      `json:"user_id"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Duration     int       `json:"duration"`    // 会话时长（秒）
	Status       string    `json:"status"`      // 会话状态：active, closed
	ClientIP     string    `json:"client_ip"`   // 客户端IP
	ServerIP     string    `json:"server_ip"`   // 服务器IP
	LogPath      string    `json:"log_path"`    // 会话日志路径
}

// ConnectionRepository 连接数据仓库接口
type ConnectionRepository interface {
	Create(conn *Connection) error
	Update(conn *Connection) error
	Delete(id uint) error
	GetByID(id uint) (*Connection, error)
	GetByUserID(userID uint) ([]*Connection, error)
	GetAll() ([]*Connection, error)
	UpdateLastUsed(id uint) error
}

// SessionRepository 会话数据仓库接口
type SessionRepository interface {
	Create(session *Session) error
	Update(session *Session) error
	GetByID(id uint) (*Session, error)
	GetByUserID(userID uint) ([]*Session, error)
	GetActiveByUserID(userID uint) ([]*Session, error)
	GetByConnectionID(connectionID uint) ([]*Session, error)
	CloseSession(id uint) error
}
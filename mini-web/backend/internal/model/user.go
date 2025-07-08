package model

import "time"

// User 用户模型
type User struct {
	ID           uint       `json:"id"`
	Username     string     `json:"username"`
	Email        string     `json:"email"`
	Password     string     `json:"-"` // 不在JSON中返回密码
	Nickname     string     `json:"nickname"`
	Avatar       string     `json:"avatar"`
	Role         string     `json:"role"`
	Status       string     `json:"status"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	LoginCount   int        `json:"login_count"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// UserLoginRequest 用户登录请求
type UserLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// UserRegisterRequest 用户注册请求
type UserRegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Nickname string `json:"nickname"`
}

// UserCreateRequest 用户创建请求
type UserCreateRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Nickname string `json:"nickname"`
	Role     string `json:"role"`
	Status   string `json:"status"`
}

// UserUpdateRequest 用户信息更新请求
type UserUpdateRequest struct {
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
	Nickname string `json:"nickname,omitempty"`
	Avatar   string `json:"avatar,omitempty"`
	Role     string `json:"role,omitempty"`
	Status   string `json:"status,omitempty"`
}

// UserBatchRequest 批量操作请求
type UserBatchRequest struct {
	UserIDs   []uint `json:"user_ids"`
	Operation string `json:"operation"` // enable, disable, delete
}

// UserActivityLog 用户活动日志
type UserActivityLog struct {
	ID        uint      `json:"id"`
	UserID    uint      `json:"user_id"`
	Action    string    `json:"action"`
	Resource  string    `json:"resource"`
	Details   string    `json:"details"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
}

// UserPasswordUpdateRequest 用户密码更新请求
type UserPasswordUpdateRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// UserLoginResponse 用户登录响应
type UserLoginResponse struct {
	Token  string `json:"token"`
	User   User   `json:"user"`
	Expire int64  `json:"expire"`
}

// PageInfo 分页信息
type PageInfo struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

// UserListResponse 用户列表响应
type UserListResponse struct {
	PageInfo
	List []User `json:"list"`
}

// ResponseData 通用响应数据结构
type ResponseData struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// UserRepository 用户数据仓库接口
type UserRepository interface {
	GetByUsername(username string) (*User, error)
	GetByEmail(email string) (*User, error)
	GetByID(id uint) (*User, error)
	GetAll() ([]*User, error)
	Create(user *User) error
	Update(user *User) error
	Delete(id uint) error
	UpdatePassword(userID uint, newPassword string) error
	VerifyPassword(username, password string) (bool, *User, error)
	BatchUpdateStatus(userIDs []uint, status string) error
	UpdateLoginInfo(userID uint) error
}

// UserActivityRepository 用户活动日志仓库接口
type UserActivityRepository interface {
	Create(log *UserActivityLog) error
	GetByUserID(userID uint, limit int, offset int) ([]*UserActivityLog, error)
	GetAll(limit int, offset int) ([]*UserActivityLog, error)
}

// SystemConfig 系统配置模型
type SystemConfig struct {
	ID          uint      `json:"id"`
	Key         string    `json:"key"`
	Value       string    `json:"value"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Type        string    `json:"type"` // string, number, boolean, json
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// SystemConfigRequest 系统配置请求
type SystemConfigRequest struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Type        string `json:"type"`
}

// SystemConfigUpdateRequest 系统配置更新请求
type SystemConfigUpdateRequest struct {
	Value       string `json:"value"`
	Description string `json:"description"`
}

// SystemLog 系统日志模型
type SystemLog struct {
	ID        uint      `json:"id"`
	Level     string    `json:"level"` // info, warn, error, debug
	Module    string    `json:"module"`
	Message   string    `json:"message"`
	Details   string    `json:"details,omitempty"`
	UserID    *uint     `json:"user_id,omitempty"`
	IPAddress string    `json:"ip_address,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// SystemLogRequest 系统日志请求
type SystemLogRequest struct {
	Level     string `json:"level"`
	Module    string `json:"module"`
	Message   string `json:"message"`
	Details   string `json:"details,omitempty"`
	UserID    *uint  `json:"user_id,omitempty"`
	IPAddress string `json:"ip_address,omitempty"`
}

// SystemConfigRepository 系统配置仓库接口
type SystemConfigRepository interface {
	GetAll() ([]*SystemConfig, error)
	GetByKey(key string) (*SystemConfig, error)
	GetByCategory(category string) ([]*SystemConfig, error)
	Create(config *SystemConfig) error
	Update(config *SystemConfig) error
	Delete(key string) error
	BatchUpdate(configs []*SystemConfig) error
}

// SystemLogRepository 系统日志仓库接口
type SystemLogRepository interface {
	Create(log *SystemLog) error
	GetAll(limit int, offset int) ([]*SystemLog, error)
	GetByLevel(level string, limit int, offset int) ([]*SystemLog, error)
	GetByModule(module string, limit int, offset int) ([]*SystemLog, error)
	GetByDateRange(startTime, endTime time.Time, limit int, offset int) ([]*SystemLog, error)
	Delete(id uint) error
	DeleteByDateRange(startTime, endTime time.Time) error
	GetStats() (map[string]interface{}, error)
}
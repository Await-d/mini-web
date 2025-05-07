package model

import "time"

// User 用户模型
type User struct {
	ID        uint      `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Password  string    `json:"-"` // 不在JSON中返回密码
	Nickname  string    `json:"nickname"`
	Avatar    string    `json:"avatar"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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

// UserUpdateRequest 用户信息更新请求
type UserUpdateRequest struct {
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
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
	UpdatePassword(userID uint, newPassword string) error
	VerifyPassword(username, password string) (bool, *User, error)
}
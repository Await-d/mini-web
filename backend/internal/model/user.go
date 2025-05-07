package model

import "time"

// User 用户模型
type User struct {
	ID        uint      `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Password  string    `json:"-"` // 不返回密码
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// UserService 用户服务接口
type UserService interface {
	GetUsers() ([]User, error)
	GetUserByID(id uint) (*User, error)
	CreateUser(user User) (*User, error)
	UpdateUser(user User) (*User, error)
	DeleteUser(id uint) error
}

// MockUsers 模拟用户数据
var MockUsers = []User{
	{
		ID:        1,
		Name:      "张三",
		Email:     "zhangsan@example.com",
		Password:  "hashed_password",
		Role:      "管理员",
		Status:    "active",
		CreatedAt: time.Now().Add(-24 * time.Hour),
		UpdatedAt: time.Now().Add(-12 * time.Hour),
	},
	{
		ID:        2,
		Name:      "李四",
		Email:     "lisi@example.com",
		Password:  "hashed_password",
		Role:      "普通用户",
		Status:    "active",
		CreatedAt: time.Now().Add(-48 * time.Hour),
		UpdatedAt: time.Now().Add(-24 * time.Hour),
	},
	{
		ID:        3,
		Name:      "王五",
		Email:     "wangwu@example.com",
		Password:  "hashed_password",
		Role:      "编辑者",
		Status:    "inactive",
		CreatedAt: time.Now().Add(-72 * time.Hour),
		UpdatedAt: time.Now().Add(-36 * time.Hour),
	},
	{
		ID:        4,
		Name:      "赵六",
		Email:     "zhaoliu@example.com",
		Password:  "hashed_password",
		Role:      "访客",
		Status:    "active",
		CreatedAt: time.Now().Add(-96 * time.Hour),
		UpdatedAt: time.Now().Add(-48 * time.Hour),
	},
}
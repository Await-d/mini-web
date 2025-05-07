package service

import (
	"errors"
	"time"

	"github.com/yourname/mini-web/internal/model"
)

// UserService 用户服务实现
type UserService struct {
	users []model.User
}

// NewUserService 创建用户服务
func NewUserService() *UserService {
	return &UserService{
		users: model.MockUsers,
	}
}

// GetUsers 获取所有用户
func (s *UserService) GetUsers() ([]model.User, error) {
	return s.users, nil
}

// GetUserByID 根据ID获取用户
func (s *UserService) GetUserByID(id uint) (*model.User, error) {
	for _, user := range s.users {
		if user.ID == id {
			return &user, nil
		}
	}
	return nil, errors.New("用户不存在")
}

// CreateUser 创建用户
func (s *UserService) CreateUser(user model.User) (*model.User, error) {
	// 检查邮箱是否已存在
	for _, u := range s.users {
		if u.Email == user.Email {
			return nil, errors.New("邮箱已存在")
		}
	}

	// 生成新ID
	maxID := uint(0)
	for _, u := range s.users {
		if u.ID > maxID {
			maxID = u.ID
		}
	}
	user.ID = maxID + 1
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	// 添加用户
	s.users = append(s.users, user)
	return &user, nil
}

// UpdateUser 更新用户
func (s *UserService) UpdateUser(user model.User) (*model.User, error) {
	for i, u := range s.users {
		if u.ID == user.ID {
			// 保留创建时间和密码
			user.CreatedAt = u.CreatedAt
			if user.Password == "" {
				user.Password = u.Password
			}
			user.UpdatedAt = time.Now()
			
			s.users[i] = user
			return &user, nil
		}
	}
	return nil, errors.New("用户不存在")
}

// DeleteUser 删除用户
func (s *UserService) DeleteUser(id uint) error {
	for i, user := range s.users {
		if user.ID == id {
			// 删除用户
			s.users = append(s.users[:i], s.users[i+1:]...)
			return nil
		}
	}
	return errors.New("用户不存在")
}
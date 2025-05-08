package service

import (
	"errors"
	"fmt"
	
	"gitee.com/await29/mini-web/internal/model"
)

// UserService 用户服务
type UserService struct {
	userRepo model.UserRepository
}

// NewUserService 创建用户服务实例
func NewUserService(userRepo model.UserRepository) *UserService {
	return &UserService{userRepo: userRepo}
}

// GetUsers 获取所有用户
func (s *UserService) GetUsers() ([]*model.User, error) {
	return s.userRepo.GetAll()
}

// GetUserByID 根据ID获取用户
func (s *UserService) GetUserByID(id uint) (*model.User, error) {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("获取用户信息失败: %w", err)
	}
	
	if user == nil {
		return nil, errors.New("用户不存在")
	}
	
	return user, nil
}

// CreateUser 创建用户
func (s *UserService) CreateUser(user *model.User) error {
	// 检查用户名是否已存在
	existingUser, err := s.userRepo.GetByUsername(user.Username)
	if err != nil {
		return fmt.Errorf("检查用户名失败: %w", err)
	}
	
	if existingUser != nil {
		return errors.New("用户名已存在")
	}
	
	// 检查邮箱是否已存在
	existingUser, err = s.userRepo.GetByEmail(user.Email)
	if err != nil {
		return fmt.Errorf("检查邮箱失败: %w", err)
	}
	
	if existingUser != nil {
		return errors.New("邮箱已存在")
	}
	
	// 创建用户
	return s.userRepo.Create(user)
}

// UpdateUser 更新用户信息
func (s *UserService) UpdateUser(user *model.User) error {
	// 检查用户是否存在
	existingUser, err := s.userRepo.GetByID(user.ID)
	if err != nil {
		return fmt.Errorf("检查用户ID失败: %w", err)
	}
	
	if existingUser == nil {
		return errors.New("用户不存在")
	}
	
	// 更新用户
	return s.userRepo.Update(user)
}

// DeleteUser 删除用户
func (s *UserService) DeleteUser(id uint) error {
	// 这里应该实现删除用户的逻辑
	// 但目前UserRepository接口没有定义DeleteUser方法
	// 所以返回未实现错误
	return errors.New("删除用户功能未实现")
}
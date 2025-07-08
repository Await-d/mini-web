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
	// 检查用户是否存在
	existingUser, err := s.userRepo.GetByID(id)
	if err != nil {
		return fmt.Errorf("检查用户ID失败: %w", err)
	}
	
	if existingUser == nil {
		return errors.New("用户不存在")
	}
	
	// 不允许删除管理员用户（可选的业务逻辑）
	if existingUser.Role == "admin" {
		return errors.New("不能删除管理员用户")
	}
	
	// 删除用户
	return s.userRepo.Delete(id)
}

// BatchUpdateUserStatus 批量更新用户状态
func (s *UserService) BatchUpdateUserStatus(userIDs []uint, status string) error {
	if len(userIDs) == 0 {
		return errors.New("用户ID列表不能为空")
	}
	
	// 验证状态值
	if status != "active" && status != "inactive" {
		return errors.New("无效的状态值")
	}
	
	return s.userRepo.BatchUpdateStatus(userIDs, status)
}

// BatchDeleteUsers 批量删除用户
func (s *UserService) BatchDeleteUsers(userIDs []uint) error {
	if len(userIDs) == 0 {
		return errors.New("用户ID列表不能为空")
	}
	
	// 检查是否包含管理员用户
	for _, id := range userIDs {
		user, err := s.userRepo.GetByID(id)
		if err != nil {
			return fmt.Errorf("检查用户ID %d 失败: %w", id, err)
		}
		if user != nil && user.Role == "admin" {
			return errors.New("不能删除管理员用户")
		}
	}
	
	// 逐个删除用户
	for _, id := range userIDs {
		err := s.userRepo.Delete(id)
		if err != nil {
			return fmt.Errorf("删除用户ID %d 失败: %w", id, err)
		}
	}
	
	return nil
}

// UpdatePassword 更新用户密码
func (s *UserService) UpdatePassword(userID uint, oldPassword, newPassword string) error {
	// 获取用户信息
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return fmt.Errorf("获取用户信息失败: %w", err)
	}
	
	if user == nil {
		return errors.New("用户不存在")
	}
	
	// 验证旧密码
	valid, _, err := s.userRepo.VerifyPassword(user.Username, oldPassword)
	if err != nil {
		return fmt.Errorf("验证旧密码失败: %w", err)
	}
	
	if !valid {
		return errors.New("旧密码错误")
	}
	
	// 更新密码
	return s.userRepo.UpdatePassword(userID, newPassword)
}
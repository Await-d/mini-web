package service

import (
	"errors"
	"fmt"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"github.com/golang-jwt/jwt/v5"
)

var (
	// JWTSecret JWT密钥
	JWTSecret = []byte("mini-web-secret-key")

	// ErrInvalidCredentials 无效的凭证错误
	ErrInvalidCredentials = errors.New("无效的用户名或密码")

	// ErrUserAlreadyExists 用户已存在错误
	ErrUserAlreadyExists = errors.New("用户名或邮箱已存在")

	// ErrUserNotFound 用户不存在错误
	ErrUserNotFound = errors.New("用户不存在")
)

// TokenClaims JWT令牌声明
type TokenClaims struct {
	UserID uint   `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// AuthService 认证服务
type AuthService struct {
	userRepo model.UserRepository
}

// NewAuthService 创建认证服务实例
func NewAuthService(userRepo model.UserRepository) *AuthService {
	return &AuthService{userRepo: userRepo}
}

// Login 用户登录
func (s *AuthService) Login(username, password string) (*model.UserLoginResponse, error) {
	// 验证用户名和密码
	ok, user, err := s.userRepo.VerifyPassword(username, password)
	if err != nil {
		return nil, fmt.Errorf("验证密码时出错: %w", err)
	}
	if !ok || user == nil {
		return nil, ErrInvalidCredentials
	}

	// 检查用户状态
	if user.Status != "active" {
		return nil, errors.New("用户账号已被禁用")
	}

	// 生成JWT令牌
	token, expireTime, err := s.generateToken(user)
	if err != nil {
		return nil, fmt.Errorf("生成令牌时出错: %w", err)
	}

	// 构建响应
	response := &model.UserLoginResponse{
		Token:  token,
		User:   *user,
		Expire: expireTime.Unix(),
	}

	return response, nil
}

// Register 用户注册
func (s *AuthService) Register(req *model.UserRegisterRequest) (*model.User, error) {
	// 检查用户名是否已存在
	existingUser, err := s.userRepo.GetByUsername(req.Username)
	if err != nil {
		return nil, fmt.Errorf("检查用户名时出错: %w", err)
	}
	if existingUser != nil {
		return nil, ErrUserAlreadyExists
	}

	// 检查邮箱是否已存在
	existingUser, err = s.userRepo.GetByEmail(req.Email)
	if err != nil {
		return nil, fmt.Errorf("检查邮箱时出错: %w", err)
	}
	if existingUser != nil {
		return nil, ErrUserAlreadyExists
	}

	// 创建新用户
	user := &model.User{
		Username: req.Username,
		Email:    req.Email,
		Password: req.Password, // 密码会在repository层进行哈希处理
		Nickname: req.Nickname,
		Role:     "user",      // 默认角色
		Status:   "active",    // 默认状态
		Avatar:   "https://randomuser.me/api/portraits/lego/1.jpg", // 默认头像
	}

	// 保存用户
	if err := s.userRepo.Create(user); err != nil {
		return nil, fmt.Errorf("创建用户时出错: %w", err)
	}

	return user, nil
}

// GetUserInfo 获取用户信息
func (s *AuthService) GetUserInfo(userID uint) (*model.User, error) {
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, fmt.Errorf("获取用户信息时出错: %w", err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	return user, nil
}

// UpdateUserInfo 更新用户信息
func (s *AuthService) UpdateUserInfo(userID uint, req *model.UserUpdateRequest) (*model.User, error) {
	// 获取现有用户
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, fmt.Errorf("获取用户信息时出错: %w", err)
	}
	if user == nil {
		return nil, ErrUserNotFound
	}

	// 更新用户信息
	user.Nickname = req.Nickname
	if req.Avatar != "" {
		user.Avatar = req.Avatar
	}

	// 保存更新
	if err := s.userRepo.Update(user); err != nil {
		return nil, fmt.Errorf("更新用户信息时出错: %w", err)
	}

	return user, nil
}

// UpdatePassword 更新用户密码
func (s *AuthService) UpdatePassword(userID uint, req *model.UserPasswordUpdateRequest) error {
	// 获取用户
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return fmt.Errorf("获取用户信息时出错: %w", err)
	}
	if user == nil {
		return ErrUserNotFound
	}

	// 验证旧密码
	ok, _, err := s.userRepo.VerifyPassword(user.Username, req.OldPassword)
	if err != nil {
		return fmt.Errorf("验证旧密码时出错: %w", err)
	}
	if !ok {
		return errors.New("旧密码不正确")
	}

	// 更新密码
	if err := s.userRepo.UpdatePassword(userID, req.NewPassword); err != nil {
		return fmt.Errorf("更新密码时出错: %w", err)
	}

	return nil
}

// VerifyToken 验证JWT令牌
func (s *AuthService) VerifyToken(tokenString string) (*TokenClaims, error) {
	// 解析令牌
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		return JWTSecret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("解析令牌时出错: %w", err)
	}

	// 验证令牌
	if !token.Valid {
		return nil, errors.New("无效的令牌")
	}

	// 获取声明
	claims, ok := token.Claims.(*TokenClaims)
	if !ok {
		return nil, errors.New("无效的令牌声明")
	}

	return claims, nil
}

// RefreshToken 刷新令牌
func (s *AuthService) RefreshToken(userID uint) (string, time.Time, error) {
	// 获取用户
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("获取用户信息时出错: %w", err)
	}
	if user == nil {
		return "", time.Time{}, ErrUserNotFound
	}

	// 生成新令牌
	token, expireTime, err := s.generateToken(user)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("生成令牌时出错: %w", err)
	}

	return token, expireTime, nil
}

// generateToken 生成JWT令牌
func (s *AuthService) generateToken(user *model.User) (string, time.Time, error) {
	// 设置过期时间为24小时
	expireTime := time.Now().Add(24 * time.Hour)

	// 创建声明
	claims := &TokenClaims{
		UserID: user.ID,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expireTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "mini-web",
			Subject:   user.Username,
		},
	}

	// 创建令牌
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// 签名令牌
	tokenString, err := token.SignedString(JWTSecret)
	if err != nil {
		return "", time.Time{}, err
	}

	return tokenString, expireTime, nil
}
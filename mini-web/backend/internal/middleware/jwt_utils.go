package middleware

import (
	"errors"
	"fmt"
	"time"

	"gitee.com/await29/mini-web/internal/service"
	"github.com/golang-jwt/jwt/v5"
)

// 复用TokenClaims结构体
type TokenClaims struct {
	UserID uint   `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// ValidateToken 验证JWT令牌
func ValidateToken(tokenString string) (*TokenClaims, error) {
	// JWT密钥，确保与service.JWTSecret一致
	jwtSecret := service.JWTSecret

	// 解析令牌
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	// 处理解析错误
	if err != nil {
		return nil, fmt.Errorf("解析令牌时出错: %w", err)
	}

	// 验证令牌有效性
	if !token.Valid {
		return nil, errors.New("无效的令牌")
	}

	// 获取声明
	claims, ok := token.Claims.(*TokenClaims)
	if !ok {
		return nil, errors.New("无效的令牌声明")
	}

	// 检查过期时间
	if claims.ExpiresAt != nil {
		// 直接使用ExpiresAt，它已经是time.Time类型
		if time.Now().After(claims.ExpiresAt.Time) {
			return nil, errors.New("令牌已过期")
		}
	}

	return claims, nil
}
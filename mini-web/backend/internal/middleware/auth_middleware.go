package middleware

import (
	"context"
	"net/http"
	"strings"

	"gitee.com/await29/mini-web/internal/service"
)

// UserIDKey 上下文中用户ID的键
type userIDKey struct{}

// RoleKey 上下文中用户角色的键
type roleKey struct{}

// AuthMiddleware 认证中间件
type AuthMiddleware struct {
	authService *service.AuthService
}

// NewAuthMiddleware 创建认证中间件
func NewAuthMiddleware(authService *service.AuthService) *AuthMiddleware {
	return &AuthMiddleware{authService: authService}
}

// JWTAuth JWT认证中间件
func (m *AuthMiddleware) JWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 从Authorization头获取令牌
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			sendAuthError(w, "缺少授权头")
			return
		}

		// 期望格式: "Bearer {token}"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			sendAuthError(w, "授权头格式无效")
			return
		}

		tokenString := parts[1]

		// 验证令牌
		claims, err := m.authService.VerifyToken(tokenString)
		if err != nil {
			sendAuthError(w, "无效的令牌: "+err.Error())
			return
		}

		// 将用户信息添加到请求上下文
		ctx := context.WithValue(r.Context(), userIDKey{}, claims.UserID)
		ctx = context.WithValue(ctx, roleKey{}, claims.Role)

		// 使用更新后的上下文继续处理请求
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RoleAuth 角色认证中间件
func (m *AuthMiddleware) RoleAuth(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// 从上下文中获取用户角色
			role, ok := r.Context().Value(roleKey{}).(string)
			if !ok {
				sendAuthError(w, "无法获取用户角色")
				return
			}

			// 检查用户角色是否在允许的角色列表中
			allowed := false
			for _, allowedRole := range roles {
				if role == allowedRole {
					allowed = true
					break
				}
			}

			if !allowed {
				sendAuthError(w, "权限不足")
				return
			}

			// 继续处理请求
			next.ServeHTTP(w, r)
		})
	}
}

// GetUserID 从请求上下文中获取用户ID
func GetUserID(r *http.Request) (uint, bool) {
	userID, ok := r.Context().Value(userIDKey{}).(uint)
	return userID, ok
}

// GetUserRole 从请求上下文中获取用户角色
func GetUserRole(r *http.Request) (string, bool) {
	role, ok := r.Context().Value(roleKey{}).(string)
	return role, ok
}

// sendAuthError 发送认证错误响应
func sendAuthError(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"code":401,"message":"` + message + `"}`))
}
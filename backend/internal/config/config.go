package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config 应用配置
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Port int
	Host string
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Type string // sqlite, mysql, postgres
	Path string // SQLite数据库文件路径
}

// JWTConfig JWT配置
type JWTConfig struct {
	Secret     string
	ExpireHour int
}

// LoadConfig 加载配置
func LoadConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Port: getEnvAsInt("SERVER_PORT", 8080),
			Host: getEnv("SERVER_HOST", "localhost"),
		},
		Database: DatabaseConfig{
			Type: getEnv("DB_TYPE", "sqlite"),
			Path: getEnv("DB_PATH", "./data/mini-web.db"),
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", "mini-web-secret-key"),
			ExpireHour: getEnvAsInt("JWT_EXPIRE_HOUR", 24),
		},
	}
}

// GetServerAddr 获取服务器地址
func (c *Config) GetServerAddr() string {
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.Port)
}

// 辅助函数

// getEnv 获取环境变量，如果不存在则返回默认值
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

// getEnvAsInt 获取环境变量并转换为整数，如果不存在或转换失败则返回默认值
func getEnvAsInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
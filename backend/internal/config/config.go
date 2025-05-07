package config

// Config 应用配置结构
type Config struct {
	Server   ServerConfig   `json:"server"`
	Database DatabaseConfig `json:"database"`
	Logging  LoggingConfig  `json:"logging"`
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Port           int    `json:"port"`
	Host           string `json:"host"`
	AllowedOrigins string `json:"allowedOrigins"`
	ReadTimeout    int    `json:"readTimeout"`
	WriteTimeout   int    `json:"writeTimeout"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Driver   string `json:"driver"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	Database string `json:"database"`
}

// LoggingConfig 日志配置
type LoggingConfig struct {
	Level      string `json:"level"`
	FilePath   string `json:"filePath"`
	MaxSize    int    `json:"maxSize"`    // 文件大小限制，单位MB
	MaxBackups int    `json:"maxBackups"` // 最大备份数
	MaxAge     int    `json:"maxAge"`     // 最大备份天数
	Compress   bool   `json:"compress"`   // 是否压缩
}

// GetDefaultConfig 返回默认配置
func GetDefaultConfig() Config {
	return Config{
		Server: ServerConfig{
			Port:           8080,
			Host:           "0.0.0.0",
			AllowedOrigins: "*",
			ReadTimeout:    60,
			WriteTimeout:   60,
		},
		Database: DatabaseConfig{
			Driver:   "postgres",
			Host:     "localhost",
			Port:     5432,
			Username: "postgres",
			Password: "postgres",
			Database: "mini_web",
		},
		Logging: LoggingConfig{
			Level:      "info",
			FilePath:   "logs/app.log",
			MaxSize:    100,
			MaxBackups: 3,
			MaxAge:     28,
			Compress:   true,
		},
	}
}
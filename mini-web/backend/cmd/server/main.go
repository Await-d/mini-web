package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"gitee.com/await29/mini-web/internal/api"
	"gitee.com/await29/mini-web/internal/config"
	"gitee.com/await29/mini-web/internal/middleware"
	"gitee.com/await29/mini-web/internal/model/sqlite"
	"gitee.com/await29/mini-web/internal/service"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

func main() {
	// 加载配置
	cfg := config.LoadConfig()

	// 初始化日志
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("服务启动中...")

	// 初始化数据库
	log.Println("开始初始化数据库...")
	if err := sqlite.InitDB(); err != nil {
		log.Printf("初始化数据库失败，详细错误: %v", err)
		panic(err) // 使用panic输出更多调用栈信息
	}
	defer sqlite.CloseDB()

	// 创建仓库
	userRepo := sqlite.NewUserRepository(sqlite.DB)
	connRepo := sqlite.NewConnectionRepository(sqlite.DB)
	sessionRepo := sqlite.NewSessionRepository(sqlite.DB)
	configRepo := sqlite.NewSystemConfigRepository(sqlite.DB)
	logRepo := sqlite.NewSystemLogRepository(sqlite.DB)
	activityRepo := sqlite.NewUserActivityRepository(sqlite.DB)

	// 创建服务
	authService := service.NewAuthService(userRepo)
	userService := service.NewUserService(userRepo)
	connService := service.NewConnectionService(connRepo, sessionRepo)
	systemService := service.NewSystemService(configRepo, logRepo)
	dashboardService := service.NewDashboardService(userRepo, connRepo, sessionRepo, systemService)

	// 创建处理器
	authHandler := api.NewAuthHandler(authService)
	userHandler := api.NewUserHandler(userService, activityRepo)
	connHandler := api.NewConnectionHandler(connService)
	systemHandler := api.NewSystemHandler(systemService)
	dashboardHandler := api.NewDashboardHandler(dashboardService)
	terminalSessionHandler := api.NewTerminalSessionHandler(connService)

	// 创建中间件
	authMiddleware := middleware.NewAuthMiddleware(authService)

	// 创建路由
	router := mux.NewRouter()

	// 应用CORS中间件
	router.Use(middleware.CORSMiddleware)

	// 添加健康检查端点
	router.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		// 确保CORS头部应用到此路由
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","message":"服务运行正常"}`))
	}).Methods("GET", "OPTIONS")
	
	// 添加WebSocket健康检查端点
	router.HandleFunc("/api/ws/health", func(w http.ResponseWriter, r *http.Request) {
		// 确保CORS头部应用到此路由
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		// 升级到WebSocket连接
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}
		
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("升级WebSocket连接失败: %v", err)
			return
		}
		defer conn.Close()
		
		// 发送健康状态消息
		conn.WriteMessage(websocket.TextMessage, []byte("WebSocket连接正常"))
		
		// 保持连接，等待客户端关闭
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	})

	// 公开路由
	publicRouter := router.PathPrefix("/api").Subrouter()
	publicRouter.HandleFunc("/auth/login", authHandler.Login).Methods("POST", "OPTIONS")
	publicRouter.HandleFunc("/auth/register", authHandler.Register).Methods("POST", "OPTIONS")

	// 受保护的路由
	protectedRouter := router.PathPrefix("/api").Subrouter()
	protectedRouter.Use(authMiddleware.JWTAuth)
	
	// 用户相关路由
	protectedRouter.HandleFunc("/user/profile", authHandler.GetUserInfo).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/user/profile", authHandler.UpdateUserInfo).Methods("PUT", "OPTIONS")
	protectedRouter.HandleFunc("/user/password", authHandler.UpdatePassword).Methods("PUT", "OPTIONS")
	protectedRouter.HandleFunc("/auth/refresh", authHandler.RefreshToken).Methods("POST", "OPTIONS")

	// 连接相关路由
	protectedRouter.HandleFunc("/connections", connHandler.GetUserConnections).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/connections", connHandler.CreateConnection).Methods("POST", "OPTIONS")
	protectedRouter.HandleFunc("/connections/{id}", connHandler.GetConnection).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/connections/{id}", connHandler.UpdateConnection).Methods("PUT", "OPTIONS")
	protectedRouter.HandleFunc("/connections/{id}", connHandler.DeleteConnection).Methods("DELETE", "OPTIONS")
	protectedRouter.HandleFunc("/connections/test", connHandler.TestConnection).Methods("POST", "OPTIONS")
	
	// 会话相关路由
	protectedRouter.HandleFunc("/sessions", connHandler.GetUserSessions).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/sessions/active", connHandler.GetActiveSessions).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/connections/{id}/sessions", connHandler.CreateSession).Methods("POST", "OPTIONS")
	protectedRouter.HandleFunc("/sessions/{id}", connHandler.CloseSession).Methods("DELETE", "OPTIONS")
	
	// WebSocket终端连接 - 移到公开路由，移除认证要求，便于调试
	log.Println("注册WebSocket终端路由: /ws/{protocol}/{sessionId}")
	router.HandleFunc("/ws/{protocol}/{sessionId}", connHandler.HandleTerminalWebSocket)

	// 管理员路由
	adminRouter := protectedRouter.PathPrefix("/admin").Subrouter()
	adminRouter.Use(authMiddleware.RoleAuth("admin"))
	adminRouter.HandleFunc("/users", userHandler.GetUsers).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/users/{id}", userHandler.GetUserByID).Methods("GET", "OPTIONS")

	// 系统配置路由
	adminRouter.HandleFunc("/system/configs", systemHandler.GetAllConfigs).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/system/configs", systemHandler.CreateConfig).Methods("POST", "OPTIONS")
	adminRouter.HandleFunc("/system/configs/batch", systemHandler.BatchUpdateConfigs).Methods("PUT", "OPTIONS")

	// 邮件配置路由 (暂时注释，使用系统处理器中的邮件测试功能)
	// emailHandler := api.NewEmailHandler()
	// adminRouter.HandleFunc("/system/email/config", emailHandler.GetEmailConfig).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/email/config", emailHandler.UpdateEmailConfig).Methods("PUT", "OPTIONS")
	// adminRouter.HandleFunc("/system/email/test-connection", emailHandler.TestEmailConnection).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/email/test-send", emailHandler.SendTestEmail).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/email/templates", emailHandler.GetEmailTemplates).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/email/templates", emailHandler.CreateEmailTemplate).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/email/templates/{id}", emailHandler.UpdateEmailTemplate).Methods("PUT", "OPTIONS")
	// adminRouter.HandleFunc("/system/email/templates/{id}", emailHandler.DeleteEmailTemplate).Methods("DELETE", "OPTIONS")
	// adminRouter.HandleFunc("/system/email/variables", emailHandler.GetEmailTemplateVariables).Methods("GET", "OPTIONS")

	// SSL证书配置路由 (暂时注释)
	// sslHandler := api.NewSSLHandler()
	// adminRouter.HandleFunc("/system/ssl/configs", sslHandler.GetSSLConfigs).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/configs", sslHandler.CreateSSLConfig).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/configs/{id}", sslHandler.GetSSLConfig).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/configs/{id}", sslHandler.UpdateSSLConfig).Methods("PUT", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/configs/{id}", sslHandler.DeleteSSLConfig).Methods("DELETE", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/configs/{id}/enable", sslHandler.EnableSSLConfig).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/configs/{id}/disable", sslHandler.DisableSSLConfig).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/configs/{id}/default", sslHandler.SetDefaultSSLConfig).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/test-connection", sslHandler.TestSSLConnection).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/parse-certificate", sslHandler.ParseCertificate).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/expiring", sslHandler.GetExpiringCertificates).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/ssl/status", sslHandler.GetSSLStatus).Methods("GET", "OPTIONS")

	// API访问控制路由 (暂时注释)
	// apiControlHandler := api.NewAPIControlHandler()
	// adminRouter.HandleFunc("/system/api/config", apiControlHandler.GetAPIConfig).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/config", apiControlHandler.UpdateAPIConfig).Methods("PUT", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/keys", apiControlHandler.GetAPIKeys).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/keys", apiControlHandler.CreateAPIKey).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/keys/{id}", apiControlHandler.UpdateAPIKey).Methods("PUT", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/keys/{id}", apiControlHandler.DeleteAPIKey).Methods("DELETE", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/whitelist", apiControlHandler.GetIPWhitelist).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/whitelist", apiControlHandler.AddIPToWhitelist).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/whitelist/{id}", apiControlHandler.RemoveIPFromWhitelist).Methods("DELETE", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/blacklist", apiControlHandler.GetIPBlacklist).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/blacklist", apiControlHandler.AddIPToBlacklist).Methods("POST", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/blacklist/{id}", apiControlHandler.RemoveIPFromBlacklist).Methods("DELETE", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/logs", apiControlHandler.GetAPIAccessLogs).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/statistics", apiControlHandler.GetAccessStatistics).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/rate-limit/status", apiControlHandler.GetRateLimitStatus).Methods("GET", "OPTIONS")
	// adminRouter.HandleFunc("/system/api/cleanup", apiControlHandler.CleanupExpiredEntries).Methods("POST", "OPTIONS")
	adminRouter.HandleFunc("/system/configs/category/{category}", systemHandler.GetConfigsByCategory).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/system/configs/{key}", systemHandler.GetConfig).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/system/configs/{key}", systemHandler.UpdateConfig).Methods("PUT", "OPTIONS")
	adminRouter.HandleFunc("/system/configs/{key}", systemHandler.DeleteConfig).Methods("DELETE", "OPTIONS")

	// 系统日志路由
	adminRouter.HandleFunc("/system/logs", systemHandler.GetLogs).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/system/logs/stats", systemHandler.GetLogStats).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/system/logs/clear", systemHandler.ClearLogs).Methods("POST", "OPTIONS")
	adminRouter.HandleFunc("/system/logs/{id}", systemHandler.DeleteLog).Methods("DELETE", "OPTIONS")

	// 系统信息和性能监控路由
	adminRouter.HandleFunc("/system/info", systemHandler.GetSystemInfo).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/system/performance", systemHandler.GetPerformanceMetrics).Methods("GET", "OPTIONS")
	adminRouter.HandleFunc("/system/email/test", systemHandler.TestEmailConfig).Methods("POST", "OPTIONS")

	// Dashboard路由
	protectedRouter.HandleFunc("/dashboard/stats", dashboardHandler.GetDashboardStats).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/dashboard/system-status", dashboardHandler.GetSystemStatus).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/dashboard/activities", dashboardHandler.GetRecentActivities).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/dashboard/connections", dashboardHandler.GetConnectionStats).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/dashboard/users", dashboardHandler.GetUserStats).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/dashboard/sessions", dashboardHandler.GetSessionStats).Methods("GET", "OPTIONS")

	// 终端会话管理路由
	protectedRouter.HandleFunc("/terminal/sessions", terminalSessionHandler.CreateTerminalSession).Methods("POST", "OPTIONS")
	protectedRouter.HandleFunc("/terminal/sessions", terminalSessionHandler.GetUserTerminalSessions).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/terminal/sessions/{id}", terminalSessionHandler.GetTerminalSession).Methods("GET", "OPTIONS")
	protectedRouter.HandleFunc("/terminal/sessions/{id}", terminalSessionHandler.CloseTerminalSession).Methods("DELETE", "OPTIONS")
	protectedRouter.HandleFunc("/terminal/sessions/stats", terminalSessionHandler.GetSessionStats).Methods("GET", "OPTIONS")

	// 新的WebSocket终端连接（支持会话恢复）
	router.HandleFunc("/ws/terminal/{sessionId}", terminalSessionHandler.HandleTerminalWebSocketWithSession)

	// 设置服务器
	server := &http.Server{
		Addr:    cfg.GetServerAddr(),
		Handler: router,
	}

	// 启动服务器
	go func() {
		log.Printf("服务器启动在 %s\n", cfg.GetServerAddr())
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("服务器启动失败: %v", err)
		}
	}()

	// 优雅关闭
	gracefulShutdown(server)
}

// gracefulShutdown 优雅关闭服务器
func gracefulShutdown(server *http.Server) {
	// 监听信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("正在关闭服务器...")

	// 关闭服务器
	if err := server.Close(); err != nil {
		log.Fatalf("服务器关闭失败: %v", err)
	}

	log.Println("服务器已关闭")
}
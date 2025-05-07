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

	// 创建服务
	authService := service.NewAuthService(userRepo)
	connService := service.NewConnectionService(connRepo, sessionRepo)

	// 创建处理器
	authHandler := api.NewAuthHandler(authService)
	userHandler := api.NewUserHandler()
	connHandler := api.NewConnectionHandler(connService)

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
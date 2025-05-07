package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/yourname/mini-web/internal/api"
	"github.com/yourname/mini-web/internal/config"
)

func main() {
	// 加载配置
	cfg := config.GetDefaultConfig()
	
	// 创建处理器
	userHandler := api.NewUserHandler()
	
	// 创建新的ServeMux
	mux := http.NewServeMux()
	
	// 设置路由
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Mini Web API Server")
	})

	// 健康检查
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "ok",
		})
	})
	
	// 注册用户相关API路由
	userHandler.RegisterRoutes(mux)
	
	// 创建跨域中间件处理器
	handler := corsMiddleware(mux)
	
	// 启动服务器
	serverAddr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Printf("Server starting on %s...\n", serverAddr)
	log.Fatal(http.ListenAndServe(serverAddr, handler))
}

// corsMiddleware 跨域中间件
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 设置CORS头
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		// 处理预检请求
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		// 调用下一个处理器
		next.ServeHTTP(w, r)
	})
}
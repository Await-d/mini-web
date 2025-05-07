package middleware

import (
	"log"
	"net/http"
	"strings"
)

// CORSMiddleware 跨域资源共享中间件
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 获取请求的Origin
		origin := r.Header.Get("Origin")
		if origin == "" {
			// 如果没有Origin头，使用通配符（不太安全，但方便测试）
			origin = "*"
		}
		
		// 记录CORS请求日志 - 增加查询参数
		log.Printf("收到请求: %s %s%s, Origin: %s", r.Method, r.URL.Path, r.URL.RawQuery, origin)
		
		// 判断是否为WebSocket请求
		isWebSocket := false
		if strings.ToLower(r.Header.Get("Upgrade")) == "websocket" {
			isWebSocket = true
			log.Printf("检测到WebSocket请求: %s%s", r.URL.Path, r.URL.RawQuery)
			
			// 打印详细的WebSocket请求信息
			if strings.HasPrefix(r.URL.Path, "/ws/") {
				log.Printf("================================")
				log.Printf("WebSocket详细信息:")
				log.Printf("完整URL: %s", r.URL.String())
				log.Printf("Query参数: %s", r.URL.RawQuery)
				log.Printf("Token: %s", r.URL.Query().Get("token"))
				log.Printf("请求头:")
				for name, values := range r.Header {
					for _, value := range values {
						log.Printf("  %s: %s", name, value)
					}
				}
				log.Printf("================================")
			}
		}
		
		// 设置跨域头 - 为WebSocket请求特别处理
		if isWebSocket {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, Referer, User-Agent, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol, Sec-WebSocket-Extensions, Upgrade, Connection")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
			w.Header().Set("Access-Control-Max-Age", "3600")
		} else {
			// 普通HTTP请求的跨域头
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, Referer, User-Agent")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "3600")
		}
		
		// 处理预检请求
		if r.Method == "OPTIONS" {
			log.Printf("处理OPTIONS预检请求: %s", r.URL.Path)
			w.WriteHeader(http.StatusOK)
			return
		}
		
		// 继续处理请求
		next.ServeHTTP(w, r)
	})
}
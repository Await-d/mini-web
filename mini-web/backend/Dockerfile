FROM golang:1.20-alpine AS builder

WORKDIR /app

# 复制Go模块定义文件
COPY go.mod go.sum ./
RUN go mod download

# 复制源代码
COPY . .

# 构建后端应用
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/mini-web-server ./cmd/server

# 创建最终镜像
FROM alpine:latest

# 设置工作目录
WORKDIR /app

# 安装必要的依赖
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    bash \
    curl \
    imagemagick \
    # freerdp可选，但有助于提供更好的RDP支持
    freerdp-dev 

# 设置时区
ENV TZ=Asia/Shanghai

# 设置为无界面环境
ENV HEADLESS=true
ENV CONTAINER=true

# 创建必要的目录
RUN mkdir -p /app/data /app/logs /app/configs /tmp/rdp_screenshots

# 从构建阶段复制二进制文件
COPY --from=builder /app/bin/mini-web-server /app/
COPY --from=builder /app/configs /app/configs
COPY --from=builder /app/data /app/data

# 设置权限
RUN chmod +x /app/mini-web-server

# 暴露API端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# 运行应用
CMD ["/app/mini-web-server"] 
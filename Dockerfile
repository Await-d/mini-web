# 多阶段构建：前端 + 后端 + 运行时
FROM node:18 AS frontend-builder

WORKDIR /app/frontend

# 复制前端依赖文件
COPY mini-web/frontend/package.json mini-web/frontend/yarn.lock ./

# 安装前端依赖
RUN yarn install --frozen-lockfile

# 复制前端源代码
COPY mini-web/frontend .

# 构建前端
RUN yarn build

# 后端构建阶段
FROM golang:1.23-alpine AS backend-builder

WORKDIR /app/backend

# 复制Go模块定义文件
COPY mini-web/backend/go.mod mini-web/backend/go.sum ./
RUN go mod download

# 复制后端源代码
COPY mini-web/backend .

# 构建后端应用
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/mini-web-server ./cmd/server

# 最终运行时镜像
FROM nginx:alpine

# 安装必要的依赖
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    bash \
    curl \
    supervisor

# 设置时区
ENV TZ=Asia/Shanghai

# 设置为容器环境
ENV HEADLESS=true
ENV CONTAINER=true
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=8080

# 创建必要的目录
RUN mkdir -p /app/data /app/logs /app/configs /tmp/rdp_screenshots /var/log/supervisor && \
    touch /app/data/.gitkeep /app/logs/.gitkeep /app/configs/.gitkeep

# 从构建阶段复制文件
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY --from=backend-builder /app/bin/mini-web-server /app/
COPY --from=backend-builder /app/backend/data /app/data

# 复制nginx配置和启动脚本
COPY nginx/mini-web.conf /etc/nginx/conf.d/default.conf
COPY scripts/entrypoint.sh /entrypoint.sh

# 设置权限
RUN chmod +x /app/mini-web-server && \
    chmod +x /entrypoint.sh && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R root:root /app

# 复制supervisor配置
COPY scripts/supervisor.conf /etc/supervisor/conf.d/mini-web.conf

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/api/health || exit 1

# 使用启动脚本
CMD ["/entrypoint.sh"]
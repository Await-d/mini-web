# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制package.json和yarn.lock
COPY package.json yarn.lock ./

# 安装依赖
RUN yarn install --frozen-lockfile

# 复制源代码
COPY . .

# 构建前端
RUN yarn build

# 生产阶段
FROM nginx:alpine

# 复制nginx配置
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露80端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/ || exit 1

# 使用非root用户运行
RUN adduser -D -u 1000 webuser && \
    chown -R webuser:webuser /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

USER webuser

# 启动nginx
CMD ["nginx", "-g", "daemon off;"] 
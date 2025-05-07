# Mini Web 项目

基于React 19 + Ant Design 5 + TypeScript构建的前端和Go后端的Web应用。

## 项目结构

```
mini-web/
├── frontend/          # 前端代码
│   ├── public/        # 静态资源
│   ├── src/           # 源代码
│   │   ├── assets/    # 静态资源
│   │   ├── components/# 组件
│   │   ├── hooks/     # 自定义Hooks
│   │   ├── layouts/   # 布局组件
│   │   ├── pages/     # 页面组件
│   │   ├── App.tsx    # 应用入口组件
│   │   ├── main.tsx   # 主入口文件
│   │   └── router.tsx # 路由配置
│   ├── index.html     # HTML模板
│   └── package.json   # 依赖管理
└── backend/           # 后端代码
    ├── cmd/           # 入口命令
    ├── internal/      # 内部包
    │   ├── api/       # API处理
    │   ├── config/    # 配置
    │   ├── model/     # 数据模型
    │   └── service/   # 业务逻辑
    ├── pkg/           # 可导出的包
    └── go.mod         # Go模块定义
```

## 前端

### 技术栈

- React 19
- TypeScript
- Ant Design 5
- Vite
- Vitest (单元测试)
- Playwright (E2E测试)

### 开发

```bash
# 安装依赖
cd frontend
yarn

# 启动开发服务器
yarn dev

# 运行测试
yarn test

# 构建生产版本
yarn build
```

## 后端

### 技术栈

- Go
- 标准库HTTP服务器 (后续可升级为Gin)

### 开发

```bash
# 运行后端
cd backend
go run cmd/server/main.go

# 构建
go build -o bin/server cmd/server/main.go
```

## 功能特性

- 响应式布局
- 主题定制
- 路由管理
- RESTful API
- 用户认证

## 贡献指南

请参考[.cursor/rules](.cursor/rules)目录下的规范文档进行开发。
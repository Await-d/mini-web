# Git 多仓库配置说明

## 仓库配置

### 当前远程仓库
```bash
origin  https://gitee.com/await29/mini-web.git (fetch/push)
github  https://github.com/Await-d/mini-web.git (fetch/push)
mini-web http://14.103.238.12:10882/await/mini-web.git (fetch/push)
```

### 分支策略
- **origin/github**: 使用 `master` 分支
- **mini-web**: 使用 `master` 分支

## 推送操作

### 自动推送（推荐）
使用提供的脚本推送到所有仓库：
```bash
./push-all.sh
```

### 手动推送
```bash
# 推送到 Gitee (origin)
git push origin master

# 推送到 GitHub
git push github master

# 推送到私有仓库 (mini-web)
git push mini-web master
```

### 强制推送（谨慎使用）
```bash
git push origin master --force
git push github master --force
git push god master:mini-web --force
```

## Drone CI/CD 配置

### 不同仓库的配置文件
1. **`.drone.yml`** - 用于 origin 和 github
   - 监听 `master` 分支
   - 部署到 `/volume1/docker/1panel/apps/local/mini-web/`

2. **`.drone-god.yml`** - 用于 god 仓库
   - 监听 `mini-web` 分支
   - 部署配置相同

### 激活 Drone
需要在对应的 Drone 服务器中激活：
- Gitee 的 Drone: 使用 `.drone.yml`
- 私有 Git 的 Drone: 重命名 `.drone-god.yml` 为 `.drone.yml`

## 常用命令

### 查看仓库状态
```bash
# 查看远程仓库配置
git remote -v

# 查看当前分支
git branch -a

# 查看远程分支
git ls-remote origin
git ls-remote github
git ls-remote god
```

### 同步操作
```bash
# 拉取所有远程更新
git fetch --all

# 查看差异
git log origin/master..HEAD
git log github/master..HEAD
git log god/mini-web..HEAD
```

### 分支管理
```bash
# 创建并切换到新分支
git checkout -b feature/new-feature

# 推送新分支到所有仓库
git push origin feature/new-feature
git push github feature/new-feature
git push god feature/new-feature:feature/new-feature
```

## 故障排除

### 推送失败
1. **认证问题**
   ```bash
   # 检查Git凭据
   git config --list | grep user
   
   # 重新配置凭据
   git config user.name "Your Name"
   git config user.email "your.email@example.com"
   ```

2. **网络问题**
   ```bash
   # 测试连接
   git ls-remote origin
   curl -I http://14.103.238.12:10882/await/god.git
   ```

3. **分支冲突**
   ```bash
   # 强制推送（谨慎）
   git push god master:mini-web --force
   ```

### 删除远程仓库
```bash
# 删除远程仓库配置
git remote remove god

# 重新添加
git remote add god http://14.103.238.12:10882/await/god.git
```

## 最佳实践

1. **提交前检查**
   ```bash
   git status
   git diff --cached
   ```

2. **使用有意义的提交信息**
   ```bash
   git commit -m "feat: 添加Drone部署配置"
   git commit -m "fix: 修复Docker健康检查问题"
   git commit -m "docs: 更新部署文档"
   ```

3. **定期同步**
   ```bash
   ./push-all.sh
   ```

4. **备份重要分支**
   ```bash
   git tag v1.0.0
   git push --tags origin github god
   ```

## 文件说明

- **`push-all.sh`**: 自动推送脚本
- **`.drone.yml`**: 主要的Drone配置
- **`.drone-god.yml`**: 私有仓库的Drone配置
- **`GIT-SETUP.md`**: 本文档

## 安全注意事项

1. **私有仓库访问**: `http://14.103.238.12:10882` 请确保网络安全
2. **凭据管理**: 不要在代码中包含敏感信息
3. **访问权限**: 定期检查仓库访问权限
4. **备份策略**: 多仓库提供了天然的备份机制
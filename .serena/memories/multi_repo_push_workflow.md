# 多仓库推送工作流程

## 配置的远程仓库
项目配置了三个远程仓库：

1. **GitHub**: `github` - https://github.com/Await-d/mini-web.git (主要开发仓库)
2. **Gitee**: `origin` - https://gitee.com/await29/mini-web.git (国内镜像)
3. **私有Git**: `mini-web` - http://14.103.238.12:10882/await/mini-web.git (内部仓库)

## 推送策略

### 标准推送流程
当需要推送代码到所有仓库时，按以下顺序执行：

```bash
# 1. 推送到GitHub（主仓库）
git push github master

# 2. 推送到私有Git仓库
git push mini-web master

# 3. 推送到Gitee（可能有访问限制）
git push origin master
```

### 特殊情况处理

**Gitee访问限制**：
- 错误信息：`reject by mode [i]` 或 HTTP 400
- 原因：Gitee可能有推送模式限制或认证问题
- 解决：跳过Gitee推送，专注GitHub和私有仓库

**推送失败处理**：
- 检查网络连接
- 验证认证信息
- 查看仓库权限
- 检查分支保护规则

## 自动化脚本参考

可以创建脚本自动推送到所有可用仓库：

```bash
#!/bin/bash
# push-all.sh

echo "推送到GitHub..."
git push github master && echo "✅ GitHub推送成功" || echo "❌ GitHub推送失败"

echo "推送到私有Git..."
git push mini-web master && echo "✅ 私有Git推送成功" || echo "❌ 私有Git推送失败"

echo "推送到Gitee..."
git push origin master && echo "✅ Gitee推送成功" || echo "❌ Gitee推送失败"
```

## 使用建议

1. **优先推送GitHub**: 作为主要开发仓库，确保代码安全
2. **备份到私有仓库**: 保证内部访问和CI/CD流程
3. **同步到Gitee**: 国内访问便利，但可能有限制

## 最近推送记录

- **2025-07-19**: Drone CI配置更新
  - ✅ GitHub: 成功推送
  - ✅ 私有Git: 成功推送  
  - ❌ Gitee: 访问被拒绝（模式限制）

## 注意事项

- 确保本地代码已提交
- 检查远程仓库连接状态
- 注意不同仓库的分支保护策略
- 保持仓库同步，避免版本分歧
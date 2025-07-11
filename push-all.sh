#!/bin/bash

# 推送到所有远程仓库的脚本

set -e

echo "=== 推送到所有远程仓库 ==="

# 检查是否有未提交的变更
if [[ -n $(git status --porcelain) ]]; then
    echo "警告: 有未提交的变更，是否继续推送?"
    echo "未提交的文件:"
    git status --short
    read -p "继续推送? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "推送已取消"
        exit 1
    fi
fi

echo "1. 推送到 origin (Gitee)..."
git push origin master || echo "推送到 origin 失败"

echo "2. 推送到 github..."
git push github master || echo "推送到 github 失败"

echo "3. 推送到 mini-web..."
git push mini-web master || echo "推送到 mini-web 失败"

echo ""
echo "=== 推送完成 ==="
echo "检查各仓库状态:"
echo "- Gitee: https://gitee.com/await29/mini-web"
echo "- GitHub: https://github.com/Await-d/mini-web"
echo "- Mini-Web: http://14.103.238.12:10882/await/mini-web"
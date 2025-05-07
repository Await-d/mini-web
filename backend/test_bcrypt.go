package main

import (
	"fmt"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// 测试admin123密码的哈希值
	password := "admin123"
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fmt.Printf("生成哈希失败: %v\n", err)
		return
	}

	fmt.Printf("密码 '%s' 的哈希值: %s\n", password, string(hash))

	// 验证存储的哈希值
	storedHash := "$2a$10$Y9OgUhM7qQMY3ZtCjRFumufLzD8j7/7L2pWPrr3JQdGF8Md3ezhiu"
	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password))
	if err != nil {
		fmt.Printf("验证失败: %v\n", err)
		return
	}

	fmt.Println("密码验证成功!")
}
package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("使用方法: go run genpwd.go <密码>")
		os.Exit(1)
	}

	password := os.Args[1]
	
	// 生成哈希密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		fmt.Printf("生成密码哈希失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("密码原文: %s\n", password)
	fmt.Printf("哈希结果: %s\n", string(hashedPassword))

	// 验证哈希密码
	err = bcrypt.CompareHashAndPassword(hashedPassword, []byte(password))
	if err == nil {
		fmt.Println("验证成功: 密码匹配!")
	} else {
		fmt.Printf("验证失败: %v\n", err)
	}
}
package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Println("使用方法: go run verify_pwd.go <密码> <哈希值>")
		os.Exit(1)
	}

	password := os.Args[1]
	hash := os.Args[2]
	
	// 验证哈希密码
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	
	fmt.Printf("密码: %s\n", password)
	fmt.Printf("哈希值: %s\n", hash)
	
	if err == nil {
		fmt.Println("验证结果: 成功! 密码匹配")
	} else {
		fmt.Printf("验证结果: 失败! %v\n", err)
	}
}
package main

import (
	"fmt"
	"log"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Println("用法: go run main.go <password>")
		os.Exit(1)
	}

	password := os.Args[1]
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("生成哈希密码时出错: %v", err)
	}

	fmt.Printf("原始密码: %s\n", password)
	fmt.Printf("哈希密码: %s\n", hashedPassword)
}
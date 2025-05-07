package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// 确保data目录存在
	dataDir := "./data"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("创建数据目录失败: %v", err)
		return
	}

	dbPath := filepath.Join(dataDir, "mini-web.db")
	log.Printf("数据库路径: %s", dbPath)

	// 检查数据库文件是否存在，如果不存在则创建
	_, err := os.Stat(dbPath)
	if os.IsNotExist(err) {
		log.Printf("数据库文件不存在，将创建新文件")
		file, err := os.Create(dbPath)
		if err != nil {
			log.Fatalf("创建数据库文件失败: %v", err)
			return
		}
		file.Close()
	}

	// 打开数据库连接
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("打开数据库连接失败: %v", err)
		return
	}
	defer db.Close()

	// 测试连接
	if err := db.Ping(); err != nil {
		log.Fatalf("数据库连接测试失败: %v", err)
		return
	}

	// 创建用户表
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		nickname TEXT,
		avatar TEXT,
		role TEXT NOT NULL DEFAULT 'user',
		status TEXT NOT NULL DEFAULT 'active',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		log.Fatalf("创建用户表失败: %v", err)
		return
	}
	log.Println("用户表已创建")

	// 删除现有管理员用户
	_, err = db.Exec("DELETE FROM users WHERE username = ?", "admin")
	if err != nil {
		log.Printf("删除admin用户失败: %v", err)
	} else {
		log.Println("删除现有admin用户")
	}

	// 创建新密码
	password := "admin123"
	// 生成哈希密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("生成密码哈希失败: %v", err)
		return
	}
	
	log.Printf("密码 '%s' 的哈希值: %s", password, string(hashedPassword))

	// 插入管理员用户
	_, err = db.Exec(`
	INSERT INTO users (username, email, password, nickname, avatar, role, status)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`, "admin", "admin@example.com", string(hashedPassword), "管理员", 
	   "https://randomuser.me/api/portraits/men/1.jpg", "admin", "active")
	
	if err != nil {
		log.Fatalf("创建管理员用户失败: %v", err)
		return
	}
	
	log.Println("管理员用户创建成功")
	fmt.Println("用户名: admin")
	fmt.Println("密码: admin123")
	
	// 验证密码哈希是否工作
	var storedHash string
	err = db.QueryRow("SELECT password FROM users WHERE username = ?", "admin").Scan(&storedHash)
	if err != nil {
		log.Fatalf("获取用户密码哈希失败: %v", err)
		return
	}
	
	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password))
	if err != nil {
		log.Fatalf("密码验证失败: %v", err)
		return
	}
	
	log.Println("密码验证成功! 哈希值工作正常")
}
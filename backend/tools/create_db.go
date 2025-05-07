package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func main() {
	// 确保数据目录存在
	dataDir := "../data"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		fmt.Printf("创建数据目录失败: %v\n", err)
		os.Exit(1)
	}

	dbPath := filepath.Join(dataDir, "mini-web.db")
	fmt.Printf("数据库路径: %s\n", dbPath)

	// 删除已存在的数据库文件
	if _, err := os.Stat(dbPath); err == nil {
		if err := os.Remove(dbPath); err != nil {
			fmt.Printf("删除现有数据库文件失败: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("已删除现有数据库文件")
	}

	// 打开数据库连接
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		fmt.Printf("打开数据库连接失败: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	// 测试连接
	if err := db.Ping(); err != nil {
		fmt.Printf("数据库连接测试失败: %v\n", err)
		os.Exit(1)
	}

	// 创建表
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
		fmt.Printf("创建用户表失败: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("表结构创建成功")

	// 添加默认用户 (密码均为: admin)
	_, err = db.Exec(`
	INSERT INTO users (username, email, password, nickname, avatar, role, status)
	VALUES 
		('admin', 'admin@example.com', '$2a$10$AUBQcXhTDkQQt5nNdmiyKufhBGWVgGONmBa5MnaSknUR0OSp5HZbO', '管理员', 'https://randomuser.me/api/portraits/men/1.jpg', 'admin', 'active'),
		('user', 'user@example.com', '$2a$10$AUBQcXhTDkQQt5nNdmiyKufhBGWVgGONmBa5MnaSknUR0OSp5HZbO', '普通用户', 'https://randomuser.me/api/portraits/women/1.jpg', 'user', 'active')
	`)
	if err != nil {
		fmt.Printf("添加默认用户失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("数据库初始化成功")
	
	// 验证数据是否正确插入
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		fmt.Printf("查询用户数量失败: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("用户表中共有 %d 条记录\n", count)
	
	// 显示用户列表
	rows, err := db.Query("SELECT id, username, email, nickname, role FROM users")
	if err != nil {
		fmt.Printf("查询用户列表失败: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()
	
	fmt.Println("\n用户列表:")
	fmt.Println("ID\t用户名\t邮箱\t\t昵称\t角色")
	fmt.Println("----------------------------------------------")
	for rows.Next() {
		var id int
		var username, email, nickname, role string
		if err := rows.Scan(&id, &username, &email, &nickname, &role); err != nil {
			fmt.Printf("读取行数据失败: %v\n", err)
			continue
		}
		fmt.Printf("%d\t%s\t%s\t%s\t%s\n", id, username, email, nickname, role)
	}
}
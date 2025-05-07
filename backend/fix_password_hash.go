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
	dbPath := filepath.Join(dataDir, "mini-web.db")
	log.Printf("尝试修复数据库: %s", dbPath)

	// 检查数据库文件是否存在
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		log.Fatalf("数据库文件不存在: %s", dbPath)
		return
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

	// 设置新密码
	password := "admin123"
	
	// 生成哈希密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("生成密码哈希失败: %v", err)
		return
	}
	
	// 打印哈希值用于验证
	log.Printf("新生成的哈希密码: %s", string(hashedPassword))

	// 更新admin用户的密码
	_, err = db.Exec(`UPDATE users SET password = ? WHERE username = ?`, string(hashedPassword), "admin")
	if err != nil {
		log.Fatalf("更新admin用户密码失败: %v", err)
		return
	}
	log.Printf("已更新admin用户的密码哈希值")

	// 更新user用户的密码
	_, err = db.Exec(`UPDATE users SET password = ? WHERE username = ?`, string(hashedPassword), "user")
	if err != nil {
		log.Fatalf("更新user用户密码失败: %v", err)
		return
	}
	log.Printf("已更新user用户的密码哈希值")

	// 验证用户账号
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		log.Fatalf("查询用户数量失败: %v", err)
		return
	}
	log.Printf("数据库中共有 %d 个用户账号", count)

	// 输出所有用户
	rows, err := db.Query("SELECT id, username, email, password FROM users")
	if err != nil {
		log.Fatalf("查询用户失败: %v", err)
		return
	}
	defer rows.Close()

	fmt.Println("\n用户列表:")
	fmt.Println("-----------------------------------")
	for rows.Next() {
		var id int
		var username, email, pwdHash string
		if err := rows.Scan(&id, &username, &email, &pwdHash); err != nil {
			log.Fatalf("读取用户数据失败: %v", err)
			return
		}
		fmt.Printf("ID: %d, 用户名: %s, 邮箱: %s\n", id, username, email)
		fmt.Printf("密码哈希: %s\n", pwdHash)
		
		// 验证密码
		err = bcrypt.CompareHashAndPassword([]byte(pwdHash), []byte(password))
		if err == nil {
			fmt.Printf("密码验证: 成功! '%s' 是有效密码\n", password)
		} else {
			fmt.Printf("密码验证: 失败! '%s' 不是有效密码: %v\n", password, err)
		}
		fmt.Println("-----------------------------------")
	}

	if err := rows.Err(); err != nil {
		log.Fatalf("遍历用户行时出错: %v", err)
		return
	}

	fmt.Println("\n修复完成! 请使用以下凭据尝试登录:")
	fmt.Println("用户名: admin, 密码: admin123")
	fmt.Println("用户名: user, 密码: admin123")
}
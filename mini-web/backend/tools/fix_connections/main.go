package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func main() {
	// 确保data目录存在
	dataDir := "./data"
	dbPath := filepath.Join(dataDir, "mini-web.db")
	log.Printf("尝试修复数据库连接表: %s", dbPath)

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

	// 修改表结构，确保NULL值默认为空字符串
	_, err = db.Exec(`
		-- 创建临时表
		CREATE TABLE connections_temp (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			protocol TEXT NOT NULL,
			host TEXT NOT NULL,
			port INTEGER NOT NULL,
			username TEXT DEFAULT '',
			password TEXT DEFAULT '',
			private_key TEXT DEFAULT '',
			group_name TEXT DEFAULT '',
			description TEXT DEFAULT '',
			last_used TIMESTAMP,
			created_by INTEGER NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (created_by) REFERENCES users(id)
		);
		
		-- 复制数据到临时表
		INSERT INTO connections_temp (
			id, name, protocol, host, port, 
			username, password, private_key, 
			group_name, description, last_used, 
			created_by, created_at, updated_at
		)
		SELECT 
			id, name, protocol, host, port, 
			COALESCE(username, '') as username, 
			COALESCE(password, '') as password, 
			COALESCE(private_key, '') as private_key,
			COALESCE(group_name, '') as group_name, 
			COALESCE(description, '') as description, 
			last_used, created_by, created_at, updated_at
		FROM connections;
		
		-- 删除原表
		DROP TABLE connections;
		
		-- 重命名临时表为原表名
		ALTER TABLE connections_temp RENAME TO connections;
	`)

	if err != nil {
		log.Fatalf("修复数据库表失败: %v", err)
		return
	}

	fmt.Println("数据库连接表已成功修复，所有NULL值已转换为空字符串。")
}
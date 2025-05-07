package sqlite

import (
	"database/sql"
	"errors"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"golang.org/x/crypto/bcrypt"
)

// UserRepository 用户数据仓库
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository 创建用户仓库实例
func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// GetByUsername 根据用户名获取用户
func (r *UserRepository) GetByUsername(username string) (*model.User, error) {
	var user model.User
	var createdAt, updatedAt string

	query := `
	SELECT id, username, email, password, nickname, avatar, role, status, created_at, updated_at
	FROM users
	WHERE username = ?
	LIMIT 1
	`

	err := r.db.QueryRow(query, username).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Password,
		&user.Nickname,
		&user.Avatar,
		&user.Role,
		&user.Status,
		&createdAt,
		&updatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // 用户不存在
		}
		return nil, err
	}

	// 解析时间
	user.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	user.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)

	return &user, nil
}

// GetByEmail 根据邮箱获取用户
func (r *UserRepository) GetByEmail(email string) (*model.User, error) {
	var user model.User
	var createdAt, updatedAt string

	query := `
	SELECT id, username, email, password, nickname, avatar, role, status, created_at, updated_at
	FROM users
	WHERE email = ?
	LIMIT 1
	`

	err := r.db.QueryRow(query, email).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Password,
		&user.Nickname,
		&user.Avatar,
		&user.Role,
		&user.Status,
		&createdAt,
		&updatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // 用户不存在
		}
		return nil, err
	}

	// 解析时间
	user.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	user.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)

	return &user, nil
}

// GetByID 根据ID获取用户
func (r *UserRepository) GetByID(id uint) (*model.User, error) {
	var user model.User
	var createdAt, updatedAt string

	query := `
	SELECT id, username, email, password, nickname, avatar, role, status, created_at, updated_at
	FROM users
	WHERE id = ?
	LIMIT 1
	`

	err := r.db.QueryRow(query, id).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Password,
		&user.Nickname,
		&user.Avatar,
		&user.Role,
		&user.Status,
		&createdAt,
		&updatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // 用户不存在
		}
		return nil, err
	}

	// 解析时间
	user.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	user.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)

	return &user, nil
}

// Create 创建新用户
func (r *UserRepository) Create(user *model.User) error {
	query := `
	INSERT INTO users (username, email, password, nickname, avatar, role, status)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	// 对密码进行哈希处理
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	result, err := r.db.Exec(
		query,
		user.Username,
		user.Email,
		string(hashedPassword),
		user.Nickname,
		user.Avatar,
		user.Role,
		user.Status,
	)
	if err != nil {
		return err
	}

	// 获取自增ID
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	user.ID = uint(id)
	return nil
}

// Update 更新用户信息
func (r *UserRepository) Update(user *model.User) error {
	query := `
	UPDATE users
	SET nickname = ?, avatar = ?, role = ?, status = ?, updated_at = CURRENT_TIMESTAMP
	WHERE id = ?
	`

	_, err := r.db.Exec(
		query,
		user.Nickname,
		user.Avatar,
		user.Role,
		user.Status,
		user.ID,
	)
	return err
}

// UpdatePassword 更新用户密码
func (r *UserRepository) UpdatePassword(userID uint, newPassword string) error {
	query := `
	UPDATE users
	SET password = ?, updated_at = CURRENT_TIMESTAMP
	WHERE id = ?
	`

	// 对密码进行哈希处理
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = r.db.Exec(query, string(hashedPassword), userID)
	return err
}

// VerifyPassword 验证用户密码
func (r *UserRepository) VerifyPassword(username, password string) (bool, *model.User, error) {
	user, err := r.GetByUsername(username)
	if err != nil {
		return false, nil, err
	}
	if user == nil {
		return false, nil, nil // 用户不存在
	}

	// 验证密码
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password))
	if err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return false, user, nil // 密码错误
		}
		return false, nil, err // 其他错误
	}

	return true, user, nil // 密码验证成功
}

// GetAll 获取所有用户
func (r *UserRepository) GetAll() ([]*model.User, error) {
	query := `
	SELECT id, username, email, password, nickname, avatar, role, status, created_at, updated_at
	FROM users
	ORDER BY id
	`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*model.User
	for rows.Next() {
		var user model.User
		var createdAt, updatedAt string

		err := rows.Scan(
			&user.ID,
			&user.Username,
			&user.Email,
			&user.Password,
			&user.Nickname,
			&user.Avatar,
			&user.Role,
			&user.Status,
			&createdAt,
			&updatedAt,
		)
		if err != nil {
			return nil, err
		}

		// 解析时间
		user.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		user.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)

		users = append(users, &user)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return users, nil
}
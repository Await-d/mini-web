package sqlite

import (
	"database/sql"
	"errors"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

// ConnectionRepository 连接数据仓库
type ConnectionRepository struct {
	db *sql.DB
}

// NewConnectionRepository 创建连接仓库实例
func NewConnectionRepository(db *sql.DB) *ConnectionRepository {
	return &ConnectionRepository{db: db}
}

// 确保连接表存在
func (r *ConnectionRepository) ensureTable() error {
	// 连接表
	_, err := r.db.Exec(`
	CREATE TABLE IF NOT EXISTS connections (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		protocol TEXT NOT NULL,
		host TEXT NOT NULL,
		port INTEGER NOT NULL,
		username TEXT,
		password TEXT,
		private_key TEXT,
		group_name TEXT,
		description TEXT,
		last_used TIMESTAMP,
		created_by INTEGER NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`)
	if err != nil {
		return err
	}

	// 会话表
	_, err = r.db.Exec(`
	CREATE TABLE IF NOT EXISTS sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		connection_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		end_time TIMESTAMP,
		duration INTEGER DEFAULT 0,
		status TEXT NOT NULL,
		client_ip TEXT,
		server_ip TEXT,
		log_path TEXT,
		FOREIGN KEY (connection_id) REFERENCES connections(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	)`)
	return err
}

// Create 创建新连接
func (r *ConnectionRepository) Create(conn *model.Connection) error {
	// 确保表存在
	if err := r.ensureTable(); err != nil {
		return err
	}

	query := `
	INSERT INTO connections (
		name, protocol, host, port, username, password, private_key, 
		group_name, description, created_by
	)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := r.db.Exec(
		query,
		conn.Name,
		conn.Protocol,
		conn.Host,
		conn.Port,
		conn.Username,
		conn.Password,
		conn.PrivateKey,
		conn.Group,
		conn.Description,
		conn.CreatedBy,
	)
	if err != nil {
		return err
	}

	// 获取自增ID
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	conn.ID = uint(id)
	
	// 设置创建和更新时间
	conn.CreatedAt = time.Now()
	conn.UpdatedAt = time.Now()
	
	return nil
}

// Update 更新连接信息
func (r *ConnectionRepository) Update(conn *model.Connection) error {
	query := `
	UPDATE connections
	SET name = ?, protocol = ?, host = ?, port = ?, username = ?, 
		password = CASE WHEN ? != '' THEN ? ELSE password END,
		private_key = CASE WHEN ? != '' THEN ? ELSE private_key END,
		group_name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
	WHERE id = ?
	`

	_, err := r.db.Exec(
		query,
		conn.Name,
		conn.Protocol,
		conn.Host,
		conn.Port,
		conn.Username,
		conn.Password, conn.Password,
		conn.PrivateKey, conn.PrivateKey,
		conn.Group,
		conn.Description,
		conn.ID,
	)
	
	return err
}

// Delete 删除连接
func (r *ConnectionRepository) Delete(id uint) error {
	// 先删除关联的会话记录
	_, err := r.db.Exec("DELETE FROM sessions WHERE connection_id = ?", id)
	if err != nil {
		return err
	}

	// 再删除连接记录
	_, err = r.db.Exec("DELETE FROM connections WHERE id = ?", id)
	return err
}

// GetByID 根据ID获取连接
func (r *ConnectionRepository) GetByID(id uint) (*model.Connection, error) {
	var conn model.Connection
	var createdAt, updatedAt, lastUsed sql.NullString

	query := `
	SELECT id, name, protocol, host, port, username, password, private_key,
		   group_name, description, last_used, created_by, created_at, updated_at
	FROM connections
	WHERE id = ?
	LIMIT 1
	`

	err := r.db.QueryRow(query, id).Scan(
		&conn.ID,
		&conn.Name,
		&conn.Protocol,
		&conn.Host,
		&conn.Port,
		&conn.Username,
		&conn.Password,
		&conn.PrivateKey,
		&conn.Group,
		&conn.Description,
		&lastUsed,
		&conn.CreatedBy,
		&createdAt,
		&updatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // 连接不存在
		}
		return nil, err
	}

	// 解析时间
	if createdAt.Valid {
		conn.CreatedAt, _ = time.Parse(time.RFC3339, createdAt.String)
	}
	if updatedAt.Valid {
		conn.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt.String)
	}
	if lastUsed.Valid {
		conn.LastUsed, _ = time.Parse(time.RFC3339, lastUsed.String)
	}

	return &conn, nil
}

// GetByUserID 获取用户的所有连接
func (r *ConnectionRepository) GetByUserID(userID uint) ([]*model.Connection, error) {
	query := `
	SELECT id, name, protocol, host, port, username, password, private_key,
		   group_name, description, last_used, created_by, created_at, updated_at
	FROM connections
	WHERE created_by = ?
	ORDER BY name
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var connections []*model.Connection
	for rows.Next() {
		var conn model.Connection
		var createdAt, updatedAt, lastUsed sql.NullString

		err := rows.Scan(
			&conn.ID,
			&conn.Name,
			&conn.Protocol,
			&conn.Host,
			&conn.Port,
			&conn.Username,
			&conn.Password,
			&conn.PrivateKey,
			&conn.Group,
			&conn.Description,
			&lastUsed,
			&conn.CreatedBy,
			&createdAt,
			&updatedAt,
		)
		if err != nil {
			return nil, err
		}

		// 解析时间
		if createdAt.Valid {
			conn.CreatedAt, _ = time.Parse(time.RFC3339, createdAt.String)
		}
		if updatedAt.Valid {
			conn.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt.String)
		}
		if lastUsed.Valid {
			conn.LastUsed, _ = time.Parse(time.RFC3339, lastUsed.String)
		}

		connections = append(connections, &conn)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return connections, nil
}

// GetAll 获取所有连接
func (r *ConnectionRepository) GetAll() ([]*model.Connection, error) {
	query := `
	SELECT id, name, protocol, host, port, username, password, private_key,
		   group_name, description, last_used, created_by, created_at, updated_at
	FROM connections
	ORDER BY name
	`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var connections []*model.Connection
	for rows.Next() {
		var conn model.Connection
		var createdAt, updatedAt, lastUsed sql.NullString

		err := rows.Scan(
			&conn.ID,
			&conn.Name,
			&conn.Protocol,
			&conn.Host,
			&conn.Port,
			&conn.Username,
			&conn.Password,
			&conn.PrivateKey,
			&conn.Group,
			&conn.Description,
			&lastUsed,
			&conn.CreatedBy,
			&createdAt,
			&updatedAt,
		)
		if err != nil {
			return nil, err
		}

		// 解析时间
		if createdAt.Valid {
			conn.CreatedAt, _ = time.Parse(time.RFC3339, createdAt.String)
		}
		if updatedAt.Valid {
			conn.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt.String)
		}
		if lastUsed.Valid {
			conn.LastUsed, _ = time.Parse(time.RFC3339, lastUsed.String)
		}

		connections = append(connections, &conn)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return connections, nil
}

// UpdateLastUsed 更新连接最后使用时间
func (r *ConnectionRepository) UpdateLastUsed(id uint) error {
	query := `
	UPDATE connections
	SET last_used = CURRENT_TIMESTAMP
	WHERE id = ?
	`

	_, err := r.db.Exec(query, id)
	return err
}

// SessionRepository 会话数据仓库
type SessionRepository struct {
	db *sql.DB
}

// NewSessionRepository 创建会话仓库实例
func NewSessionRepository(db *sql.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

// Create 创建新会话
func (r *SessionRepository) Create(session *model.Session) error {
	query := `
	INSERT INTO sessions (
		connection_id, user_id, status, client_ip, server_ip, log_path
	)
	VALUES (?, ?, ?, ?, ?, ?)
	`

	result, err := r.db.Exec(
		query,
		session.ConnectionID,
		session.UserID,
		session.Status,
		session.ClientIP,
		session.ServerIP,
		session.LogPath,
	)
	if err != nil {
		return err
	}

	// 获取自增ID
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	session.ID = uint(id)
	
	// 设置开始时间
	session.StartTime = time.Now()
	
	return nil
}

// Update 更新会话信息
func (r *SessionRepository) Update(session *model.Session) error {
	query := `
	UPDATE sessions
	SET status = ?, end_time = ?, duration = ?
	WHERE id = ?
	`

	_, err := r.db.Exec(
		query,
		session.Status,
		session.EndTime,
		session.Duration,
		session.ID,
	)
	return err
}

// GetByID 根据ID获取会话
func (r *SessionRepository) GetByID(id uint) (*model.Session, error) {
	var session model.Session
	var startTime, endTime sql.NullString

	query := `
	SELECT id, connection_id, user_id, start_time, end_time, duration, status, 
		   client_ip, server_ip, log_path
	FROM sessions
	WHERE id = ?
	LIMIT 1
	`

	err := r.db.QueryRow(query, id).Scan(
		&session.ID,
		&session.ConnectionID,
		&session.UserID,
		&startTime,
		&endTime,
		&session.Duration,
		&session.Status,
		&session.ClientIP,
		&session.ServerIP,
		&session.LogPath,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // 会话不存在
		}
		return nil, err
	}

	// 解析时间
	if startTime.Valid {
		session.StartTime, _ = time.Parse(time.RFC3339, startTime.String)
	}
	if endTime.Valid {
		session.EndTime, _ = time.Parse(time.RFC3339, endTime.String)
	}

	return &session, nil
}

// GetByUserID 获取用户的所有会话
func (r *SessionRepository) GetByUserID(userID uint) ([]*model.Session, error) {
	query := `
	SELECT id, connection_id, user_id, start_time, end_time, duration, status, 
		   client_ip, server_ip, log_path
	FROM sessions
	WHERE user_id = ?
	ORDER BY start_time DESC
	`

	return r.querySessions(query, userID)
}

// GetActiveByUserID 获取用户的活动会话
func (r *SessionRepository) GetActiveByUserID(userID uint) ([]*model.Session, error) {
	query := `
	SELECT id, connection_id, user_id, start_time, end_time, duration, status, 
		   client_ip, server_ip, log_path
	FROM sessions
	WHERE user_id = ? AND status = 'active'
	ORDER BY start_time DESC
	`

	return r.querySessions(query, userID)
}

// GetByConnectionID 获取连接的所有会话
func (r *SessionRepository) GetByConnectionID(connectionID uint) ([]*model.Session, error) {
	query := `
	SELECT id, connection_id, user_id, start_time, end_time, duration, status, 
		   client_ip, server_ip, log_path
	FROM sessions
	WHERE connection_id = ?
	ORDER BY start_time DESC
	`

	return r.querySessions(query, connectionID)
}

// CloseSession 关闭会话
func (r *SessionRepository) CloseSession(id uint) error {
	// 获取会话开始时间
	var startTimeStr string
	err := r.db.QueryRow("SELECT start_time FROM sessions WHERE id = ?", id).Scan(&startTimeStr)
	if err != nil {
		return err
	}
	
	// 计算会话持续时间
	startTime, err := time.Parse(time.RFC3339, startTimeStr)
	if err != nil {
		return err
	}
	
	endTime := time.Now()
	duration := int(endTime.Sub(startTime).Seconds())
	
	// 更新会话
	query := `
	UPDATE sessions
	SET status = 'closed', end_time = CURRENT_TIMESTAMP, duration = ?
	WHERE id = ?
	`
	
	_, err = r.db.Exec(query, duration, id)
	return err
}

// querySessions 查询会话辅助函数
func (r *SessionRepository) querySessions(query string, args ...interface{}) ([]*model.Session, error) {
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*model.Session
	for rows.Next() {
		var session model.Session
		var startTime, endTime sql.NullString

		err := rows.Scan(
			&session.ID,
			&session.ConnectionID,
			&session.UserID,
			&startTime,
			&endTime,
			&session.Duration,
			&session.Status,
			&session.ClientIP,
			&session.ServerIP,
			&session.LogPath,
		)
		if err != nil {
			return nil, err
		}

		// 解析时间
		if startTime.Valid {
			session.StartTime, _ = time.Parse(time.RFC3339, startTime.String)
		}
		if endTime.Valid {
			session.EndTime, _ = time.Parse(time.RFC3339, endTime.String)
		}

		sessions = append(sessions, &session)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return sessions, nil
}
package sqlite

import (
	"database/sql"
	"errors"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

// GetByUserIDFixed 获取用户的所有连接 - 修复了对NULL值的处理
func (r *ConnectionRepository) GetByUserIDFixed(userID uint) ([]*model.Connection, error) {
	query := `
	SELECT id, name, protocol, host, port, username, 
		   COALESCE(password, '') as password, 
		   COALESCE(private_key, '') as private_key,
		   COALESCE(group_name, '') as group_name, 
		   COALESCE(description, '') as description, 
		   last_used, created_by, created_at, updated_at
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

// GetAllFixed 获取所有连接 - 修复了对NULL值的处理
func (r *ConnectionRepository) GetAllFixed() ([]*model.Connection, error) {
	query := `
	SELECT id, name, protocol, host, port, username, 
		   COALESCE(password, '') as password, 
		   COALESCE(private_key, '') as private_key,
		   COALESCE(group_name, '') as group_name, 
		   COALESCE(description, '') as description, 
		   last_used, created_by, created_at, updated_at
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

// GetByIDFixed 根据ID获取连接 - 修复了对NULL值的处理
func (r *ConnectionRepository) GetByIDFixed(id uint) (*model.Connection, error) {
	var conn model.Connection
	var createdAt, updatedAt, lastUsed sql.NullString

	query := `
	SELECT id, name, protocol, host, port, username, 
		   COALESCE(password, '') as password, 
		   COALESCE(private_key, '') as private_key,
		   COALESCE(group_name, '') as group_name, 
		   COALESCE(description, '') as description, 
		   last_used, created_by, created_at, updated_at
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
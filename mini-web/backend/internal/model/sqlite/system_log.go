package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

// SystemLogRepository SQLite系统日志仓库实现
type SystemLogRepository struct {
	db *sql.DB
}

// NewSystemLogRepository 创建系统日志仓库实例
func NewSystemLogRepository(db *sql.DB) model.SystemLogRepository {
	return &SystemLogRepository{db: db}
}

// Create 创建系统日志
func (r *SystemLogRepository) Create(log *model.SystemLog) error {
	query := `
		INSERT INTO system_logs (level, module, message, details, user_id, ip_address, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	
	log.CreatedAt = time.Now()

	result, err := r.db.Exec(query,
		log.Level,
		log.Module,
		log.Message,
		log.Details,
		log.UserID,
		log.IPAddress,
		log.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("创建系统日志失败: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("获取插入ID失败: %w", err)
	}

	log.ID = uint(id)
	return nil
}

// GetAll 获取所有系统日志
func (r *SystemLogRepository) GetAll(limit, offset int) ([]*model.SystemLog, error) {
	query := `
		SELECT id, level, module, message, details, user_id, ip_address, created_at
		FROM system_logs
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`
	
	rows, err := r.db.Query(query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("查询系统日志失败: %w", err)
	}
	defer rows.Close()

	var logs []*model.SystemLog
	for rows.Next() {
		log := &model.SystemLog{}
		var userID sql.NullInt64
		var details sql.NullString
		var ipAddress sql.NullString

		err := rows.Scan(
			&log.ID,
			&log.Level,
			&log.Module,
			&log.Message,
			&details,
			&userID,
			&ipAddress,
			&log.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描系统日志失败: %w", err)
		}

		if details.Valid {
			log.Details = details.String
		}
		if userID.Valid {
			uid := uint(userID.Int64)
			log.UserID = &uid
		}
		if ipAddress.Valid {
			log.IPAddress = ipAddress.String
		}

		logs = append(logs, log)
	}

	return logs, nil
}

// GetByLevel 根据级别获取系统日志
func (r *SystemLogRepository) GetByLevel(level string, limit, offset int) ([]*model.SystemLog, error) {
	query := `
		SELECT id, level, module, message, details, user_id, ip_address, created_at
		FROM system_logs
		WHERE level = ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`
	
	rows, err := r.db.Query(query, level, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("查询系统日志失败: %w", err)
	}
	defer rows.Close()

	var logs []*model.SystemLog
	for rows.Next() {
		log := &model.SystemLog{}
		var userID sql.NullInt64
		var details sql.NullString
		var ipAddress sql.NullString

		err := rows.Scan(
			&log.ID,
			&log.Level,
			&log.Module,
			&log.Message,
			&details,
			&userID,
			&ipAddress,
			&log.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描系统日志失败: %w", err)
		}

		if details.Valid {
			log.Details = details.String
		}
		if userID.Valid {
			uid := uint(userID.Int64)
			log.UserID = &uid
		}
		if ipAddress.Valid {
			log.IPAddress = ipAddress.String
		}

		logs = append(logs, log)
	}

	return logs, nil
}

// GetByModule 根据模块获取系统日志
func (r *SystemLogRepository) GetByModule(module string, limit, offset int) ([]*model.SystemLog, error) {
	query := `
		SELECT id, level, module, message, details, user_id, ip_address, created_at
		FROM system_logs
		WHERE module = ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`
	
	rows, err := r.db.Query(query, module, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("查询系统日志失败: %w", err)
	}
	defer rows.Close()

	var logs []*model.SystemLog
	for rows.Next() {
		log := &model.SystemLog{}
		var userID sql.NullInt64
		var details sql.NullString
		var ipAddress sql.NullString

		err := rows.Scan(
			&log.ID,
			&log.Level,
			&log.Module,
			&log.Message,
			&details,
			&userID,
			&ipAddress,
			&log.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描系统日志失败: %w", err)
		}

		if details.Valid {
			log.Details = details.String
		}
		if userID.Valid {
			uid := uint(userID.Int64)
			log.UserID = &uid
		}
		if ipAddress.Valid {
			log.IPAddress = ipAddress.String
		}

		logs = append(logs, log)
	}

	return logs, nil
}

// GetByDateRange 根据时间范围获取系统日志
func (r *SystemLogRepository) GetByDateRange(startTime, endTime time.Time, limit, offset int) ([]*model.SystemLog, error) {
	query := `
		SELECT id, level, module, message, details, user_id, ip_address, created_at
		FROM system_logs
		WHERE created_at BETWEEN ? AND ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`
	
	rows, err := r.db.Query(query, startTime, endTime, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("查询系统日志失败: %w", err)
	}
	defer rows.Close()

	var logs []*model.SystemLog
	for rows.Next() {
		log := &model.SystemLog{}
		var userID sql.NullInt64
		var details sql.NullString
		var ipAddress sql.NullString

		err := rows.Scan(
			&log.ID,
			&log.Level,
			&log.Module,
			&log.Message,
			&details,
			&userID,
			&ipAddress,
			&log.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描系统日志失败: %w", err)
		}

		if details.Valid {
			log.Details = details.String
		}
		if userID.Valid {
			uid := uint(userID.Int64)
			log.UserID = &uid
		}
		if ipAddress.Valid {
			log.IPAddress = ipAddress.String
		}

		logs = append(logs, log)
	}

	return logs, nil
}

// Delete 删除系统日志
func (r *SystemLogRepository) Delete(id uint) error {
	query := `DELETE FROM system_logs WHERE id = ?`
	
	_, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("删除系统日志失败: %w", err)
	}

	return nil
}

// DeleteByDateRange 根据时间范围删除系统日志
func (r *SystemLogRepository) DeleteByDateRange(startTime, endTime time.Time) error {
	query := `DELETE FROM system_logs WHERE created_at BETWEEN ? AND ?`
	
	_, err := r.db.Exec(query, startTime, endTime)
	if err != nil {
		return fmt.Errorf("删除系统日志失败: %w", err)
	}

	return nil
}

// GetStats 获取日志统计信息
func (r *SystemLogRepository) GetStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// 总数统计
	var total int
	err := r.db.QueryRow("SELECT COUNT(*) FROM system_logs").Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("获取日志总数失败: %w", err)
	}
	stats["total"] = total

	// 按级别统计
	levelStats := make(map[string]int)
	rows, err := r.db.Query(`
		SELECT level, COUNT(*) as count
		FROM system_logs
		GROUP BY level
	`)
	if err != nil {
		return nil, fmt.Errorf("按级别统计失败: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var level string
		var count int
		if err := rows.Scan(&level, &count); err != nil {
			return nil, fmt.Errorf("扫描级别统计失败: %w", err)
		}
		levelStats[level] = count
	}
	stats["by_level"] = levelStats

	// 按模块统计
	moduleStats := make(map[string]int)
	rows, err = r.db.Query(`
		SELECT module, COUNT(*) as count
		FROM system_logs
		GROUP BY module
		ORDER BY count DESC
		LIMIT 10
	`)
	if err != nil {
		return nil, fmt.Errorf("按模块统计失败: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var module string
		var count int
		if err := rows.Scan(&module, &count); err != nil {
			return nil, fmt.Errorf("扫描模块统计失败: %w", err)
		}
		moduleStats[module] = count
	}
	stats["by_module"] = moduleStats

	// 今日日志数量
	var todayCount int
	err = r.db.QueryRow(`
		SELECT COUNT(*) 
		FROM system_logs 
		WHERE DATE(created_at) = DATE('now')
	`).Scan(&todayCount)
	if err != nil {
		return nil, fmt.Errorf("获取今日日志数量失败: %w", err)
	}
	stats["today_count"] = todayCount

	return stats, nil
}
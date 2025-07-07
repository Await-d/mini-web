package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

// SystemConfigRepository SQLite系统配置仓库实现
type SystemConfigRepository struct {
	db *sql.DB
}

// NewSystemConfigRepository 创建系统配置仓库实例
func NewSystemConfigRepository(db *sql.DB) model.SystemConfigRepository {
	return &SystemConfigRepository{db: db}
}

// GetAll 获取所有系统配置
func (r *SystemConfigRepository) GetAll() ([]*model.SystemConfig, error) {
	query := `
		SELECT id, key, value, description, category, type, created_at, updated_at
		FROM system_configs
		ORDER BY category, key
	`
	
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询系统配置失败: %w", err)
	}
	defer rows.Close()

	var configs []*model.SystemConfig
	for rows.Next() {
		config := &model.SystemConfig{}
		err := rows.Scan(
			&config.ID,
			&config.Key,
			&config.Value,
			&config.Description,
			&config.Category,
			&config.Type,
			&config.CreatedAt,
			&config.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描系统配置失败: %w", err)
		}
		configs = append(configs, config)
	}

	return configs, nil
}

// GetByKey 根据键获取系统配置
func (r *SystemConfigRepository) GetByKey(key string) (*model.SystemConfig, error) {
	query := `
		SELECT id, key, value, description, category, type, created_at, updated_at
		FROM system_configs
		WHERE key = ?
	`
	
	config := &model.SystemConfig{}
	err := r.db.QueryRow(query, key).Scan(
		&config.ID,
		&config.Key,
		&config.Value,
		&config.Description,
		&config.Category,
		&config.Type,
		&config.CreatedAt,
		&config.UpdatedAt,
	)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("查询系统配置失败: %w", err)
	}

	return config, nil
}

// GetByCategory 根据分类获取系统配置
func (r *SystemConfigRepository) GetByCategory(category string) ([]*model.SystemConfig, error) {
	query := `
		SELECT id, key, value, description, category, type, created_at, updated_at
		FROM system_configs
		WHERE category = ?
		ORDER BY key
	`
	
	rows, err := r.db.Query(query, category)
	if err != nil {
		return nil, fmt.Errorf("查询系统配置失败: %w", err)
	}
	defer rows.Close()

	var configs []*model.SystemConfig
	for rows.Next() {
		config := &model.SystemConfig{}
		err := rows.Scan(
			&config.ID,
			&config.Key,
			&config.Value,
			&config.Description,
			&config.Category,
			&config.Type,
			&config.CreatedAt,
			&config.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描系统配置失败: %w", err)
		}
		configs = append(configs, config)
	}

	return configs, nil
}

// Create 创建系统配置
func (r *SystemConfigRepository) Create(config *model.SystemConfig) error {
	query := `
		INSERT INTO system_configs (key, value, description, category, type, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	
	now := time.Now()
	config.CreatedAt = now
	config.UpdatedAt = now

	result, err := r.db.Exec(query,
		config.Key,
		config.Value,
		config.Description,
		config.Category,
		config.Type,
		config.CreatedAt,
		config.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("创建系统配置失败: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("获取插入ID失败: %w", err)
	}

	config.ID = uint(id)
	return nil
}

// Update 更新系统配置
func (r *SystemConfigRepository) Update(config *model.SystemConfig) error {
	query := `
		UPDATE system_configs
		SET value = ?, description = ?, updated_at = ?
		WHERE key = ?
	`
	
	config.UpdatedAt = time.Now()

	_, err := r.db.Exec(query,
		config.Value,
		config.Description,
		config.UpdatedAt,
		config.Key,
	)
	if err != nil {
		return fmt.Errorf("更新系统配置失败: %w", err)
	}

	return nil
}

// Delete 删除系统配置
func (r *SystemConfigRepository) Delete(key string) error {
	query := `DELETE FROM system_configs WHERE key = ?`
	
	_, err := r.db.Exec(query, key)
	if err != nil {
		return fmt.Errorf("删除系统配置失败: %w", err)
	}

	return nil
}

// BatchUpdate 批量更新系统配置
func (r *SystemConfigRepository) BatchUpdate(configs []*model.SystemConfig) error {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("开始事务失败: %w", err)
	}
	defer tx.Rollback()

	query := `
		UPDATE system_configs
		SET value = ?, description = ?, updated_at = ?
		WHERE key = ?
	`
	
	stmt, err := tx.Prepare(query)
	if err != nil {
		return fmt.Errorf("预处理SQL失败: %w", err)
	}
	defer stmt.Close()

	now := time.Now()
	for _, config := range configs {
		config.UpdatedAt = now
		_, err := stmt.Exec(
			config.Value,
			config.Description,
			config.UpdatedAt,
			config.Key,
		)
		if err != nil {
			return fmt.Errorf("批量更新系统配置失败: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}

	return nil
}
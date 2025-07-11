package sqlite

import (
	"database/sql"
	"fmt"
	"log"
)

// PerformanceMetric 性能指标结构
type PerformanceMetric struct {
	ID          int     `json:"id" db:"id"`
	MetricName  string  `json:"metric_name" db:"metric_name"`
	MetricValue float64 `json:"metric_value" db:"metric_value"`
	Unit        string  `json:"unit" db:"unit"`
	Category    string  `json:"category" db:"category"`
	Description string  `json:"description" db:"description"`
	CollectedAt string  `json:"collected_at" db:"collected_at"`
	CreatedAt   string  `json:"created_at" db:"created_at"`
}

// SystemStatus 系统状态结构
type SystemStatus struct {
	ID             int     `json:"id" db:"id"`
	CPUUsage       float64 `json:"cpu_usage" db:"cpu_usage"`
	MemoryUsage    float64 `json:"memory_usage" db:"memory_usage"`
	MemoryTotal    int64   `json:"memory_total" db:"memory_total"`
	MemoryUsed     int64   `json:"memory_used" db:"memory_used"`
	DiskUsage      float64 `json:"disk_usage" db:"disk_usage"`
	DiskTotal      int64   `json:"disk_total" db:"disk_total"`
	DiskUsed       int64   `json:"disk_used" db:"disk_used"`
	NetworkInBytes int64   `json:"network_in_bytes" db:"network_in_bytes"`
	NetworkOutBytes int64  `json:"network_out_bytes" db:"network_out_bytes"`
	LoadAverage1   float64 `json:"load_average_1" db:"load_average_1"`
	LoadAverage5   float64 `json:"load_average_5" db:"load_average_5"`
	LoadAverage15  float64 `json:"load_average_15" db:"load_average_15"`
	ActiveSessions int     `json:"active_sessions" db:"active_sessions"`
	ConnectedUsers int     `json:"connected_users" db:"connected_users"`
	Uptime         int64   `json:"uptime" db:"uptime"`
	CollectedAt    string  `json:"collected_at" db:"collected_at"`
	CreatedAt      string  `json:"created_at" db:"created_at"`
}

// APIPerformance API性能指标结构
type APIPerformance struct {
	ID               int     `json:"id" db:"id"`
	Endpoint         string  `json:"endpoint" db:"endpoint"`
	Method           string  `json:"method" db:"method"`
	AvgResponseTime  float64 `json:"avg_response_time" db:"avg_response_time"`
	MinResponseTime  float64 `json:"min_response_time" db:"min_response_time"`
	MaxResponseTime  float64 `json:"max_response_time" db:"max_response_time"`
	RequestCount     int     `json:"request_count" db:"request_count"`
	ErrorCount       int     `json:"error_count" db:"error_count"`
	SuccessRate      float64 `json:"success_rate" db:"success_rate"`
	ThroughputPerSec float64 `json:"throughput_per_sec" db:"throughput_per_sec"`
	Period           string  `json:"period" db:"period"` // hourly, daily, weekly
	PeriodStart      string  `json:"period_start" db:"period_start"`
	PeriodEnd        string  `json:"period_end" db:"period_end"`
	CreatedAt        string  `json:"created_at" db:"created_at"`
}

// DatabasePerformance 数据库性能指标结构
type DatabasePerformance struct {
	ID                 int     `json:"id" db:"id"`
	ConnectionCount    int     `json:"connection_count" db:"connection_count"`
	ActiveQueries      int     `json:"active_queries" db:"active_queries"`
	AvgQueryTime       float64 `json:"avg_query_time" db:"avg_query_time"`
	SlowQueryCount     int     `json:"slow_query_count" db:"slow_query_count"`
	DatabaseSize       int64   `json:"database_size" db:"database_size"`
	TableCount         int     `json:"table_count" db:"table_count"`
	IndexUsage         float64 `json:"index_usage" db:"index_usage"`
	CacheHitRatio      float64 `json:"cache_hit_ratio" db:"cache_hit_ratio"`
	TransactionCount   int     `json:"transaction_count" db:"transaction_count"`
	LocksCount         int     `json:"locks_count" db:"locks_count"`
	DeadlockCount      int     `json:"deadlock_count" db:"deadlock_count"`
	CollectedAt        string  `json:"collected_at" db:"collected_at"`
	CreatedAt          string  `json:"created_at" db:"created_at"`
}

// PerformanceAlert 性能告警结构
type PerformanceAlert struct {
	ID          int    `json:"id" db:"id"`
	AlertType   string `json:"alert_type" db:"alert_type"`
	Severity    string `json:"severity" db:"severity"` // low, medium, high, critical
	Title       string `json:"title" db:"title"`
	Message     string `json:"message" db:"message"`
	MetricName  string `json:"metric_name" db:"metric_name"`
	MetricValue float64 `json:"metric_value" db:"metric_value"`
	Threshold   float64 `json:"threshold" db:"threshold"`
	IsResolved  bool   `json:"is_resolved" db:"is_resolved"`
	ResolvedAt  string `json:"resolved_at" db:"resolved_at"`
	CreatedAt   string `json:"created_at" db:"created_at"`
	UpdatedAt   string `json:"updated_at" db:"updated_at"`
}

// RecordPerformanceMetric 记录性能指标
func RecordPerformanceMetric(metric *PerformanceMetric) error {
	query := `
		INSERT INTO performance_metrics (metric_name, metric_value, unit, category, 
		                               description, collected_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query, metric.MetricName, metric.MetricValue, metric.Unit,
		metric.Category, metric.Description, metric.CollectedAt)
	if err != nil {
		return fmt.Errorf("记录性能指标失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	metric.ID = int(id)
	
	return nil
}

// GetPerformanceMetrics 获取性能指标
func GetPerformanceMetrics(category string, limit int, hoursBack int) ([]PerformanceMetric, error) {
	query := `
		SELECT id, metric_name, metric_value, unit, category, description,
		       collected_at, created_at
		FROM performance_metrics
		WHERE 1=1
	`
	args := []interface{}{}
	
	if category != "" {
		query += " AND category = ?"
		args = append(args, category)
	}
	
	if hoursBack > 0 {
		query += " AND datetime(collected_at) >= datetime('now', '-' || ? || ' hours')"
		args = append(args, hoursBack)
	}
	
	query += " ORDER BY collected_at DESC"
	
	if limit > 0 {
		query += " LIMIT ?"
		args = append(args, limit)
	}
	
	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询性能指标失败: %w", err)
	}
	defer rows.Close()
	
	var metrics []PerformanceMetric
	for rows.Next() {
		var metric PerformanceMetric
		err := rows.Scan(&metric.ID, &metric.MetricName, &metric.MetricValue,
			&metric.Unit, &metric.Category, &metric.Description,
			&metric.CollectedAt, &metric.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("扫描性能指标失败: %w", err)
		}
		metrics = append(metrics, metric)
	}
	
	return metrics, nil
}

// RecordSystemStatus 记录系统状态
func RecordSystemStatus(status *SystemStatus) error {
	query := `
		INSERT INTO system_status (cpu_usage, memory_usage, memory_total, memory_used,
		                         disk_usage, disk_total, disk_used, network_in_bytes,
		                         network_out_bytes, load_average_1, load_average_5,
		                         load_average_15, active_sessions, connected_users,
		                         uptime, collected_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query,
		status.CPUUsage, status.MemoryUsage, status.MemoryTotal, status.MemoryUsed,
		status.DiskUsage, status.DiskTotal, status.DiskUsed, status.NetworkInBytes,
		status.NetworkOutBytes, status.LoadAverage1, status.LoadAverage5,
		status.LoadAverage15, status.ActiveSessions, status.ConnectedUsers,
		status.Uptime, status.CollectedAt)
	
	if err != nil {
		return fmt.Errorf("记录系统状态失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	status.ID = int(id)
	
	return nil
}

// GetLatestSystemStatus 获取最新系统状态
func GetLatestSystemStatus() (*SystemStatus, error) {
	query := `
		SELECT id, cpu_usage, memory_usage, memory_total, memory_used,
		       disk_usage, disk_total, disk_used, network_in_bytes,
		       network_out_bytes, load_average_1, load_average_5,
		       load_average_15, active_sessions, connected_users,
		       uptime, collected_at, created_at
		FROM system_status
		ORDER BY collected_at DESC
		LIMIT 1
	`
	
	status := &SystemStatus{}
	err := DB.QueryRow(query).Scan(
		&status.ID, &status.CPUUsage, &status.MemoryUsage, &status.MemoryTotal,
		&status.MemoryUsed, &status.DiskUsage, &status.DiskTotal, &status.DiskUsed,
		&status.NetworkInBytes, &status.NetworkOutBytes, &status.LoadAverage1,
		&status.LoadAverage5, &status.LoadAverage15, &status.ActiveSessions,
		&status.ConnectedUsers, &status.Uptime, &status.CollectedAt, &status.CreatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("未找到系统状态记录")
		}
		return nil, fmt.Errorf("获取系统状态失败: %w", err)
	}
	
	return status, nil
}

// GetSystemStatusHistory 获取系统状态历史
func GetSystemStatusHistory(hoursBack int) ([]SystemStatus, error) {
	query := `
		SELECT id, cpu_usage, memory_usage, memory_total, memory_used,
		       disk_usage, disk_total, disk_used, network_in_bytes,
		       network_out_bytes, load_average_1, load_average_5,
		       load_average_15, active_sessions, connected_users,
		       uptime, collected_at, created_at
		FROM system_status
		WHERE datetime(collected_at) >= datetime('now', '-' || ? || ' hours')
		ORDER BY collected_at ASC
	`
	
	rows, err := DB.Query(query, hoursBack)
	if err != nil {
		return nil, fmt.Errorf("查询系统状态历史失败: %w", err)
	}
	defer rows.Close()
	
	var statuses []SystemStatus
	for rows.Next() {
		var status SystemStatus
		err := rows.Scan(
			&status.ID, &status.CPUUsage, &status.MemoryUsage, &status.MemoryTotal,
			&status.MemoryUsed, &status.DiskUsage, &status.DiskTotal, &status.DiskUsed,
			&status.NetworkInBytes, &status.NetworkOutBytes, &status.LoadAverage1,
			&status.LoadAverage5, &status.LoadAverage15, &status.ActiveSessions,
			&status.ConnectedUsers, &status.Uptime, &status.CollectedAt, &status.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描系统状态历史失败: %w", err)
		}
		statuses = append(statuses, status)
	}
	
	return statuses, nil
}

// RecordAPIPerformance 记录API性能指标
func RecordAPIPerformance(perf *APIPerformance) error {
	query := `
		INSERT INTO api_performance (endpoint, method, avg_response_time, min_response_time,
		                           max_response_time, request_count, error_count, success_rate,
		                           throughput_per_sec, period, period_start, period_end, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query,
		perf.Endpoint, perf.Method, perf.AvgResponseTime, perf.MinResponseTime,
		perf.MaxResponseTime, perf.RequestCount, perf.ErrorCount, perf.SuccessRate,
		perf.ThroughputPerSec, perf.Period, perf.PeriodStart, perf.PeriodEnd)
	
	if err != nil {
		return fmt.Errorf("记录API性能指标失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	perf.ID = int(id)
	
	return nil
}

// GetAPIPerformance 获取API性能指标
func GetAPIPerformance(endpoint string, period string, limit int) ([]APIPerformance, error) {
	query := `
		SELECT id, endpoint, method, avg_response_time, min_response_time,
		       max_response_time, request_count, error_count, success_rate,
		       throughput_per_sec, period, period_start, period_end, created_at
		FROM api_performance
		WHERE 1=1
	`
	args := []interface{}{}
	
	if endpoint != "" {
		query += " AND endpoint = ?"
		args = append(args, endpoint)
	}
	
	if period != "" {
		query += " AND period = ?"
		args = append(args, period)
	}
	
	query += " ORDER BY period_start DESC"
	
	if limit > 0 {
		query += " LIMIT ?"
		args = append(args, limit)
	}
	
	rows, err := DB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询API性能指标失败: %w", err)
	}
	defer rows.Close()
	
	var performances []APIPerformance
	for rows.Next() {
		var perf APIPerformance
		err := rows.Scan(&perf.ID, &perf.Endpoint, &perf.Method, &perf.AvgResponseTime,
			&perf.MinResponseTime, &perf.MaxResponseTime, &perf.RequestCount,
			&perf.ErrorCount, &perf.SuccessRate, &perf.ThroughputPerSec,
			&perf.Period, &perf.PeriodStart, &perf.PeriodEnd, &perf.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("扫描API性能指标失败: %w", err)
		}
		performances = append(performances, perf)
	}
	
	return performances, nil
}

// CreatePerformanceAlert 创建性能告警
func CreatePerformanceAlert(alert *PerformanceAlert) error {
	query := `
		INSERT INTO performance_alerts (alert_type, severity, title, message, metric_name,
		                              metric_value, threshold, is_resolved, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`
	
	result, err := DB.Exec(query, alert.AlertType, alert.Severity, alert.Title,
		alert.Message, alert.MetricName, alert.MetricValue, alert.Threshold)
	if err != nil {
		return fmt.Errorf("创建性能告警失败: %w", err)
	}
	
	id, _ := result.LastInsertId()
	alert.ID = int(id)
	log.Printf("性能告警已创建，ID: %d, 类型: %s", id, alert.AlertType)
	
	return nil
}

// GetActivePerformanceAlerts 获取活跃的性能告警
func GetActivePerformanceAlerts() ([]PerformanceAlert, error) {
	query := `
		SELECT id, alert_type, severity, title, message, metric_name,
		       metric_value, threshold, is_resolved, resolved_at,
		       created_at, updated_at
		FROM performance_alerts
		WHERE is_resolved = 0
		ORDER BY created_at DESC
	`
	
	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("查询活跃性能告警失败: %w", err)
	}
	defer rows.Close()
	
	var alerts []PerformanceAlert
	for rows.Next() {
		var alert PerformanceAlert
		err := rows.Scan(&alert.ID, &alert.AlertType, &alert.Severity, &alert.Title,
			&alert.Message, &alert.MetricName, &alert.MetricValue, &alert.Threshold,
			&alert.IsResolved, &alert.ResolvedAt, &alert.CreatedAt, &alert.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("扫描性能告警失败: %w", err)
		}
		alerts = append(alerts, alert)
	}
	
	return alerts, nil
}

// ResolvePerformanceAlert 解决性能告警
func ResolvePerformanceAlert(id int) error {
	query := `
		UPDATE performance_alerts 
		SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	
	_, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("解决性能告警失败: %w", err)
	}
	
	log.Printf("性能告警已解决，ID: %d", id)
	return nil
}

// CleanupOldPerformanceData 清理旧的性能数据
func CleanupOldPerformanceData(daysToKeep int) error {
	// 清理旧的性能指标
	_, err := DB.Exec(`
		DELETE FROM performance_metrics 
		WHERE datetime(created_at) <= datetime('now', '-' || ? || ' days')
	`, daysToKeep)
	if err != nil {
		return fmt.Errorf("清理旧性能指标失败: %w", err)
	}
	
	// 清理旧的系统状态
	_, err = DB.Exec(`
		DELETE FROM system_status 
		WHERE datetime(created_at) <= datetime('now', '-' || ? || ' days')
	`, daysToKeep)
	if err != nil {
		return fmt.Errorf("清理旧系统状态失败: %w", err)
	}
	
	// 清理旧的API性能数据
	_, err = DB.Exec(`
		DELETE FROM api_performance 
		WHERE datetime(created_at) <= datetime('now', '-' || ? || ' days')
	`, daysToKeep)
	if err != nil {
		return fmt.Errorf("清理旧API性能数据失败: %w", err)
	}
	
	// 清理已解决的旧告警
	_, err = DB.Exec(`
		DELETE FROM performance_alerts 
		WHERE is_resolved = 1 AND datetime(resolved_at) <= datetime('now', '-' || ? || ' days')
	`, daysToKeep)
	if err != nil {
		return fmt.Errorf("清理旧性能告警失败: %w", err)
	}
	
	log.Printf("旧性能数据清理完成，保留天数: %d", daysToKeep)
	return nil
}
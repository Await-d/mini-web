package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"

	"gitee.com/await29/mini-web/internal/model/sqlite"
	"gitee.com/await29/mini-web/internal/service"
)

// APIControlHandler API访问控制处理器
type APIControlHandler struct {
	apiControlService *service.APIControlService
}

// NewAPIControlHandler 创建API访问控制处理器实例
func NewAPIControlHandler() *APIControlHandler {
	return &APIControlHandler{
		apiControlService: service.NewAPIControlService(),
	}
}

// GetAPIConfig 获取API访问配置
func (h *APIControlHandler) GetAPIConfig(w http.ResponseWriter, r *http.Request) {
	config, err := sqlite.GetAPIConfig()
	if err != nil {
		http.Error(w, "获取API配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取API配置成功",
		"data":    config,
	})
}

// UpdateAPIConfig 更新API访问配置
func (h *APIControlHandler) UpdateAPIConfig(w http.ResponseWriter, r *http.Request) {
	var config sqlite.APIConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 保存配置
	if err := sqlite.CreateOrUpdateAPIConfig(&config); err != nil {
		http.Error(w, "保存API配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 重新加载配置
	if err := h.apiControlService.ReloadConfig(); err != nil {
		http.Error(w, "重新加载配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "API配置保存成功",
		"data":    config,
	})
}

// GetAPIKeys 获取API密钥列表
func (h *APIControlHandler) GetAPIKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := sqlite.GetAPIKeys()
	if err != nil {
		http.Error(w, "获取API密钥失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 隐藏敏感信息
	for i := range keys {
		keys[i].SecretValue = ""
		// 只显示密钥的前8位和后4位
		if len(keys[i].KeyValue) > 12 {
			keys[i].KeyValue = keys[i].KeyValue[:8] + "****" + keys[i].KeyValue[len(keys[i].KeyValue)-4:]
		}
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取API密钥成功",
		"data":    keys,
	})
}

// CreateAPIKey 创建API密钥
func (h *APIControlHandler) CreateAPIKey(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Name        string `json:"name"`
		UserID      int    `json:"user_id"`
		Permissions string `json:"permissions"`
		ExpiresAt   string `json:"expires_at"`
		IsEnabled   bool   `json:"is_enabled"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 验证必填字段
	if request.Name == "" {
		http.Error(w, "API密钥名称不能为空", http.StatusBadRequest)
		return
	}
	
	// 生成API密钥
	keyValue, secretValue, err := h.apiControlService.GenerateAPIKey()
	if err != nil {
		http.Error(w, "生成API密钥失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 创建API密钥记录
	key := &sqlite.APIKey{
		Name:        request.Name,
		KeyValue:    keyValue,
		SecretValue: secretValue,
		UserID:      request.UserID,
		Permissions: request.Permissions,
		ExpiresAt:   request.ExpiresAt,
		IsEnabled:   request.IsEnabled,
	}
	
	if err := sqlite.CreateAPIKey(key); err != nil {
		http.Error(w, "创建API密钥失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 返回完整的密钥信息（仅此次显示）
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "API密钥创建成功",
		"data": map[string]interface{}{
			"id":          key.ID,
			"name":        key.Name,
			"key_value":   key.KeyValue,
			"secret_value": key.SecretValue,
			"created_at":  key.CreatedAt,
			"warning":     "请妥善保存密钥信息，此信息将不会再次显示",
		},
	})
}

// UpdateAPIKey 更新API密钥
func (h *APIControlHandler) UpdateAPIKey(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的密钥ID", http.StatusBadRequest)
		return
	}
	
	var key sqlite.APIKey
	if err := json.NewDecoder(r.Body).Decode(&key); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 设置密钥ID
	key.ID = id
	
	// 验证必填字段
	if key.Name == "" {
		http.Error(w, "API密钥名称不能为空", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.UpdateAPIKey(&key); err != nil {
		http.Error(w, "更新API密钥失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 隐藏敏感信息
	key.SecretValue = ""
	if len(key.KeyValue) > 12 {
		key.KeyValue = key.KeyValue[:8] + "****" + key.KeyValue[len(key.KeyValue)-4:]
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "API密钥更新成功",
		"data":    key,
	})
}

// DeleteAPIKey 删除API密钥
func (h *APIControlHandler) DeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的密钥ID", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.DeleteAPIKey(id); err != nil {
		http.Error(w, "删除API密钥失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "API密钥删除成功",
	})
}

// GetIPWhitelist 获取IP白名单
func (h *APIControlHandler) GetIPWhitelist(w http.ResponseWriter, r *http.Request) {
	whitelist, err := sqlite.GetIPWhitelist()
	if err != nil {
		http.Error(w, "获取IP白名单失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取IP白名单成功",
		"data":    whitelist,
	})
}

// AddIPToWhitelist 添加IP到白名单
func (h *APIControlHandler) AddIPToWhitelist(w http.ResponseWriter, r *http.Request) {
	var item sqlite.IPWhitelist
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 验证IP地址格式
	if err := h.apiControlService.ValidateIPAddress(item.IPAddress); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "IP地址格式错误: " + err.Error(),
		})
		return
	}
	
	if err := sqlite.AddIPToWhitelist(&item); err != nil {
		http.Error(w, "添加IP白名单失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "IP白名单添加成功",
		"data":    item,
	})
}

// RemoveIPFromWhitelist 从白名单移除IP
func (h *APIControlHandler) RemoveIPFromWhitelist(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的ID", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.RemoveIPFromWhitelist(id); err != nil {
		http.Error(w, "删除IP白名单失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "IP白名单删除成功",
	})
}

// GetIPBlacklist 获取IP黑名单
func (h *APIControlHandler) GetIPBlacklist(w http.ResponseWriter, r *http.Request) {
	blacklist, err := sqlite.GetIPBlacklist()
	if err != nil {
		http.Error(w, "获取IP黑名单失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取IP黑名单成功",
		"data":    blacklist,
	})
}

// AddIPToBlacklist 添加IP到黑名单
func (h *APIControlHandler) AddIPToBlacklist(w http.ResponseWriter, r *http.Request) {
	var item sqlite.IPBlacklist
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 验证IP地址格式
	if err := h.apiControlService.ValidateIPAddress(item.IPAddress); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "IP地址格式错误: " + err.Error(),
		})
		return
	}
	
	// 设置封禁时间
	item.BlockedAt = time.Now().Format("2006-01-02 15:04:05")
	
	if err := sqlite.AddIPToBlacklist(&item); err != nil {
		http.Error(w, "添加IP黑名单失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "IP黑名单添加成功",
		"data":    item,
	})
}

// RemoveIPFromBlacklist 从黑名单移除IP
func (h *APIControlHandler) RemoveIPFromBlacklist(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的ID", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.RemoveIPFromBlacklist(id); err != nil {
		http.Error(w, "删除IP黑名单失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "IP黑名单删除成功",
	})
}

// GetAPIAccessLogs 获取API访问日志
func (h *APIControlHandler) GetAPIAccessLogs(w http.ResponseWriter, r *http.Request) {
	// 解析查询参数
	query := r.URL.Query()
	limit := 50
	offset := 0
	
	if l := query.Get("limit"); l != "" {
		if parsedLimit, err := strconv.Atoi(l); err == nil {
			limit = parsedLimit
		}
	}
	
	if o := query.Get("offset"); o != "" {
		if parsedOffset, err := strconv.Atoi(o); err == nil {
			offset = parsedOffset
		}
	}
	
	// 构建过滤条件
	filters := make(map[string]interface{})
	if ip := query.Get("ip_address"); ip != "" {
		filters["ip_address"] = ip
	}
	if method := query.Get("method"); method != "" {
		filters["method"] = method
	}
	if statusCodeStr := query.Get("status_code"); statusCodeStr != "" {
		if statusCode, err := strconv.Atoi(statusCodeStr); err == nil {
			filters["status_code"] = statusCode
		}
	}
	if startTime := query.Get("start_time"); startTime != "" {
		filters["start_time"] = startTime
	}
	if endTime := query.Get("end_time"); endTime != "" {
		filters["end_time"] = endTime
	}
	
	logs, err := sqlite.GetAPIAccessLogs(limit, offset, filters)
	if err != nil {
		http.Error(w, "获取API访问日志失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取API访问日志成功",
		"data": map[string]interface{}{
			"list":   logs,
			"limit":  limit,
			"offset": offset,
		},
	})
}

// GetAccessStatistics 获取访问统计信息
func (h *APIControlHandler) GetAccessStatistics(w http.ResponseWriter, r *http.Request) {
	// 获取天数参数
	days := 7
	if d := r.URL.Query().Get("days"); d != "" {
		if parsedDays, err := strconv.Atoi(d); err == nil {
			days = parsedDays
		}
	}
	
	stats, err := h.apiControlService.GetAccessStatistics(days)
	if err != nil {
		http.Error(w, "获取访问统计失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取访问统计成功",
		"data":    stats,
	})
}

// GetRateLimitStatus 获取当前速率限制状态
func (h *APIControlHandler) GetRateLimitStatus(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)
	status := h.apiControlService.GetCurrentRateLimitStatus(clientIP)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取速率限制状态成功",
		"data": map[string]interface{}{
			"client_ip": clientIP,
			"status":    status,
		},
	})
}

// CleanupExpiredEntries 清理过期条目
func (h *APIControlHandler) CleanupExpiredEntries(w http.ResponseWriter, r *http.Request) {
	if err := h.apiControlService.CleanupExpiredEntries(); err != nil {
		http.Error(w, "清理过期条目失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "过期条目清理成功",
	})
}
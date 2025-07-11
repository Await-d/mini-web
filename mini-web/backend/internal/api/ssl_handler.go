package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"gitee.com/await29/mini-web/internal/model/sqlite"
	"gitee.com/await29/mini-web/internal/service"
)

// SSLHandler SSL证书管理处理器
type SSLHandler struct {
	sslService *service.SSLService
}

// NewSSLHandler 创建SSL处理器实例
func NewSSLHandler() *SSLHandler {
	return &SSLHandler{
		sslService: service.NewSSLService(),
	}
}

// GetSSLConfigs 获取SSL配置列表
func (h *SSLHandler) GetSSLConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := sqlite.GetSSLConfigs()
	if err != nil {
		http.Error(w, "获取SSL配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 隐藏敏感信息
	for i := range configs {
		configs[i].KeyContent = ""
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取SSL配置成功",
		"data":    configs,
	})
}

// GetSSLConfig 获取单个SSL配置
func (h *SSLHandler) GetSSLConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的配置ID", http.StatusBadRequest)
		return
	}
	
	config, err := sqlite.GetSSLConfigByID(id)
	if err != nil {
		http.Error(w, "获取SSL配置失败: "+err.Error(), http.StatusNotFound)
		return
	}
	
	// 隐藏私钥内容
	config.KeyContent = ""
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取SSL配置成功",
		"data":    config,
	})
}

// CreateSSLConfig 创建SSL配置
func (h *SSLHandler) CreateSSLConfig(w http.ResponseWriter, r *http.Request) {
	var config sqlite.SSLConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 验证必填字段
	if config.Name == "" || config.Domain == "" || config.CertContent == "" || config.KeyContent == "" {
		http.Error(w, "证书名称、域名、证书内容和私钥内容不能为空", http.StatusBadRequest)
		return
	}
	
	// 验证证书和私钥
	if err := h.sslService.ValidateCertificateAndKey(config.CertContent, config.KeyContent); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "证书验证失败: " + err.Error(),
		})
		return
	}
	
	// 解析证书信息
	certInfo, err := h.sslService.ParseCertificate(config.CertContent)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "解析证书失败: " + err.Error(),
		})
		return
	}
	
	// 设置证书信息
	config.Issuer = certInfo.Issuer
	config.Subject = certInfo.Subject
	config.NotBefore = certInfo.NotBefore.Format("2006-01-02 15:04:05")
	config.NotAfter = certInfo.NotAfter.Format("2006-01-02 15:04:05")
	
	// 验证域名与证书是否匹配
	if err := h.sslService.ValidateDomainCertificate(config.Domain, config.CertContent); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "域名验证失败: " + err.Error(),
		})
		return
	}
	
	// 创建配置
	if err := sqlite.CreateSSLConfig(&config); err != nil {
		http.Error(w, "创建SSL配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 隐藏私钥内容
	config.KeyContent = ""
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "SSL配置创建成功",
		"data":    config,
	})
}

// UpdateSSLConfig 更新SSL配置
func (h *SSLHandler) UpdateSSLConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的配置ID", http.StatusBadRequest)
		return
	}
	
	var config sqlite.SSLConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 设置配置ID
	config.ID = id
	
	// 验证必填字段
	if config.Name == "" || config.Domain == "" {
		http.Error(w, "证书名称和域名不能为空", http.StatusBadRequest)
		return
	}
	
	// 如果提供了新的证书内容，验证证书
	if config.CertContent != "" && config.KeyContent != "" {
		if err := h.sslService.ValidateCertificateAndKey(config.CertContent, config.KeyContent); err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"code":    400,
				"message": "证书验证失败: " + err.Error(),
			})
			return
		}
		
		// 解析证书信息
		certInfo, err := h.sslService.ParseCertificate(config.CertContent)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"code":    400,
				"message": "解析证书失败: " + err.Error(),
			})
			return
		}
		
		// 设置证书信息
		config.Issuer = certInfo.Issuer
		config.Subject = certInfo.Subject
		config.NotBefore = certInfo.NotBefore.Format("2006-01-02 15:04:05")
		config.NotAfter = certInfo.NotAfter.Format("2006-01-02 15:04:05")
		
		// 验证域名与证书是否匹配
		if err := h.sslService.ValidateDomainCertificate(config.Domain, config.CertContent); err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"code":    400,
				"message": "域名验证失败: " + err.Error(),
			})
			return
		}
	} else {
		// 如果没有提供新证书，保持原有证书信息
		existingConfig, err := sqlite.GetSSLConfigByID(id)
		if err != nil {
			http.Error(w, "获取现有配置失败: "+err.Error(), http.StatusNotFound)
			return
		}
		
		config.CertContent = existingConfig.CertContent
		config.KeyContent = existingConfig.KeyContent
		config.Issuer = existingConfig.Issuer
		config.Subject = existingConfig.Subject
		config.NotBefore = existingConfig.NotBefore
		config.NotAfter = existingConfig.NotAfter
	}
	
	// 更新配置
	if err := sqlite.UpdateSSLConfig(&config); err != nil {
		http.Error(w, "更新SSL配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 隐藏私钥内容
	config.KeyContent = ""
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "SSL配置更新成功",
		"data":    config,
	})
}

// DeleteSSLConfig 删除SSL配置
func (h *SSLHandler) DeleteSSLConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的配置ID", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.DeleteSSLConfig(id); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": err.Error(),
		})
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "SSL配置删除成功",
	})
}

// SetDefaultSSLConfig 设置默认SSL配置
func (h *SSLHandler) SetDefaultSSLConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的配置ID", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.SetDefaultSSLConfig(id); err != nil {
		http.Error(w, "设置默认SSL配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "默认SSL配置设置成功",
	})
}

// EnableSSLConfig 启用SSL配置
func (h *SSLHandler) EnableSSLConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的配置ID", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.EnableSSLConfig(id); err != nil {
		http.Error(w, "启用SSL配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "SSL配置启用成功",
	})
}

// DisableSSLConfig 禁用SSL配置
func (h *SSLHandler) DisableSSLConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的配置ID", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.DisableSSLConfig(id); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": err.Error(),
		})
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "SSL配置禁用成功",
	})
}

// TestSSLConnection 测试SSL连接
func (h *SSLHandler) TestSSLConnection(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Host        string `json:"host"`
		Port        int    `json:"port"`
		CertContent string `json:"cert_content"`
		KeyContent  string `json:"key_content"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	if request.Host == "" || request.Port <= 0 {
		http.Error(w, "主机地址和端口不能为空", http.StatusBadRequest)
		return
	}
	
	// 测试SSL连接
	if err := h.sslService.TestSSLConnection(request.Host, request.Port, request.CertContent, request.KeyContent); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "SSL连接测试失败: " + err.Error(),
		})
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "SSL连接测试成功",
	})
}

// ParseCertificate 解析证书信息
func (h *SSLHandler) ParseCertificate(w http.ResponseWriter, r *http.Request) {
	var request struct {
		CertContent string `json:"cert_content"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	if request.CertContent == "" {
		http.Error(w, "证书内容不能为空", http.StatusBadRequest)
		return
	}
	
	// 解析证书
	certInfo, err := h.sslService.ParseCertificate(request.CertContent)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "解析证书失败: " + err.Error(),
		})
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "证书解析成功",
		"data":    certInfo,
	})
}

// GetExpiringCertificates 获取即将过期的证书
func (h *SSLHandler) GetExpiringCertificates(w http.ResponseWriter, r *http.Request) {
	expiring, err := h.sslService.CheckCertificateExpiry()
	if err != nil {
		http.Error(w, "获取即将过期的证书失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 隐藏敏感信息
	for i := range expiring {
		expiring[i].KeyContent = ""
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取即将过期的证书成功",
		"data":    expiring,
	})
}

// GetSSLStatus 获取SSL配置状态统计
func (h *SSLHandler) GetSSLStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.sslService.GetSSLConfigsStatus()
	if err != nil {
		http.Error(w, "获取SSL状态失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取SSL状态成功",
		"data":    status,
	})
}
package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"mini-web/backend/internal/model/sqlite"
	"mini-web/backend/internal/service"
)

// EmailHandler 邮件配置处理器
type EmailHandler struct {
	emailService *service.EmailService
}

// NewEmailHandler 创建邮件处理器实例
func NewEmailHandler() *EmailHandler {
	return &EmailHandler{
		emailService: service.NewEmailService(),
	}
}

// GetEmailConfig 获取邮件配置
func (h *EmailHandler) GetEmailConfig(w http.ResponseWriter, r *http.Request) {
	config, err := sqlite.GetEmailConfig()
	if err != nil {
		http.Error(w, "获取邮件配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 隐藏敏感信息
	config.Password = ""
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取邮件配置成功",
		"data":    config,
	})
}

// UpdateEmailConfig 更新邮件配置
func (h *EmailHandler) UpdateEmailConfig(w http.ResponseWriter, r *http.Request) {
	var config sqlite.EmailConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 如果密码为空，保持原有密码
	if config.Password == "" {
		existingConfig, err := sqlite.GetEmailConfig()
		if err == nil && existingConfig.ID > 0 {
			config.Password = existingConfig.Password
		}
	}
	
	// 保存配置
	if err := sqlite.CreateOrUpdateEmailConfig(&config); err != nil {
		http.Error(w, "保存邮件配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 隐藏敏感信息
	config.Password = ""
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件配置保存成功",
		"data":    config,
	})
}

// TestEmailConnection 测试邮件连接
func (h *EmailHandler) TestEmailConnection(w http.ResponseWriter, r *http.Request) {
	var config sqlite.EmailConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 如果密码为空，使用现有配置的密码
	if config.Password == "" {
		existingConfig, err := sqlite.GetEmailConfig()
		if err == nil && existingConfig.ID > 0 {
			config.Password = existingConfig.Password
		}
	}
	
	// 测试连接
	if err := h.emailService.TestConnection(&config); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "邮件连接测试失败: " + err.Error(),
		})
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件连接测试成功",
	})
}

// SendTestEmail 发送测试邮件
func (h *EmailHandler) SendTestEmail(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Config sqlite.EmailConfig `json:"config"`
		Email  string             `json:"email"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	if request.Email == "" {
		http.Error(w, "测试邮箱不能为空", http.StatusBadRequest)
		return
	}
	
	// 如果密码为空，使用现有配置的密码
	if request.Config.Password == "" {
		existingConfig, err := sqlite.GetEmailConfig()
		if err == nil && existingConfig.ID > 0 {
			request.Config.Password = existingConfig.Password
		}
	}
	
	// 发送测试邮件
	if err := h.emailService.SendTestEmail(&request.Config, request.Email); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    400,
			"message": "发送测试邮件失败: " + err.Error(),
		})
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "测试邮件发送成功，请检查收件箱",
	})
}

// GetEmailTemplates 获取邮件模板列表
func (h *EmailHandler) GetEmailTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := sqlite.GetEmailTemplates()
	if err != nil {
		http.Error(w, "获取邮件模板失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取邮件模板成功",
		"data":    templates,
	})
}

// CreateEmailTemplate 创建邮件模板
func (h *EmailHandler) CreateEmailTemplate(w http.ResponseWriter, r *http.Request) {
	var template sqlite.EmailTemplate
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 验证必填字段
	if template.Name == "" || template.Subject == "" || template.Body == "" || template.Type == "" {
		http.Error(w, "模板名称、主题、内容和类型不能为空", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.CreateEmailTemplate(&template); err != nil {
		http.Error(w, "创建邮件模板失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件模板创建成功",
		"data":    template,
	})
}

// UpdateEmailTemplate 更新邮件模板
func (h *EmailHandler) UpdateEmailTemplate(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的模板ID", http.StatusBadRequest)
		return
	}
	
	var template sqlite.EmailTemplate
	if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	
	// 设置模板ID
	template.ID = id
	
	// 验证必填字段
	if template.Name == "" || template.Subject == "" || template.Body == "" || template.Type == "" {
		http.Error(w, "模板名称、主题、内容和类型不能为空", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.UpdateEmailTemplate(&template); err != nil {
		http.Error(w, "更新邮件模板失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件模板更新成功",
		"data":    template,
	})
}

// DeleteEmailTemplate 删除邮件模板
func (h *EmailHandler) DeleteEmailTemplate(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "无效的模板ID", http.StatusBadRequest)
		return
	}
	
	if err := sqlite.DeleteEmailTemplate(id); err != nil {
		http.Error(w, "删除邮件模板失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件模板删除成功",
	})
}

// GetEmailTemplateVariables 获取邮件模板可用变量
func (h *EmailHandler) GetEmailTemplateVariables(w http.ResponseWriter, r *http.Request) {
	variables := h.emailService.GetCommonEmailVariables()
	
	// 添加变量说明
	variableDescriptions := map[string]string{
		"site_name":     "网站名称",
		"site_url":      "网站地址",
		"support_email": "支持邮箱",
		"current_year":  "当前年份",
		"current_date":  "当前日期",
		"current_time":  "当前时间",
		"user_name":     "用户名称",
		"user_email":    "用户邮箱",
		"reset_link":    "重置链接",
		"login_ip":      "登录IP",
		"login_time":    "登录时间",
	}
	
	response := map[string]interface{}{
		"variables":    variables,
		"descriptions": variableDescriptions,
		"usage":        "在模板中使用 {{variable_name}} 的格式来使用变量",
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取模板变量成功",
		"data":    response,
	})
}
package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"gitee.com/await29/mini-web/internal/model/sqlite"
	"gitee.com/await29/mini-web/internal/service"
	"github.com/gorilla/mux"
)

type EmailHandler struct {
	systemService *service.SystemService
}

func NewEmailHandler() *EmailHandler {
	configRepo := sqlite.NewSystemConfigRepository(sqlite.DB)
	logRepo := sqlite.NewSystemLogRepository(sqlite.DB)

	return &EmailHandler{
		systemService: service.NewSystemService(configRepo, logRepo),
	}
}

func (h *EmailHandler) GetEmailConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := sqlite.GetEmailConfig()
	if err != nil {
		http.Error(w, "获取邮件配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取邮件配置成功",
		"data":    cfg,
	})
}

func (h *EmailHandler) UpdateEmailConfig(w http.ResponseWriter, r *http.Request) {
	var cfg sqlite.EmailConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	if cfg.SMTPPort <= 0 {
		cfg.SMTPPort = 587
	}

	if cfg.SMTPHost == "" || cfg.FromEmail == "" {
		http.Error(w, "SMTP主机和发件邮箱不能为空", http.StatusBadRequest)
		return
	}

	if err := sqlite.CreateOrUpdateEmailConfig(&cfg); err != nil {
		http.Error(w, "保存邮件配置失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件配置保存成功",
		"data":    cfg,
	})
}

func (h *EmailHandler) TestEmailConnection(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SMTPHost  string `json:"smtp_host"`
		SMTPPort  int    `json:"smtp_port"`
		Username  string `json:"username"`
		Password  string `json:"password"`
		FromEmail string `json:"from_email"`
		TestEmail string `json:"test_email"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.SMTPPort <= 0 {
		req.SMTPPort = 587
	}
	if req.TestEmail == "" {
		req.TestEmail = req.FromEmail
	}

	if req.SMTPHost == "" || req.Username == "" || req.Password == "" || req.TestEmail == "" {
		http.Error(w, "SMTP主机、用户名、密码和测试收件箱不能为空", http.StatusBadRequest)
		return
	}

	userID, err := getUserIDFromContext(r)
	if err != nil {
		http.Error(w, "未授权访问", http.StatusUnauthorized)
		return
	}
	ipAddress := getClientIP(r)

	if err := h.systemService.TestEmailConfig(req.SMTPHost, req.SMTPPort, req.Username, req.Password, req.TestEmail, userID, ipAddress); err != nil {
		http.Error(w, "邮件连接测试失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件连接测试成功",
	})
}

func (h *EmailHandler) SendTestEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Config sqlite.EmailConfig `json:"config"`
		Email  string             `json:"email"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Email == "" {
		http.Error(w, "测试收件邮箱不能为空", http.StatusBadRequest)
		return
	}

	if req.Config.SMTPPort <= 0 {
		req.Config.SMTPPort = 587
	}

	if req.Config.SMTPHost == "" || req.Config.Username == "" || req.Config.Password == "" {
		http.Error(w, "SMTP配置不完整", http.StatusBadRequest)
		return
	}

	userID, err := getUserIDFromContext(r)
	if err != nil {
		http.Error(w, "未授权访问", http.StatusUnauthorized)
		return
	}
	ipAddress := getClientIP(r)

	if err := h.systemService.TestEmailConfig(req.Config.SMTPHost, req.Config.SMTPPort, req.Config.Username, req.Config.Password, req.Email, userID, ipAddress); err != nil {
		http.Error(w, "测试邮件发送失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "测试邮件发送成功",
	})
}

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

func (h *EmailHandler) CreateEmailTemplate(w http.ResponseWriter, r *http.Request) {
	var tpl sqlite.EmailTemplate
	if err := json.NewDecoder(r.Body).Decode(&tpl); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}

	if tpl.Name == "" || tpl.Subject == "" || tpl.Body == "" || tpl.Type == "" {
		http.Error(w, "模板名称、标题、正文和类型不能为空", http.StatusBadRequest)
		return
	}

	if err := sqlite.CreateEmailTemplate(&tpl); err != nil {
		http.Error(w, "创建邮件模板失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件模板创建成功",
		"data":    tpl,
	})
}

func (h *EmailHandler) UpdateEmailTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "无效的模板ID", http.StatusBadRequest)
		return
	}

	var tpl sqlite.EmailTemplate
	if err := json.NewDecoder(r.Body).Decode(&tpl); err != nil {
		http.Error(w, "请求参数格式错误: "+err.Error(), http.StatusBadRequest)
		return
	}
	tpl.ID = id

	if tpl.Name == "" || tpl.Subject == "" || tpl.Body == "" || tpl.Type == "" {
		http.Error(w, "模板名称、标题、正文和类型不能为空", http.StatusBadRequest)
		return
	}

	if err := sqlite.UpdateEmailTemplate(&tpl); err != nil {
		http.Error(w, "更新邮件模板失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "邮件模板更新成功",
		"data":    tpl,
	})
}

func (h *EmailHandler) DeleteEmailTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
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

func (h *EmailHandler) GetEmailTemplateVariables(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"code":    200,
		"message": "获取模板变量成功",
		"data": map[string]interface{}{
			"variables": map[string]string{
				"site_name":            "站点名称",
				"user_name":            "用户名",
				"support_email":        "支持邮箱",
				"current_date":         "当前日期",
				"reset_link":           "密码重置链接",
				"login_time":           "登录时间",
				"login_ip":             "登录IP",
				"notification_content": "通知内容",
			},
			"usage": "模板中使用 {{variable_name}} 格式插入变量",
		},
	})
}

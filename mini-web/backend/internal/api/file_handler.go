/*
 * @Author: Await
 * @Date: 2025-10-02
 * @Description: SSH文件管理API处理器
 */
package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"

	"gitee.com/await29/mini-web/internal/service"
)

// FileHandler 文件操作处理器
type FileHandler struct {
	sessionManager *service.TerminalSessionManager
}

// NewFileHandler 创建文件处理器
func NewFileHandler() *FileHandler {
	return &FileHandler{
		sessionManager: service.GetTerminalSessionManager(),
	}
}

// DownloadFileRequest 下载文件请求
type DownloadFileRequest struct {
	SessionID  string `json:"sessionId"`
	RemotePath string `json:"remotePath"`
}

// UploadFileRequest 上传文件请求
type UploadFileRequest struct {
	SessionID  string `json:"sessionId"`
	RemotePath string `json:"remotePath"`
	Content    string `json:"content"`    // Base64编码的文件内容
}

// DeleteFilesRequest 批量删除文件请求
type DeleteFilesRequest struct {
	SessionID   string   `json:"sessionId"`
	RemotePaths []string `json:"remotePaths"`
}

// EditFileRequest 编辑文件请求
type EditFileRequest struct {
	SessionID  string `json:"sessionId"`
	RemotePath string `json:"remotePath"`
	Content    string `json:"content"`
}

// DownloadFile 下载文件
func (h *FileHandler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	// 解析请求参数
	sessionID := r.URL.Query().Get("sessionId")
	remotePath := r.URL.Query().Get("remotePath")

	if sessionID == "" || remotePath == "" {
		http.Error(w, "缺少必要参数", http.StatusBadRequest)
		return
	}

	log.Printf("处理文件下载请求: sessionId=%s, remotePath=%s", sessionID, remotePath)

	// 从会话管理器获取会话
	persistentSession, err := h.sessionManager.GetSession(sessionID)
	if err != nil {
		http.Error(w, "会话不存在或已过期", http.StatusNotFound)
		return
	}

	// 确保会话有terminal代理
	if persistentSession.TerminalProxy == nil {
		http.Error(w, "终端代理未初始化", http.StatusServiceUnavailable)
		return
	}

	// 获取底层终端会话
	terminalSession := persistentSession.TerminalProxy.GetTerminal()
	if terminalSession == nil {
		http.Error(w, "终端会话未找到", http.StatusNotFound)
		return
	}

	// 确保是SSH会话
	sshSession, ok := terminalSession.(*service.SSHTerminalSession)
	if !ok {
		http.Error(w, "只支持SSH协议的文件操作", http.StatusBadRequest)
		return
	}

	// 创建文件管理器
	fileManager, err := service.NewSSHFileManager(sshSession)
	if err != nil {
		log.Printf("创建文件管理器失败: %v", err)
		http.Error(w, fmt.Sprintf("创建文件管理器失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 下载文件
	data, fileName, err := fileManager.DownloadFile(remotePath)
	if err != nil {
		log.Printf("下载文件失败: %v", err)
		http.Error(w, fmt.Sprintf("下载文件失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 设置响应头
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))

	// 发送文件数据
	if _, err := w.Write(data); err != nil {
		log.Printf("发送文件数据失败: %v", err)
		return
	}

	log.Printf("文件下载成功: %s (%d bytes)", fileName, len(data))
}

// UploadFile 上传文件
func (h *FileHandler) UploadFile(w http.ResponseWriter, r *http.Request) {
	// 解析multipart form
	if err := r.ParseMultipartForm(100 << 20); err != nil { // 100MB限制
		http.Error(w, "解析表单失败", http.StatusBadRequest)
		return
	}

	sessionID := r.FormValue("sessionId")
	remotePath := r.FormValue("remotePath")

	if sessionID == "" || remotePath == "" {
		http.Error(w, "缺少必要参数", http.StatusBadRequest)
		return
	}

	// 获取上传的文件
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "获取上传文件失败", http.StatusBadRequest)
		return
	}
	defer file.Close()

	log.Printf("处理文件上传请求: sessionId=%s, remotePath=%s, fileName=%s",
		sessionID, remotePath, header.Filename)

	// 从会话管理器获取会话
	persistentSession, err := h.sessionManager.GetSession(sessionID)
	if err != nil {
		http.Error(w, "会话不存在或已过期", http.StatusNotFound)
		return
	}

	// 确保会话有terminal代理
	if persistentSession.TerminalProxy == nil {
		http.Error(w, "终端代理未初始化", http.StatusServiceUnavailable)
		return
	}

	// 获取底层终端会话
	terminalSession := persistentSession.TerminalProxy.GetTerminal()
	if terminalSession == nil {
		http.Error(w, "终端会话未找到", http.StatusNotFound)
		return
	}

	// 确保是SSH会话
	sshSession, ok := terminalSession.(*service.SSHTerminalSession)
	if !ok {
		http.Error(w, "只支持SSH协议的文件操作", http.StatusBadRequest)
		return
	}

	// 创建文件管理器
	fileManager, err := service.NewSSHFileManager(sshSession)
	if err != nil {
		log.Printf("创建文件管理器失败: %v", err)
		http.Error(w, fmt.Sprintf("创建文件管理器失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 读取文件内容
	content, err := io.ReadAll(file)
	if err != nil {
		log.Printf("读取文件内容失败: %v", err)
		http.Error(w, "读取文件内容失败", http.StatusInternalServerError)
		return
	}

	// 上传文件
	if err := fileManager.UploadFile(remotePath, content); err != nil {
		log.Printf("上传文件失败: %v", err)
		http.Error(w, fmt.Sprintf("上传文件失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 返回成功响应
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "文件上传成功",
		"path":    remotePath,
		"size":    len(content),
	})

	log.Printf("文件上传成功: %s (%d bytes)", remotePath, len(content))
}

// DeleteFiles 批量删除文件
func (h *FileHandler) DeleteFiles(w http.ResponseWriter, r *http.Request) {
	var req DeleteFilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求格式错误", http.StatusBadRequest)
		return
	}

	if req.SessionID == "" || len(req.RemotePaths) == 0 {
		http.Error(w, "缺少必要参数", http.StatusBadRequest)
		return
	}

	log.Printf("处理批量删除请求: sessionId=%s, 文件数=%d", req.SessionID, len(req.RemotePaths))

	// 从会话管理器获取会话
	persistentSession, err := h.sessionManager.GetSession(req.SessionID)
	if err != nil {
		http.Error(w, "会话不存在或已过期", http.StatusNotFound)
		return
	}

	// 确保会话有terminal代理
	if persistentSession.TerminalProxy == nil {
		http.Error(w, "终端代理未初始化", http.StatusServiceUnavailable)
		return
	}

	// 获取底层终端会话
	terminalSession := persistentSession.TerminalProxy.GetTerminal()
	if terminalSession == nil {
		http.Error(w, "终端会话未找到", http.StatusNotFound)
		return
	}

	// 确保是SSH会话
	sshSession, ok := terminalSession.(*service.SSHTerminalSession)
	if !ok {
		http.Error(w, "只支持SSH协议的文件操作", http.StatusBadRequest)
		return
	}

	// 创建文件管理器
	fileManager, err := service.NewSSHFileManager(sshSession)
	if err != nil {
		log.Printf("创建文件管理器失败: %v", err)
		http.Error(w, fmt.Sprintf("创建文件管理器失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 批量删除文件
	if err := fileManager.DeleteFiles(req.RemotePaths); err != nil {
		log.Printf("批量删除失败: %v", err)
		http.Error(w, fmt.Sprintf("批量删除失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 返回成功响应
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("成功删除 %d 个项目", len(req.RemotePaths)),
		"count":   len(req.RemotePaths),
	})

	log.Printf("批量删除成功: %d 个项目", len(req.RemotePaths))
}

// EditFile 编辑文件
func (h *FileHandler) EditFile(w http.ResponseWriter, r *http.Request) {
	var req EditFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求格式错误", http.StatusBadRequest)
		return
	}

	if req.SessionID == "" || req.RemotePath == "" {
		http.Error(w, "缺少必要参数", http.StatusBadRequest)
		return
	}

	log.Printf("处理文件编辑请求: sessionId=%s, remotePath=%s", req.SessionID, req.RemotePath)

	// 从会话管理器获取会话
	persistentSession, err := h.sessionManager.GetSession(req.SessionID)
	if err != nil {
		http.Error(w, "会话不存在或已过期", http.StatusNotFound)
		return
	}

	// 确保会话有terminal代理
	if persistentSession.TerminalProxy == nil {
		http.Error(w, "终端代理未初始化", http.StatusServiceUnavailable)
		return
	}

	// 获取底层终端会话
	terminalSession := persistentSession.TerminalProxy.GetTerminal()
	if terminalSession == nil {
		http.Error(w, "终端会话未找到", http.StatusNotFound)
		return
	}

	// 确保是SSH会话
	sshSession, ok := terminalSession.(*service.SSHTerminalSession)
	if !ok {
		http.Error(w, "只支持SSH协议的文件操作", http.StatusBadRequest)
		return
	}

	// 创建文件管理器
	fileManager, err := service.NewSSHFileManager(sshSession)
	if err != nil {
		log.Printf("创建文件管理器失败: %v", err)
		http.Error(w, fmt.Sprintf("创建文件管理器失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 编辑文件
	if err := fileManager.EditFile(req.RemotePath, req.Content); err != nil {
		log.Printf("编辑文件失败: %v", err)
		http.Error(w, fmt.Sprintf("编辑文件失败: %v", err), http.StatusInternalServerError)
		return
	}

	// 返回成功响应
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "文件保存成功",
		"path":    req.RemotePath,
		"size":    len(req.Content),
	})

	log.Printf("文件编辑成功: %s (%d bytes)", req.RemotePath, len(req.Content))
}

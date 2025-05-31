package service

import (
	"bufio"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// SSHCommandHandler 处理SSH特殊命令
type SSHCommandHandler struct {
	client    *ssh.Client
	session   *ssh.Session
	stdout    *bufio.Reader
	stdin     *bufio.Writer
	mu        sync.Mutex
	responses chan *CommandResponse
}

// CommandResponse 命令响应
type CommandResponse struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// FileInfo 文件信息
type FileInfo struct {
	Name        string `json:"name"`
	Type        string `json:"type"` // "file" or "directory"
	Size        int64  `json:"size"`
	Permissions string `json:"permissions"`
	Modified    string `json:"modified"`
	Owner       string `json:"owner"`
	Group       string `json:"group"`
}

// FileListResponse 文件列表响应
type FileListResponse struct {
	Path  string     `json:"path"`
	Files []FileInfo `json:"files"`
	Error string     `json:"error,omitempty"`
}

// NewSSHCommandHandler 创建SSH命令处理器
func NewSSHCommandHandler(client *ssh.Client) (*SSHCommandHandler, error) {
	// 不立即创建会话，而是在需要时创建一次性会话
	handler := &SSHCommandHandler{
		client:    client,
		session:   nil, // 不预创建会话
		stdout:    nil,
		stdin:     nil,
		responses: make(chan *CommandResponse, 10),
	}

	return handler, nil
}

// ExecuteFileListCommand 执行文件列表命令
func (h *SSHCommandHandler) ExecuteFileListCommand(path string) (*FileListResponse, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行文件列表命令，路径: %s", path)

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return &FileListResponse{
			Path:  path,
			Error: "无法创建SSH会话",
		}, nil
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 直接执行简单的ls命令
	cmd := fmt.Sprintf("ls -la '%s'", path)
	log.Printf("执行文件列表命令: %s", cmd)

	// 设置超时
	done := make(chan struct{})
	var output []byte
	var cmdErr error

	go func() {
		defer close(done)
		output, cmdErr = session.CombinedOutput(cmd)
		log.Printf("命令执行完成，输出长度: %d, 错误: %v", len(output), cmdErr)
	}()

	// 等待命令完成或超时
	select {
	case <-done:
		log.Printf("命令正常完成")
	case <-time.After(10 * time.Second):
		log.Printf("命令执行超时")
		session.Close()
		return &FileListResponse{
			Path:  path,
			Error: "命令执行超时",
		}, nil
	}

	if cmdErr != nil {
		log.Printf("执行命令失败: %v", cmdErr)
		// 即使命令失败，也尝试解析输出
		if len(output) == 0 {
			return &FileListResponse{
				Path:  path,
				Error: fmt.Sprintf("执行命令失败: %v", cmdErr),
			}, nil
		}
	}

	outputStr := string(output)
	previewLen := 200
	if len(outputStr) < previewLen {
		previewLen = len(outputStr)
	}
	log.Printf("命令输出预览 (前%d字符): %s", previewLen, outputStr[:previewLen])

	// 解析输出
	result, err := h.parseLsOutput(path, strings.Split(strings.TrimSpace(outputStr), "\n"))
	if err != nil {
		log.Printf("解析ls输出失败: %v", err)
		return &FileListResponse{
			Path:  path,
			Error: fmt.Sprintf("解析输出失败: %v", err),
		}, nil
	}

	log.Printf("成功解析文件列表，共 %d 个文件", len(result.Files))
	return result, nil
}

// parseLsOutput 解析ls命令输出
func (h *SSHCommandHandler) parseLsOutput(path string, lines []string) (*FileListResponse, error) {
	response := &FileListResponse{
		Path:  path,
		Files: []FileInfo{},
	}

	// 检查错误
	if len(lines) > 0 && strings.HasPrefix(lines[0], "ERROR:") {
		response.Error = "无法访问目录"
		return response, nil
	}

	// 检查是否有"No such file or directory"错误
	for _, line := range lines {
		if strings.Contains(line, "No such file or directory") || strings.Contains(line, "cannot access") {
			response.Error = "目录不存在"
			return response, nil
		}
	}

	// 解析文件列表
	for _, line := range lines {
		// 跳过total行
		if strings.HasPrefix(line, "total") {
			continue
		}

		// 解析文件信息行
		// 格式: drwxr-xr-x 2 user group 4096 Jan 1 12:00 filename
		parts := strings.Fields(line)
		if len(parts) < 9 {
			continue
		}

		permissions := parts[0]
		owner := parts[2]
		group := parts[3]
		size := parts[4]
		month := parts[5]
		day := parts[6]
		timeOrYear := parts[7]

		// 文件名可能包含空格，从第8个部分开始
		fileName := strings.Join(parts[8:], " ")

		// 处理符号链接
		if strings.Contains(fileName, " -> ") {
			fileName = strings.Split(fileName, " -> ")[0]
		}

		// 跳过当前目录和父目录
		if fileName == "." || fileName == ".." {
			continue
		}

		// 确定文件类型
		fileType := "file"
		if strings.HasPrefix(permissions, "d") {
			fileType = "directory"
		} else if strings.HasPrefix(permissions, "l") {
			fileType = "link"
		}

		// 解析文件大小
		var fileSize int64
		fmt.Sscanf(size, "%d", &fileSize)

		fileInfo := FileInfo{
			Name:        fileName,
			Type:        fileType,
			Size:        fileSize,
			Permissions: permissions,
			Modified:    fmt.Sprintf("%s %s %s", month, day, timeOrYear),
			Owner:       owner,
			Group:       group,
		}

		response.Files = append(response.Files, fileInfo)
	}

	return response, nil
}

// Close 关闭命令处理器
func (h *SSHCommandHandler) Close() error {
	close(h.responses)
	// 不需要关闭会话，因为使用的是一次性会话
	return nil
}

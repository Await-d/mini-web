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
	session, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("创建SSH会话失败: %w", err)
	}

	// 获取标准输入输出
	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		return nil, fmt.Errorf("获取标准输入管道失败: %w", err)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		return nil, fmt.Errorf("获取标准输出管道失败: %w", err)
	}

	// 启动shell
	if err := session.Shell(); err != nil {
		session.Close()
		return nil, fmt.Errorf("启动shell失败: %w", err)
	}

	handler := &SSHCommandHandler{
		client:    client,
		session:   session,
		stdout:    bufio.NewReader(stdout),
		stdin:     bufio.NewWriter(stdin),
		responses: make(chan *CommandResponse, 10),
	}

	return handler, nil
}

// ExecuteFileListCommand 执行文件列表命令
func (h *SSHCommandHandler) ExecuteFileListCommand(path string) (*FileListResponse, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// 执行ls命令，使用特殊的标记来识别输出
	marker := fmt.Sprintf("___FILE_LIST_START_%d___", time.Now().UnixNano())
	endMarker := fmt.Sprintf("___FILE_LIST_END_%d___", time.Now().UnixNano())

	// 使用更可靠的命令格式
	cmd := fmt.Sprintf("echo '%s' && ls -la '%s' 2>&1 || echo 'ERROR:' $? && echo '%s'", marker, path, endMarker)

	log.Printf("执行文件列表命令: %s", cmd)

	// 发送命令
	if _, err := h.stdin.WriteString(cmd + "\n"); err != nil {
		return nil, fmt.Errorf("发送命令失败: %w", err)
	}
	if err := h.stdin.Flush(); err != nil {
		return nil, fmt.Errorf("刷新输入缓冲失败: %w", err)
	}

	// 读取输出
	var output []string
	inOutput := false
	timeout := time.After(5 * time.Second)

	for {
		select {
		case <-timeout:
			return &FileListResponse{
				Path:  path,
				Error: "命令执行超时",
			}, nil
		default:
			line, err := h.stdout.ReadString('\n')
			if err != nil {
				log.Printf("读取输出错误: %v", err)
				break
			}

			line = strings.TrimSpace(line)

			if strings.Contains(line, marker) {
				inOutput = true
				continue
			}

			if strings.Contains(line, endMarker) {
				break
			}

			if inOutput && line != "" {
				output = append(output, line)
			}
		}

		// 检查是否已经读取到结束标记
		if len(output) > 0 && strings.Contains(output[len(output)-1], endMarker) {
			output = output[:len(output)-1]
			break
		}
	}

	// 解析输出
	return h.parseLsOutput(path, output)
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
	return h.session.Close()
}

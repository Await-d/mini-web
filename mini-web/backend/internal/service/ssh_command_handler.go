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
	Name               string `json:"name"`
	Type               string `json:"type"` // "file" or "directory"
	Size               int64  `json:"size"`
	Permissions        string `json:"permissions"`        // 符号权限 (如 drwxr-xr-x)
	NumericPermissions string `json:"numericPermissions"` // 数字权限 (如 755)
	Modified           string `json:"modified"`
	Owner              string `json:"owner"`
	Group              string `json:"group"`
	Path               string `json:"path"` // 完整路径
}

// FileListResponse 文件列表响应
type FileListResponse struct {
	Path  string     `json:"path"`
	Files []FileInfo `json:"files"`
	Error string     `json:"error,omitempty"`
}

// FileViewResponse 文件查看响应
type FileViewResponse struct {
	FileType string `json:"fileType"`
	Content  string `json:"content"`
	Encoding string `json:"encoding,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
	Error    string `json:"error,omitempty"`
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

	// 使用ls命令获取完整时间格式，优先使用GNU ls的time-style参数
	cmd := fmt.Sprintf("ls -la --time-style='+%%Y-%%m-%%d %%H:%%M:%%S' '%s' 2>/dev/null || ls -la '%s'", path, path)
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
		// 支持两种格式:
		// 1. 新格式: drwxr-xr-x 2 user group 4096 2025-05-23 10:29:03 filename
		// 2. 旧格式: drwxr-xr-x 2 user group 4096 Jan 1 12:00 filename
		parts := strings.Fields(line)
		if len(parts) < 8 {
			continue
		}

		permissions := parts[0]
		owner := parts[2]
		group := parts[3]
		size := parts[4]

		var fullTime string
		var fileName string

		// 检查是否是新的时间格式 (YYYY-MM-DD)
		if len(parts) >= 8 && strings.Contains(parts[5], "-") && len(parts[5]) == 10 {
			// 新格式: 2025-05-23 10:29:03
			date := parts[5] // 2025-05-23
			time := parts[6] // 10:29:03
			fullTime = fmt.Sprintf("%s %s", date, time)
			// 文件名从第7个部分开始
			fileName = strings.Join(parts[7:], " ")
		} else {
			// 旧格式: Jan 1 12:00 或 Jan 1 2023
			if len(parts) < 9 {
				continue
			}
			month := parts[5]
			day := parts[6]
			timeOrYear := parts[7]

			// 尝试转换为标准格式
			if parsedTime := h.convertToStandardTime(month, day, timeOrYear); parsedTime != "" {
				fullTime = parsedTime
			} else {
				fullTime = fmt.Sprintf("%s %s %s", month, day, timeOrYear)
			}
			// 文件名从第8个部分开始
			fileName = strings.Join(parts[8:], " ")
		}

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
			Name:               fileName,
			Type:               fileType,
			Size:               fileSize,
			Permissions:        permissions,
			NumericPermissions: convertPermissionsToNumeric(permissions),
			Modified:           fullTime,
			Owner:              owner,
			Group:              group,
			Path:               path,
		}

		response.Files = append(response.Files, fileInfo)
	}

	return response, nil
}

// convertPermissionsToNumeric 将符号权限转换为数字权限
func convertPermissionsToNumeric(symbolic string) string {
	if len(symbolic) < 10 {
		return "000"
	}

	// 跳过第一个字符（文件类型标识符）
	perms := symbolic[1:]

	result := ""
	for i := 0; i < 9; i += 3 {
		if i+2 >= len(perms) {
			break
		}

		value := 0
		if perms[i] == 'r' {
			value += 4
		}
		if perms[i+1] == 'w' {
			value += 2
		}
		if perms[i+2] == 'x' || perms[i+2] == 's' || perms[i+2] == 't' {
			value += 1
		}

		result += fmt.Sprintf("%d", value)
	}

	return result
}

// convertToStandardTime 将旧的时间格式转换为标准格式
func (h *SSHCommandHandler) convertToStandardTime(month, day, timeOrYear string) string {
	monthMap := map[string]string{
		"Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
		"May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
		"Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
	}

	monthNum, exists := monthMap[month]
	if !exists {
		return ""
	}

	// 补零天数
	if len(day) == 1 {
		day = "0" + day
	}

	// 检查是否包含冒号（时间）还是年份
	if strings.Contains(timeOrYear, ":") {
		// 包含时间，使用当前年份
		currentYear := time.Now().Year()
		return fmt.Sprintf("%d-%s-%s %s:00", currentYear, monthNum, day, timeOrYear)
	} else {
		// 只有年份，使用00:00:00作为时间
		return fmt.Sprintf("%s-%s-%s 00:00:00", timeOrYear, monthNum, day)
	}
}

// ExecuteFileViewCommand 执行文件查看命令
func (h *SSHCommandHandler) ExecuteFileViewCommand(path string, fileType string, maxSize int64) (*FileViewResponse, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行文件查看命令，路径: %s, 文件类型: %s, 最大大小: %d", path, fileType, maxSize)

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return &FileViewResponse{
			FileType: fileType,
			Error:    "无法创建SSH会话",
		}, nil
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 设置默认最大大小 (10MB)
	if maxSize <= 0 {
		maxSize = 10 * 1024 * 1024
	}

	// 首先检查文件是否存在和大小
	checkCmd := fmt.Sprintf("stat -c '%%s' '%s'", path)
	log.Printf("执行文件大小检查命令: %s", checkCmd)

	sizeOutput, err := session.CombinedOutput(checkCmd)
	if err != nil {
		log.Printf("检查文件大小失败: %v", err)
		return &FileViewResponse{
			FileType: fileType,
			Error:    "文件不存在或无法访问",
		}, nil
	}

	// 解析文件大小
	var fileSize int64
	if _, err := fmt.Sscanf(string(sizeOutput), "%d", &fileSize); err != nil {
		log.Printf("解析文件大小失败: %v", err)
		return &FileViewResponse{
			FileType: fileType,
			Error:    "无法获取文件大小",
		}, nil
	}

	log.Printf("文件大小: %d 字节, 最大限制: %d 字节", fileSize, maxSize)

	// 检查文件大小是否超过限制
	if fileSize > maxSize {
		return &FileViewResponse{
			FileType: fileType,
			Error:    fmt.Sprintf("文件过大 (%d 字节)，超过最大限制 (%d 字节)", fileSize, maxSize),
		}, nil
	}

	// 重新创建会话（因为上面的会话已经使用过了）
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return &FileViewResponse{
			FileType: fileType,
			Error:    "无法创建SSH会话",
		}, nil
	}

	// 根据文件类型选择合适的读取命令
	var cmd string
	var encoding string
	var mimeType string

	switch fileType {
	case "text":
		// 文本文件，使用cat命令
		cmd = fmt.Sprintf("cat '%s'", path)
		encoding = "utf-8"
		mimeType = "text/plain"
	case "image":
		// 图片文件，使用base64编码
		cmd = fmt.Sprintf("base64 '%s'", path)
		encoding = "base64"
		// 根据文件扩展名设置MIME类型
		if strings.HasSuffix(strings.ToLower(path), ".png") {
			mimeType = "image/png"
		} else if strings.HasSuffix(strings.ToLower(path), ".jpg") || strings.HasSuffix(strings.ToLower(path), ".jpeg") {
			mimeType = "image/jpeg"
		} else if strings.HasSuffix(strings.ToLower(path), ".gif") {
			mimeType = "image/gif"
		} else if strings.HasSuffix(strings.ToLower(path), ".webp") {
			mimeType = "image/webp"
		} else {
			mimeType = "image/octet-stream"
		}
	default:
		// 其他类型，尝试作为文本读取
		cmd = fmt.Sprintf("cat '%s'", path)
		encoding = "utf-8"
		mimeType = "application/octet-stream"
	}

	log.Printf("执行文件读取命令: %s", cmd)

	// 设置超时
	done := make(chan struct{})
	var output []byte
	var cmdErr error

	go func() {
		defer close(done)
		output, cmdErr = session.CombinedOutput(cmd)
		log.Printf("文件读取命令执行完成，输出长度: %d, 错误: %v", len(output), cmdErr)
	}()

	// 等待命令完成或超时
	select {
	case <-done:
		log.Printf("文件读取命令正常完成")
	case <-time.After(30 * time.Second): // 增加超时时间，因为文件可能较大
		log.Printf("文件读取命令执行超时")
		session.Close()
		return &FileViewResponse{
			FileType: fileType,
			Error:    "文件读取超时",
		}, nil
	}

	if cmdErr != nil {
		log.Printf("执行文件读取命令失败: %v", cmdErr)
		return &FileViewResponse{
			FileType: fileType,
			Error:    fmt.Sprintf("文件读取失败: %v", cmdErr),
		}, nil
	}

	// 检查输出内容
	if len(output) == 0 {
		log.Printf("文件内容为空")
		return &FileViewResponse{
			FileType: fileType,
			Content:  "",
			Encoding: encoding,
			MimeType: mimeType,
		}, nil
	}

	content := string(output)
	log.Printf("成功读取文件内容，长度: %d 字符", len(content))

	return &FileViewResponse{
		FileType: fileType,
		Content:  content,
		Encoding: encoding,
		MimeType: mimeType,
	}, nil
}

// ExecuteFileSaveCommand 执行文件保存命令
func (h *SSHCommandHandler) ExecuteFileSaveCommand(path string, content string, encoding string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行文件保存命令，路径: %s, 内容长度: %d, 编码: %s", path, len(content), encoding)

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 使用cat命令写入文件内容
	// 使用heredoc方式避免特殊字符问题
	cmd := fmt.Sprintf("cat > '%s'", path)
	log.Printf("执行文件保存命令: %s", cmd)

	// 获取stdin
	stdin, err := session.StdinPipe()
	if err != nil {
		log.Printf("获取stdin失败: %v", err)
		return fmt.Errorf("获取stdin失败: %v", err)
	}

	// 设置超时
	done := make(chan error, 1)

	go func() {
		defer close(done)
		defer stdin.Close()

		// 启动命令
		if err := session.Start(cmd); err != nil {
			log.Printf("启动保存命令失败: %v", err)
			done <- fmt.Errorf("启动命令失败: %v", err)
			return
		}

		// 写入内容
		_, err := stdin.Write([]byte(content))
		if err != nil {
			log.Printf("写入文件内容失败: %v", err)
			done <- fmt.Errorf("写入内容失败: %v", err)
			return
		}

		// 关闭stdin触发保存
		stdin.Close()

		// 等待命令完成
		if err := session.Wait(); err != nil {
			log.Printf("保存命令执行失败: %v", err)
			done <- fmt.Errorf("保存失败: %v", err)
			return
		}

		done <- nil
	}()

	// 等待命令完成或超时
	select {
	case err := <-done:
		if err != nil {
			log.Printf("文件保存失败: %v", err)
			return err
		}
		log.Printf("文件保存成功: %s", path)
		return nil
	case <-time.After(30 * time.Second):
		log.Printf("文件保存超时")
		session.Close()
		return fmt.Errorf("文件保存超时")
	}
}

// ExecuteFileCreateCommand 执行文件创建命令
func (h *SSHCommandHandler) ExecuteFileCreateCommand(path string, content string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行文件创建命令，路径: %s, 内容长度: %d", path, len(content))

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 1. 首先检查父目录是否存在，如果不存在则创建
	parentDir := strings.TrimSuffix(path, "/"+path[strings.LastIndex(path, "/")+1:])
	if parentDir != "" && parentDir != path {
		checkParentCmd := fmt.Sprintf("test -d '%s' || mkdir -p '%s'", parentDir, parentDir)
		log.Printf("检查并创建父目录: %s", checkParentCmd)

		parentOutput, err := session.CombinedOutput(checkParentCmd)
		if err != nil {
			log.Printf("创建父目录失败: %v, 输出: %s", err, string(parentOutput))
			return fmt.Errorf("无法创建父目录: %v", err)
		}
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 2. 检查文件是否已存在
	checkCmd := fmt.Sprintf("test -e '%s' && echo 'exists' || echo 'not_exists'", path)
	checkOutput, err := session.CombinedOutput(checkCmd)
	if err != nil {
		log.Printf("检查文件是否存在失败: %v", err)
		return fmt.Errorf("检查文件失败: %v", err)
	}

	if strings.TrimSpace(string(checkOutput)) == "exists" {
		return fmt.Errorf("文件已存在")
	}

	// 重新创建会话（因为上面的会话已经使用过了）
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 3. 检查目标目录的写权限
	targetDir := strings.TrimSuffix(path, "/"+path[strings.LastIndex(path, "/")+1:])
	if targetDir == "" {
		targetDir = "."
	}
	permCmd := fmt.Sprintf("test -w '%s' && echo 'writable' || echo 'not_writable'", targetDir)
	permOutput, err := session.CombinedOutput(permCmd)
	if err != nil {
		log.Printf("检查目录权限失败: %v", err)
		return fmt.Errorf("检查目录权限失败: %v", err)
	}

	if strings.TrimSpace(string(permOutput)) != "writable" {
		log.Printf("目录没有写权限: %s", targetDir)
		return fmt.Errorf("目录没有写权限: %s", targetDir)
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 4. 使用touch命令创建空文件，然后写入内容（如果有）
	var cmd string
	if content == "" {
		// 如果没有内容，直接使用touch创建空文件
		cmd = fmt.Sprintf("touch '%s'", path)
		log.Printf("执行文件创建命令（touch）: %s", cmd)

		output, err := session.CombinedOutput(cmd)
		if err != nil {
			log.Printf("touch命令执行失败: %v, 输出: %s", err, string(output))
			return fmt.Errorf("创建文件失败: %v", err)
		}

		log.Printf("文件创建成功: %s", path)
		return nil
	} else {
		// 如果有内容，使用cat命令写入
		cmd = fmt.Sprintf("cat > '%s'", path)
		log.Printf("执行文件创建命令（cat）: %s", cmd)

		// 获取stdin
		stdin, err := session.StdinPipe()
		if err != nil {
			log.Printf("获取stdin失败: %v", err)
			return fmt.Errorf("获取stdin失败: %v", err)
		}

		// 设置超时
		done := make(chan error, 1)

		go func() {
			defer close(done)
			defer stdin.Close()

			// 启动命令
			if err := session.Start(cmd); err != nil {
				log.Printf("启动创建命令失败: %v", err)
				done <- fmt.Errorf("启动命令失败: %v", err)
				return
			}

			// 写入内容
			_, err := stdin.Write([]byte(content))
			if err != nil {
				log.Printf("写入文件内容失败: %v", err)
				done <- fmt.Errorf("写入内容失败: %v", err)
				return
			}

			// 关闭stdin触发创建
			stdin.Close()

			// 等待命令完成
			if err := session.Wait(); err != nil {
				log.Printf("创建命令执行失败: %v", err)
				done <- fmt.Errorf("创建失败: %v", err)
				return
			}

			done <- nil
		}()

		// 等待命令完成或超时
		select {
		case err := <-done:
			if err != nil {
				log.Printf("文件创建失败: %v", err)
				return err
			}
			log.Printf("文件创建成功: %s", path)
			return nil
		case <-time.After(30 * time.Second):
			log.Printf("文件创建超时")
			session.Close()
			return fmt.Errorf("文件创建超时")
		}
	}
}

// ExecuteFolderCreateCommand 执行文件夹创建命令
func (h *SSHCommandHandler) ExecuteFolderCreateCommand(path string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行文件夹创建命令，路径: %s", path)

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 1. 首先检查文件夹是否已存在
	checkCmd := fmt.Sprintf("test -d '%s' && echo 'exists' || echo 'not_exists'", path)
	checkOutput, err := session.CombinedOutput(checkCmd)
	if err != nil {
		log.Printf("检查文件夹是否存在失败: %v", err)
		return fmt.Errorf("检查文件夹失败: %v", err)
	}

	if strings.TrimSpace(string(checkOutput)) == "exists" {
		log.Printf("文件夹已存在: %s", path)
		return fmt.Errorf("文件夹已存在")
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 2. 检查父目录的写权限
	parentDir := strings.TrimSuffix(path, "/"+path[strings.LastIndex(path, "/")+1:])
	if parentDir == "" {
		parentDir = "."
	}
	permCmd := fmt.Sprintf("test -w '%s' && echo 'writable' || echo 'not_writable'", parentDir)
	permOutput, err := session.CombinedOutput(permCmd)
	if err != nil {
		log.Printf("检查父目录权限失败: %v", err)
		return fmt.Errorf("检查父目录权限失败: %v", err)
	}

	if strings.TrimSpace(string(permOutput)) != "writable" {
		log.Printf("父目录没有写权限: %s", parentDir)
		return fmt.Errorf("父目录没有写权限: %s", parentDir)
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 3. 使用mkdir命令创建文件夹，-p参数确保父目录存在
	cmd := fmt.Sprintf("mkdir -p '%s'", path)
	log.Printf("执行文件夹创建命令: %s", cmd)

	// 设置超时
	done := make(chan error, 1)

	go func() {
		defer close(done)
		output, err := session.CombinedOutput(cmd)
		if err != nil {
			log.Printf("创建文件夹命令执行失败: %v, 输出: %s", err, string(output))
			// 检查是否是因为文件夹已存在（虽然前面已经检查过，但可能有竞态条件）
			if strings.Contains(string(output), "File exists") || strings.Contains(string(output), "already exists") {
				done <- fmt.Errorf("文件夹已存在")
			} else if strings.Contains(string(output), "Permission denied") {
				done <- fmt.Errorf("权限被拒绝")
			} else if strings.Contains(string(output), "No space left") {
				done <- fmt.Errorf("磁盘空间不足")
			} else {
				done <- fmt.Errorf("创建失败: %s", string(output))
			}
			return
		}
		log.Printf("文件夹创建命令执行完成")
		done <- nil
	}()

	// 等待命令完成或超时
	select {
	case err := <-done:
		if err != nil {
			log.Printf("文件夹创建失败: %v", err)
			return err
		}
		log.Printf("文件夹创建成功: %s", path)
		return nil
	case <-time.After(15 * time.Second):
		log.Printf("文件夹创建超时")
		session.Close()
		return fmt.Errorf("文件夹创建超时")
	}
}

// ExecuteFileUploadCommand 执行文件上传命令
func (h *SSHCommandHandler) ExecuteFileUploadCommand(path string, content []byte, fileName string, totalSize int64, chunkIndex int, totalChunks int) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行文件上传命令，路径: %s, 文件名: %s, 分片: %d/%d, 当前分片大小: %d, 总大小: %d",
		path, fileName, chunkIndex+1, totalChunks, len(content), totalSize)

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 构建完整的文件路径
	fullPath := path
	if !strings.HasSuffix(path, "/") {
		fullPath = path + "/"
	}
	fullPath = fullPath + fileName

	// 如果是第一个分片，检查并创建父目录，检查文件是否已存在
	if chunkIndex == 0 {
		// 1. 检查并创建父目录
		parentDir := strings.TrimSuffix(fullPath, "/"+fileName)
		if parentDir != "" {
			checkParentCmd := fmt.Sprintf("test -d '%s' || mkdir -p '%s'", parentDir, parentDir)
			log.Printf("检查并创建父目录: %s", checkParentCmd)

			parentOutput, err := session.CombinedOutput(checkParentCmd)
			if err != nil {
				log.Printf("创建父目录失败: %v, 输出: %s", err, string(parentOutput))
				return fmt.Errorf("无法创建父目录: %v", err)
			}
		}

		// 重新创建会话
		session.Close()
		session, err = h.client.NewSession()
		if err != nil {
			log.Printf("重新创建SSH会话失败: %v", err)
			return fmt.Errorf("无法创建SSH会话: %v", err)
		}

		// 2. 检查文件是否已存在
		checkCmd := fmt.Sprintf("test -e '%s' && echo 'exists' || echo 'not_exists'", fullPath)
		checkOutput, err := session.CombinedOutput(checkCmd)
		if err != nil {
			log.Printf("检查文件是否存在失败: %v", err)
			return fmt.Errorf("检查文件失败: %v", err)
		}

		if strings.TrimSpace(string(checkOutput)) == "exists" {
			return fmt.Errorf("文件已存在: %s", fileName)
		}

		// 重新创建会话
		session.Close()
		session, err = h.client.NewSession()
		if err != nil {
			log.Printf("重新创建SSH会话失败: %v", err)
			return fmt.Errorf("无法创建SSH会话: %v", err)
		}

		// 3. 检查目录权限
		targetDir := strings.TrimSuffix(fullPath, "/"+fileName)
		if targetDir == "" {
			targetDir = "."
		}
		permCmd := fmt.Sprintf("test -w '%s' && echo 'writable' || echo 'not_writable'", targetDir)
		permOutput, err := session.CombinedOutput(permCmd)
		if err != nil {
			log.Printf("检查目录权限失败: %v", err)
			return fmt.Errorf("检查目录权限失败: %v", err)
		}

		if strings.TrimSpace(string(permOutput)) != "writable" {
			log.Printf("目录没有写权限: %s", targetDir)
			return fmt.Errorf("目录没有写权限: %s", targetDir)
		}

		// 重新创建会话
		session.Close()
		session, err = h.client.NewSession()
		if err != nil {
			log.Printf("重新创建SSH会话失败: %v", err)
			return fmt.Errorf("无法创建SSH会话: %v", err)
		}
	}

	// 4. 写入文件内容
	var cmd string
	if chunkIndex == 0 {
		// 第一个分片，创建新文件
		cmd = fmt.Sprintf("cat > '%s'", fullPath)
	} else {
		// 后续分片，追加到文件
		cmd = fmt.Sprintf("cat >> '%s'", fullPath)
	}

	log.Printf("执行文件上传命令: %s", cmd)

	// 获取stdin
	stdin, err := session.StdinPipe()
	if err != nil {
		log.Printf("获取stdin失败: %v", err)
		return fmt.Errorf("获取stdin失败: %v", err)
	}

	// 设置超时
	done := make(chan error, 1)

	go func() {
		defer close(done)
		defer stdin.Close()

		// 启动命令
		if err := session.Start(cmd); err != nil {
			log.Printf("启动上传命令失败: %v", err)
			done <- fmt.Errorf("启动命令失败: %v", err)
			return
		}

		// 写入分片内容
		_, err := stdin.Write(content)
		if err != nil {
			log.Printf("写入文件分片失败: %v", err)
			done <- fmt.Errorf("写入分片失败: %v", err)
			return
		}

		// 关闭stdin
		stdin.Close()

		// 等待命令完成
		if err := session.Wait(); err != nil {
			log.Printf("上传命令执行失败: %v", err)
			done <- fmt.Errorf("上传失败: %v", err)
			return
		}

		done <- nil
	}()

	// 等待命令完成或超时
	select {
	case err := <-done:
		if err != nil {
			log.Printf("文件分片上传失败: %v", err)
			return err
		}
		log.Printf("文件分片上传成功: %s (分片 %d/%d)", fullPath, chunkIndex+1, totalChunks)
		return nil
	case <-time.After(60 * time.Second): // 上传可能需要更长时间
		log.Printf("文件上传超时")
		session.Close()
		return fmt.Errorf("文件上传超时")
	}
}

// ExecuteFileDeleteCommand 执行文件/目录删除命令
func (h *SSHCommandHandler) ExecuteFileDeleteCommand(path string, isDirectory bool) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行删除命令，路径: %s, 是否为目录: %v", path, isDirectory)

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 1. 首先检查文件/目录是否存在
	var checkCmd string
	if isDirectory {
		checkCmd = fmt.Sprintf("test -d '%s' && echo 'exists' || echo 'not_exists'", path)
	} else {
		checkCmd = fmt.Sprintf("test -f '%s' && echo 'exists' || echo 'not_exists'", path)
	}

	checkOutput, err := session.CombinedOutput(checkCmd)
	if err != nil {
		log.Printf("检查文件/目录是否存在失败: %v", err)
		return fmt.Errorf("检查文件/目录失败: %v", err)
	}

	if strings.TrimSpace(string(checkOutput)) != "exists" {
		log.Printf("文件/目录不存在: %s", path)
		return fmt.Errorf("文件/目录不存在")
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 2. 检查父目录的写权限
	parentDir := strings.TrimSuffix(path, "/"+path[strings.LastIndex(path, "/")+1:])
	if parentDir == "" || parentDir == path {
		parentDir = "."
	}
	permCmd := fmt.Sprintf("test -w '%s' && echo 'writable' || echo 'not_writable'", parentDir)
	permOutput, err := session.CombinedOutput(permCmd)
	if err != nil {
		log.Printf("检查父目录权限失败: %v", err)
		return fmt.Errorf("检查父目录权限失败: %v", err)
	}

	if strings.TrimSpace(string(permOutput)) != "writable" {
		log.Printf("父目录没有写权限: %s", parentDir)
		return fmt.Errorf("父目录没有写权限")
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 3. 构建删除命令
	var cmd string
	if isDirectory {
		// 删除目录（递归删除）
		// 首先尝试使用Unix/Linux标准命令
		cmd = fmt.Sprintf("rm -rf '%s' 2>/dev/null || rmdir /S /Q \"%s\" 2>/dev/null || Remove-Item -Path '%s' -Recurse -Force 2>/dev/null", path, path, path)
	} else {
		// 删除文件
		// 首先尝试使用Unix/Linux标准命令，然后尝试Windows命令
		cmd = fmt.Sprintf("rm -f '%s' 2>/dev/null || del /F /Q \"%s\" 2>/dev/null || Remove-Item -Path '%s' -Force 2>/dev/null", path, path, path)
	}

	log.Printf("执行删除命令: %s", cmd)

	// 设置超时
	done := make(chan error, 1)

	go func() {
		defer close(done)
		output, err := session.CombinedOutput(cmd)
		if err != nil {
			log.Printf("删除命令执行失败: %v, 输出: %s", err, string(output))
			// 检查具体错误类型
			if strings.Contains(string(output), "Permission denied") || strings.Contains(string(output), "Access is denied") {
				done <- fmt.Errorf("权限被拒绝")
			} else if strings.Contains(string(output), "No such file or directory") || strings.Contains(string(output), "cannot find") {
				done <- fmt.Errorf("文件/目录不存在")
			} else if strings.Contains(string(output), "Directory not empty") {
				done <- fmt.Errorf("目录不为空")
			} else if strings.Contains(string(output), "Operation not permitted") {
				done <- fmt.Errorf("操作不被允许")
			} else {
				done <- fmt.Errorf("删除失败: %s", string(output))
			}
			return
		}
		log.Printf("删除命令执行完成")
		done <- nil
	}()

	// 等待命令完成或超时
	select {
	case err := <-done:
		if err != nil {
			log.Printf("删除失败: %v", err)
			return err
		}
		log.Printf("删除成功: %s", path)
		return nil
	case <-time.After(30 * time.Second):
		log.Printf("删除操作超时")
		session.Close()
		return fmt.Errorf("删除操作超时")
	}
}

// ExecuteFileRenameCommand 执行文件/目录重命名命令
func (h *SSHCommandHandler) ExecuteFileRenameCommand(oldPath string, newPath string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行重命名命令，原路径: %s, 新路径: %s", oldPath, newPath)

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 1. 检查源文件/目录是否存在
	checkCmd := fmt.Sprintf("test -e '%s' && echo 'exists' || echo 'not_exists'", oldPath)
	checkOutput, err := session.CombinedOutput(checkCmd)
	if err != nil {
		log.Printf("检查源文件/目录是否存在失败: %v", err)
		return fmt.Errorf("检查源文件/目录失败: %v", err)
	}

	if strings.TrimSpace(string(checkOutput)) != "exists" {
		log.Printf("源文件/目录不存在: %s", oldPath)
		return fmt.Errorf("源文件/目录不存在")
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 2. 检查目标文件/目录是否已存在
	targetCheckCmd := fmt.Sprintf("test -e '%s' && echo 'exists' || echo 'not_exists'", newPath)
	targetCheckOutput, err := session.CombinedOutput(targetCheckCmd)
	if err != nil {
		log.Printf("检查目标文件/目录是否存在失败: %v", err)
		return fmt.Errorf("检查目标文件/目录失败: %v", err)
	}

	if strings.TrimSpace(string(targetCheckOutput)) == "exists" {
		log.Printf("目标文件/目录已存在: %s", newPath)
		return fmt.Errorf("目标文件/目录已存在")
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 3. 检查源路径的父目录写权限
	oldParentDir := strings.TrimSuffix(oldPath, "/"+oldPath[strings.LastIndex(oldPath, "/")+1:])
	if oldParentDir == "" || oldParentDir == oldPath {
		oldParentDir = "."
	}

	// 4. 检查目标路径的父目录写权限
	newParentDir := strings.TrimSuffix(newPath, "/"+newPath[strings.LastIndex(newPath, "/")+1:])
	if newParentDir == "" || newParentDir == newPath {
		newParentDir = "."
	}

	// 检查权限的命令
	permCmd := fmt.Sprintf("test -w '%s' && test -w '%s' && echo 'writable' || echo 'not_writable'", oldParentDir, newParentDir)
	permOutput, err := session.CombinedOutput(permCmd)
	if err != nil {
		log.Printf("检查目录权限失败: %v", err)
		return fmt.Errorf("检查目录权限失败: %v", err)
	}

	if strings.TrimSpace(string(permOutput)) != "writable" {
		log.Printf("源目录或目标目录没有写权限")
		return fmt.Errorf("源目录或目标目录没有写权限")
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}

	// 5. 执行重命名命令
	// 使用多种命令兼容不同系统：Unix/Linux (mv)、Windows CMD (ren/move)、PowerShell (Rename-Item/Move-Item)
	cmd := fmt.Sprintf("mv '%s' '%s' 2>/dev/null || move \"%s\" \"%s\" 2>/dev/null || ren \"%s\" \"%s\" 2>/dev/null || Rename-Item -Path '%s' -NewName '%s' 2>/dev/null || Move-Item -Path '%s' -Destination '%s' 2>/dev/null", oldPath, newPath, oldPath, newPath, oldPath, newPath, oldPath, newPath, oldPath, newPath)
	log.Printf("执行重命名命令: %s", cmd)

	// 设置超时
	done := make(chan error, 1)

	go func() {
		defer close(done)
		output, err := session.CombinedOutput(cmd)
		if err != nil {
			log.Printf("重命名命令执行失败: %v, 输出: %s", err, string(output))
			// 检查具体错误类型（兼容Unix/Linux和Windows错误消息）
			if strings.Contains(string(output), "Permission denied") || strings.Contains(string(output), "Access is denied") {
				done <- fmt.Errorf("权限被拒绝")
			} else if strings.Contains(string(output), "No such file or directory") || strings.Contains(string(output), "cannot find") || strings.Contains(string(output), "The system cannot find") {
				done <- fmt.Errorf("文件/目录不存在")
			} else if strings.Contains(string(output), "File exists") || strings.Contains(string(output), "already exists") || strings.Contains(string(output), "A duplicate file name exists") {
				done <- fmt.Errorf("目标文件/目录已存在")
			} else if strings.Contains(string(output), "Cross-device link") {
				// 跨设备移动，需要使用 cp + rm
				done <- fmt.Errorf("跨设备重命名，请使用复制然后删除")
			} else if strings.Contains(string(output), "Operation not permitted") || strings.Contains(string(output), "Access is denied") {
				done <- fmt.Errorf("操作不被允许")
			} else {
				done <- fmt.Errorf("重命名失败: %s", string(output))
			}
			return
		}
		log.Printf("重命名命令执行完成")
		done <- nil
	}()

	// 等待命令完成或超时
	select {
	case err := <-done:
		if err != nil {
			log.Printf("重命名失败: %v", err)
			return err
		}
		log.Printf("重命名成功: %s -> %s", oldPath, newPath)
		return nil
	case <-time.After(30 * time.Second):
		log.Printf("重命名操作超时")
		session.Close()
		return fmt.Errorf("重命名操作超时")
	}
}

// ExecuteFilePermissionsCommand 执行文件权限修改命令
func (h *SSHCommandHandler) ExecuteFilePermissionsCommand(path string, permissions string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	log.Printf("开始执行权限修改命令，路径: %s, 权限: %s", path, permissions)

	// 验证权限格式
	if len(permissions) != 3 {
		return fmt.Errorf("权限格式错误，应为3位数字（如755）")
	}

	// 验证每个数字都在0-7范围内
	for _, char := range permissions {
		if char < '0' || char > '7' {
			return fmt.Errorf("权限数字必须在0-7之间")
		}
	}

	// 创建一次性会话
	session, err := h.client.NewSession()
	if err != nil {
		log.Printf("创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}
	defer func() {
		log.Printf("关闭SSH会话")
		session.Close()
	}()

	// 1. 首先检查文件是否存在
	checkCmd := fmt.Sprintf("test -e '%s' && echo 'exists' || echo 'not_exists'", path)
	checkOutput, err := session.CombinedOutput(checkCmd)
	if err != nil {
		log.Printf("检查文件是否存在失败: %v", err)
		return fmt.Errorf("无法检查文件状态")
	}

	if strings.TrimSpace(string(checkOutput)) != "exists" {
		log.Printf("文件不存在: %s", path)
		return fmt.Errorf("文件或目录不存在")
	}

	// 重新创建会话
	session.Close()
	session, err = h.client.NewSession()
	if err != nil {
		log.Printf("重新创建SSH会话失败: %v", err)
		return fmt.Errorf("无法创建SSH会话: %v", err)
	}
	defer session.Close()

	// 2. 执行权限修改命令
	// 使用多种命令兼容不同系统：Unix/Linux (chmod)、Windows (可能不支持)
	cmd := fmt.Sprintf("chmod %s '%s' 2>/dev/null", permissions, path)
	log.Printf("执行权限修改命令: %s", cmd)

	done := make(chan error, 1)
	var output []byte

	go func() {
		defer close(done)
		var cmdErr error
		output, cmdErr = session.CombinedOutput(cmd)
		log.Printf("权限修改命令执行完成，输出: %s, 错误: %v", string(output), cmdErr)

		if cmdErr != nil {
			log.Printf("权限修改命令执行失败: %v, 输出: %s", cmdErr, string(output))
			// 检查具体错误类型
			if strings.Contains(string(output), "Permission denied") {
				done <- fmt.Errorf("权限被拒绝：您没有修改此文件权限的权限")
			} else if strings.Contains(string(output), "No such file or directory") {
				done <- fmt.Errorf("文件或目录不存在")
			} else if strings.Contains(string(output), "Operation not permitted") {
				done <- fmt.Errorf("操作不被允许：可能是系统文件或只读文件系统")
			} else if strings.Contains(string(output), "chmod: command not found") || strings.Contains(string(output), "is not recognized") {
				done <- fmt.Errorf("系统不支持chmod命令（可能是Windows系统）")
			} else {
				done <- fmt.Errorf("权限修改失败: %s", string(output))
			}
		} else {
			log.Printf("权限修改成功")
			done <- nil
		}
	}()

	// 等待命令完成或超时
	select {
	case err := <-done:
		return err
	case <-time.After(15 * time.Second):
		log.Printf("权限修改命令执行超时")
		session.Close()
		return fmt.Errorf("权限修改操作超时")
	}
}

// Close 关闭命令处理器
func (h *SSHCommandHandler) Close() error {
	close(h.responses)
	// 不需要关闭会话，因为使用的是一次性会话
	return nil
}

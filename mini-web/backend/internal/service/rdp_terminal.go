package service

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

// RDPTerminalSession 实现RDP终端会话
type RDPTerminalSession struct {
	conn        net.Conn
	reader      *io.PipeReader
	writer      *io.PipeWriter
	model       *model.Connection
	stopChan    chan struct{}
	closedChan  chan struct{}
	closeOnce   sync.Once
	mutex       sync.Mutex
	width       int
	height      int
	lastUpdate  time.Time
	connected   bool
	sessionInfo string
	// 真实RDP连接相关
	rdpCmd         *exec.Cmd
	rdpStdin       io.WriteCloser
	rdpStdout      io.ReadCloser
	rdpStderr      io.ReadCloser
	screenshotPath string
	cmdMutex       sync.Mutex
}

// 创建RDP终端会话
func createRDPTerminalSession(conn *model.Connection) (*RDPTerminalSession, error) {
	// 先尝试TCP连接到RDP服务器验证可达性
	addr := net.JoinHostPort(conn.Host, strconv.Itoa(conn.Port))
	log.Printf("尝试连接RDP服务器: %s", addr)
	tcpConn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		log.Printf("连接RDP服务器失败: %v", err)
		return nil, fmt.Errorf("连接RDP服务器失败: %w", err)
	}
	log.Printf("已成功连接到RDP服务器: %s", addr)
	defer tcpConn.Close() // 我们只是测试连接，不需要保持这个TCP连接

	// 创建数据传输管道
	reader, writer := io.Pipe()

	// 尝试创建临时目录用于存储屏幕截图
	var tempDir string
	var screenshotPath string

	tempDir, err = os.MkdirTemp("", "rdp_screenshots")
	if err != nil {
		log.Printf("创建临时目录失败: %v，使用备用目录", err)
		// 使用备用目录
		tempDir = filepath.Join(os.TempDir(), "rdp_screenshots")
		if err := os.MkdirAll(tempDir, 0755); err != nil {
			log.Printf("创建备用目录也失败: %v，使用当前目录", err)
			// 使用当前目录
			tempDir = "."
		}
	}

	// 使用连接ID创建唯一的截图文件名
	screenshotPath = filepath.Join(tempDir, fmt.Sprintf("screenshot_%d.png", conn.ID))
	log.Printf("屏幕截图将保存到: %s", screenshotPath)

	// 确保截图文件可写
	file, err := os.Create(screenshotPath)
	if err != nil {
		log.Printf("创建截图文件失败: %v", err)
	} else {
		file.Close()
		log.Printf("成功创建初始截图文件")
	}

	// 创建终端会话
	stopChan := make(chan struct{})
	closedChan := make(chan struct{})

	session := &RDPTerminalSession{
		reader:         reader,
		writer:         writer,
		model:          conn,
		stopChan:       stopChan,
		closedChan:     closedChan,
		width:          1024,
		height:         768,
		lastUpdate:     time.Now(),
		connected:      false, // 初始设为未连接，等RDP真正连上后再设为true
		sessionInfo:    fmt.Sprintf("%s@%s:%d", conn.Username, conn.Host, conn.Port),
		screenshotPath: screenshotPath,
	}

	log.Printf("RDP会话对象已创建，准备初始化真实RDP连接")

	// 启动处理协程
	go session.handleRDPEvents()

	log.Printf("RDP终端会话已创建并初始化完成")
	return session, nil
}

// 处理RDP事件
func (r *RDPTerminalSession) handleRDPEvents() {
	defer close(r.closedChan)

	log.Printf("启动RDP事件处理循环，准备连接到真实RDP服务器")

	// 给读取协程更多时间来启动
	time.Sleep(300 * time.Millisecond)

	// 发送连接中消息
	r.mutex.Lock()
	if _, err := r.writer.Write([]byte("RDP_NOTICE:正在连接到RDP服务器...")); err != nil {
		log.Printf("发送RDP连接通知失败: %v", err)
		r.mutex.Unlock()
		return
	}
	r.mutex.Unlock()

	// 初始化真实RDP连接
	if err := r.initRealRDPConnection(); err != nil {
		log.Printf("初始化真实RDP连接失败: %v", err)
		// 发送错误消息
		r.mutex.Lock()
		r.writer.Write([]byte(fmt.Sprintf("RDP_ERROR:无法连接到RDP服务器: %v", err)))
		r.mutex.Unlock()
		return
	}

	// 发送连接成功消息
	r.mutex.Lock()
	r.connected = true
	if _, err := r.writer.Write([]byte("RDP_CONNECTED")); err != nil {
		log.Printf("发送RDP连接成功消息失败: %v", err)
		r.mutex.Unlock()
		return
	} else {
		log.Printf("已发送RDP连接成功消息")
	}
	r.mutex.Unlock()

	// 设置定时器，定期发送保持活跃消息
	keepAliveTicker := time.NewTicker(30 * time.Second)
	defer keepAliveTicker.Stop()

	// 初始截图频率 - 对无界面环境进行优化
	isHeadless := os.Getenv("HEADLESS") == "true" || os.Getenv("DOCKER") == "true" || os.Getenv("CONTAINER") == "true"
	initialInterval := 1 * time.Second
	if isHeadless {
		// 无界面环境下降低刷新频率以减少资源消耗
		initialInterval = 3 * time.Second
	}

	// 设置截图定时器，初始化为较高频率
	screenshotTicker := time.NewTicker(initialInterval)
	defer screenshotTicker.Stop()

	// 发送连接信息
	r.mutex.Lock()
	connectionInfo := fmt.Sprintf("RDP_INFO:已连接到 %s:%d [用户: %s]",
		r.model.Host, r.model.Port, r.model.Username)
	_, err := r.writer.Write([]byte(connectionInfo))
	r.mutex.Unlock()

	if err != nil {
		log.Printf("发送RDP连接信息失败: %v", err)
		return
	}

	// 延迟一段时间让RDP连接稳定
	time.Sleep(1 * time.Second)

	// 首次获取屏幕截图
	if err := r.captureAndSendScreenshot(); err != nil {
		log.Printf("首次获取屏幕截图失败: %v", err)
	}

	log.Printf("RDP事件循环已启动，开始定期获取屏幕截图")

	// 计数器，用于控制屏幕截图频率
	counter := 0
	// 连续失败计数器
	failureCount := 0
	// 最大允许的连续失败次数
	maxFailures := 5

	for {
		select {
		case <-r.stopChan:
			log.Printf("收到RDP会话停止信号，停止RDP客户端并退出事件循环")
			r.stopRDPClient()
			return

		case <-keepAliveTicker.C:
			// 发送保持活跃的消息
			r.mutex.Lock()
			_, err := r.writer.Write([]byte("RDP_KEEP_ALIVE"))
			r.mutex.Unlock()

			if err != nil {
				log.Printf("发送RDP保活消息失败: %v", err)
				failureCount++
			} else {
				// 成功发送消息，重置失败计数
				failureCount = 0
			}

		case <-screenshotTicker.C:
			counter++

			// 根据计数器调整截图频率 - 考虑无界面环境
			if counter == 10 && !isHeadless {
				// 10秒后将频率降低到每2秒一次(仅适用于有界面环境)
				screenshotTicker.Reset(2 * time.Second)
				log.Printf("调整屏幕截图频率为每2秒一次")
			} else if counter == 30 {
				// 30秒后将频率降低到每3秒一次(所有环境)
				screenshotTicker.Reset(3 * time.Second)
				log.Printf("调整屏幕截图频率为每3秒一次")
			} else if counter == 60 && isHeadless {
				// 60秒后无界面环境进一步降低到每5秒一次
				screenshotTicker.Reset(5 * time.Second)
				log.Printf("无界面环境：调整屏幕截图频率为每5秒一次")
			}

			// 获取屏幕截图并发送
			if err := r.captureAndSendScreenshot(); err != nil {
				failureCount++
				log.Printf("获取屏幕截图失败 (%d/%d): %v", failureCount, maxFailures, err)

				// 如果连续失败次数超过阈值，尝试重连
				if failureCount >= maxFailures {
					log.Printf("连续截图失败 %d 次，尝试重新连接", failureCount)
					r.mutex.Lock()
					r.connected = false
					r.mutex.Unlock()

					// 尝试重新初始化连接
					r.stopRDPClient()
					if err := r.initRealRDPConnection(); err != nil {
						log.Printf("重新初始化RDP连接失败: %v", err)
						r.writer.Write([]byte(fmt.Sprintf("RDP_ERROR:重新连接失败: %v", err)))
					} else {
						r.mutex.Lock()
						r.connected = true
						r.writer.Write([]byte("RDP_NOTICE:RDP连接已恢复"))
						r.mutex.Unlock()
						// 重置失败计数
						failureCount = 0
					}
				}
			} else {
				// 成功获取截图，重置失败计数
				failureCount = 0
			}
		}
	}
}

// 初始化真实RDP连接
func (r *RDPTerminalSession) initRealRDPConnection() error {
	r.cmdMutex.Lock()
	defer r.cmdMutex.Unlock()

	// 如果已有正在运行的RDP客户端，先停止它
	if r.rdpCmd != nil && r.rdpCmd.Process != nil {
		log.Printf("停止现有RDP客户端进程")
		r.stopRDPClient()
	}

	// 确保截图目录存在
	screenshotDir := filepath.Dir(r.screenshotPath)
	if _, err := os.Stat(screenshotDir); os.IsNotExist(err) {
		log.Printf("创建屏幕截图目录: %s", screenshotDir)
		if err := os.MkdirAll(screenshotDir, 0755); err != nil {
			return fmt.Errorf("创建屏幕截图目录失败: %w", err)
		}
	}

	// 确保截图路径是可写的
	if file, err := os.Create(r.screenshotPath); err != nil {
		return fmt.Errorf("无法创建屏幕截图文件: %w", err)
	} else {
		file.Close()
		log.Printf("成功创建测试截图文件: %s", r.screenshotPath)
	}

	// 使用FreeRDP命令行工具（确保已安装）
	// 从环境变量获取FreeRDP路径，如果没有指定，使用默认路径
	freerdpPath := os.Getenv("FREERDP_PATH")
	if freerdpPath == "" {
		// 尝试一些常见的路径
		possiblePaths := []string{
			"xfreerdp",
			"wfreerdp",
			"/usr/bin/xfreerdp",
			"/usr/local/bin/xfreerdp",
			"C:\\Program Files\\FreeRDP\\wfreerdp.exe",
			"C:\\Program Files (x86)\\FreeRDP\\wfreerdp.exe",
		}

		for _, path := range possiblePaths {
			if _, err := exec.LookPath(path); err == nil {
				freerdpPath = path
				break
			}
		}

		if freerdpPath == "" {
			// 如果找不到FreeRDP，使用虚拟会话模式
			log.Printf("系统中未找到FreeRDP客户端，使用虚拟RDP会话模式")
			// 创建一个占位图像，模拟RDP屏幕
			if err := r.createPlaceholderScreenshot(r.width, r.height); err != nil {
				log.Printf("创建占位图像失败: %v", err)
				if err := r.createEmptyScreenshot(); err != nil {
					log.Printf("创建空白图像也失败: %v", err)
				}
			}
			// 虚拟会话不需要实际的RDP进程
			return nil
		}
	}

	log.Printf("使用RDP客户端: %s", freerdpPath)

	// 检查是否在Docker/无界面环境中
	isHeadless := os.Getenv("HEADLESS") == "true" || os.Getenv("DOCKER") == "true" || os.Getenv("CONTAINER") == "true"
	if isHeadless {
		log.Printf("检测到无界面环境，RDP会使用虚拟会话模式")
		// 在无界面环境中，创建占位图像并返回
		if err := r.createPlaceholderScreenshot(r.width, r.height); err != nil {
			log.Printf("创建占位图像失败: %v", err)
			if err := r.createEmptyScreenshot(); err != nil {
				log.Printf("创建空白图像也失败: %v", err)
			}
		}
		// 虚拟会话不需要实际的RDP进程
		return nil
	}

	// 构建RDP连接参数
	args := []string{
		fmt.Sprintf("/v:%s:%d", r.model.Host, r.model.Port),
		fmt.Sprintf("/u:%s", r.model.Username),
	}

	// 添加密码（如果有）
	if r.model.Password != "" {
		args = append(args, fmt.Sprintf("/p:%s", r.model.Password))
	}

	// 添加其他RDP参数 - 移除不支持的参数
	args = append(args, []string{
		"/cert-ignore",                      // 忽略证书警告
		"/audio-mode:0",                     // 禁用音频
		fmt.Sprintf("/w:%d", r.width),       // 设置宽度
		fmt.Sprintf("/h:%d", r.height),      // 设置高度
		"/bitmap-cache:off",                 // 禁用位图缓存提高刷新率
		"/compression-level:2",              // 优化压缩级别
		fmt.Sprintf("/jpeg-quality:%d", 80), // 设置JPEG质量
		"/auto-reconnect",                   // 自动重连
		"/reconnect-cookie:mini-web",        // 重连cookie
		"/clipboard",                        // 启用剪贴板
		"/log-level:INFO",                   // 设置日志级别
	}...)

	// 根据当前版本检查并添加特定参数
	versionOutput, err := exec.Command(freerdpPath, "--version").Output()
	if err == nil {
		versionStr := string(versionOutput)
		// 检查是否为较新版本FreeRDP
		if strings.Contains(versionStr, "2.") {
			// FreeRDP 2.x具有一些额外的功能
			args = append(args, "/disp", "/rfx") // 添加显示设置和RemoteFX编码
		}
	}

	log.Printf("启动RDP客户端，连接到 %s:%d，用户名: %s", r.model.Host, r.model.Port, r.model.Username)

	// 创建命令
	cmd := exec.Command(freerdpPath, args...)

	// 获取标准输入/输出管道
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("无法创建RDP标准输入管道: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("无法创建RDP标准输出管道: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("无法创建RDP标准错误管道: %w", err)
	}

	// 开始执行命令
	if err := cmd.Start(); err != nil {
		log.Printf("启动RDP客户端失败: %v", err)

		// 如果启动失败，创建占位图像
		if err := r.createPlaceholderScreenshot(r.width, r.height); err != nil {
			log.Printf("创建占位图像失败: %v", err)
			if err := r.createEmptyScreenshot(); err != nil {
				log.Printf("创建空白图像也失败: %v", err)
			}
		}

		return fmt.Errorf("启动RDP客户端失败: %w", err)
	}

	// 保存命令和管道引用
	r.rdpCmd = cmd
	r.rdpStdin = stdin
	r.rdpStdout = stdout
	r.rdpStderr = stderr

	// 启动一个goroutine来读取stderr并记录日志
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			log.Printf("RDP客户端错误输出: %s", line)

			// 检查是否有截图相关的错误
			if strings.Contains(line, "screenshot") || strings.Contains(line, "image") {
				log.Printf("检测到可能的截图问题: %s", line)
			}
		}
	}()

	// 启动一个goroutine来读取stdout并记录日志
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			log.Printf("RDP客户端标准输出: %s", line)

			// 当客户端连接成功时通常会有输出
			if strings.Contains(line, "connected") {
				// 尝试获取初始截图
				go r.captureAndSendScreenshot()
			}
		}
	}()

	// 启动一个goroutine等待命令结束
	go func() {
		err := cmd.Wait()
		log.Printf("RDP客户端进程已结束: %v", err)

		// 通知主协程RDP客户端已断开
		r.mutex.Lock()
		r.connected = false
		r.mutex.Unlock()

		// 发送错误通知
		if err != nil {
			r.mutex.Lock()
			r.writer.Write([]byte(fmt.Sprintf("RDP_ERROR:RDP客户端异常终止: %v", err)))
			r.mutex.Unlock()
		} else {
			r.mutex.Lock()
			r.writer.Write([]byte("RDP_ERROR:RDP连接已关闭"))
			r.mutex.Unlock()
		}
	}()

	log.Printf("RDP客户端启动成功，PID: %d", cmd.Process.Pid)

	// 延迟稍等，确保进程稳定运行
	time.Sleep(500 * time.Millisecond)

	return nil
}

// 停止RDP客户端
func (r *RDPTerminalSession) stopRDPClient() {
	r.cmdMutex.Lock()
	defer r.cmdMutex.Unlock()

	if r.rdpCmd != nil && r.rdpCmd.Process != nil {
		log.Printf("正在停止RDP客户端进程 (PID: %d)", r.rdpCmd.Process.Pid)

		// 关闭标准输入/输出管道
		if r.rdpStdin != nil {
			r.rdpStdin.Close()
			r.rdpStdin = nil
		}

		if r.rdpStdout != nil {
			// 不需要显式关闭，因为这是由命令自己关闭的
			r.rdpStdout = nil
		}

		if r.rdpStderr != nil {
			// 不需要显式关闭，因为这是由命令自己关闭的
			r.rdpStderr = nil
		}

		// 尝试优雅地终止进程
		if err := r.rdpCmd.Process.Signal(os.Interrupt); err != nil {
			log.Printf("发送中断信号失败: %v，尝试强制终止", err)
			r.rdpCmd.Process.Kill()
		}

		// 等待进程结束
		r.rdpCmd.Wait()
		r.rdpCmd = nil

		log.Printf("RDP客户端进程已停止")
	}
}

// 捕获并发送屏幕截图
func (r *RDPTerminalSession) captureAndSendScreenshot() error {
	r.mutex.Lock()
	width := r.width
	height := r.height
	r.lastUpdate = time.Now()
	r.mutex.Unlock()

	// 检查RDP客户端是否正在运行
	if r.rdpCmd == nil || r.rdpCmd.Process == nil {
		log.Printf("RDP客户端未运行，创建占位图像")
		// 尝试创建占位图像
		if err := r.createPlaceholderScreenshot(width, height); err != nil {
			log.Printf("创建占位图像失败: %v", err)
			if err := r.createEmptyScreenshot(); err != nil {
				return fmt.Errorf("无法创建任何类型的屏幕图像: %w", err)
			}
		}
	}

	// 1. 尝试使用headless模式捕获屏幕内容
	// 先确保截图目录存在
	dir := filepath.Dir(r.screenshotPath)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Printf("无法创建屏幕截图目录: %v，尝试使用系统临时目录", err)
			// 尝试使用系统临时目录
			r.screenshotPath = filepath.Join(os.TempDir(), fmt.Sprintf("rdp_screenshot_%d.png", r.model.ID))
			dir = filepath.Dir(r.screenshotPath)
			if err := os.MkdirAll(dir, 0755); err != nil {
				log.Printf("无法创建系统临时目录: %v", err)
				return fmt.Errorf("无法创建任何截图目录: %w", err)
			}
		}
	}

	// 尝试使用系统截图工具（考虑无界面环境）
	screenshotCaptured := false

	// 检查是否在Docker/无界面环境中
	isHeadless := os.Getenv("HEADLESS") == "true" || os.Getenv("DOCKER") == "true" || os.Getenv("CONTAINER") == "true"

	if !isHeadless {
		// 如果有界面环境，尝试使用多种工具获取截图
		screenshotTools := []struct {
			name    string
			command string
			args    []string
		}{
			{"scrot", "scrot", []string{"-u", "-z", "-o", r.screenshotPath}},
			{"import", "import", []string{"-window", "root", r.screenshotPath}},
			{"gnome-screenshot", "gnome-screenshot", []string{"-f", r.screenshotPath}},
		}

		for _, tool := range screenshotTools {
			// 检查工具是否存在
			if _, err := exec.LookPath(tool.command); err != nil {
				continue // 工具不存在，跳过
			}

			log.Printf("尝试使用 %s 捕获屏幕截图", tool.name)
			captureCmd := exec.Command(tool.command, tool.args...)

			// 执行截图命令
			if err := captureCmd.Run(); err != nil {
				log.Printf("使用 %s 截图失败: %v", tool.name, err)
				continue // 尝试下一个工具
			}

			// 检查文件是否实际创建
			if fileInfo, err := os.Stat(r.screenshotPath); err != nil || fileInfo.Size() == 0 {
				log.Printf("使用 %s 创建的截图文件无效: %v", tool.name, err)
				continue // 尝试下一个工具
			}

			log.Printf("成功使用 %s 捕获屏幕截图", tool.name)
			screenshotCaptured = true
			break
		}
	}

	// 如果未能通过外部工具捕获屏幕，检查是否存在现有截图文件
	if !screenshotCaptured {
		// 检查现有文件是否有效
		fileOk := false
		if fileInfo, err := os.Stat(r.screenshotPath); err == nil && fileInfo.Size() > 0 {
			// 文件存在且大小大于0
			fileOk = true
			log.Printf("使用现有截图文件: %s (大小: %d 字节)", r.screenshotPath, fileInfo.Size())
		}

		if !fileOk {
			log.Printf("未能捕获屏幕截图并且现有文件无效，创建占位图像")
			// 创建有用的占位图像
			if err := r.createPlaceholderScreenshot(width, height); err != nil {
				log.Printf("创建占位图像失败: %v", err)
				// 如果创建占位图像也失败，尝试最简单的空白图像
				if err := r.createEmptyScreenshot(); err != nil {
					return fmt.Errorf("无法获取屏幕截图且无法创建替代图像: %w", err)
				}
			}
		}
	}

	// 读取屏幕截图文件
	imgFile, err := os.ReadFile(r.screenshotPath)
	if err != nil {
		log.Printf("读取屏幕截图文件失败: %v", err)
		// 尝试创建更有信息的占位图像
		if err := r.createPlaceholderScreenshot(width, height); err != nil {
			log.Printf("创建占位图像失败，尝试空白图像: %v", err)
			if err := r.createEmptyScreenshot(); err != nil {
				return fmt.Errorf("所有屏幕截图尝试都失败: %w", err)
			}
		}
		// 重新读取
		imgFile, err = os.ReadFile(r.screenshotPath)
		if err != nil {
			return fmt.Errorf("读取屏幕截图文件失败: %w", err)
		}
	}

	// 验证图像数据有效性
	if len(imgFile) < 10 || len(imgFile) > 20*1024*1024 {
		log.Printf("图像数据异常 (大小: %d 字节)，创建占位图像", len(imgFile))
		if err := r.createPlaceholderScreenshot(width, height); err != nil {
			log.Printf("创建占位图像失败: %v", err)
			if err := r.createEmptyScreenshot(); err != nil {
				return fmt.Errorf("无法创建任何类型的图像: %w", err)
			}
		}
		// 重新读取图像
		imgFile, err = os.ReadFile(r.screenshotPath)
		if err != nil {
			return fmt.Errorf("读取创建的占位图像失败: %w", err)
		}
	}

	// 对图像进行Base64编码
	base64Image := base64.StdEncoding.EncodeToString(imgFile)

	// 验证Base64编码后的数据
	if len(base64Image) < 10 {
		log.Printf("警告: Base64编码后数据异常短 (%d 字符)", len(base64Image))
		// 创建一个简单的1x1图像的base64编码作为后备
		base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC"
	}

	// 构建消息 - 确保格式与前端解析逻辑匹配
	messageFormat := fmt.Sprintf("RDP_SCREENSHOT:%d:%d:%s", width, height, base64Image)

	// 检查消息长度
	if len(messageFormat) > 1024*1024*20 {
		log.Printf("警告：消息过大 (%d MB)，可能导致传输问题", len(messageFormat)/(1024*1024))
	} else {
		log.Printf("消息长度正常 (%d KB)", len(messageFormat)/1024)
	}

	// 记录发送前的消息摘要
	log.Printf("准备发送RDP截图消息: 'RDP_SCREENSHOT:%d:%d:[base64数据(%d字符)]'",
		width, height, len(base64Image))
	log.Printf("Base64数据前20字符: %s...", base64Image[:min(20, len(base64Image))])

	// 发送屏幕截图
	r.mutex.Lock()
	n, err := r.writer.Write([]byte(messageFormat))
	r.mutex.Unlock()

	if err != nil {
		return fmt.Errorf("发送屏幕截图失败: %w", err)
	}

	log.Printf("成功发送RDP屏幕截图: 写入 %d/%d 字节, 数据长度: %d 字节, Base64长度: %d 字符",
		n, len(messageFormat), len(imgFile), len(base64Image))
	return nil
}

// 创建带有会话信息的占位截图
func (r *RDPTerminalSession) createPlaceholderScreenshot(width, height int) error {
	log.Printf("创建RDP占位截图 (宽度: %d, 高度: %d)", width, height)

	// 如果宽度和高度太小，设置最小值
	if width < 320 {
		width = 320
	}
	if height < 240 {
		height = 240
	}

	// 确保目录存在
	dir := filepath.Dir(r.screenshotPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建截图目录失败: %w", err)
	}

	// 简单的PNG占位图像 - 在真实项目中可以使用更复杂的图像生成库
	// 这里使用一个简单的1x1 PNG，后续可以扩展为使用imaging等库生成更好的占位图像
	emptyImageData := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
		0x0A, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x60, 0x00, 0x00, 0x00,
		0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49,
		0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
	}

	// 写入占位图像文件
	if err := os.WriteFile(r.screenshotPath, emptyImageData, 0644); err != nil {
		return fmt.Errorf("创建占位图像失败: %w", err)
	}

	log.Printf("创建了RDP会话占位截图 (%s@%s:%d): %s",
		r.model.Username, r.model.Host, r.model.Port, r.screenshotPath)
	return nil
}

// 创建空白屏幕截图
func (r *RDPTerminalSession) createEmptyScreenshot() error {
	log.Printf("创建空白RDP截图")

	// 创建一个简单的1x1空白PNG图像
	emptyImageData := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
		0x0A, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
		0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
	}

	// 确保目录存在
	dir := filepath.Dir(r.screenshotPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建截图目录失败: %w", err)
	}

	// 写入空白图像文件
	if err := os.WriteFile(r.screenshotPath, emptyImageData, 0644); err != nil {
		return fmt.Errorf("创建空白图像失败: %w", err)
	}

	log.Printf("创建了空白屏幕截图: %s", r.screenshotPath)
	return nil
}

// Read 实现io.Reader接口
func (r *RDPTerminalSession) Read(p []byte) (int, error) {
	return r.reader.Read(p)
}

// Write 实现io.Writer接口，将客户端消息发送到RDP服务器
func (r *RDPTerminalSession) Write(p []byte) (int, error) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	if len(p) < 1 {
		return 0, nil
	}

	// 如果收到的是JSON消息，尝试解析
	if p[0] == '{' {
		var msg map[string]interface{}
		if err := json.Unmarshal(p, &msg); err == nil {
			// 处理JSON命令
			log.Printf("收到RDP客户端JSON命令: %s", string(p))

			if msgType, ok := msg["type"].(string); ok {
				switch msgType {
				case "init":
					log.Printf("收到RDP初始化请求")
					// 立即获取并发送一次截图
					go r.captureAndSendScreenshot()
					return len(p), nil

				case "screenshot", "refresh":
					log.Printf("收到RDP屏幕截图/刷新请求")
					// 立即获取并发送一次截图
					go r.captureAndSendScreenshot()
					return len(p), nil

				case "resize":
					// 处理调整大小请求
					width, _ := msg["width"].(float64)
					height, _ := msg["height"].(float64)
					if width > 0 && height > 0 {
						r.width = int(width)
						r.height = int(height)
						log.Printf("调整RDP屏幕尺寸为: %dx%d", r.width, r.height)

						// 重新初始化RDP连接以应用新的尺寸
						go func() {
							r.stopRDPClient()
							if err := r.initRealRDPConnection(); err != nil {
								log.Printf("调整尺寸后重新连接失败: %v", err)
								r.writer.Write([]byte(fmt.Sprintf("RDP_ERROR:调整尺寸后重新连接失败: %v", err)))
							}
						}()
					}
					return len(p), nil
				}
			}
		}
	}

	// 处理二进制消息
	if len(p) >= 1 {
		switch p[0] {
		case 1: // 键盘事件
			if len(p) >= 4 {
				isDown := p[1] != 0
				keyCode := uint16(p[2])<<8 | uint16(p[3])

				// 记录键盘事件
				log.Printf("RDP键盘事件: 键码=%d, 按下=%v", keyCode, isDown)

				// 将键盘事件发送到RDP客户端
				// 这里需要根据RDP客户端的实际接口来实现
				if r.rdpStdin != nil {
					// 示例：将键盘事件转换为RDP客户端可理解的格式
					keyEvent := fmt.Sprintf("key:%d:%v\n", keyCode, isDown)
					r.rdpStdin.Write([]byte(keyEvent))
				}

				// 通知前端键盘事件已处理
				r.writer.Write([]byte(fmt.Sprintf("RDP_KEY:%d:%v", keyCode, isDown)))

				// 稍后更新屏幕截图以反映键盘操作的结果
				go func() {
					time.Sleep(200 * time.Millisecond)
					r.captureAndSendScreenshot()
				}()
			}

		case 2: // 鼠标事件
			if len(p) >= 6 {
				x := uint16(p[1])<<8 | uint16(p[2])
				y := uint16(p[3])<<8 | uint16(p[4])
				buttonMask := p[5]

				// 记录鼠标事件
				log.Printf("RDP鼠标事件: 坐标=(%d,%d), 按钮=%d", x, y, buttonMask)

				// 将鼠标事件发送到RDP客户端
				// 这里需要根据RDP客户端的实际接口来实现
				if r.rdpStdin != nil {
					// 示例：将鼠标事件转换为RDP客户端可理解的格式
					mouseEvent := fmt.Sprintf("mouse:%d:%d:%d\n", x, y, buttonMask)
					r.rdpStdin.Write([]byte(mouseEvent))
				}

				// 通知前端鼠标事件已处理
				r.writer.Write([]byte(fmt.Sprintf("RDP_MOUSE:%d:%d:%d", x, y, buttonMask)))

				// 稍后更新屏幕截图以反映鼠标操作的结果
				go func() {
					time.Sleep(200 * time.Millisecond)
					r.captureAndSendScreenshot()
				}()
			}

		case 3: // 屏幕截图请求
			log.Printf("收到RDP屏幕刷新请求")
			// 立即获取并发送一次截图
			go r.captureAndSendScreenshot()
		}
	}

	// 处理纯文本命令
	if len(p) >= 7 {
		// 检查是否为刷新命令
		if string(p) == "refresh" || string(p) == "RDP_COMMAND:refresh" {
			log.Printf("收到纯文本刷新命令: %s", string(p))
			go r.captureAndSendScreenshot()
			return len(p), nil
		}
	}

	return len(p), nil
}

// Close 关闭RDP会话
func (r *RDPTerminalSession) Close() error {
	var err error

	// 使用sync.Once确保只执行一次关闭操作
	r.closeOnce.Do(func() {
		log.Printf("关闭RDP终端会话")

		// 发送关闭信号
		close(r.stopChan)

		// 等待处理协程结束
		select {
		case <-r.closedChan:
			log.Printf("RDP处理协程已正常结束")
		case <-time.After(5 * time.Second):
			log.Printf("等待RDP处理协程超时")
		}

		// 停止RDP客户端进程
		r.stopRDPClient()

		// 关闭数据管道
		r.writer.Close()
		r.reader.Close()

		// 清理屏幕截图文件
		if r.screenshotPath != "" {
			if _, fileErr := os.Stat(r.screenshotPath); fileErr == nil {
				if removeErr := os.Remove(r.screenshotPath); removeErr != nil {
					log.Printf("移除屏幕截图文件失败: %v", removeErr)
				} else {
					log.Printf("成功移除屏幕截图文件: %s", r.screenshotPath)
				}
			}

			// 尝试删除截图目录（仅当是临时目录时）
			screenshotDir := filepath.Dir(r.screenshotPath)
			if strings.Contains(screenshotDir, "rdp_screenshots") {
				if removeErr := os.RemoveAll(screenshotDir); removeErr != nil {
					log.Printf("移除屏幕截图目录失败: %v", removeErr)
				} else {
					log.Printf("成功移除屏幕截图目录: %s", screenshotDir)
				}
			}
		}

		log.Printf("RDP终端会话已关闭")
	})

	return err
}

// WindowResize 调整终端窗口大小
func (r *RDPTerminalSession) WindowResize(rows, cols uint16) error {
	// 记录新尺寸
	r.mutex.Lock()

	// 更新窗口尺寸
	oldWidth := r.width
	oldHeight := r.height
	r.width = int(cols)
	r.height = int(rows)

	// 只有当尺寸真正改变时才重新初始化RDP连接
	sizeChanged := (oldWidth != r.width || oldHeight != r.height)

	// 发送调整大小响应
	r.writer.Write([]byte(fmt.Sprintf("RDP_RESIZE:%d:%d", cols, rows)))

	r.mutex.Unlock()

	// 如果尺寸发生变化，重新初始化RDP连接
	if sizeChanged {
		go func() {
			log.Printf("屏幕尺寸已更改，重新初始化RDP连接...")
			r.stopRDPClient()
			if err := r.initRealRDPConnection(); err != nil {
				log.Printf("调整尺寸后重新连接失败: %v", err)
				r.writer.Write([]byte(fmt.Sprintf("RDP_ERROR:调整尺寸后重新连接失败: %v", err)))
			}
		}()
	}

	return nil
}

// 辅助函数：返回两个整数中的较小值
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

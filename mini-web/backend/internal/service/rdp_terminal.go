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
	conn           net.Conn
	reader         *io.PipeReader
	writer         *io.PipeWriter
	model          *model.Connection
	stopChan       chan struct{}
	closedChan     chan struct{}
	closeOnce      sync.Once
	mutex          sync.Mutex
	width          int
	height         int
	lastUpdate     time.Time
	connected      bool
	sessionInfo    string
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

	// 创建临时目录用于存储屏幕截图
	tempDir, err := os.MkdirTemp("", "rdp_screenshots")
	if err != nil {
		log.Printf("创建临时目录失败: %v", err)
		return nil, fmt.Errorf("创建临时目录失败: %w", err)
	}
	
	screenshotPath := filepath.Join(tempDir, "screenshot.png")
	log.Printf("屏幕截图将保存到: %s", screenshotPath)

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

	// 设置截图定时器
	screenshotTicker := time.NewTicker(1 * time.Second) // 初始频率更快以获得更好的用户体验
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
	time.Sleep(2 * time.Second)

	// 首次获取屏幕截图
	if err := r.captureAndSendScreenshot(); err != nil {
		log.Printf("首次获取屏幕截图失败: %v", err)
	}

	log.Printf("RDP事件循环已启动，开始定期获取屏幕截图")
	
	// 计数器，用于控制屏幕截图频率
	counter := 0
	
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
			}
			
		case <-screenshotTicker.C:
			counter++
			
			// 根据计数器调整截图频率
			if counter == 10 {
				// 10秒后将频率降低到每2秒一次
				screenshotTicker.Reset(2 * time.Second)
				log.Printf("调整屏幕截图频率为每2秒一次")
			} else if counter == 30 {
				// 30秒后将频率降低到每3秒一次
				screenshotTicker.Reset(3 * time.Second)
				log.Printf("调整屏幕截图频率为每3秒一次")
			}
			
			// 获取屏幕截图并发送
			if err := r.captureAndSendScreenshot(); err != nil {
				log.Printf("获取屏幕截图失败: %v", err)
				
				// 如果连续失败多次，可能RDP连接已断开，尝试重连
				if strings.Contains(err.Error(), "连接断开") || strings.Contains(err.Error(), "没有运行") {
					log.Printf("检测到RDP连接可能已断开，尝试重新连接")
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
					}
				}
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
	
	// 使用FreeRDP命令行工具（确保已安装）
	// 从环境变量获取FreeRDP路径，如果没有指定，使用默认路径
	freerdpPath := os.Getenv("FREERDP_PATH")
	if freerdpPath == "" {
		// 尝试一些常见的路径
		possiblePaths := []string{
			"xfreerdp",
			"freerdp-shadow-cli",
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
			return fmt.Errorf("未找到FreeRDP客户端，请安装FreeRDP或设置FREERDP_PATH环境变量")
		}
	}
	
	log.Printf("使用RDP客户端: %s", freerdpPath)

	// 构建RDP连接参数
	args := []string{
		fmt.Sprintf("/v:%s:%d", r.model.Host, r.model.Port),
		fmt.Sprintf("/u:%s", r.model.Username),
	}
	
	// 添加密码（如果有）
	if r.model.Password != "" {
		args = append(args, fmt.Sprintf("/p:%s", r.model.Password))
	}
	
	// 添加其他RDP参数
	args = append(args, []string{
		"/cert-ignore",            // 忽略证书警告
		"/audio-mode:0",           // 禁用音频
		fmt.Sprintf("/w:%d", r.width),  // 设置宽度
		fmt.Sprintf("/h:%d", r.height), // 设置高度
		"/bitmap-cache:off",       // 禁用位图缓存提高刷新率
		"/compression-level:2",    // 优化压缩级别
		fmt.Sprintf("/jpeg-quality:%d", 80), // 设置JPEG质量
		fmt.Sprintf("/o:%s", r.screenshotPath), // 屏幕截图输出路径
	}...)
	
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
			log.Printf("RDP客户端错误输出: %s", scanner.Text())
		}
	}()
	
	// 启动一个goroutine来读取stdout并记录日志
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			log.Printf("RDP客户端标准输出: %s", scanner.Text())
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
			r.writer.Write([]byte(fmt.Sprintf("RDP_ERROR:RDP客户端异常终止: %v", err)))
		} else {
			r.writer.Write([]byte("RDP_ERROR:RDP连接已关闭"))
		}
	}()
	
	log.Printf("RDP客户端启动成功，PID: %d", cmd.Process.Pid)
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
		return fmt.Errorf("RDP客户端没有运行")
	}
	
	// 1. 捕获当前屏幕截图
	// 这里假设FreeRDP已经将截图保存到指定路径
	// 我们只需要检查文件是否存在并读取它
	
	// 检查文件是否存在
	if _, err := os.Stat(r.screenshotPath); os.IsNotExist(err) {
		// 如果文件不存在，尝试发送指令让FreeRDP截图
		log.Printf("屏幕截图文件不存在，尝试发送截图指令...")
		
		// 这里可能需要发送特定指令给FreeRDP客户端触发截图
		// 由于不同RDP客户端可能有不同方式，这里只是一个示例
		if r.rdpStdin != nil {
			if _, err := r.rdpStdin.Write([]byte("screendump\n")); err != nil {
				log.Printf("发送截图指令失败: %v", err)
			}
		}
		
		// 等待一段时间让截图生成
		time.Sleep(500 * time.Millisecond)
		
		// 再次检查文件是否存在
		if _, err := os.Stat(r.screenshotPath); os.IsNotExist(err) {
			return fmt.Errorf("无法获取屏幕截图: 文件不存在")
		}
	}
	
	// 读取屏幕截图文件
	imgFile, err := os.ReadFile(r.screenshotPath)
	if err != nil {
		return fmt.Errorf("读取屏幕截图文件失败: %w", err)
	}
	
	// 对图像进行Base64编码
	base64Image := base64.StdEncoding.EncodeToString(imgFile)
	
	// 构建消息
	messageFormat := fmt.Sprintf("RDP_SCREENSHOT:%d:%d:%s", width, height, base64Image)
	
	// 发送屏幕截图
	r.mutex.Lock()
	_, err = r.writer.Write([]byte(messageFormat))
	r.mutex.Unlock()
	
	if err != nil {
		return fmt.Errorf("发送屏幕截图失败: %w", err)
	}
	
	log.Printf("成功获取并发送RDP屏幕截图 (%d字节)", len(messageFormat))
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
					
				case "screenshot":
					log.Printf("收到RDP屏幕截图请求")
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

	return len(p), nil
}

// Close 关闭RDP会话
func (r *RDPTerminalSession) Close() error {
	r.closeOnce.Do(func() {
		// 发送停止信号
		close(r.stopChan)

		// 等待处理goroutine结束
		<-r.closedChan

		// 停止RDP客户端
		r.stopRDPClient()

		// 关闭管道
		r.reader.Close()
		r.writer.Close()

		// 删除临时文件和目录
		if r.screenshotPath != "" {
			os.Remove(r.screenshotPath)
			os.RemoveAll(filepath.Dir(r.screenshotPath))
		}
	})

	return nil
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
package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"log"
	"net"
	"strconv"
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
}

// 创建RDP终端会话
func createRDPTerminalSession(conn *model.Connection) (*RDPTerminalSession, error) {
	// 先尝试TCP连接到RDP服务器
	addr := net.JoinHostPort(conn.Host, strconv.Itoa(conn.Port))
	log.Printf("尝试连接RDP服务器: %s", addr)
	tcpConn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		log.Printf("连接RDP服务器失败: %v", err)
		return nil, fmt.Errorf("连接RDP服务器失败: %w", err)
	}
	log.Printf("已成功连接到RDP服务器: %s", addr)

	// 创建数据传输管道
	reader, writer := io.Pipe()

	// 创建终端会话
	stopChan := make(chan struct{})
	closedChan := make(chan struct{})

	session := &RDPTerminalSession{
		conn:        tcpConn,
		reader:      reader,
		writer:      writer,
		model:       conn,
		stopChan:    stopChan,
		closedChan:  closedChan,
		width:       1024,
		height:      768,
		lastUpdate:  time.Now(),
		connected:   true,
		sessionInfo: fmt.Sprintf("%s@%s:%d", conn.Username, conn.Host, conn.Port),
	}

	log.Printf("RDP会话对象已创建，准备初始化")

	// 不在此处发送初始消息，改为在handleRDPEvents中发送

	// 启动处理协程
	go session.handleRDPEvents()

	log.Printf("RDP终端会话已创建并初始化完成")
	return session, nil
}

// 处理RDP事件
func (r *RDPTerminalSession) handleRDPEvents() {
	defer close(r.closedChan)
	
	log.Printf("启动RDP事件处理循环，准备发送初始消息")

	// 给读取协程更多时间来启动
	time.Sleep(300 * time.Millisecond)

	// 发送连接成功消息
	r.mutex.Lock()
	if _, err := r.writer.Write([]byte("RDP_CONNECTED")); err != nil {
		log.Printf("发送RDP连接成功消息失败: %v", err)
		r.mutex.Unlock()
		return // 如果发送失败，直接返回，避免后续操作
	} else {
		log.Printf("已发送RDP连接成功消息")
	}
	r.mutex.Unlock()

	// 较长延迟，确保上一条消息被处理
	time.Sleep(200 * time.Millisecond)

	// 发送连接信息
	r.mutex.Lock()
	connInfo := fmt.Sprintf("RDP_INFO:%s:%d:%s", r.model.Host, r.model.Port, r.model.Username)
	if _, err := r.writer.Write([]byte(connInfo)); err != nil {
		log.Printf("发送RDP连接信息失败: %v", err)
		r.mutex.Unlock()
		return // 如果发送失败，直接返回，避免后续操作
	} else {
		log.Printf("已发送RDP连接信息: %s", connInfo)
	}
	r.mutex.Unlock()

	// 设置定时器，定期发送保持活跃消息
	keepAliveTicker := time.NewTicker(30 * time.Second)
	defer keepAliveTicker.Stop()

	// 设置截图定时器，初始设置为较慢的更新频率
	screenshotTicker := time.NewTicker(5 * time.Second) // 降低初始频率减少管道阻塞风险
	defer screenshotTicker.Stop()

	// 快速初始化阶段的计数器
	initPhaseCounter := 0

	// 延迟一段时间后再发送第一个屏幕截图
	time.Sleep(800 * time.Millisecond)

	// 发送连接信息
	r.mutex.Lock()
	connectionInfo := fmt.Sprintf("RDP_INFO:连接到 %s:%d [用户: %s]",
		r.model.Host, r.model.Port, r.model.Username)
	_, err := r.writer.Write([]byte(connectionInfo))
	r.mutex.Unlock()
	
	if err != nil {
		log.Printf("发送RDP连接信息失败: %v", err)
		return // 添加失败检查
	} else {
		log.Printf("已发送RDP连接信息: %s", connectionInfo)
	}

	// 再次延迟，确保上一条消息被处理
	time.Sleep(200 * time.Millisecond)

	// 发送通知，告知客户端RDP后端实现状态
	r.mutex.Lock()
	noticeMsg := "RDP_NOTICE:RDP远程桌面会话已建立。正在等待屏幕数据..."
	_, err = r.writer.Write([]byte(noticeMsg))
	r.mutex.Unlock()
	
	if err != nil {
		log.Printf("发送RDP通知失败: %v", err)
		return // 添加失败检查
	} else {
		log.Printf("已发送RDP通知: %s", noticeMsg)
	}

	// 再次延迟，确保上一条消息被处理
	time.Sleep(500 * time.Millisecond)

	// 启动时立即发送一次初始屏幕截图
	log.Printf("发送初始RDP屏幕截图")
	r.sendDummyScreenshot() // 直接调用，不使用goroutine

	log.Printf("RDP事件循环已启动，开始监听事件")
	
	for {
		select {
		case <-r.stopChan:
			log.Printf("收到RDP会话停止信号，退出事件循环")
			return
		case <-keepAliveTicker.C:
			// 发送保持活跃的消息
			r.mutex.Lock()
			_, err := r.writer.Write([]byte("RDP_KEEP_ALIVE"))
			r.mutex.Unlock()
			
			if err != nil {
				log.Printf("发送RDP保活消息失败: %v", err)
				// 不返回，继续尝试其他操作
			} else {
				log.Printf("已发送RDP保活消息")
			}
		case <-screenshotTicker.C:
			// 初始化阶段结束后，调整屏幕更新频率
			if initPhaseCounter < 10 {
				initPhaseCounter++
				if initPhaseCounter == 10 {
					// 调整为更慢的更新频率
					screenshotTicker.Reset(10 * time.Second) // 进一步降低频率
					log.Printf("初始化阶段结束，调整屏幕更新频率为10秒一次")
				}
			}
			
			// 定期发送屏幕截图
			timeSinceUpdate := time.Since(r.lastUpdate)
			if timeSinceUpdate >= 2*time.Second { // 增加最小间隔到2秒
				log.Printf("定时更新RDP屏幕截图 (距上次更新: %.2f秒)", timeSinceUpdate.Seconds())
				r.sendDummyScreenshot() // 直接调用，不使用goroutine
			}
		}
	}
}

// sendDummyScreenshot 发送模拟的屏幕截图
func (r *RDPTerminalSession) sendDummyScreenshot() {
	// 检查是否应该跳过本次更新
	r.mutex.Lock()
	if time.Since(r.lastUpdate) < 500*time.Millisecond {
		r.mutex.Unlock()
		log.Printf("跳过本次屏幕截图，距上次更新时间太短")
		return
	}
	
	// 获取所需数据后立即释放锁，避免长时间持有
	width := r.width
	height := r.height
	// 标记更新时间提前，避免其他请求重复发送
	r.lastUpdate = time.Now()
	r.mutex.Unlock()
	
	log.Printf("正在生成RDP模拟屏幕截图: 宽度=%d, 高度=%d", width, height)
	
	// 在锁外执行耗时操作
	img := r.createDummyScreenImage()
	
	// 将图像编码为PNG，使用最快的压缩
	var buf bytes.Buffer
	enc := &png.Encoder{
		CompressionLevel: png.BestSpeed,
	}
	if err := enc.Encode(&buf, img); err != nil {
		log.Printf("PNG编码失败: %v", err)
		return
	}
	
	// Base64编码
	base64Image := base64.StdEncoding.EncodeToString(buf.Bytes())
	
	// 记录数据大小
	log.Printf("PNG编码完成，原始大小: %d 字节, Base64编码后: %d 字节", 
		buf.Len(), len(base64Image))
	
	// 构建消息
	messageFormat := fmt.Sprintf("RDP_SCREENSHOT:%d:%d:%s", width, height, base64Image)
	
	log.Printf("发送RDP屏幕截图，消息大小: %d 字节", len(messageFormat))
	
	// 直接写入，不再获取锁
	_, err := r.writer.Write([]byte(messageFormat))
	if err != nil {
		log.Printf("发送RDP屏幕截图失败: %v", err)
	} else {
		log.Printf("RDP屏幕截图已成功发送")
	}
}

// createDummyScreenImage 创建模拟的屏幕图像
func (r *RDPTerminalSession) createDummyScreenImage() image.Image {
	img := image.NewRGBA(image.Rect(0, 0, r.width, r.height))

	// 填充背景色
	bgColor := color.RGBA{0, 120, 215, 255} // Windows蓝色
	for y := 0; y < r.height; y++ {
		for x := 0; x < r.width; x++ {
			img.Set(x, y, bgColor)
		}
	}

	// 绘制简单的Windows桌面模拟界面
	drawDesktopElements(img, r.width, r.height, r.sessionInfo)

	return img
}

// drawDesktopElements 在图像上绘制桌面元素
func drawDesktopElements(img *image.RGBA, width, height int, sessionInfo string) {
	// 绘制任务栏
	taskbarHeight := 40
	taskbarColor := color.RGBA{32, 32, 32, 255}
	for y := height - taskbarHeight; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, taskbarColor)
		}
	}

	// 绘制开始按钮
	startButtonWidth := 50
	startButtonColor := color.RGBA{0, 120, 215, 255}
	for y := height - taskbarHeight; y < height; y++ {
		for x := 0; x < startButtonWidth; x++ {
			img.Set(x, y, startButtonColor)
		}
	}

	// 绘制桌面图标
	iconColor := color.RGBA{255, 255, 255, 255}
	for i := 0; i < 3; i++ {
		iconY := 40 + i*80
		iconX := 40
		for y := iconY; y < iconY+40; y++ {
			for x := iconX; x < iconX+40; x++ {
				if x >= 0 && x < width && y >= 0 && y < height {
					img.Set(x, y, iconColor)
				}
			}
		}
	}

	// 绘制时间
	currentTime := time.Now().Format("15:04")
	drawText(img, width-100, height-taskbarHeight/2, currentTime, color.RGBA{255, 255, 255, 255})

	// 绘制连接信息窗口
	windowX := width / 4
	windowY := height / 4
	windowWidth := width / 2
	windowHeight := height / 3

	// 窗口背景
	windowColor := color.RGBA{240, 240, 240, 255}
	for y := windowY; y < windowY+windowHeight; y++ {
		for x := windowX; x < windowX+windowWidth; x++ {
			img.Set(x, y, windowColor)
		}
	}

	// 窗口标题栏
	titleBarHeight := 30
	titleBarColor := color.RGBA{0, 120, 215, 255}
	for y := windowY; y < windowY+titleBarHeight; y++ {
		for x := windowX; x < windowX+windowWidth; x++ {
			img.Set(x, y, titleBarColor)
		}
	}

	// 标题文本
	drawText(img, windowX+10, windowY+titleBarHeight/2, "远程桌面连接", color.RGBA{255, 255, 255, 255})

	// 连接信息
	drawText(img, windowX+20, windowY+titleBarHeight+30, "连接到: "+sessionInfo, color.RGBA{0, 0, 0, 255})
	drawText(img, windowX+20, windowY+titleBarHeight+60, "状态: 已连接", color.RGBA{0, 128, 0, 255})
	drawText(img, windowX+20, windowY+titleBarHeight+90, "当前时间: "+time.Now().Format("2006-01-02 15:04:05"), color.RGBA{0, 0, 0, 255})
	drawText(img, windowX+20, windowY+titleBarHeight+120, "RDP模拟界面 - 图形化功能开发中", color.RGBA{128, 0, 0, 255})
}

// drawText 在图像上绘制文本（简化实现，实际应使用字体库）
func drawText(img *image.RGBA, x, y int, text string, textColor color.RGBA) {
	// 简化实现，实际应使用字体库渲染文本
	// 这里只是在指定位置绘制一条表示文本的线
	lineLength := len(text) * 6
	for i := 0; i < lineLength; i++ {
		img.Set(x+i, y, textColor)
	}
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
					// 标记需要更新，解锁后异步发送
					r.lastUpdate = time.Now().Add(-2 * time.Second)
					go func() {
						time.Sleep(100 * time.Millisecond)
						r.sendDummyScreenshot()
					}()
					return len(p), nil
					
				case "screenshot":
					log.Printf("收到RDP屏幕截图请求")
					// 标记需要更新，解锁后异步发送
					r.lastUpdate = time.Now().Add(-2 * time.Second)
					go func() {
						time.Sleep(100 * time.Millisecond)
						r.sendDummyScreenshot()
					}()
					return len(p), nil
					
				case "resize":
					// 处理调整大小请求
					width, _ := msg["width"].(float64)
					height, _ := msg["height"].(float64)
					if width > 0 && height > 0 {
						r.width = int(width)
						r.height = int(height)
						log.Printf("调整RDP屏幕尺寸为: %dx%d", r.width, r.height)
						// 标记需要更新，解锁后异步发送
						r.lastUpdate = time.Now().Add(-2 * time.Second)
						go func() {
							time.Sleep(200 * time.Millisecond)
							r.sendDummyScreenshot()
						}()
					}
					return len(p), nil
				}
			}
		}
	}

	// 解析客户端二进制消息
	if len(p) >= 1 {
		switch p[0] {
		case 1: // 键盘事件
			if len(p) >= 4 {
				isDown := p[1] != 0
				keyCode := uint16(p[2])<<8 | uint16(p[3])

				// 记录键盘事件
				log.Printf("RDP键盘事件: 键码=%d, 按下=%v", keyCode, isDown)

				// 发送按键响应
				r.writer.Write([]byte(fmt.Sprintf("RDP_KEY:%d:%v", keyCode, isDown)))

				// 标记需要更新，解锁后异步发送
				r.lastUpdate = time.Now().Add(-2 * time.Second)
				go func() {
					time.Sleep(300 * time.Millisecond)
					r.sendDummyScreenshot()
				}()
			}

		case 2: // 鼠标事件
			if len(p) >= 6 {
				x := uint16(p[1])<<8 | uint16(p[2])
				y := uint16(p[3])<<8 | uint16(p[4])
				buttonMask := p[5]

				// 记录鼠标事件
				log.Printf("RDP鼠标事件: 坐标=(%d,%d), 按钮=%d", x, y, buttonMask)

				// 发送鼠标响应
				r.writer.Write([]byte(fmt.Sprintf("RDP_MOUSE:%d:%d:%d", x, y, buttonMask)))

				// 标记需要更新，解锁后异步发送
				r.lastUpdate = time.Now().Add(-2 * time.Second)
				go func() {
					time.Sleep(300 * time.Millisecond)
					r.sendDummyScreenshot()
				}()
			}

		case 3: // 屏幕截图请求
			log.Printf("收到RDP屏幕刷新请求")
			// 标记需要更新，解锁后异步发送
			r.lastUpdate = time.Now().Add(-2 * time.Second)
			go func() {
				time.Sleep(100 * time.Millisecond)
				r.sendDummyScreenshot()
			}()
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

		// 关闭管道
		r.reader.Close()
		r.writer.Close()

		// 关闭TCP连接
		if r.conn != nil {
			r.conn.Close()
		}
	})

	return nil
}

// WindowResize 调整终端窗口大小
func (r *RDPTerminalSession) WindowResize(rows, cols uint16) error {
	// 记录新尺寸
	r.mutex.Lock()

	// 更新窗口尺寸
	r.width = int(cols)
	r.height = int(rows)

	// 发送调整大小响应
	r.writer.Write([]byte(fmt.Sprintf("RDP_RESIZE:%d:%d", cols, rows)))

	// 触发重新发送屏幕截图
	r.lastUpdate = time.Now().Add(-1 * time.Second)

	r.mutex.Unlock()

	return nil
}

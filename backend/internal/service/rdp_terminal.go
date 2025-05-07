package service

import (
	"bytes"
	"encoding/base64"
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
	tcpConn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return nil, fmt.Errorf("连接RDP服务器失败: %w", err)
	}

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

	// 发送连接成功消息
	writer.Write([]byte("RDP_CONNECTED"))

	// 发送连接信息
	writer.Write([]byte(fmt.Sprintf("RDP_INFO:%s:%d:%d:%s",
		conn.Host, conn.Port, 0, conn.Username)))

	// 启动处理协程
	go session.handleRDPEvents()

	return session, nil
}

// 处理RDP事件
func (r *RDPTerminalSession) handleRDPEvents() {
	defer close(r.closedChan)

	// 设置定时器，定期发送保持活跃消息
	keepAliveTicker := time.NewTicker(30 * time.Second)
	defer keepAliveTicker.Stop()

	// 设置截图定时器
	screenshotTicker := time.NewTicker(1 * time.Second)
	defer screenshotTicker.Stop()

	// 发送连接信息
	r.mutex.Lock()
	r.writer.Write([]byte(fmt.Sprintf("RDP_INFO:连接到 %s:%d [用户: %s]",
		r.model.Host, r.model.Port, r.model.Username)))
	r.mutex.Unlock()

	// 发送模拟通知，告知客户端RDP后端实现处于开发中
	r.mutex.Lock()
	r.writer.Write([]byte("RDP_NOTICE:RDP协议支持正在开发中。目前使用模拟图形界面。"))
	r.mutex.Unlock()

	// 启动时发送一次初始屏幕截图
	r.sendDummyScreenshot()

	for {
		select {
		case <-r.stopChan:
			return
		case <-keepAliveTicker.C:
			// 发送保持活跃的消息
			r.mutex.Lock()
			r.writer.Write([]byte("RDP_KEEP_ALIVE"))
			r.mutex.Unlock()
		case <-screenshotTicker.C:
			// 定期发送屏幕截图
			if time.Since(r.lastUpdate) >= 1*time.Second {
				r.sendDummyScreenshot()
			}
		}
	}
}

// sendDummyScreenshot 发送模拟的屏幕截图
func (r *RDPTerminalSession) sendDummyScreenshot() {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	// 创建模拟屏幕图像
	img := r.createDummyScreenImage()

	// 将图像编码为PNG
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		log.Printf("PNG编码失败: %v", err)
		return
	}

	// Base64编码
	base64Image := base64.StdEncoding.EncodeToString(buf.Bytes())

	// 发送屏幕截图消息
	r.writer.Write([]byte(fmt.Sprintf("RDP_SCREENSHOT:%d:%d:%s", r.width, r.height, base64Image)))

	// 更新时间戳
	r.lastUpdate = time.Now()
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

	// 解析客户端消息
	// 这里是简化的协议处理，实际应用中需要根据前端约定的协议格式
	switch p[0] {
	case 1: // 键盘事件
		if len(p) >= 3 {
			keyCode := uint16(p[1])<<8 | uint16(p[2])
			isDown := len(p) >= 4 && p[3] != 0

			// 仅记录事件，实际RDP实现待开发
			log.Printf("RDP键盘事件: 键码=%d, 按下=%v", keyCode, isDown)

			// 发送按键响应
			r.writer.Write([]byte(fmt.Sprintf("RDP_KEY:%d:%v", keyCode, isDown)))

			// 触发屏幕更新
			r.lastUpdate = time.Now().Add(-1 * time.Second)
		}

	case 2: // 鼠标事件
		if len(p) >= 6 {
			x := uint16(p[1])<<8 | uint16(p[2])
			y := uint16(p[3])<<8 | uint16(p[4])
			buttonMask := p[5]

			// 仅记录事件，实际RDP实现待开发
			log.Printf("RDP鼠标事件: 坐标=(%d,%d), 按钮=%d", x, y, buttonMask)

			// 发送鼠标响应
			r.writer.Write([]byte(fmt.Sprintf("RDP_MOUSE:%d:%d:%d", x, y, buttonMask)))

			// 触发屏幕更新
			r.lastUpdate = time.Now().Add(-1 * time.Second)
		}

	case 3: // 屏幕截图请求
		// 立即发送当前屏幕截图
		go r.sendDummyScreenshot()
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

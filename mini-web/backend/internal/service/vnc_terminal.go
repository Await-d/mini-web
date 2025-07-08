package service

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"io"
	"log"
	"net"
	"strconv"
	"sync"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"github.com/mitchellh/go-vnc"
)

// VNCTerminalSession 实现VNC终端会话
type VNCTerminalSession struct {
	conn       *vnc.ClientConn
	reader     *io.PipeReader
	writer     *io.PipeWriter
	model      *model.Connection
	stopChan   chan struct{}
	closedChan chan struct{}
	closeOnce  sync.Once
	mutex      sync.Mutex
	// 用于存储VNC帧缓冲区的当前状态
	frameBuffer []byte
	width       uint16
	height      uint16
	// 用于存储上一次屏幕快照
	lastScreenshot []byte
	lastUpdateTime time.Time
}

// 创建VNC终端会话
func createVNCTerminalSession(conn *model.Connection) (*VNCTerminalSession, error) {
	// 准备VNC配置
	config := &vnc.ClientConfig{
		Auth: []vnc.ClientAuth{
			&vnc.PasswordAuth{Password: conn.Password},
		},
	}

	// 连接到VNC服务器
	addr := net.JoinHostPort(conn.Host, strconv.Itoa(conn.Port))
	nc, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return nil, fmt.Errorf("连接VNC服务器失败: %w", err)
	}

	// 创建VNC客户端连接
	vncConn, err := vnc.Client(nc, config)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("创建VNC客户端失败: %w", err)
	}

	// 创建管道用于数据传输
	reader, writer := io.Pipe()

	// 创建会话
	stopChan := make(chan struct{})
	closedChan := make(chan struct{})

	// 初始化帧缓冲区
	width := uint16(vncConn.FrameBufferWidth)
	height := uint16(vncConn.FrameBufferHeight)
	bufferSize := int(width) * int(height) * 4 // 假设每像素4字节(RGBA)

	session := &VNCTerminalSession{
		conn:           vncConn,
		reader:         reader,
		writer:         writer,
		model:          conn,
		stopChan:       stopChan,
		closedChan:     closedChan,
		frameBuffer:    make([]byte, bufferSize),
		width:          width,
		height:         height,
		lastScreenshot: nil,
		lastUpdateTime: time.Now(),
	}

	// 启动goroutine处理VNC事件
	go session.handleVNCEvents()

	// 请求完整的帧缓冲区更新
	err = vncConn.FramebufferUpdateRequest(false, 0, 0, width, height)
	if err != nil {
		session.Close()
		return nil, fmt.Errorf("请求帧缓冲区更新失败: %w", err)
	}

	// 发送初始连接信息
	writer.Write([]byte(fmt.Sprintf("VNC_CONNECT:%s:%d:%d", conn.Host, width, height)))

	return session, nil
}

// handleVNCEvents 处理VNC事件
func (v *VNCTerminalSession) handleVNCEvents() {
	defer close(v.closedChan)

	// 设置一个定时器，定期请求帧缓冲区更新
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	// 创建更新屏幕截图的定时器
	screenshotTicker := time.NewTicker(1 * time.Second)
	defer screenshotTicker.Stop()

	for {
		select {
		case <-v.stopChan:
			return
		case <-ticker.C:
			// 定期请求帧缓冲区更新
			err := v.conn.FramebufferUpdateRequest(true, 0, 0, v.width, v.height)
			if err != nil {
				log.Printf("请求VNC帧缓冲区更新失败: %v", err)
				return
			}
		case <-screenshotTicker.C:
			// 定期生成和发送屏幕截图
			v.captureAndSendScreenshot()
		}
	}
}

// captureAndSendScreenshot 捕获并发送屏幕截图
func (v *VNCTerminalSession) captureAndSendScreenshot() {
	v.mutex.Lock()
	defer v.mutex.Unlock()

	// 如果距离上次更新时间太短，跳过
	if time.Since(v.lastUpdateTime) < 500*time.Millisecond {
		return
	}

	// 请求完整帧缓冲区
	err := v.conn.FramebufferUpdateRequest(false, 0, 0, v.width, v.height)
	if err != nil {
		log.Printf("请求VNC完整帧缓冲区失败: %v", err)
		return
	}

	// 创建一个简单的图像
	// 注意：这里只是模拟，实际应该从帧缓冲区生成真实的屏幕截图
	img := image.NewRGBA(image.Rect(0, 0, int(v.width), int(v.height)))
	
	// 将图像编码为PNG
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		log.Printf("PNG编码失败: %v", err)
		return
	}
	
	// 生成base64编码的图像
	base64Img := base64.StdEncoding.EncodeToString(buf.Bytes())
	
	// 发送屏幕截图消息
	message := fmt.Sprintf("VNC_SCREENSHOT:%d:%d:%s", v.width, v.height, base64Img)
	v.writer.Write([]byte(message))
	
	// 更新时间戳
	v.lastUpdateTime = time.Now()
}

// Read 实现io.Reader接口
func (v *VNCTerminalSession) Read(p []byte) (int, error) {
	return v.reader.Read(p)
}

// Write 实现io.Writer接口，将客户端消息发送到VNC服务器
func (v *VNCTerminalSession) Write(p []byte) (int, error) {
	v.mutex.Lock()
	defer v.mutex.Unlock()

	if len(p) < 1 {
		return 0, nil
	}

	// 解析客户端消息
	// 注意：这里的协议需要与前端约定
	switch p[0] {
	case 1: // 假设1表示鼠标事件
		if len(p) >= 6 {
			buttonMask := uint8(p[1])
			x := uint16(p[2])<<8 | uint16(p[3])
			y := uint16(p[4])<<8 | uint16(p[5])
			
			// 使用自定义的ButtonMask类型
			buttonState := vnc.ButtonMask(buttonMask)
			
			err := v.conn.PointerEvent(buttonState, x, y)
			if err != nil {
				return 0, err
			}
			
			// 发送鼠标事件确认
			v.writer.Write([]byte(fmt.Sprintf("VNC_MOUSE_ACK:%d:%d:%d", x, y, buttonMask)))
		}

	case 2: // 假设2表示键盘事件
		if len(p) >= 4 {
			downFlag := p[1] != 0
			keyCode := uint32(p[2])<<8 | uint32(p[3])
			
			// 注意：go-vnc库的KeyEvent参数顺序可能不同，需要适配
			err := v.conn.KeyEvent(keyCode, downFlag)
			if err != nil {
				return 0, err
			}
			
			// 发送键盘事件确认
			v.writer.Write([]byte(fmt.Sprintf("VNC_KEY_ACK:%d:%v", keyCode, downFlag)))
		}

	case 3: // 假设3表示请求屏幕截图
		// 请求完整的帧缓冲区更新并发送截图
		v.captureAndSendScreenshot()
	}

	return len(p), nil
}

// Close 关闭VNC会话
func (v *VNCTerminalSession) Close() error {
	v.closeOnce.Do(func() {
		// 发送停止信号
		close(v.stopChan)

		// 等待处理goroutine结束
		<-v.closedChan

		// 关闭管道
		v.reader.Close()
		v.writer.Close()

		// 关闭VNC连接
		if v.conn != nil {
			v.conn.Close()
		}
	})

	return nil
}

// WindowResize 调整终端窗口大小
func (v *VNCTerminalSession) WindowResize(rows, cols uint16) error {
	// VNC不直接支持窗口大小调整的概念
	log.Printf("请求调整VNC窗口大小: %dx%d", cols, rows)

	// 发送窗口调整通知
	v.mutex.Lock()
	defer v.mutex.Unlock()
	
	v.writer.Write([]byte(fmt.Sprintf("VNC_RESIZE:%d:%d", cols, rows)))
	
	return nil
}
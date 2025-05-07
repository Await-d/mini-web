package service

import (
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"sync"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"github.com/reiver/go-telnet"
)

// TelnetTerminalSession 实现Telnet终端会话
type TelnetTerminalSession struct {
	conn       net.Conn
	reader     io.Reader
	writer     io.Writer
	stopChan   chan struct{}
	closedChan chan struct{}
	closeOnce  sync.Once
	model      *model.Connection
}

// TelnetHandler 实现telnet.Caller接口
type TelnetHandler struct {
	reader     io.Reader
	writer     io.Writer
	stopChan   chan struct{}
	closedChan chan struct{}
}

// CallTELNET 实现telnet.Caller接口
func (handler *TelnetHandler) CallTELNET(ctx telnet.Context, w telnet.Writer, r telnet.Reader) {
	// 通知连接成功
	w.Write([]byte("Telnet连接成功!\r\n"))

	// 复制数据的goroutine
	go func() {
		buffer := make([]byte, 4096)
		for {
			select {
			case <-handler.stopChan:
				return
			default:
				n, err := r.Read(buffer)
				if err != nil {
					if err != io.EOF {
						log.Printf("读取Telnet数据错误: %v", err)
					}
					// 关闭通道通知会话已结束
					if !isClosed(handler.closedChan) {
						close(handler.closedChan)
					}
					return
				}

				if n > 0 {
					_, err = handler.writer.Write(buffer[:n])
					if err != nil {
						log.Printf("写入管道错误: %v", err)
						return
					}
				}
			}
		}
	}()

	// 从读取管道读取数据并发送到远程
	buffer := make([]byte, 4096)
	for {
		select {
		case <-handler.stopChan:
			return
		default:
			n, err := handler.reader.Read(buffer)
			if err != nil {
				if err != io.EOF {
					log.Printf("从管道读取错误: %v", err)
				}
				return
			}

			if n > 0 {
				_, err = w.Write(buffer[:n])
				if err != nil {
					log.Printf("写入Telnet错误: %v", err)
					return
				}
			}
		}
	}
}

// 创建Telnet终端会话
func createTelnetTerminalSession(conn *model.Connection) (*TelnetTerminalSession, error) {
	addr := net.JoinHostPort(conn.Host, strconv.Itoa(conn.Port))

	// 创建通道
	stopChan := make(chan struct{})
	closedChan := make(chan struct{})

	// 创建读写管道
	reader, writer := io.Pipe()

	// 创建处理器
	handler := &TelnetHandler{
		reader:     reader,
		writer:     writer,
		stopChan:   stopChan,
		closedChan: closedChan,
	}

	// 创建会话对象
	session := &TelnetTerminalSession{
		conn:       nil, // 稍后设置
		reader:     reader,
		writer:     writer,
		stopChan:   stopChan,
		closedChan: closedChan,
		model:      conn,
	}

	// 先尝试简单的TCP连接测试
	tcpConn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("Telnet TCP连接失败: %w", err)
	}
	tcpConn.Close() // 只是测试连接性

	// 在goroutine中建立Telnet连接并处理
	go func() {
		// 使用Telnet客户端建立连接
		err := telnet.DialToAndCall(addr, handler)
		if err != nil {
			log.Printf("Telnet连接错误: %v", err)
			// 关闭通道通知会话已结束
			if !isClosed(closedChan) {
				close(closedChan)
			}
			return
		}
		
		// 注意：在这个实现中，DialToAndCall会阻塞直到连接结束
		// 当函数返回时，表示连接已经关闭
		if !isClosed(closedChan) {
			close(closedChan)
		}
	}()

	// 发送初始连接消息给客户端
	writer.Write([]byte(fmt.Sprintf("正在连接到 %s:%d...\r\n", conn.Host, conn.Port)))

	return session, nil
}



// Read 实现io.Reader接口
func (t *TelnetTerminalSession) Read(p []byte) (int, error) {
	return t.reader.Read(p)
}

// Write 实现io.Writer接口
func (t *TelnetTerminalSession) Write(p []byte) (int, error) {
	return t.writer.Write(p)
}

// Close 关闭Telnet会话
func (t *TelnetTerminalSession) Close() error {
	t.closeOnce.Do(func() {
		// 发送停止信号
		close(t.stopChan)

		// 等待处理goroutine结束
		<-t.closedChan

		// 关闭连接
		if t.conn != nil {
			t.conn.Close()
		}
	})

	return nil
}

// WindowResize 调整终端窗口大小
func (t *TelnetTerminalSession) WindowResize(rows, cols uint16) error {
	// Telnet协议没有标准的窗口调整支持
	// 可以通过NAWS (Negotiate About Window Size) 选项实现，但大多数情况下不需要
	return nil
}

// isClosed 检查通道是否已关闭
func isClosed(ch chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}
package service

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"gitee.com/await29/mini-web/internal/model"
)

// TerminalSessionProxy 终端会话代理，管理终端会话的生命周期
type TerminalSessionProxy struct {
	session         *PersistentTerminalSession
	terminal        TerminalSession  // 底层终端实现
	connectionInfo  *model.Connection
	inputBuffer     chan []byte
	outputBuffer    chan []byte
	isActive        bool
	lastActivity    time.Time
	mutex           sync.RWMutex
	ctx             context.Context
	cancel          context.CancelFunc
	sessionManager  *TerminalSessionManager
}

// NewTerminalSessionProxy 创建终端会话代理
func NewTerminalSessionProxy(session *PersistentTerminalSession, connectionInfo *model.Connection, sessionManager *TerminalSessionManager) (*TerminalSessionProxy, error) {
	ctx, cancel := context.WithCancel(context.Background())
	
	proxy := &TerminalSessionProxy{
		session:        session,
		connectionInfo: connectionInfo,
		inputBuffer:    make(chan []byte, 100),
		outputBuffer:   make(chan []byte, 100),
		isActive:       false,
		lastActivity:   time.Now(),
		ctx:            ctx,
		cancel:         cancel,
		sessionManager: sessionManager,
	}
	
	// 创建底层终端会话
	if err := proxy.createTerminal(); err != nil {
		cancel()
		return nil, fmt.Errorf("创建终端失败: %w", err)
	}
	
	// 启动监控协程
	go proxy.monitorTerminal()
	go proxy.processInput()
	
	return proxy, nil
}

// createTerminal 创建底层终端会话
func (p *TerminalSessionProxy) createTerminal() error {
	var terminal TerminalSession
	var err error
	
	switch p.session.Protocol {
	case "ssh":
		terminal, err = CreateSSHSession(p.connectionInfo)
	case "rdp":
		terminal, err = CreateRDPSession(p.connectionInfo)
	case "telnet":
		terminal, err = CreateTelnetSession(p.connectionInfo)
	case "vnc":
		terminal, err = CreateVNCSession(p.connectionInfo)
	default:
		return fmt.Errorf("不支持的协议: %s", p.session.Protocol)
	}
	
	if err != nil {
		return fmt.Errorf("创建%s终端失败: %w", p.session.Protocol, err)
	}
	
	p.terminal = terminal
	p.isActive = true
	
	log.Printf("创建终端会话代理: 会话ID=%s, 协议=%s", p.session.ID, p.session.Protocol)
	
	return nil
}

// monitorTerminal 监控终端输出
func (p *TerminalSessionProxy) monitorTerminal() {
	defer func() {
		p.mutex.Lock()
		p.isActive = false
		p.mutex.Unlock()
		
		if p.terminal != nil {
			p.terminal.Close()
		}
		
		log.Printf("终端监控协程结束: 会话ID=%s", p.session.ID)
	}()
	
	buf := make([]byte, 4096)
	
	for {
		select {
		case <-p.ctx.Done():
			return
		default:
			if p.terminal == nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			
			// 设置读取超时
			deadline := time.Now().Add(1 * time.Second)
			if deadlineTerminal, ok := p.terminal.(interface{ SetReadDeadline(time.Time) error }); ok {
				deadlineTerminal.SetReadDeadline(deadline)
			}
			
			n, err := p.terminal.Read(buf)
			if err != nil {
				// 超时错误可以继续，其他错误需要处理
				if netErr, ok := err.(interface{ Timeout() bool }); ok && netErr.Timeout() {
					continue
				}
				
				log.Printf("读取终端输出错误: %v", err)
				// 添加错误消息到会话历史
				p.sessionManager.AddMessage(p.session.ID, "error", "终端连接错误: "+err.Error())
				return
			}
			
			if n > 0 {
				output := string(buf[:n])
				p.updateActivity()
				
				// 添加输出消息到会话历史
				p.sessionManager.AddMessage(p.session.ID, "output", output)
				
				// 发送到输出缓冲区
				select {
				case p.outputBuffer <- buf[:n]:
				default:
					// 缓冲区满，丢弃最旧的数据
					select {
					case <-p.outputBuffer:
					default:
					}
					select {
					case p.outputBuffer <- buf[:n]:
					default:
					}
				}
			}
		}
	}
}

// processInput 处理输入数据
func (p *TerminalSessionProxy) processInput() {
	defer log.Printf("输入处理协程结束: 会话ID=%s", p.session.ID)
	
	for {
		select {
		case <-p.ctx.Done():
			return
		case input := <-p.inputBuffer:
			if p.terminal == nil {
				continue
			}
			
			p.updateActivity()
			
			// 添加输入消息到会话历史
			p.sessionManager.AddMessage(p.session.ID, "input", string(input))
			
			// 发送到终端
			if _, err := p.terminal.Write(input); err != nil {
				log.Printf("发送输入到终端失败: %v", err)
				p.sessionManager.AddMessage(p.session.ID, "error", "发送输入失败: "+err.Error())
			}
		}
	}
}

// Write 实现TerminalSession接口
func (p *TerminalSessionProxy) Write(data []byte) (int, error) {
	select {
	case p.inputBuffer <- data:
		return len(data), nil
	case <-time.After(5 * time.Second):
		return 0, fmt.Errorf("写入超时")
	}
}

// Read 实现TerminalSession接口
func (p *TerminalSessionProxy) Read(buf []byte) (int, error) {
	select {
	case data := <-p.outputBuffer:
		n := copy(buf, data)
		return n, nil
	case <-time.After(30 * time.Second):
		return 0, fmt.Errorf("读取超时")
	}
}

// Close 实现TerminalSession接口
func (p *TerminalSessionProxy) Close() error {
	p.cancel()
	
	// 关闭缓冲区
	close(p.inputBuffer)
	close(p.outputBuffer)
	
	// 关闭底层终端
	if p.terminal != nil {
		return p.terminal.Close()
	}
	
	return nil
}

// IsActive 检查会话是否活跃
func (p *TerminalSessionProxy) IsActive() bool {
	p.mutex.RLock()
	defer p.mutex.RUnlock()
	return p.isActive
}

// GetLastActivity 获取最后活跃时间
func (p *TerminalSessionProxy) GetLastActivity() time.Time {
	p.mutex.RLock()
	defer p.mutex.RUnlock()
	return p.lastActivity
}

// updateActivity 更新活跃时间
func (p *TerminalSessionProxy) updateActivity() {
	p.mutex.Lock()
	p.lastActivity = time.Now()
	p.mutex.Unlock()
}

// GetSession 获取会话信息
func (p *TerminalSessionProxy) GetSession() *PersistentTerminalSession {
	return p.session
}

// SendInput 发送输入到终端
func (p *TerminalSessionProxy) SendInput(input string) error {
	data := []byte(input)
	_, err := p.Write(data)
	return err
}

// 工厂函数用于创建不同类型的终端会话

// CreateSSHSession 创建SSH会话
func CreateSSHSession(conn *model.Connection) (TerminalSession, error) {
	terminal, err := createSSHTerminalSession(conn)
	
	if err != nil {
		return nil, fmt.Errorf("SSH连接失败: %w", err)
	}
	
	return terminal, nil
}

// CreateRDPSession 创建RDP会话
func CreateRDPSession(conn *model.Connection) (TerminalSession, error) {
	terminal, err := createRDPTerminalSessionSimple(conn)
	
	if err != nil {
		return nil, fmt.Errorf("RDP连接失败: %w", err)
	}
	
	return terminal, nil
}

// CreateTelnetSession 创建Telnet会话
func CreateTelnetSession(conn *model.Connection) (TerminalSession, error) {
	terminal, err := createTelnetTerminalSession(conn)
	
	if err != nil {
		return nil, fmt.Errorf("Telnet连接失败: %w", err)
	}
	
	return terminal, nil
}

// CreateVNCSession 创建VNC会话
func CreateVNCSession(conn *model.Connection) (TerminalSession, error) {
	terminal, err := createVNCTerminalSession(conn)
	
	if err != nil {
		return nil, fmt.Errorf("VNC连接失败: %w", err)
	}
	
	return terminal, nil
}
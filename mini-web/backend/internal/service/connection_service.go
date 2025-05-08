package service

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os/exec"
	"strconv"
	"time"

	"gitee.com/await29/mini-web/internal/model"
	"gitee.com/await29/mini-web/internal/model/sqlite"
)

var (
	// ErrConnectionNotFound 连接不存在错误
	ErrConnectionNotFound = errors.New("连接不存在")

	// ErrInvalidProtocol 无效的协议错误
	ErrInvalidProtocol = errors.New("无效的协议类型")

	// ErrConnectionFailed 连接失败错误
	ErrConnectionFailed = errors.New("连接服务器失败")

	// ErrSessionNotFound 会话不存在错误
	ErrSessionNotFound = errors.New("会话不存在")

	// ErrTerminalFailed 终端创建失败错误
	ErrTerminalFailed = errors.New("终端创建失败")
)

// TerminalSession 定义终端会话接口
type TerminalSession interface {
	io.ReadWriter
	Close() error
	WindowResize(rows, cols uint16) error
}

// 各种终端会话实现
type sshTerminalSession struct {
	io.ReadWriteCloser
	connection *model.Connection
}

type rdpTerminalSession struct {
	io.ReadWriteCloser
	connection *model.Connection
}

type vncTerminalSession struct {
	io.ReadWriteCloser
	connection *model.Connection
}

type telnetTerminalSession struct {
	io.ReadWriteCloser
	connection *model.Connection
}

// 本地模拟终端会话实现（用于开发测试）
type localTerminalSession struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
}

// ConnectionService 连接服务
type ConnectionService struct {
	connRepo    model.ConnectionRepository
	sessionRepo model.SessionRepository
}

// NewConnectionService 创建连接服务实例
func NewConnectionService(connRepo model.ConnectionRepository, sessionRepo model.SessionRepository) *ConnectionService {
	return &ConnectionService{
		connRepo:    connRepo,
		sessionRepo: sessionRepo,
	}
}

// CreateConnection 创建新连接
func (s *ConnectionService) CreateConnection(userID uint, req *model.ConnectionRequest) (*model.Connection, error) {
	// 验证协议类型
	if !isValidProtocol(req.Protocol) {
		return nil, ErrInvalidProtocol
	}

	// 创建连接对象
	conn := &model.Connection{
		Name:        req.Name,
		Protocol:    req.Protocol,
		Host:        req.Host,
		Port:        req.Port,
		Username:    req.Username,
		Password:    req.Password,
		PrivateKey:  req.PrivateKey,
		Group:       req.Group,
		Description: req.Description,
		CreatedBy:   userID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// 保存连接
	if err := s.connRepo.Create(conn); err != nil {
		return nil, fmt.Errorf("创建连接时出错: %w", err)
	}

	return conn, nil
}

// UpdateConnection 更新连接配置
func (s *ConnectionService) UpdateConnection(userID uint, id uint, req *model.ConnectionRequest) (*model.Connection, error) {
	var conn *model.Connection
	var err error
	
	// 使用修复后的方法获取连接，处理NULL值问题
	if repo, ok := s.connRepo.(*sqlite.ConnectionRepository); ok {
		conn, err = repo.GetByIDFixed(id)
	} else {
		// 回退到原始方法
		conn, err = s.connRepo.GetByID(id)
	}
	
	if err != nil {
		return nil, fmt.Errorf("获取连接信息时出错: %w", err)
	}
	if conn == nil {
		return nil, ErrConnectionNotFound
	}

	// 检查是否是创建者
	if conn.CreatedBy != userID {
		return nil, errors.New("无权修改此连接")
	}

	// 验证协议类型
	if !isValidProtocol(req.Protocol) {
		return nil, ErrInvalidProtocol
	}

	// 更新连接信息
	conn.Name = req.Name
	conn.Protocol = req.Protocol
	conn.Host = req.Host
	conn.Port = req.Port
	conn.Username = req.Username
	if req.Password != "" {
		conn.Password = req.Password
	}
	if req.PrivateKey != "" {
		conn.PrivateKey = req.PrivateKey
	}
	conn.Group = req.Group
	conn.Description = req.Description
	conn.UpdatedAt = time.Now()

	// 保存更新
	if err := s.connRepo.Update(conn); err != nil {
		return nil, fmt.Errorf("更新连接时出错: %w", err)
	}

	return conn, nil
}

// DeleteConnection 删除连接
func (s *ConnectionService) DeleteConnection(userID uint, id uint) error {
	var conn *model.Connection
	var err error
	
	// 使用修复后的方法获取连接，处理NULL值问题
	if repo, ok := s.connRepo.(*sqlite.ConnectionRepository); ok {
		conn, err = repo.GetByIDFixed(id)
	} else {
		// 回退到原始方法
		conn, err = s.connRepo.GetByID(id)
	}
	
	if err != nil {
		return fmt.Errorf("获取连接信息时出错: %w", err)
	}
	if conn == nil {
		return ErrConnectionNotFound
	}

	// 检查是否是创建者
	if conn.CreatedBy != userID {
		return errors.New("无权删除此连接")
	}

	// 删除连接
	if err := s.connRepo.Delete(id); err != nil {
		return fmt.Errorf("删除连接时出错: %w", err)
	}

	return nil
}

// GetConnection 获取连接详情
func (s *ConnectionService) GetConnection(userID uint, id uint) (*model.Connection, error) {
	var conn *model.Connection
	var err error
	
	// 使用修复后的方法获取连接，处理NULL值问题
	if repo, ok := s.connRepo.(*sqlite.ConnectionRepository); ok {
		conn, err = repo.GetByIDFixed(id)
	} else {
		// 回退到原始方法
		conn, err = s.connRepo.GetByID(id)
	}
	
	if err != nil {
		return nil, fmt.Errorf("获取连接信息时出错: %w", err)
	}
	if conn == nil {
		return nil, ErrConnectionNotFound
	}

	// 检查访问权限
	if conn.CreatedBy != userID {
		// 这里可以扩展为团队共享功能
		return nil, errors.New("无权访问此连接")
	}

	return conn, nil
}

// GetUserConnections 获取用户的所有连接
func (s *ConnectionService) GetUserConnections(userID uint) ([]*model.Connection, error) {
	// 使用修复后的方法获取连接，处理NULL值问题
	if repo, ok := s.connRepo.(*sqlite.ConnectionRepository); ok {
		connections, err := repo.GetByUserIDFixed(userID)
		if err != nil {
			return nil, fmt.Errorf("获取用户连接时出错: %w", err)
		}
		return connections, nil
	}
	
	// 回退到原始方法
	connections, err := s.connRepo.GetByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("获取用户连接时出错: %w", err)
	}

	return connections, nil
}

// CreateSession 创建新会话
func (s *ConnectionService) CreateSession(userID uint, connectionID uint, clientIP string) (*model.Session, error) {
	// 获取连接信息
	conn, err := s.GetConnection(userID, connectionID)
	if err != nil {
		return nil, err
	}

	// 更新连接最后使用时间
	if err := s.connRepo.UpdateLastUsed(connectionID); err != nil {
		return nil, fmt.Errorf("更新连接使用时间时出错: %w", err)
	}

	// 创建会话
	session := &model.Session{
		ConnectionID: connectionID,
		UserID:       userID,
		StartTime:    time.Now(),
		Status:       "active",
		ClientIP:     clientIP,
		ServerIP:     conn.Host,
		LogPath:      fmt.Sprintf("logs/session_%d_%s.log", userID, time.Now().Format("20060102150405")),
	}

	// 保存会话
	if err := s.sessionRepo.Create(session); err != nil {
		return nil, fmt.Errorf("创建会话时出错: %w", err)
	}

	return session, nil
}

// CloseSession 关闭会话
func (s *ConnectionService) CloseSession(userID uint, sessionID uint) error {
	// 获取会话
	session, err := s.sessionRepo.GetByID(sessionID)
	if err != nil {
		return fmt.Errorf("获取会话信息时出错: %w", err)
	}
	if session == nil {
		return errors.New("会话不存在")
	}

	// 检查权限
	if session.UserID != userID {
		return errors.New("无权关闭此会话")
	}

	// 关闭会话
	if err := s.sessionRepo.CloseSession(sessionID); err != nil {
		return fmt.Errorf("关闭会话时出错: %w", err)
	}

	return nil
}

// GetUserSessions 获取用户的所有会话
func (s *ConnectionService) GetUserSessions(userID uint) ([]*model.Session, error) {
	sessions, err := s.sessionRepo.GetByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("获取用户会话时出错: %w", err)
	}

	return sessions, nil
}

// GetActiveSessions 获取用户的活动会话
func (s *ConnectionService) GetActiveSessions(userID uint) ([]*model.Session, error) {
	sessions, err := s.sessionRepo.GetActiveByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("获取活动会话时出错: %w", err)
	}

	return sessions, nil
}

// TestConnection 测试连接
func (s *ConnectionService) TestConnection(conn *model.Connection) error {
	// 根据协议类型进行不同的连接测试
	switch conn.Protocol {
	case model.ProtocolRDP, model.ProtocolVNC, model.ProtocolTelnet:
		// 简单的TCP连接测试
		return testTCPConnection(conn.Host, conn.Port)
	case model.ProtocolSSH:
		// SSH连接测试可以是更详细的验证
		return testTCPConnection(conn.Host, conn.Port)
	default:
		return ErrInvalidProtocol
	}
}

// GetSessionByID 获取指定ID的会话
func (s *ConnectionService) GetSessionByID(userID uint, sessionID uint) (*model.Session, error) {
	session, err := s.sessionRepo.GetByID(sessionID)
	if err != nil {
		return nil, fmt.Errorf("获取会话信息时出错: %w", err)
	}
	if session == nil {
		return nil, ErrSessionNotFound
	}

	// 检查访问权限
	if session.UserID != userID {
		return nil, errors.New("无权访问此会话")
	}

	return session, nil
}

// CreateTerminalSession 创建终端会话
func (s *ConnectionService) CreateTerminalSession(protocol string, connection *model.Connection) (TerminalSession, error) {
	switch protocol {
	case model.ProtocolSSH:
		return s.createSSHSession(connection)
	case model.ProtocolRDP:
		return s.createRDPSession(connection)
	case model.ProtocolVNC:
		return s.createVNCSession(connection)
	case model.ProtocolTelnet:
		return s.createTelnetSession(connection)
	default:
		// 默认使用本地模拟终端（仅用于开发测试）
		return s.createLocalTerminalSession()
	}
}

// createSSHSession 创建SSH会话
func (s *ConnectionService) createSSHSession(connection *model.Connection) (TerminalSession, error) {
	log.Printf("创建SSH终端会话: %s@%s:%d", connection.Username, connection.Host, connection.Port)
	
	// 使用我们实现的SSH终端
	session, err := createSSHTerminalSession(connection)
	if err != nil {
		log.Printf("SSH终端创建失败: %v", err)
		return nil, err
	}
	
	log.Printf("SSH终端会话创建成功")
	return session, nil
}

// createRDPSession 创建RDP会话
func (s *ConnectionService) createRDPSession(connection *model.Connection) (TerminalSession, error) {
	log.Printf("创建RDP远程桌面会话: %s@%s:%d", connection.Username, connection.Host, connection.Port)
	
	// 使用增强版的RDP终端，支持图形界面
	session, err := createRDPTerminalSession(connection)
	if err != nil {
		log.Printf("RDP终端创建失败: %v", err)
		return nil, err
	}
	
	log.Printf("RDP远程桌面会话创建成功")
	return session, nil
}

// createVNCSession 创建VNC会话
func (s *ConnectionService) createVNCSession(connection *model.Connection) (TerminalSession, error) {
	log.Printf("创建VNC远程桌面会话: %s@%s:%d", connection.Username, connection.Host, connection.Port)
	
	// 使用修复版的VNC终端，支持图形界面
	session, err := createVNCTerminalSession(connection)
	if err != nil {
		log.Printf("VNC终端创建失败: %v", err)
		return nil, err
	}
	
	log.Printf("VNC远程桌面会话创建成功")
	return session, nil
}

// createTelnetSession 创建Telnet会话
func (s *ConnectionService) createTelnetSession(connection *model.Connection) (TerminalSession, error) {
	log.Printf("创建Telnet终端会话: %s:%d", connection.Host, connection.Port)
	
	// 使用修复版的Telnet终端
	session, err := createTelnetTerminalSession(connection)
	if err != nil {
		log.Printf("Telnet终端创建失败: %v", err)
		return nil, err
	}
	
	log.Printf("Telnet终端会话创建成功")
	return session, nil
}

// createLocalTerminalSession 创建本地终端会话（仅用于开发测试）
func (s *ConnectionService) createLocalTerminalSession() (TerminalSession, error) {
	// 在Windows上使用PowerShell，在Linux/macOS上使用bash
	var shell string
	var args []string

	// 这里简化处理，实际应该根据操作系统选择合适的shell
	shell = "powershell"
	args = []string{"-NoExit"}

	cmd := exec.Command(shell, args...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("创建标准输入管道失败: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("创建标准输出管道失败: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("启动本地终端失败: %w", err)
	}

	return &localTerminalSession{
		cmd:    cmd,
		stdin:  stdin,
		stdout: stdout,
	}, nil
}

// Read 实现io.Reader接口
func (s *localTerminalSession) Read(p []byte) (int, error) {
	return s.stdout.Read(p)
}

// Write 实现io.Writer接口
func (s *localTerminalSession) Write(p []byte) (int, error) {
	return s.stdin.Write(p)
}

// Close 关闭终端会话
func (s *localTerminalSession) Close() error {
	s.stdin.Close()
	s.stdout.Close()

	// 结束进程
	if err := s.cmd.Process.Kill(); err != nil {
		return err
	}
	return s.cmd.Wait()
}

// WindowResize 调整终端窗口大小
func (s *localTerminalSession) WindowResize(rows, cols uint16) error {
	// 本地终端这里简单返回nil
	// 实际终端应该实现窗口大小调整
	return nil
}

// IsValidProtocol 检查协议是否有效（改为公开函数）
func IsValidProtocol(protocol string) bool {
	return protocol == model.ProtocolRDP ||
		protocol == model.ProtocolSSH ||
		protocol == model.ProtocolVNC ||
		protocol == model.ProtocolTelnet
}

// isValidProtocol 内部使用的协议检查（保留兼容性）
func isValidProtocol(protocol string) bool {
	return IsValidProtocol(protocol)
}

// 辅助函数

// testTCPConnection 测试TCP连接
func testTCPConnection(host string, port int) error {
	address := net.JoinHostPort(host, strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", address, 5*time.Second)
	if err != nil {
		return fmt.Errorf("连接服务器失败: %w", err)
	}
	defer conn.Close()
	return nil
}
/*
 * @Author: Await
 * @Date: 2025-05-08 18:19:21
 * @LastEditors: Await
 * @LastEditTime: 2025-05-31 16:57:49
 * @Description: 请填写简介
 */
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
	"golang.org/x/crypto/ssh"
)

// SSHTerminalSession 实现SSH终端会话
type SSHTerminalSession struct {
	client  *ssh.Client
	session *ssh.Session
	stdin   io.WriteCloser
	stdout  io.Reader
	stderr  io.Reader
	conn    *model.Connection
	// 添加命令处理器
	commandHandler *SSHCommandHandler
	// 添加输出缓冲区，用于捕获命令输出
	outputBuffer  []byte
	bufferMutex   sync.Mutex
	isCapturing   bool
	captureMarker string
}

// 创建SSH终端会话
func createSSHTerminalSession(conn *model.Connection) (*SSHTerminalSession, error) {
	// 准备SSH配置
	config := &ssh.ClientConfig{
		User:            conn.Username,
		Auth:            []ssh.AuthMethod{},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 注意：生产环境应验证主机密钥
		Timeout:         time.Second * 10,
	}

	// 添加认证方式（密码或密钥）
	if conn.Password != "" {
		config.Auth = append(config.Auth, ssh.Password(conn.Password))
	}

	if conn.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(conn.PrivateKey))
		if err != nil {
			return nil, fmt.Errorf("解析SSH私钥失败: %w", err)
		}
		config.Auth = append(config.Auth, ssh.PublicKeys(signer))
	}

	// 如果没有提供认证方式，返回错误
	if len(config.Auth) == 0 {
		return nil, fmt.Errorf("未提供SSH认证方式（密码或私钥）")
	}

	// 连接到SSH服务器
	addr := net.JoinHostPort(conn.Host, strconv.Itoa(conn.Port))
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("SSH连接失败: %w", err)
	}

	// 创建会话
	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("创建SSH会话失败: %w", err)
	}

	// 请求伪终端
	if err := session.RequestPty("xterm", 80, 40, ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}); err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("请求伪终端失败: %w", err)
	}

	// 获取标准输入/输出管道
	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("获取标准输入管道失败: %w", err)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("获取标准输出管道失败: %w", err)
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("获取标准错误管道失败: %w", err)
	}

	// 启动shell
	if err := session.Shell(); err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("启动shell失败: %w", err)
	}

	// 创建命令处理器
	log.Printf("尝试创建SSH命令处理器...")
	commandHandler, err := NewSSHCommandHandler(client)
	if err != nil {
		log.Printf("创建SSH命令处理器失败: %v", err)
		// 不是致命错误，继续运行
		commandHandler = nil
	} else {
		log.Printf("SSH命令处理器创建成功")
	}

	return &SSHTerminalSession{
		client:         client,
		session:        session,
		stdin:          stdin,
		stdout:         stdout,
		stderr:         stderr,
		conn:           conn,
		commandHandler: commandHandler,
		outputBuffer:   make([]byte, 0, 1024*1024), // 1MB缓冲区
	}, nil
}

// Read 实现io.Reader接口
func (s *SSHTerminalSession) Read(p []byte) (int, error) {
	return s.stdout.Read(p)
}

// Write 实现io.Writer接口
func (s *SSHTerminalSession) Write(p []byte) (int, error) {
	return s.stdin.Write(p)
}

// Close 关闭SSH会话
func (s *SSHTerminalSession) Close() error {
	// 先关闭会话，再关闭客户端
	sessionErr := s.session.Close()
	clientErr := s.client.Close()

	if sessionErr != nil {
		return sessionErr
	}
	return clientErr
}

// WindowResize 调整终端窗口大小
func (s *SSHTerminalSession) WindowResize(rows, cols uint16) error {
	return s.session.WindowChange(int(rows), int(cols))
}

// GetCommandHandler 获取命令处理器
func (s *SSHTerminalSession) GetCommandHandler() *SSHCommandHandler {
	return s.commandHandler
}

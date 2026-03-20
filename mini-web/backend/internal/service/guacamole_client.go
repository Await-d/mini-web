/*
 * @Author: Await
 * @Date: 2025-10-22
 * @Description: Apache Guacamole协议Go客户端实现
 *
 * Guacamole协议说明：
 * - 基于文本的协议，指令格式：长度.内容;
 * - 例如："4.size,1.0,4.1024,3.768;"表示设置屏幕为1024x768
 * - 主要流程：select → connect → size → 接收图像/发送输入
 */
package service

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GuacamoleClient Guacamole协议客户端
type GuacamoleClient struct {
	conn       net.Conn
	reader     *bufio.Reader
	writer     *bufio.Writer
	mutex      sync.Mutex
	connected  bool
	sessionID  string

	// 回调函数
	OnInstruction func(instruction *GuacInstruction)
	OnError       func(error)
	OnDisconnect  func()
}

// GuacInstruction Guacamole指令
type GuacInstruction struct {
	Opcode string
	Args   []string
}

// NewGuacamoleClient 创建新的Guacamole客户端
func NewGuacamoleClient(guacdHost string, guacdPort int) (*GuacamoleClient, error) {
	address := fmt.Sprintf("%s:%d", guacdHost, guacdPort)
	log.Printf("[Guac] 连接到guacd: %s", address)

	conn, err := net.DialTimeout("tcp", address, 10*time.Second)
	if err != nil {
		return nil, fmt.Errorf("连接guacd失败: %w", err)
	}

	client := &GuacamoleClient{
		conn:      conn,
		reader:    bufio.NewReader(conn),
		writer:    bufio.NewWriter(conn),
		connected: true,
	}

	return client, nil
}

// ReadInstruction 读取一条Guacamole指令
func (gc *GuacamoleClient) ReadInstruction() (*GuacInstruction, error) {
	var instruction GuacInstruction
	var args []string

	for {
		// 读取长度
		lengthStr, err := gc.reader.ReadString('.')
		if err != nil {
			return nil, fmt.Errorf("读取长度失败: %w", err)
		}

		lengthStr = strings.TrimSuffix(lengthStr, ".")
		length, err := strconv.Atoi(lengthStr)
		if err != nil {
			return nil, fmt.Errorf("解析长度失败: %w", err)
		}

		// 读取内容
		content := make([]byte, length)
		_, err = io.ReadFull(gc.reader, content)
		if err != nil {
			return nil, fmt.Errorf("读取内容失败: %w", err)
		}

		// 读取分隔符（, 或 ;）
		sep, err := gc.reader.ReadByte()
		if err != nil {
			return nil, fmt.Errorf("读取分隔符失败: %w", err)
		}

		args = append(args, string(content))

		// 如果是分号，表示指令结束
		if sep == ';' {
			break
		}
	}

	if len(args) > 0 {
		instruction.Opcode = args[0]
		instruction.Args = args[1:]
	}

	return &instruction, nil
}

// SendInstruction 发送一条Guacamole指令
func (gc *GuacamoleClient) SendInstruction(opcode string, args ...string) error {
	gc.mutex.Lock()
	defer gc.mutex.Unlock()

	// 写入opcode
	fmt.Fprintf(gc.writer, "%d.%s", len(opcode), opcode)

	// 写入参数
	for _, arg := range args {
		fmt.Fprintf(gc.writer, ",%d.%s", len(arg), arg)
	}

	// 写入结束符
	gc.writer.WriteString(";")

	err := gc.writer.Flush()
	if err != nil {
		return fmt.Errorf("发送指令失败: %w", err)
	}

	return nil
}

// SelectProtocol 选择协议（rdp, vnc, ssh等）
func (gc *GuacamoleClient) SelectProtocol(protocol string) error {
	log.Printf("[Guac] 选择协议: %s", protocol)
	return gc.SendInstruction("select", protocol)
}

// ConnectRDP 连接到RDP服务器
func (gc *GuacamoleClient) ConnectRDP(params map[string]string) error {
	log.Printf("[Guac] 连接RDP服务器: %s:%s", params["hostname"], params["port"])

	// 发送连接参数
	var args []string
	for key, value := range params {
		args = append(args, key, value)
	}

	err := gc.SendInstruction("connect", args...)
	if err != nil {
		return err
	}

	// 读取响应
	inst, err := gc.ReadInstruction()
	if err != nil {
		return fmt.Errorf("读取连接响应失败: %w", err)
	}

	if inst.Opcode == "error" {
		return fmt.Errorf("连接失败: %v", inst.Args)
	}

	if inst.Opcode == "ready" && len(inst.Args) > 0 {
		gc.sessionID = inst.Args[0]
		log.Printf("[Guac] 连接成功, Session ID: %s", gc.sessionID)
	}

	return nil
}

// SetDisplaySize 设置显示尺寸
func (gc *GuacamoleClient) SetDisplaySize(width, height int) error {
	log.Printf("[Guac] 设置显示尺寸: %dx%d", width, height)
	return gc.SendInstruction("size", "0", strconv.Itoa(width), strconv.Itoa(height))
}

// SendMouse 发送鼠标事件
func (gc *GuacamoleClient) SendMouse(x, y int, mask int) error {
	return gc.SendInstruction("mouse", strconv.Itoa(x), strconv.Itoa(y), strconv.Itoa(mask))
}

// SendKey 发送键盘事件
func (gc *GuacamoleClient) SendKey(keysym int, pressed bool) error {
	pressedStr := "0"
	if pressed {
		pressedStr = "1"
	}
	return gc.SendInstruction("key", strconv.Itoa(keysym), pressedStr)
}

// StartReceiving 开始接收指令循环
func (gc *GuacamoleClient) StartReceiving() {
	go func() {
		for gc.connected {
			inst, err := gc.ReadInstruction()
			if err != nil {
				if gc.connected {
					log.Printf("[Guac] 读取指令错误: %v", err)
					if gc.OnError != nil {
						gc.OnError(err)
					}
				}
				break
			}

			// 处理指令
			if gc.OnInstruction != nil {
				gc.OnInstruction(inst)
			}
		}

		if gc.OnDisconnect != nil {
			gc.OnDisconnect()
		}
	}()
}

// Close 关闭连接
func (gc *GuacamoleClient) Close() error {
	gc.connected = false
	if gc.conn != nil {
		gc.SendInstruction("disconnect")
		return gc.conn.Close()
	}
	return nil
}

// GetRDPConnectionParams 获取RDP连接参数
func GetRDPConnectionParams(hostname string, port int, username, password string, width, height int) map[string]string {
	return map[string]string{
		"hostname":               hostname,
		"port":                   strconv.Itoa(port),
		"username":               username,
		"password":               password,
		"security":               "any", // auto, rdp, nla, tls
		"ignore-cert":            "true",
		"enable-wallpaper":       "true",
		"enable-theming":         "true",
		"enable-font-smoothing":  "true",
		"enable-full-window-drag": "true",
		"enable-desktop-composition": "true",
		"enable-menu-animations": "true",
		"disable-bitmap-caching": "false",
		"disable-offscreen-caching": "false",
		"color-depth":            "32",
		"width":                  strconv.Itoa(width),
		"height":                 strconv.Itoa(height),
		"dpi":                    "96",
		"resize-method":          "display-update",
		"force-lossless":         "false",
	}
}

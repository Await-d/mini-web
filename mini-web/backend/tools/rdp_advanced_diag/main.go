//go:build windows

/*
 * @Author: Await
 * @Date: 2025-06-07 20:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 18:19:54
 * @Description: 高级RDP连接诊断工具
 */
package main

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"syscall"
	"time"
)

var (
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	advapi32 = syscall.NewLazyDLL("advapi32.dll")
)

func main() {
	if len(os.Args) != 3 {
		fmt.Printf("使用方法: %s <主机> <端口>\n", os.Args[0])
		fmt.Println("示例: go run rdp_advanced_diag.go 192.168.123.5 3390")
		os.Exit(1)
	}

	host := os.Args[1]
	portStr := os.Args[2]

	port, err := strconv.Atoi(portStr)
	if err != nil {
		fmt.Printf("无效的端口号: %s\n", portStr)
		os.Exit(1)
	}

	fmt.Printf("=== 高级RDP连接诊断工具 ===\n")
	fmt.Printf("目标: %s:%d\n", host, port)
	fmt.Printf("开始时间: %s\n\n", time.Now().Format("2006-01-02 15:04:05"))

	// 1. 检查当前进程权限
	fmt.Println("1. 检查进程权限...")
	checkProcessPrivileges()

	// 2. 尝试不同的socket选项
	fmt.Println("\n2. 测试不同的socket配置...")
	testDifferentSocketOptions(host, port)

	// 3. 尝试Windows特定的连接方式
	fmt.Println("\n3. 测试Windows特定连接方式...")
	testWindowsSpecificConnection(host, port)

	// 4. 模拟RDP握手
	fmt.Println("\n4. 尝试RDP协议握手...")
	testRDPHandshake(host, port)

	// 5. 检查防火墙和安全软件
	fmt.Println("\n5. 检查系统安全状态...")
	checkSystemSecurity()

	fmt.Println("\n=== 测试完成 ===")
	fmt.Println("\n📋 建议:")
	fmt.Println("1. 尝试以管理员身份运行此程序")
	fmt.Println("2. 检查Windows Defender或其他安全软件是否阻止了连接")
	fmt.Println("3. 尝试临时禁用防火墙进行测试")
	fmt.Println("4. 检查RDP服务器的安全策略设置")
}

func checkProcessPrivileges() {
	fmt.Println("检查当前进程权限...")

	// 简单检查（在实际环境中需要更复杂的权限检查）
	f, err := os.OpenFile("C:\\Windows\\System32\\test_admin_access", os.O_CREATE|os.O_WRONLY, 0666)
	if err != nil {
		fmt.Println("❌ 当前进程可能没有管理员权限")
		fmt.Println("   建议：右键选择 '以管理员身份运行' PowerShell")
	} else {
		f.Close()
		os.Remove("C:\\Windows\\System32\\test_admin_access")
		fmt.Println("✅ 当前进程具有管理员权限")
	}
}

func testDifferentSocketOptions(host string, port int) {
	configs := []struct {
		name   string
		config func(conn net.Conn) error
	}{
		{
			"标准TCP连接",
			func(conn net.Conn) error { return nil },
		},
		{
			"TCP NoDelay",
			func(conn net.Conn) error {
				if tcpConn, ok := conn.(*net.TCPConn); ok {
					return tcpConn.SetNoDelay(true)
				}
				return nil
			},
		},
		{
			"TCP KeepAlive",
			func(conn net.Conn) error {
				if tcpConn, ok := conn.(*net.TCPConn); ok {
					return tcpConn.SetKeepAlive(true)
				}
				return nil
			},
		},
	}

	for _, config := range configs {
		fmt.Printf("  %s: ", config.name)

		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 10*time.Second)
		if err != nil {
			fmt.Printf("❌ 连接失败 - %v\n", err)
			continue
		}

		err = config.config(conn)
		if err != nil {
			fmt.Printf("⚠️ 配置失败 - %v\n", err)
			conn.Close()
			continue
		}

		fmt.Printf("✅ 连接成功\n")
		conn.Close()
	}
}

func testWindowsSpecificConnection(host string, port int) {
	// 测试使用系统代理
	fmt.Printf("  使用系统网络栈: ")

	// 创建地址结构
	addr := &net.TCPAddr{
		IP:   net.ParseIP(host),
		Port: port,
	}

	conn, err := net.DialTCP("tcp", nil, addr)
	if err != nil {
		fmt.Printf("❌ 失败 - %v\n", err)
	} else {
		fmt.Printf("✅ 成功\n")
		conn.Close()
	}

	// 测试指定本地端口范围
	fmt.Printf("  指定源端口范围: ")
	localAddr := &net.TCPAddr{
		IP:   net.ParseIP("192.168.123.20"), // 使用之前检测到的本地IP
		Port: 0,                             // 让系统自动分配
	}

	conn, err = net.DialTCP("tcp", localAddr, addr)
	if err != nil {
		fmt.Printf("❌ 失败 - %v\n", err)
	} else {
		fmt.Printf("✅ 成功\n")
		conn.Close()
	}
}

func testRDPHandshake(host string, port int) {
	fmt.Printf("  尝试建立TCP连接并发送RDP握手: ")

	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 10*time.Second)
	if err != nil {
		fmt.Printf("❌ TCP连接失败 - %v\n", err)
		return
	}
	defer conn.Close()

	fmt.Printf("✅ TCP连接成功，")

	// 发送简单的RDP握手数据
	// 这是一个简化的RDP连接请求
	rdpHandshake := []byte{
		0x03, 0x00, 0x00, 0x13, // TPKT Header (Length=19)
		0x0E, 0xE0, 0x00, 0x00, // X.224 Header
		0x00, 0x00, 0x00, 0x01, // Connection Request
		0x00, 0x08, 0x00, 0x00, // Request ID
		0x00, 0x00, 0x00, // Padding
	}

	conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	n, err := conn.Write(rdpHandshake)
	if err != nil {
		fmt.Printf("❌ 发送握手失败 - %v\n", err)
		return
	}

	fmt.Printf("发送握手成功 (%d bytes), ", n)

	// 尝试读取响应
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	response := make([]byte, 1024)
	n, err = conn.Read(response)
	if err != nil {
		fmt.Printf("❌ 读取响应失败 - %v\n", err)
		return
	}

	fmt.Printf("✅ 收到响应 (%d bytes)\n", n)
	fmt.Printf("    响应数据: %x\n", response[:n])
}

func checkSystemSecurity() {
	fmt.Println("检查系统安全状态...")

	// 检查Windows Defender状态（简化版）
	fmt.Println("  📊 建议检查项目:")
	fmt.Println("    - Windows Defender 实时保护状态")
	fmt.Println("    - 第三方安全软件（如360、腾讯管家等）")
	fmt.Println("    - Windows防火墙出站规则")
	fmt.Println("    - 网络配置文件（公用/专用网络）")
}

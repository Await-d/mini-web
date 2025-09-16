/*
 * @Author: Await
 * @Date: 2025-06-07 18:20:11
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 18:20:20
 * @Description: 请填写简介
 */
package main

import (
	"fmt"
	"net"
	"os/exec"
	"time"
)

func main() {
	fmt.Println("=== 简单网络测试 ===")

	// 1. Ping测试
	fmt.Println("1. Ping测试...")
	testPing("192.168.123.5")

	// 2. 尝试连接其他端口
	fmt.Println("\n2. 测试其他常见端口...")
	testPort("192.168.123.5", "3389") // 标准RDP端口
	testPort("192.168.123.5", "3390") // 配置的RDP端口
	testPort("192.168.123.5", "22")   // SSH
	testPort("192.168.123.5", "80")   // HTTP
	testPort("192.168.123.5", "443")  // HTTPS

	// 3. 测试PowerShell连接
	fmt.Println("\n3. 尝试PowerShell测试连接...")
	testPowerShellConnection("192.168.123.5", "3390")
}

func testPing(host string) {
	cmd := exec.Command("ping", "-n", "1", host)
	_, err := cmd.Output()
	if err != nil {
		fmt.Printf("❌ Ping失败: %v\n", err)
	} else {
		fmt.Printf("✅ Ping成功\n")
	}
}

func testPort(host, port string) {
	fmt.Printf("  端口 %s: ", port)
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 5*time.Second)
	if err != nil {
		fmt.Printf("❌ 无法连接 - %v\n", err)
	} else {
		fmt.Printf("✅ 连接成功\n")
		conn.Close()
	}
}

func testPowerShellConnection(host, port string) {
	// 使用PowerShell的Test-NetConnection
	cmd := exec.Command("powershell", "-Command",
		fmt.Sprintf("Test-NetConnection -ComputerName %s -Port %s", host, port))
	output, err := cmd.Output()
	if err != nil {
		fmt.Printf("❌ PowerShell测试失败: %v\n", err)
	} else {
		fmt.Printf("✅ PowerShell测试完成\n")
		fmt.Printf("输出: %s\n", string(output))
	}
}

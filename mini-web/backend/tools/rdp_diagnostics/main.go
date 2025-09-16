/*
 * @Author: Await
 * @Date: 2025-06-07 19:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 18:16:57
 * @Description: RDP连接诊断工具
 */
package main

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Printf("使用方法: %s <主机> <端口>\n", os.Args[0])
		fmt.Println("示例: go run rdp_diagnostics.go 192.168.123.5 3390")
		os.Exit(1)
	}

	host := os.Args[1]
	portStr := os.Args[2]

	port, err := strconv.Atoi(portStr)
	if err != nil {
		fmt.Printf("无效的端口号: %s\n", portStr)
		os.Exit(1)
	}

	fmt.Printf("=== RDP连接诊断工具 ===\n")
	fmt.Printf("目标: %s:%d\n", host, port)
	fmt.Printf("开始时间: %s\n\n", time.Now().Format("2006-01-02 15:04:05"))

	// 1. 基本网络连通性测试
	fmt.Println("1. 测试基本网络连通性...")
	testBasicConnectivity(host, port)

	// 2. 测试不同超时时间的连接
	fmt.Println("\n2. 测试不同超时时间...")
	testWithDifferentTimeouts(host, port)

	// 3. 测试多次连接
	fmt.Println("\n3. 测试连续多次连接...")
	testMultipleConnections(host, port, 5)

	// 4. 测试本地网络接口
	fmt.Println("\n4. 本地网络接口信息...")
	testLocalInterfaces()

	// 5. DNS解析测试
	fmt.Println("\n5. DNS解析测试...")
	testDNSResolution(host)

	// 6. 路由跟踪模拟（简化版）
	fmt.Println("\n6. 网络路径测试...")
	testNetworkPath(host, port)

	// 7. 系统建议
	fmt.Println("\n7. 解决方案建议...")
	provideSuggestions(host, port)

	fmt.Println("\n=== 诊断完成 ===")
}

func testBasicConnectivity(host string, port int) {
	address := fmt.Sprintf("%s:%d", host, port)

	fmt.Printf("尝试连接到 %s...\n", address)

	conn, err := net.DialTimeout("tcp", address, 5*time.Second)
	if err != nil {
		fmt.Printf("❌ 连接失败: %v\n", err)

		// 分析错误类型
		if netErr, ok := err.(net.Error); ok {
			if netErr.Timeout() {
				fmt.Println("  ⚠️  这是超时错误，可能的原因：")
				fmt.Println("     - 目标主机不可达")
				fmt.Println("     - 防火墙阻止了连接")
				fmt.Println("     - 网络延迟过高")
			}
		}

		// 检查是否是"connection refused"错误
		if strings.Contains(err.Error(), "refused") {
			fmt.Println("  ⚠️  连接被拒绝，可能的原因：")
			fmt.Println("     - 目标端口没有服务监听")
			fmt.Println("     - RDP服务未启动")
			fmt.Println("     - 防火墙规则阻止了连接")
			fmt.Println("     - RDP服务器配置了IP限制")
		}

		return
	}

	fmt.Printf("✅ 连接成功！\n")
	fmt.Printf("   本地地址: %s\n", conn.LocalAddr())
	fmt.Printf("   远程地址: %s\n", conn.RemoteAddr())

	conn.Close()
}

func testWithDifferentTimeouts(host string, port int) {
	timeouts := []time.Duration{1, 3, 5, 10, 30}

	for _, timeout := range timeouts {
		fmt.Printf("超时时间 %ds: ", int(timeout.Seconds()))

		start := time.Now()
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), timeout*time.Second)
		duration := time.Since(start)

		if err != nil {
			fmt.Printf("❌ 失败 (耗时: %v) - %v\n", duration, err)
		} else {
			fmt.Printf("✅ 成功 (耗时: %v)\n", duration)
			conn.Close()
		}
	}
}

func testMultipleConnections(host string, port int, count int) {
	successful := 0

	for i := 1; i <= count; i++ {
		fmt.Printf("第 %d 次连接: ", i)

		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 5*time.Second)
		if err != nil {
			fmt.Printf("❌ 失败 - %v\n", err)
		} else {
			fmt.Printf("✅ 成功\n")
			successful++
			conn.Close()
		}

		// 连接间隔
		if i < count {
			time.Sleep(1 * time.Second)
		}
	}

	fmt.Printf("成功率: %d/%d (%.1f%%)\n", successful, count, float64(successful)/float64(count)*100)
}

func testLocalInterfaces() {
	interfaces, err := net.Interfaces()
	if err != nil {
		fmt.Printf("❌ 获取网络接口失败: %v\n", err)
		return
	}

	fmt.Println("本地网络接口:")
	for _, iface := range interfaces {
		fmt.Printf("  - %s (%s)\n", iface.Name, iface.HardwareAddr)

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			fmt.Printf("    IP: %s\n", addr.String())
		}
	}
}

func testDNSResolution(host string) {
	fmt.Printf("解析主机名 '%s'...\n", host)

	ips, err := net.LookupIP(host)
	if err != nil {
		fmt.Printf("❌ DNS解析失败: %v\n", err)
		return
	}

	fmt.Printf("✅ DNS解析成功:\n")
	for _, ip := range ips {
		fmt.Printf("  - %s\n", ip.String())
	}
}

func testNetworkPath(host string, port int) {
	fmt.Printf("测试到 %s:%d 的网络路径...\n", host, port)

	// 测试不同的连接方式
	methods := []struct {
		name    string
		network string
	}{
		{"TCP IPv4", "tcp4"},
		{"TCP IPv6", "tcp6"},
		{"TCP (自动)", "tcp"},
	}

	for _, method := range methods {
		fmt.Printf("  %s: ", method.name)

		conn, err := net.DialTimeout(method.network, fmt.Sprintf("%s:%d", host, port), 5*time.Second)
		if err != nil {
			fmt.Printf("❌ 失败 - %v\n", err)
		} else {
			fmt.Printf("✅ 成功\n")
			conn.Close()
		}
	}
}

func provideSuggestions(host string, port int) {
	fmt.Println("基于诊断结果的解决方案：")
	fmt.Println()

	fmt.Println("📋 请按以下步骤检查：")
	fmt.Println()

	fmt.Println("1. 检查RDP服务状态（在目标机器上）：")
	fmt.Println("   - 按 Win+R，输入 services.msc")
	fmt.Println("   - 找到 'Remote Desktop Services' 服务")
	fmt.Println("   - 确保状态为 '已启动'")
	fmt.Println()

	fmt.Println("2. 检查RDP设置（在目标机器上）：")
	fmt.Println("   - 右键 '此电脑' → 属性 → 高级系统设置")
	fmt.Println("   - 点击 '远程' 选项卡")
	fmt.Println("   - 确保启用了远程桌面")
	fmt.Println()

	if port != 3389 {
		fmt.Printf("3. 检查RDP端口配置（目标机器使用非标准端口 %d）：\n", port)
		fmt.Println("   - 打开注册表编辑器 (regedit)")
		fmt.Println("   - 导航到: HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\Wds\\rdpwd\\Tds\\tcp")
		fmt.Printf("   - 确保 PortNumber 值为 %d\n", port)
		fmt.Println("   - 还要检查: HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp")
		fmt.Printf("   - 确保 PortNumber 值也为 %d\n", port)
		fmt.Println()
	}

	fmt.Println("4. 检查防火墙设置（在目标机器上）：")
	fmt.Println("   - 打开 Windows Defender 防火墙")
	fmt.Printf("   - 确保端口 %d 允许入站连接\n", port)
	fmt.Println("   - 或者允许 '远程桌面' 应用")
	fmt.Println()

	fmt.Println("5. 网络检查：")
	fmt.Println("   - 确保两台机器在同一网络或网络可达")
	fmt.Println("   - 检查路由器/防火墙是否阻止了连接")
	fmt.Println("   - 尝试从其他机器连接确认问题范围")
	fmt.Println()

	fmt.Println("6. 使用Windows内置命令测试：")
	fmt.Printf("   telnet %s %d\n", host, port)
	fmt.Println("   （如果连接成功，应该看到空白屏幕；如果失败，会立即报错）")
	fmt.Println()

	fmt.Println("7. 高级排查：")
	fmt.Println("   - 检查事件查看器中的错误日志")
	fmt.Println("   - 使用 netstat -an 查看端口监听状态")
	fmt.Println("   - 考虑重启 Remote Desktop Services 服务")
}

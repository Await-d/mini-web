package service

import (
	"regexp"
	"strings"
)

// TerminalFormatter 终端输出格式化器
type TerminalFormatter struct {
	passwordMode   bool   // 是否处于密码输入模式
	lastLine       string // 上一行内容，用于去重
	commandEcho    string // 命令回显，用于过滤
	passwordPrompt string // 密码提示内容
}

// NewTerminalFormatter 创建新的终端格式化器
func NewTerminalFormatter() *TerminalFormatter {
	return &TerminalFormatter{
		passwordMode: false,
		lastLine:     "",
		commandEcho:  "",
	}
}

// FormatOutput 格式化终端输出
func (tf *TerminalFormatter) FormatOutput(data []byte) []byte {
	text := string(data)

	// 如果是空内容，直接返回
	if strings.TrimSpace(text) == "" {
		return data
	}

	// 检查是否是密码提示
	if tf.isPasswordPrompt(text) {
		tf.passwordMode = true
		tf.passwordPrompt = text

		// 如果是重复的密码提示，不显示
		if strings.TrimSpace(text) == strings.TrimSpace(tf.lastLine) {
			return []byte("")
		}

		tf.lastLine = text
		// 添加调试日志
		// log.Printf("检测到密码提示，进入密码模式: %s", text)
		return data
	}

	// 在密码模式下，处理用户输入的密码内容
	if tf.passwordMode && tf.isPasswordInput(text) {
		// 替换密码为星号显示
		maskedText := tf.maskPassword(text)
		tf.lastLine = text
		// 添加调试日志（生产环境请移除）
		// log.Printf("密码处理: 原始长度=%d, 清理后长度=%d, 掩码结果长度=%d", len(text), len(tf.removeAnsiSequences(strings.TrimSpace(text))), len(maskedText))
		return []byte(maskedText)
	}

	// 检查是否退出密码模式
	if tf.passwordMode && tf.shouldExitPasswordMode(text) {
		tf.passwordMode = false
		tf.passwordPrompt = ""
	}

	// 检查是否是重复的错误消息
	if tf.isDuplicateErrorMessage(text) {
		return []byte("")
	}

	// 处理重复的提示符
	if tf.isDuplicatePrompt(text) {
		return []byte("")
	}

	tf.lastLine = text
	return data
}

// isPasswordPrompt 检查是否是密码提示
func (tf *TerminalFormatter) isPasswordPrompt(text string) bool {
	// 常见的密码提示模式
	passwordPrompts := []string{
		"password:",
		"password for",
		"enter password",
		"请输入密码",
		"[sudo] password for",
		"Password:",
		"Password for",
	}

	lowercaseText := strings.ToLower(strings.TrimSpace(text))

	for _, prompt := range passwordPrompts {
		if strings.Contains(lowercaseText, prompt) {
			return true
		}
	}

	return false
}

// isPasswordInput 检查是否是密码输入
func (tf *TerminalFormatter) isPasswordInput(text string) bool {
	// 在密码模式下，如果输入不是提示符或错误消息，就认为是密码输入
	if !tf.passwordMode {
		return false
	}

	trimmed := strings.TrimSpace(text)

	// 排除空行
	if trimmed == "" {
		return false
	}

	// 清理ANSI序列后再检查
	cleanText := tf.removeAnsiSequences(trimmed)

	// 排除清理后为空的内容
	if cleanText == "" {
		return false
	}

	// 排除错误消息
	lowercaseText := strings.ToLower(cleanText)
	if strings.Contains(lowercaseText, "sorry") ||
		strings.Contains(lowercaseText, "incorrect") ||
		strings.Contains(lowercaseText, "failed") ||
		strings.Contains(lowercaseText, "wrong") ||
		strings.Contains(lowercaseText, "try again") {
		return false
	}

	// 排除明显的提示符（使用清理后的文本检查）
	promptPattern := regexp.MustCompile(`^\s*[^@]*@[^$#>]*[$#>]\s*$`)
	if promptPattern.MatchString(cleanText) {
		return false
	}

	// 排除单独的提示符字符
	if cleanText == "$" || cleanText == "#" || cleanText == ">" {
		return false
	}

	// 排除密码提示本身
	if tf.isPasswordPrompt(cleanText) {
		return false
	}

	// 简化检测逻辑：在密码模式下，任何包含可见字符的输入都认为是密码
	// 这解决了第一次输入时检测失败的问题
	if len(cleanText) > 0 {
		// 添加调试日志
		// log.Printf("检测密码输入: 原始长度=%d, 清理后='%s', 长度=%d", len(trimmed), cleanText, len(cleanText))
		return true
	}

	return false
}

// maskPassword 将密码替换为星号
func (tf *TerminalFormatter) maskPassword(text string) string {
	trimmed := strings.TrimSpace(text)
	if len(trimmed) == 0 {
		return text
	}

	// 移除ANSI转义序列和控制字符，只保留可见字符
	cleanText := tf.removeAnsiSequences(trimmed)

	// 如果清理后的文本为空，返回原文本
	if len(cleanText) == 0 {
		return text
	}

	// 为密码生成合理数量的星号（限制最大长度）
	maxStars := 20 // 最多显示20个星号
	starCount := len(cleanText)
	if starCount > maxStars {
		starCount = maxStars
	}
	maskedPassword := strings.Repeat("*", starCount)

	// 添加调试日志
	// log.Printf("密码掩码: 原始='%s', 清理后='%s', 星号数=%d", trimmed, cleanText, starCount)

	// 返回简单的星号字符串，不保留原格式
	return maskedPassword
}

// removeAnsiSequences 移除ANSI转义序列和控制字符
func (tf *TerminalFormatter) removeAnsiSequences(text string) string {
	// ANSI转义序列正则表达式
	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

	// 移除ANSI序列
	cleaned := ansiRegex.ReplaceAllString(text, "")

	// 移除其他控制字符（保留可打印字符）
	result := ""
	for _, r := range cleaned {
		if r >= 32 && r <= 126 || r >= 128 { // 可打印ASCII字符和Unicode字符
			result += string(r)
		}
	}

	return result
}

// shouldExitPasswordMode 检查是否应该退出密码模式
func (tf *TerminalFormatter) shouldExitPasswordMode(text string) bool {
	lowercaseText := strings.ToLower(strings.TrimSpace(text))

	// 成功登录的提示
	successIndicators := []string{
		"welcome",
		"login successful",
		"authentication successful",
		"$",
		"#",
		">",
		"root@",
		"~",
	}

	// 错误消息后通常会重新提示密码，不退出密码模式
	errorIndicators := []string{
		"sorry",
		"incorrect",
		"failed",
		"wrong",
		"try again",
		"authentication failure",
	}

	// 如果是错误消息，不退出密码模式
	for _, indicator := range errorIndicators {
		if strings.Contains(lowercaseText, indicator) {
			return false
		}
	}

	// 如果是成功指示器，退出密码模式
	for _, indicator := range successIndicators {
		if strings.Contains(lowercaseText, indicator) {
			return true
		}
	}

	return false
}

// isDuplicateErrorMessage 检查是否是重复的错误消息
func (tf *TerminalFormatter) isDuplicateErrorMessage(text string) bool {
	trimmed := strings.TrimSpace(text)
	lastTrimmed := strings.TrimSpace(tf.lastLine)

	// 如果与上一行完全相同，认为是重复
	if trimmed == lastTrimmed && trimmed != "" {
		return true
	}

	return false
}

// isDuplicatePrompt 检查是否是重复的提示符
func (tf *TerminalFormatter) isDuplicatePrompt(text string) bool {
	trimmed := strings.TrimSpace(text)
	lastTrimmed := strings.TrimSpace(tf.lastLine)

	// 检查是否是提示符格式
	promptPattern := regexp.MustCompile(`.*[$#>]\s*$`)

	if promptPattern.MatchString(trimmed) && trimmed == lastTrimmed {
		return true
	}

	return false
}

// IsPasswordMode 检查是否处于密码输入模式
func (tf *TerminalFormatter) IsPasswordMode() bool {
	return tf.passwordMode
}

// SetCommandEcho 设置命令回显内容，用于过滤
func (tf *TerminalFormatter) SetCommandEcho(command string) {
	tf.commandEcho = command
}

// Reset 重置格式化器状态
func (tf *TerminalFormatter) Reset() {
	tf.passwordMode = false
	tf.lastLine = ""
	tf.commandEcho = ""
	tf.passwordPrompt = ""
}

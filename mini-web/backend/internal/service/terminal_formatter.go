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
		return data
	}

	// 检查是否是密码输入内容
	if tf.passwordMode && tf.isPasswordInput(text) {
		// 替换密码为星号
		maskedText := tf.maskPassword(text)
		tf.lastLine = text
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

	// 排除空行、错误消息等
	if trimmed == "" ||
		strings.Contains(strings.ToLower(trimmed), "sorry") ||
		strings.Contains(strings.ToLower(trimmed), "incorrect") ||
		strings.Contains(strings.ToLower(trimmed), "failed") ||
		strings.Contains(trimmed, "$") ||
		strings.Contains(trimmed, "#") ||
		strings.Contains(trimmed, ">") {
		return false
	}

	// 如果包含明显的密码字符，认为是密码输入
	if len(trimmed) > 0 && !tf.isPasswordPrompt(text) {
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

	// 保留原有的空白格式，只替换文本内容
	return strings.Replace(text, trimmed, strings.Repeat("*", len(trimmed)), 1)
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

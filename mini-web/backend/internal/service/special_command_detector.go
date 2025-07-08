package service

import (
	"regexp"
	"strings"
)

// SpecialCommandType 特殊命令类型
type SpecialCommandType string

const (
	SpecialCommandPassword SpecialCommandType = "password" // 密码输入
	SpecialCommandSudo     SpecialCommandType = "sudo"     // sudo确认
	SpecialCommandConfirm  SpecialCommandType = "confirm"  // 确认操作
	SpecialCommandEditor   SpecialCommandType = "editor"   // 文件编辑器
	SpecialCommandProgress SpecialCommandType = "progress" // 进度显示
	SpecialCommandInstall  SpecialCommandType = "install"  // 软件安装
	SpecialCommandLogin    SpecialCommandType = "login"    // 登录提示
	SpecialCommandMenu     SpecialCommandType = "menu"     // 菜单选择
	SpecialCommandNormal   SpecialCommandType = "normal"   // 普通命令
)

// SpecialCommandInfo 特殊命令信息
type SpecialCommandInfo struct {
	Type        SpecialCommandType `json:"type"`
	Prompt      string             `json:"prompt"`      // 原始提示文本
	Context     string             `json:"context"`     // 上下文信息
	Masked      bool               `json:"masked"`      // 是否需要掩码输入
	ExpectInput bool               `json:"expectInput"` // 是否期待用户输入
	Timeout     int                `json:"timeout"`     // 超时时间（秒）
	Options     []string           `json:"options"`     // 可选项（用于菜单等）
	Pattern     string             `json:"pattern"`     // 匹配的正则表达式
	Description string             `json:"description"` // 描述信息
}

// SpecialCommandDetector 特殊命令检测器
type SpecialCommandDetector struct {
	patterns []commandPattern
}

type commandPattern struct {
	regex       *regexp.Regexp
	commandType SpecialCommandType
	masked      bool
	timeout     int
	description string
}

// NewSpecialCommandDetector 创建特殊命令检测器
func NewSpecialCommandDetector() *SpecialCommandDetector {
	detector := &SpecialCommandDetector{}
	detector.initPatterns()
	return detector
}

// initPatterns 初始化匹配模式
func (d *SpecialCommandDetector) initPatterns() {
	patterns := []struct {
		pattern     string
		commandType SpecialCommandType
		masked      bool
		timeout     int
		description string
	}{
		// 密码输入模式
		{`(?i)(password|密码|口令).*[:：]\s*$`, SpecialCommandPassword, true, 30, "密码输入"},
		{`(?i)enter.*password.*[:：]\s*$`, SpecialCommandPassword, true, 30, "输入密码"},
		{`(?i)请输入密码.*[:：]\s*$`, SpecialCommandPassword, true, 30, "请输入密码"},
		{`(?i)\[sudo\].*password.*[:：]\s*$`, SpecialCommandSudo, true, 30, "sudo密码确认"},

		// SSH登录相关
		{`(?i).*@.*'s password.*[:：]\s*$`, SpecialCommandLogin, true, 30, "SSH登录密码"},
		{`(?i)are you sure you want to continue connecting.*\(yes/no.*\)\??\s*$`, SpecialCommandConfirm, false, 15, "SSH连接确认"},
		{`(?i)the authenticity of host.*can't be established`, SpecialCommandConfirm, false, 15, "主机认证确认"},

		// 确认操作
		{`(?i).*\(y/n\).*[:：]?\s*$`, SpecialCommandConfirm, false, 15, "是否确认"},
		{`(?i).*\(yes/no\).*[:：]?\s*$`, SpecialCommandConfirm, false, 15, "是否确认"},
		{`(?i)do you want to continue.*\(y/n\).*$`, SpecialCommandConfirm, false, 15, "是否继续"},
		{`(?i)继续.*\(y/n\).*$`, SpecialCommandConfirm, false, 15, "是否继续"},
		{`(?i)确认.*\(y/n\).*$`, SpecialCommandConfirm, false, 15, "确认操作"},

		// 文件编辑器
		{`(?i)entering.*vi.*mode`, SpecialCommandEditor, false, 0, "进入vi编辑模式"},
		{`(?i)entering.*vim.*mode`, SpecialCommandEditor, false, 0, "进入vim编辑模式"},
		{`(?i)nano.*editor`, SpecialCommandEditor, false, 0, "进入nano编辑模式"},
		{`(?i)--.*insert.*--`, SpecialCommandEditor, false, 0, "编辑器插入模式"},

		// 软件安装进度
		{`(?i)downloading.*packages`, SpecialCommandProgress, false, 0, "正在下载软件包"},
		{`(?i)installing.*packages`, SpecialCommandInstall, false, 0, "正在安装软件包"},
		{`(?i)upgrading.*packages`, SpecialCommandInstall, false, 0, "正在升级软件包"},
		{`(?i)正在下载`, SpecialCommandProgress, false, 0, "正在下载"},
		{`(?i)正在安装`, SpecialCommandInstall, false, 0, "正在安装"},
		{`(?i)正在更新`, SpecialCommandProgress, false, 0, "正在更新"},

		// 进度条模式
		{`\[.*[#=>\-\*]+.*\].*%`, SpecialCommandProgress, false, 0, "进度条显示"},
		{`\d+%.*complete`, SpecialCommandProgress, false, 0, "完成百分比"},

		// 菜单选择
		{`(?i)please select.*[:：]\s*$`, SpecialCommandMenu, false, 30, "菜单选择"},
		{`(?i)选择.*[:：]\s*$`, SpecialCommandMenu, false, 30, "菜单选择"},
		{`(?i)\d+\).*\n.*\d+\).*`, SpecialCommandMenu, false, 30, "数字菜单"},
	}

	d.patterns = make([]commandPattern, len(patterns))
	for i, p := range patterns {
		d.patterns[i] = commandPattern{
			regex:       regexp.MustCompile(p.pattern),
			commandType: p.commandType,
			masked:      p.masked,
			timeout:     p.timeout,
			description: p.description,
		}
	}
}

// DetectSpecialCommand 检测特殊命令
func (d *SpecialCommandDetector) DetectSpecialCommand(output string) *SpecialCommandInfo {
	// 清理输出文本，移除ANSI转义序列
	cleanOutput := d.cleanAnsiSequences(output)

	// 按行分割，检查最后几行
	lines := strings.Split(strings.TrimSpace(cleanOutput), "\n")
	if len(lines) == 0 {
		return &SpecialCommandInfo{Type: SpecialCommandNormal}
	}

	// 检查最后3行的内容
	checkLines := make([]string, 0)
	for i := len(lines) - 1; i >= 0 && len(checkLines) < 3; i-- {
		if strings.TrimSpace(lines[i]) != "" {
			checkLines = append([]string{lines[i]}, checkLines...)
		}
	}

	// 检查每一行是否匹配特殊模式
	for _, line := range checkLines {
		for _, pattern := range d.patterns {
			if pattern.regex.MatchString(line) {
				// 提取选项（用于菜单等）
				options := d.extractOptions(cleanOutput, pattern.commandType)

				// 判断是否期待用户输入
				expectInput := (pattern.commandType == SpecialCommandPassword ||
					pattern.commandType == SpecialCommandSudo ||
					pattern.commandType == SpecialCommandLogin ||
					pattern.commandType == SpecialCommandConfirm ||
					pattern.commandType == SpecialCommandMenu)

				return &SpecialCommandInfo{
					Type:        pattern.commandType,
					Prompt:      strings.TrimSpace(line),
					Context:     strings.Join(checkLines, "\n"),
					Masked:      pattern.masked,
					ExpectInput: expectInput,
					Timeout:     pattern.timeout,
					Options:     options,
					Pattern:     pattern.regex.String(),
					Description: pattern.description,
				}
			}
		}
	}

	return &SpecialCommandInfo{Type: SpecialCommandNormal}
}

// cleanAnsiSequences 清理ANSI转义序列
func (d *SpecialCommandDetector) cleanAnsiSequences(text string) string {
	// 移除ANSI颜色代码和控制序列
	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	cleaned := ansiRegex.ReplaceAllString(text, "")

	// 移除回车符
	cleaned = strings.ReplaceAll(cleaned, "\r", "")

	return cleaned
}

// extractOptions 提取选项（用于菜单等）
func (d *SpecialCommandDetector) extractOptions(output string, commandType SpecialCommandType) []string {
	var options []string

	switch commandType {
	case SpecialCommandConfirm:
		// 提取y/n选项
		if strings.Contains(strings.ToLower(output), "(y/n)") {
			options = []string{"y", "n"}
		} else if strings.Contains(strings.ToLower(output), "(yes/no)") {
			options = []string{"yes", "no"}
		}

	case SpecialCommandMenu:
		// 提取数字菜单选项
		lines := strings.Split(output, "\n")
		menuRegex := regexp.MustCompile(`^\s*(\d+)\)\s*(.+)$`)

		for _, line := range lines {
			matches := menuRegex.FindStringSubmatch(strings.TrimSpace(line))
			if len(matches) >= 3 {
				options = append(options, matches[1]) // 添加选项编号
			}
		}

	case SpecialCommandLogin:
		// SSH连接确认选项
		if strings.Contains(strings.ToLower(output), "yes/no") {
			options = []string{"yes", "no"}
		}
	}

	return options
}

// IsPasswordPrompt 快速检查是否是密码提示
func (d *SpecialCommandDetector) IsPasswordPrompt(output string) bool {
	info := d.DetectSpecialCommand(output)
	return info.Type == SpecialCommandPassword || info.Type == SpecialCommandSudo || info.Type == SpecialCommandLogin
}

// IsConfirmPrompt 快速检查是否是确认提示
func (d *SpecialCommandDetector) IsConfirmPrompt(output string) bool {
	info := d.DetectSpecialCommand(output)
	return info.Type == SpecialCommandConfirm
}

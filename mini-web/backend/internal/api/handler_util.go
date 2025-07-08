package api

import (
	"gitee.com/await29/mini-web/internal/service"
	"log"
)

// 确保HandleResizeCommand被正确导出和引用
func init() {
	log.Println("注册调整大小命令处理函数...")
}

// HandleResizeCommandHelper 为了避免导入循环，创建一个辅助函数
func HandleResizeCommandHelper(p []byte, terminal service.TerminalSession) bool {
	return HandleResizeCommand(p, terminal)
}
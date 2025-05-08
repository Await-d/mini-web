package api

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"gitee.com/await29/mini-web/internal/service"
)

// HandleResizeCommand 处理调整终端大小的命令
// 支持多种不同格式:
// 1. {type: "resize", width: X, height: Y}
// 2. {type: "resize", cols: X, rows: Y}
// 3. {cols: X, rows: Y} - 不包含type字段的纯大小信息
// 4. {type: "resize"} 包含其他嵌套结构
// 5. 不完整的JSON数据，尽量进行解析
func HandleResizeCommand(p []byte, terminal service.TerminalSession) bool {
	// 修复不完整的JSON数据
	dataStr := string(p)
	if !strings.HasSuffix(dataStr, "}") && strings.Contains(dataStr, "{") {
		// 尝试修复不完整的JSON
		if lastOpenBrace := strings.LastIndex(dataStr, "{"); lastOpenBrace >= 0 {
			braceCount := 0
			for _, c := range dataStr[lastOpenBrace:] {
				if c == '{' {
					braceCount++
				} else if c == '}' {
					braceCount--
				}
			}
			// 添加缺失的右花括号
			for i := 0; i < braceCount; i++ {
				dataStr += "}"
			}
			p = []byte(dataStr)
		}
	}
	
	// 先尝试最简单的格式 - 只包含cols和rows，没有type字段
	var simpleResize struct {
		Cols   int `json:"cols"`
		Rows   int `json:"rows"`
	}
	
	if err := json.Unmarshal(p, &simpleResize); err == nil && simpleResize.Cols > 0 && simpleResize.Rows > 0 {
		log.Printf("从简单格式解析终端调整大小命令: 列=%d, 行=%d",
			simpleResize.Cols, simpleResize.Rows)
		terminal.WindowResize(uint16(simpleResize.Rows), uint16(simpleResize.Cols))
		return true
	}
	
	// 尝试简单的宽高格式
	var simpleWidthHeight struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	}
	
	if err := json.Unmarshal(p, &simpleWidthHeight); err == nil && simpleWidthHeight.Width > 0 && simpleWidthHeight.Height > 0 {
		log.Printf("从简单宽高格式解析终端调整大小命令: 宽度=%d, 高度=%d",
			simpleWidthHeight.Width, simpleWidthHeight.Height)
		terminal.WindowResize(uint16(simpleWidthHeight.Height), uint16(simpleWidthHeight.Width))
		return true
	}

	// 尝试带类型字段的标准格式
	var resizeData struct {
		Type   string `json:"type"`
		Width  int    `json:"width"`
		Height int    `json:"height"`
		Cols   int    `json:"cols"`
		Rows   int    `json:"rows"`
	}

	// 从完整消息解析
	if err := json.Unmarshal(p, &resizeData); err == nil {
		// 优先使用cols/rows格式（无论是否有Type字段都尝试解析）
		if (resizeData.Type == "resize" || resizeData.Type == "") && resizeData.Cols > 0 && resizeData.Rows > 0 {
			log.Printf("从标准格式解析终端调整大小命令: 列=%d, 行=%d",
				resizeData.Cols, resizeData.Rows)
			terminal.WindowResize(uint16(resizeData.Rows), uint16(resizeData.Cols))
			return true
		} else if (resizeData.Type == "resize" || resizeData.Type == "") && resizeData.Width > 0 && resizeData.Height > 0 {
			// 兼容width/height格式
			log.Printf("从标准格式解析终端调整大小命令: 宽度=%d, 高度=%d",
				resizeData.Width, resizeData.Height)
			terminal.WindowResize(uint16(resizeData.Height), uint16(resizeData.Width))
			return true
		}
	} else {
		log.Printf("完整格式解析失败: %v, 尝试其他方法", err)
	}

	// 尝试解析局部字段
	var cmdWrapper struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	
	// 记录更多调试信息
	log.Printf("尝试解析resize命令的数据: %s", string(p))

	if err := json.Unmarshal(p, &cmdWrapper); err == nil && cmdWrapper.Type == "resize" {
		log.Printf("成功解析resize命令的type字段: %s", cmdWrapper.Type)
		if len(cmdWrapper.Data) > 0 {
			log.Printf("resize命令包含data字段: %s", string(cmdWrapper.Data))
			// 尝试从data字段解析
			var dataResizeData struct {
				Width  int `json:"width"`
				Height int `json:"height"`
				Cols   int `json:"cols"`
				Rows   int `json:"rows"`
			}

			if err := json.Unmarshal(cmdWrapper.Data, &dataResizeData); err == nil {
				// 优先使用cols/rows格式
				if dataResizeData.Cols > 0 && dataResizeData.Rows > 0 {
					log.Printf("从cmd.Data解析终端调整大小命令: 列=%d, 行=%d",
						dataResizeData.Cols, dataResizeData.Rows)
					terminal.WindowResize(uint16(dataResizeData.Rows), uint16(dataResizeData.Cols))
					return true
				} else if dataResizeData.Width > 0 && dataResizeData.Height > 0 {
					// 兼容width/height格式
					log.Printf("从cmd.Data解析终端调整大小命令: 宽度=%d, 高度=%d",
						dataResizeData.Width, dataResizeData.Height)
					terminal.WindowResize(uint16(dataResizeData.Height), uint16(dataResizeData.Width))
					return true
				}
			} else {
				log.Printf("解析Data字段失败: %v, 尝试其他方法", err)
			}
		} else {
			// 可能是resize字段在JSON根级别，尝试提取其他结构
			log.Printf("resize命令没有Data字段，尝试通过其他方式解析")
			var lastResort struct {
				Type   string `json:"type"`
				Width  int    `json:"width,omitempty"`
				Height int    `json:"height,omitempty"`
				Cols   int    `json:"cols,omitempty"`
				Rows   int    `json:"rows,omitempty"`
			}
			
			if err := json.Unmarshal(p, &lastResort); err == nil {
				log.Printf("使用最后手段解析resize命令: 类型=%s, 列=%d, 行=%d, 宽度=%d, 高度=%d", 
					lastResort.Type, lastResort.Cols, lastResort.Rows, lastResort.Width, lastResort.Height)
					
				if lastResort.Cols > 0 && lastResort.Rows > 0 {
					terminal.WindowResize(uint16(lastResort.Rows), uint16(lastResort.Cols))
					return true
				} else if lastResort.Width > 0 && lastResort.Height > 0 {
					terminal.WindowResize(uint16(lastResort.Height), uint16(lastResort.Width))
					return true
				}
			}
		}
	}
	
	// 尝试从字符串中解析数字
	if len(p) > 0 {
		log.Printf("尝试从字符串中解析调整大小命令: %s", string(p))
		
		// 查找常见的尺寸标记
		s := string(p)
		colsIdx := strings.Index(s, "\"cols\"")
		rowsIdx := strings.Index(s, "\"rows\"")
		widthIdx := strings.Index(s, "\"width\"")
		heightIdx := strings.Index(s, "\"height\"")
		
		// 尝试从字符串中提取数字
		var cols, rows, width, height int
		if colsIdx >= 0 && rowsIdx >= 0 {
			// 提取cols和rows的值
			colsPart := s[colsIdx+6:]
			rowsPart := s[rowsIdx+6:]
			
			// 增强数字解析能力，支持JSON数字格式
			for i := 0; i < len(colsPart); i++ {
				if colsPart[i] >= '0' && colsPart[i] <= '9' {
					// 找到数字，尝试解析
					_, err := fmt.Sscanf(colsPart[i:], "%d", &cols)
					if err == nil {
						break
					}
				}
			}
			
			for i := 0; i < len(rowsPart); i++ {
				if rowsPart[i] >= '0' && rowsPart[i] <= '9' {
					// 找到数字，尝试解析
					_, err := fmt.Sscanf(rowsPart[i:], "%d", &rows)
					if err == nil {
						break
					}
				}
			}
			
			// 也尝试简单冒号后数字解析方式
			if cols <= 0 || rows <= 0 {
				_, err1 := fmt.Sscanf(colsPart, ":%d", &cols)
				_, err2 := fmt.Sscanf(rowsPart, ":%d", &rows)
				
				// 再尝试其他常见格式 "cols": 数字
				if err1 != nil || cols <= 0 {
					for i := 0; i < len(colsPart); i++ {
						if colsPart[i] == ':' {
							_, err := fmt.Sscanf(colsPart[i+1:], "%d", &cols)
							if err == nil {
								break
							}
						}
					}
				}
				
				if err2 != nil || rows <= 0 {
					for i := 0; i < len(rowsPart); i++ {
						if rowsPart[i] == ':' {
							_, err := fmt.Sscanf(rowsPart[i+1:], "%d", &rows)
							if err == nil {
								break
							}
						}
					}
				}
			}
			
			if cols > 0 && rows > 0 {
				log.Printf("从字符串中提取到尺寸: 列=%d, 行=%d", cols, rows)
				terminal.WindowResize(uint16(rows), uint16(cols))
				return true
			}
		} else if widthIdx >= 0 && heightIdx >= 0 {
			// 提取width和height的值
			widthPart := s[widthIdx+7:]
			heightPart := s[heightIdx+8:]
			
			// 增强数字解析能力，支持JSON数字格式
			for i := 0; i < len(widthPart); i++ {
				if widthPart[i] >= '0' && widthPart[i] <= '9' {
					// 找到数字，尝试解析
					_, err := fmt.Sscanf(widthPart[i:], "%d", &width)
					if err == nil {
						break
					}
				}
			}
			
			for i := 0; i < len(heightPart); i++ {
				if heightPart[i] >= '0' && heightPart[i] <= '9' {
					// 找到数字，尝试解析
					_, err := fmt.Sscanf(heightPart[i:], "%d", &height)
					if err == nil {
						break
					}
				}
			}
			
			// 也尝试简单冒号后数字解析方式
			if width <= 0 || height <= 0 {
				_, err1 := fmt.Sscanf(widthPart, ":%d", &width)
				_, err2 := fmt.Sscanf(heightPart, ":%d", &height)
				
				// 再尝试其他常见格式 "width": 数字
				if err1 != nil || width <= 0 {
					for i := 0; i < len(widthPart); i++ {
						if widthPart[i] == ':' {
							_, err := fmt.Sscanf(widthPart[i+1:], "%d", &width)
							if err == nil {
								break
							}
						}
					}
				}
				
				if err2 != nil || height <= 0 {
					for i := 0; i < len(heightPart); i++ {
						if heightPart[i] == ':' {
							_, err := fmt.Sscanf(heightPart[i+1:], "%d", &height)
							if err == nil {
								break
							}
						}
					}
				}
			}
			
			if width > 0 && height > 0 {
				log.Printf("从字符串中提取到尺寸: 宽度=%d, 高度=%d", width, height)
				terminal.WindowResize(uint16(height), uint16(width))
				return true
			}
		}
	}
	
	// 所有方法都失败，输出数据以便调试
	if len(p) > 0 {
		log.Printf("所有方法都无法解析resize命令，输出原始数据以供调试: %s", string(p))
	}

	return false
}
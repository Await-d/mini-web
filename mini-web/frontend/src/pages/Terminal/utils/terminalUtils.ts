/*
 * @Author: Await
 * @Date: 2025-05-24 22:30:15
 * @LastEditors: Await
 * @LastEditTime: 2025-05-24 21:21:07
 * @Description: 终端工具函数
 */

/**
 * 终端数据处理类，用于缓冲和排序WebSocket消息
 */
export class TerminalDataProcessor {
    private messageQueue: any[] = [];
    private isProcessing: boolean = false;
    private processingDelay: number = 5; // 处理间隔(毫秒)
    private tabKey: string;
    private onMessage: (data: any) => void;

    /**
     * 创建一个终端数据处理器
     * @param tabKey 标签页Key
     * @param onMessage 消息处理回调
     * @param processingDelay 处理延迟(毫秒)
     */
    constructor(tabKey: string, onMessage: (data: any) => void, processingDelay: number = 5) {
        this.tabKey = tabKey;
        this.onMessage = onMessage;
        this.processingDelay = processingDelay;
    }

    /**
     * 添加消息到队列
     * @param data 消息数据
     */
    public addMessage(data: any): void {
        this.messageQueue.push(data);

        // 如果没有正在处理的消息，开始处理队列
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    /**
     * 处理消息队列
     */
    private processQueue(): void {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            // 获取队列中的第一条消息
            const message = this.messageQueue.shift();

            // 处理消息
            this.onMessage(message);

            // 延迟处理下一条消息，防止UI阻塞
            setTimeout(() => {
                this.isProcessing = false;

                // 如果队列中还有消息，继续处理
                if (this.messageQueue.length > 0) {
                    this.processQueue();
                }
            }, this.processingDelay);
        } catch (error) {
            console.error(`处理消息队列时出错: ${this.tabKey}`, error);
            this.isProcessing = false;

            // 发生错误后，也要继续处理队列
            if (this.messageQueue.length > 0) {
                setTimeout(() => {
                    this.processQueue();
                }, this.processingDelay * 2); // 错误后稍微增加延迟
            }
        }
    }

    /**
     * 清空消息队列
     */
    public clear(): void {
        this.messageQueue = [];
        this.isProcessing = false;
    }

    /**
     * 获取队列中待处理的消息数量
     */
    public getPendingCount(): number {
        return this.messageQueue.length;
    }
}

/**
 * 解析终端输出文本
 * @param text 终端文本
 * @returns 解析后的文本行数组
 */
export function parseTerminalOutput(text: string): string[] {
    // 按换行符分割文本
    const lines = text.split(/\r?\n/);

    // 过滤掉空行
    return lines.filter(line => line.trim() !== '');
}

/**
 * 处理ANSI转义序列
 * @param text 包含ANSI转义序列的文本
 * @returns 处理后的文本
 */
export function stripAnsiEscapeCodes(text: string): string {
    // 移除ANSI转义序列，如颜色代码等
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * 将ANSI转义序列转换为HTML/CSS样式
 * @param text 包含ANSI转义序列的文本
 * @returns 包含HTML样式的文本
 */
export function ansiToHtml(text: string): string {
    // 基本颜色映射
    const colors: Record<string, string> = {
        '30': 'black',
        '31': 'red',
        '32': 'green',
        '33': 'yellow',
        '34': 'blue',
        '35': 'magenta',
        '36': 'cyan',
        '37': 'white',
        '90': 'gray',
        '91': 'lightred',
        '92': 'lightgreen',
        '93': 'lightyellow',
        '94': 'lightblue',
        '95': 'lightmagenta',
        '96': 'lightcyan',
        '97': 'lightwhite'
    };

    // 替换ANSI转义序列为HTML标签
    let result = text.replace(/\x1B\[([0-9;]+)m/g, (match, p1) => {
        const codes = p1.split(';');
        let styles = '';

        for (const code of codes) {
            if (code === '0' || code === '00') {
                // 重置所有样式
                return '</span>';
            } else if (colors[code]) {
                // 文本颜色
                styles += `color: ${colors[code]};`;
            } else if (code === '1') {
                // 粗体
                styles += 'font-weight: bold;';
            } else if (code === '3') {
                // 斜体
                styles += 'font-style: italic;';
            } else if (code === '4') {
                // 下划线
                styles += 'text-decoration: underline;';
            }
        }

        if (styles) {
            return `<span style="${styles}">`;
        }
        return '';
    });

    // 确保所有span标签都被关闭
    const openTags = (result.match(/<span/g) || []).length;
    const closeTags = (result.match(/<\/span>/g) || []).length;
    for (let i = 0; i < openTags - closeTags; i++) {
        result += '</span>';
    }

    return result;
}

/**
 * 识别终端命令提示符
 * @param line 终端行文本
 * @returns 是否是命令提示符
 */
export function isPromptLine(line: string): boolean {
    // 检查常见的命令提示符模式
    const promptPatterns = [
        /[\w\-\.]+@[\w\-\.]+:.+[\$\#\>]\s*$/,  // username@hostname:path$ 
        /^[A-Za-z]:\\.*>\s*$/,                 // C:\path>
        /^\[.+\].+[$#>]\s*$/                   // [user@host path]$
    ];

    return promptPatterns.some(pattern => pattern.test(line));
}

/**
 * 解析WebSocket消息
 * @param data WebSocket消息数据
 * @returns 解析后的数据
 */
export async function parseWebSocketMessage(data: any): Promise<{ type: string, content: any }> {
    try {
        // 处理Blob数据
        if (data instanceof Blob) {
            const text = await data.text();
            try {
                // 尝试解析JSON
                const jsonData = JSON.parse(text);
                return { type: 'json', content: jsonData };
            } catch (e) {
                // 不是JSON，作为文本处理
                return { type: 'text', content: text };
            }
        }
        // 处理字符串数据
        else if (typeof data === 'string') {
            try {
                // 尝试解析JSON
                const jsonData = JSON.parse(data);
                return { type: 'json', content: jsonData };
            } catch (e) {
                // 不是JSON，作为文本处理
                return { type: 'text', content: data };
            }
        }
        // 其他类型数据
        else {
            return { type: 'other', content: data };
        }
    } catch (error) {
        console.error('解析WebSocket消息出错:', error);
        return { type: 'error', content: String(error) };
    }
} 
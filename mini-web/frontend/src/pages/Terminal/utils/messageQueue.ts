// 终端消息队列管理
// 用于优化高频消息的渲染性能

/**
 * 消息队列类
 * 用于批量处理终端消息，提高渲染性能
 */
export class TerminalMessageQueue {
  private queue: string[] = [];
  private processingTimer: number | null = null;
  private maxBatchSize: number = 20;
  private processingInterval: number = 16; // 大约60fps
  private processingCallback: (messages: string[]) => void;
  
  constructor(
    callback: (messages: string[]) => void,
    options?: {
      maxBatchSize?: number,
      processingInterval?: number
    }
  ) {
    this.processingCallback = callback;
    
    if (options?.maxBatchSize) {
      this.maxBatchSize = options.maxBatchSize;
    }
    
    if (options?.processingInterval) {
      this.processingInterval = options.processingInterval;
    }
  }
  
  /**
   * 添加消息到队列
   */
  public enqueue(message: string): void {
    if (!message) return;
    
    // 优化：对某些消息进行特殊处理，避免终端渲染异常
    // 系统消息完全过滤掉
    if (this.isSystemMessage(message)) {
      // 系统消息不加入渲染队列
      console.debug('过滤系统消息:', message.substring(0, 50) + (message.length > 50 ? '...' : ''));
      return;
    }
    
    // 优化：处理特大数据块
    // 如果消息过大，分块处理避免性能问题
    if (message.length > 10000) {
      console.log(`处理大型消息: ${message.length}字节，分块处理`);
      // 每5000字符分块
      const chunkSize = 5000;
      for (let i = 0; i < message.length; i += chunkSize) {
        const chunk = message.substring(i, Math.min(i + chunkSize, message.length));
        this.queue.push(chunk);
      }
    } else {
      // 添加到队列
      this.queue.push(message);
    }
    
    // 如果队列达到最大批处理大小，立即处理
    if (this.queue.length >= this.maxBatchSize) {
      this.processQueue();
      return;
    }
    
    // 否则设置定时器延迟处理，使用requestAnimationFrame优化渲染
    if (this.processingTimer === null) {
      // 使用requestAnimationFrame而不是setTimeout，更好地与浏览器渲染周期同步
      this.processingTimer = window.requestAnimationFrame(() => {
        // 延迟到下一帧处理
        setTimeout(() => {
          this.processQueue();
        }, this.processingInterval);
      });
    }
  }
  
  /**
   * 处理队列中的消息
   */
  private processQueue(): void {
    // 清除定时器
    if (this.processingTimer !== null) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    
    // 如果队列为空，不处理
    if (this.queue.length === 0) {
      return;
    }
    
    // 复制当前队列并清空
    const messagesToProcess = [...this.queue];
    this.queue = [];
    
    // 使用requestAnimationFrame确保在下一帧处理
    window.requestAnimationFrame(() => {
      // 调用回调处理消息
      this.processingCallback(messagesToProcess);
    });
  }
  
  /**
   * 立即处理所有消息
   */
  public flush(): void {
    this.processQueue();
  }
  
  /**
   * 清空队列
   */
  public clear(): void {
    if (this.processingTimer !== null) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    this.queue = [];
  }
  
  /**
   * 判断是否为系统消息
   */
  private isSystemMessage(message: string): boolean {
    // 增强了系统消息识别能力
    return (
      // 基本系统消息模式
      message.includes('"type":"ping"') ||
      message.includes('{"camp":') ||
      message.includes('"timestamp":') ||
      message.includes('await@Await_Nas') ||
      message.includes('type:auth') ||
      
      // 新增识别模式
      message.includes('"type":"system"') ||
      message.includes('"action":"heartbeat"') ||
      message.includes('{"type":"latency"') ||
      message.includes('{"session":') ||
      
      // 识别特殊控制序列
      (message.includes('\u001B') && message.length < 10) || // 短的控制序列
      
      // ANSI控制码序列模式
      (message.match(/^\x1B\[\?[0-9;]*[a-zA-Z]$/) !== null) ||
      
      // JSON心跳消息
      message.match(/^\s*\{\s*"heartbeat"\s*:\s*(true|"true")\s*\}\s*$/) !== null ||
      
      // 空JSON对象
      message.match(/^\s*\{\s*\}\s*$/) !== null
    );
  }
}

/**
 * 创建终端消息队列
 */
export const createTerminalMessageQueue = (
  writeCallback: (messages: string[]) => void,
  options?: {
    maxBatchSize?: number,
    processingInterval?: number
  }
): TerminalMessageQueue => {
  return new TerminalMessageQueue(writeCallback, options);
};
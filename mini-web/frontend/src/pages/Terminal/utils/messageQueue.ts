// 终端消息队列管理
// 用于优化高频消息的渲染性能

/**
 * 终端消息队列实现
 * 用于处理和管理发送到终端的消息队列
 */

import { Terminal } from 'xterm';

/**
 * 消息队列接口
 */
export interface TerminalMessageQueue {
  /**
   * 添加消息到队列
   */
  add: (message: string) => void;

  /**
   * 处理队列中的消息
   */
  process: () => void;

  /**
   * 清空队列
   */
  clear: () => void;

  /**
   * 获取队列长度
   */
  length: () => number;
}

/**
 * 创建终端消息队列
 * @param term XTerm终端实例
 * @returns 消息队列对象
 */
export const createTerminalMessageQueue = (term: Terminal): TerminalMessageQueue => {
  // 创建内部消息队列
  const queue: string[] = [];

  // 处理消息的间隔时间(毫秒)
  const PROCESS_INTERVAL = 20;

  // 处理定时器
  let processingTimer: number | null = null;

  /**
   * 添加消息到队列
   */
  const add = (message: string): void => {
    if (!message) return;

    // 添加到队列
    queue.push(message);

    // 如果未在处理，启动处理
    if (!processingTimer) {
      process();
    }
  };

  /**
   * 处理队列中的消息
   */
  const process = (): void => {
    // 清除任何现有的处理定时器
    if (processingTimer) {
      window.clearTimeout(processingTimer);
      processingTimer = null;
    }

    // 检查队列是否为空
    if (queue.length === 0) return;

    try {
      // 获取并处理下一条消息
      const message = queue.shift();

      if (message && term) {
        // 写入终端
        term.write(message);
      }

      // 如果队列中还有消息，安排下一次处理
      if (queue.length > 0) {
        processingTimer = window.setTimeout(() => {
          process();
        }, PROCESS_INTERVAL);
      }
    } catch (error) {
      console.error('处理终端消息队列时出错:', error);
    }
  };

  /**
   * 清空队列
   */
  const clear = (): void => {
    // 清空队列
    queue.length = 0;

    // 清除处理定时器
    if (processingTimer) {
      window.clearTimeout(processingTimer);
      processingTimer = null;
    }
  };

  /**
   * 获取队列长度
   */
  const length = (): number => {
    return queue.length;
  };

  return {
    add,
    process,
    clear,
    length
  };
};
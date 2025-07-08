/**
 * 终端大小调整相关工具函数
 */

/**
 * 调整大小消息接口
 */
export interface ResizeMessage {
  type: string;
  cols: number;
  rows: number;
  width?: number;
  height?: number;
}

/**
 * 创建调整大小消息
 * @param cols 列数
 * @param rows 行数
 * @returns 调整大小消息对象
 */
export function createResizeMessage(cols: number, rows: number): ResizeMessage {
  // 验证输入
  if (!cols || !rows || cols <= 0 || rows <= 0) {
    console.warn('调整大小消息参数无效:', cols, rows);
    cols = cols || 80;
    rows = rows || 24;
  }

  // 创建包含两种格式的消息，以增强兼容性
  return {
    type: 'resize',
    cols: cols,
    rows: rows,
    width: cols * 8,  // 估算像素宽度
    height: rows * 16 // 估算像素高度
  };
}

/**
 * 发送调整大小消息（使用二进制协议）
 * @param tab 终端标签对象
 * @param cols 列数
 * @param rows 行数
 * @returns 是否发送成功
 */
export async function sendResizeMessage(
  tab: any,
  cols: number,
  rows: number
): Promise<boolean> {
  if (!tab) {
    console.warn('无法发送调整大小消息：缺少标签信息');
    return false;
  }

  try {
    // 创建调整大小消息
    const resizeMessage = createResizeMessage(cols, rows);

    // 使用WebSocketService发送（启用二进制协议）
    const webSocketServiceModule = await import('./services/WebSocketService');
    const success = await webSocketServiceModule.default.sendJsonData(tab, resizeMessage);

    if (success) {
      console.log(`通过二进制协议发送调整大小消息: ${cols}x${rows}`);
    }

    return success;
  } catch (error) {
    console.error('创建或发送调整大小消息时出错:', error);
    return false;
  }
}
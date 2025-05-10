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
 * 发送调整大小消息
 * @param websocket WebSocket连接
 * @param cols 列数
 * @param rows 行数
 * @returns 是否发送成功
 */
export function sendResizeMessage(
  websocket: WebSocket | null,
  cols: number, 
  rows: number
): boolean {
  // 检查WebSocket状态
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    console.warn('无法发送调整大小消息：WebSocket未连接');
    return false;
  }

  try {
    // 创建调整大小消息
    const resizeMessage = createResizeMessage(cols, rows);
    
    // 序列化并发送
    const messageJson = JSON.stringify(resizeMessage);
    websocket.send(messageJson);
    
    // 终端大小已调整
    return true;
  } catch (error) {
    console.error('创建或发送调整大小消息时出错:', error);
    return false;
  }
}
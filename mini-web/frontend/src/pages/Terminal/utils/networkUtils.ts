// 网络延迟测量工具

/**
 * 测量WebSocket连接的网络延迟
 * 发送ping消息并计算接收pong响应的时间差
 */
export const measureNetworkLatency = (
  ws: WebSocket, 
  callback: (latency: number) => void
): void => {
  if (ws.readyState !== WebSocket.OPEN) {
    console.warn('无法测量网络延迟：WebSocket未连接');
    return;
  }

  try {
    // 记录发送时间
    const startTime = Date.now();
    
    // 发送ping消息
    const pingMessage = JSON.stringify({
      type: 'ping',
      timestamp: startTime
    });
    
    // 发送ping消息
    ws.send(pingMessage);
    
    // 设置一次性消息处理器来接收pong响应
    const originalOnMessage = ws.onmessage;
    const messageHandler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          // 计算延迟
          const endTime = Date.now();
          const latency = endTime - startTime;
          
          // 调用回调函数
          callback(latency);
          
          // 恢复原始消息处理器
          ws.onmessage = originalOnMessage;
        } else if (originalOnMessage) {
          // 不是pong消息，传递给原始处理器
          // 使用call方法确保正确的this上下文
          originalOnMessage.call(ws, event);
        }
      } catch (e) {
        // 不是JSON格式，传递给原始处理器
        if (originalOnMessage) {
          // 使用call方法确保正确的this上下文
          originalOnMessage.call(ws, event);
        }
      }
    };
    
    // 设置临时消息处理器
    ws.onmessage = messageHandler;
    
    // 设置超时，避免永久等待
    setTimeout(() => {
      // 如果当前消息处理器仍然是我们设置的，则恢复原始处理器
      if (ws.onmessage === messageHandler) {
        ws.onmessage = originalOnMessage;
        // 如果超时，将延迟设为-1表示未知
        callback(-1);
      }
    }, 5000);
  } catch (e) {
    console.error('测量网络延迟失败:', e);
  }
};
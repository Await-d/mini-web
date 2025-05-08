// 终端工具函数索引文件

// 导出所有工具函数和常量
export * from './terminalConfig';
export * from './terminalInit';

// 导入并导出WebSocket相关函数（带详细日志）
import { connectWebSocket, handleWebSocketMessage } from './websocket';
console.log('**** index.ts: 正在导出WebSocket相关函数 ****');
console.log('**** connectWebSocket函数是否存在:', !!connectWebSocket, ' ****');
console.log('**** handleWebSocketMessage函数是否存在:', !!handleWebSocketMessage, ' ****');
// 导出WebSocket函数
export { connectWebSocket, handleWebSocketMessage };

// 导出终端工具函数
export * from './terminalUtils';
export * from './networkUtils';

import { sessionAPI } from '../../../services/api';
import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * 关闭所有会话
 * @param tabs 标签列表
 * @returns 是否成功关闭所有会话
 */
export const closeAllSessions = async (tabs: TerminalTab[]): Promise<boolean> => {
  if (!tabs || tabs.length === 0) {
    console.log('没有会话需要关闭');
    return true;
  }

  try {
    console.log(`开始关闭 ${tabs.length} 个会话...`);
    
    // 关闭所有WebSocket连接
    for (const tab of tabs) {
      try {
        // 关闭WebSocket连接
        if (tab.webSocketRef?.current && 
            tab.webSocketRef.current.readyState !== WebSocket.CLOSED) {
          console.log(`关闭会话 ${tab.sessionId} 的WebSocket连接`);
          tab.webSocketRef.current.close();
        }
        
        // 调用后端API关闭会话
        if (tab.sessionId) {
          console.log(`调用API关闭会话 ${tab.sessionId}`);
          await sessionAPI.closeSession(tab.sessionId);
        }
      } catch (error) {
        console.error(`关闭会话 ${tab.sessionId} 失败:`, error);
        // 继续关闭其他会话，不中断流程
      }
    }
    
    console.log('所有会话已关闭');
    return true;
  } catch (error) {
    console.error('关闭所有会话时发生错误:', error);
    return false;
  }
};

// 定义备用的forceConnection函数
export const forceConnection = async (
  sessionId: number, 
  connection: any, 
  element: any
): Promise<WebSocket | null> => {
  console.log('使用内联forceConnection函数');
  
  return connectWebSocket(
    sessionId,
    connection,
    null,
    undefined,
    (ws) => {
      console.log('内联forceConnection连接成功');
      (window as any).lastForceWs = ws;
    },
    0
  );
};

// 将关键函数设置到全局作用域便于调试
setTimeout(() => {
  console.log('**** 将connectWebSocket函数导出到window对象 ****');
  (window as any).connectWebSocketGlobal = connectWebSocket;
  
  // 提供更简单的全局调试函数
  (window as any).debugConnectWebSocket = (sessionId: number, connection: any) => {
    console.log('**** 使用全局调试函数尝试连接 ****', {
      sessionId, connection
    });
    
    // 创建一个模拟终端对象
    const mockTerm = {
      writeln: (text: string) => console.log('模拟终端输出:', text),
      write: (text: string) => console.log('模拟终端写入:', text)
    };
    
    // 尝试连接
    return connectWebSocket(
      sessionId,
      connection,
      mockTerm as any,
      undefined,
      (ws) => {
        console.log('**** 调试连接成功! ****');
        (window as any).lastWs = ws;
      },
      0
    );
  };
  
  // 为了方便调试而添加的简化版调用函数
  (window as any).quickConnect = (sessionId: number) => {
    const savedConnections = localStorage.getItem('terminal_connections');
    let connection = null;
    
    if (savedConnections) {
      try {
        const connections = JSON.parse(savedConnections);
        if (connections && connections.length > 0) {
          connection = connections[0];
          console.log('**** 使用保存的连接配置 ****', connection);
        }
      } catch (e) {
        console.error('解析保存的连接失败:', e);
      }
    }
    
    if (!connection) {
      // 使用默认连接
      connection = {
        protocol: 'ssh',
        host: 'localhost',
        port: 22,
        username: 'root'
      };
      console.log('**** 使用默认连接配置 ****', connection);
    }
    
    return (window as any).debugConnectWebSocket(sessionId, connection);
  };
}, 500);
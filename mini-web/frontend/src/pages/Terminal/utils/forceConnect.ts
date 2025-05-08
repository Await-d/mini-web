// 强制WebSocket连接工具

import { connectWebSocket } from './websocket';
import type { Connection } from '../../../services/api';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { Terminal as XTerm } from 'xterm';

/**
 * 强制创建WebSocket连接的实用程序函数
 */
export const forceConnection = async (
  sessionId: number,
  connectionConfig: Connection | null = null,
  terminalElement: HTMLElement | null = null
): Promise<WebSocket | null> => {
  console.log('**** 强制创建WebSocket连接 ****');
  console.log('参数:', { sessionId, connectionConfig });
  
  if (!sessionId) {
    console.error('会话ID为空，无法连接');
    return null;
  }
  
  // 如果没有提供连接配置，尝试从localStorage获取
  let connection = connectionConfig;
  if (!connection) {
    try {
      const savedConnections = localStorage.getItem('terminal_connections');
      if (savedConnections) {
        const connections = JSON.parse(savedConnections);
        if (connections && connections.length > 0) {
          connection = connections[0];
          console.log('使用已保存的连接配置:', connection);
        }
      }
    } catch (e) {
      console.error('无法加载保存的连接配置:', e);
    }
    
    // 如果仍然没有连接配置，使用默认值
    if (!connection) {
      connection = {
        id: 1,
        name: '默认连接',
        protocol: 'ssh',
        host: 'localhost',
        port: 22,
        username: 'root',
        // 移除Connection类型中不存在的属性
        // password: '',
        // privateKey: '',
        // serverName: '默认服务器',
        // description: '强制创建的默认连接'
      } as Connection;
      console.log('使用默认连接配置:', connection);
    }
  }
  
  // 创建一个模拟终端实例，或使用提供的DOM元素创建真实终端
  let term: any = null;
  
  if (terminalElement) {
    // 尝试创建真实终端
    try {
      const realTerm = new XTerm({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#f0f0f0'
        }
      });
      
      realTerm.open(terminalElement);
      term = realTerm;
      console.log('创建了真实终端实例');
    } catch (e) {
      console.error('创建真实终端失败:', e);
    }
  }
  
  // 如果无法创建真实终端，使用模拟终端
  if (!term) {
    term = {
      writeln: (text: string) => console.log('终端输出:', text),
      write: (text: string) => console.log('终端写入:', text)
    };
    console.log('使用模拟终端实例');
  }
  
  // 创建一个模拟标签页
  const mockTab: Partial<TerminalTab> = {
    key: `force_tab_${Date.now()}`,
    title: '强制连接',
    connectionId: connection?.id || 0,
    sessionId: sessionId,
    connection: connection || undefined,
    isGraphical: false,
    isConnected: false,
    webSocketRef: { current: null }
  };
  
  // 尝试创建WebSocket连接
  try {
    console.log('开始建立WebSocket连接...');
    const ws = await connectWebSocket(
      sessionId,
      connection,
      term,
      mockTab as TerminalTab,
      (connectedWs) => {
        console.log('WebSocket连接成功!');
        if (mockTab.webSocketRef) {
          mockTab.webSocketRef.current = connectedWs;
        }
        mockTab.isConnected = true;
        
        // 发送初始命令确保终端正常工作
        setTimeout(() => {
          try {
            connectedWs.send('\r\n');
            setTimeout(() => connectedWs.send('echo "强制连接成功"\r\n'), 300);
          } catch (e) {
            console.error('发送初始命令失败:', e);
          }
        }, 500);
      },
      0
    );
    
    // 将结果保存到window对象方便调试
    (window as any).lastForceWs = ws;
    (window as any).lastForceMockTab = mockTab;
    
    return ws;
  } catch (e) {
    console.error('强制创建WebSocket连接失败:', e);
    return null;
  }
};

// 将函数导出到window对象便于调试
setTimeout(() => {
  console.log('**** 强制连接工具已导出到window对象 ****');
  (window as any).forceWebSocketConnection = forceConnection;
  
  // 简化版的强制连接函数
  (window as any).simpleConnect = async (sessionId: number) => {
    console.log('**** 使用简化版强制连接函数 ****');
    return await forceConnection(sessionId);
  };
}, 1000);
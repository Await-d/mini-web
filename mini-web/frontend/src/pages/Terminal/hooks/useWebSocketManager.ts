import { useState, useRef, useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { handleWebSocketMessage } from '../utils';

/**
 * 管理WebSocket连接的生命周期的Hook
 */
export const useWebSocketManager = () => {
  const [isConnected, setIsConnected] = useState(false);
  const reconnectCountRef = useRef(0);
  const connectionAttemptRef = useRef(false);
  
  /**
   * 创建WebSocket连接
   */
  const createWebSocketConnection = useCallback((
    activeTab: TerminalTab,
    onConnectionHelp: () => void,
    onRetryInterface: () => void
  ) => {
    if (!activeTab || !activeTab.terminalRef?.current || !activeTab.xtermRef?.current) {
      console.error('【WebSocket调试】创建WebSocket连接失败：缺少必要参数');
      console.log('【WebSocket调试】标签页详情:', {
        key: activeTab?.key,
        connectionId: activeTab?.connectionId,
        sessionId: activeTab?.sessionId,
        hasTerminalRef: !!activeTab?.terminalRef?.current,
        hasXtermRef: !!activeTab?.xtermRef?.current,
        hasWebSocketRef: !!activeTab?.webSocketRef?.current,
        connectionInfo: activeTab?.connection ? {
          protocol: activeTab.connection.protocol,
          host: activeTab.connection.host,
          port: activeTab.connection.port
        } : 'connection不存在'
      });
      return false;
    }
    
    const term = activeTab.xtermRef.current;
    
    try {
      // 确保连接信息存在
      if (!activeTab.sessionId || !activeTab.connection) {
        const errorMsg = '无法连接：会话ID或连接信息不存在';
        console.error('【WebSocket调试】' + errorMsg, { 
          sessionId: activeTab.sessionId,
          connection: activeTab.connection ? '存在' : '不存在',
          connectionDetails: activeTab.connection
        });
        term.writeln(`\r\n\x1b[31m${errorMsg}\x1b[0m`);
        return false;
      }
      
      // 构建WebSocket URL
      let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = localStorage.getItem('token') || '';
      
      // 获取后端配置
      const savedSettings = localStorage.getItem('terminal_settings');
      let backendUrl = window.location.hostname;
      let backendPort = 8080;

      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          backendUrl = settings.backendUrl || backendUrl;
          backendPort = settings.backendPort || backendPort;
        } catch (e) {
          console.error('读取终端设置失败:', e);
        }
      }
      
      const protocol = activeTab.connection.protocol || 'ssh';
      let wsUrl = `${wsProtocol}//${backendUrl}:${backendPort}/ws/${protocol}/${activeTab.sessionId}`;
      wsUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;
      
      console.log('【WebSocket调试】创建WebSocket连接:', wsUrl);
      console.log('【WebSocket调试】连接参数:', {
        协议: protocol,
        主机: activeTab.connection.host,
        端口: activeTab.connection.port,
        用户名: activeTab.connection.username,
        会话ID: activeTab.sessionId,
        后端地址: `${backendUrl}:${backendPort}`,
        连接时间: new Date().toLocaleTimeString()
      });
      term.writeln(`\r\n\x1b[33m连接到: ${wsUrl}\x1b[0m`);
      
      // 将URL保存到window对象便于调试
      if (typeof window !== 'undefined') {
        (window as any).lastWsUrl = wsUrl;
      }
      
      // 创建WebSocket
      const ws = new WebSocket(wsUrl);
      console.log('WebSocket实例创建成功，等待连接...');
      
      // 将WebSocket实例导出到window对象便于调试
      if (typeof window !== 'undefined') {
        (window as any).lastWebSocket = ws;
        (window as any).lastWebSocketTime = new Date().toISOString();
      }
      
      // 连接超时处理
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          term.writeln('\r\n\x1b[31m连接超时，请检查后端服务\x1b[0m');
          
          // 连接超时后提供帮助信息
          onConnectionHelp();
        }
      }, 5000);
      
      // WebSocket连接成功时的处理
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket连接成功!');
        term.writeln('\r\n\x1b[32m🎉 WebSocket连接成功!\x1b[0m');
        
        // 更新连接状态
        activeTab.webSocketRef.current = ws;
        activeTab.isConnected = true;
        setIsConnected(true);
        reconnectCountRef.current = 0; // 重置重试计数
        
        // 发送认证消息
        try {
          if (!activeTab.connection) return;
          
          const authMessage = JSON.stringify({
            type: 'auth',
            token: token,
            connectionInfo: {
              protocol: protocol,
              host: activeTab.connection.host,
              port: activeTab.connection.port,
              username: activeTab.connection.username,
              sessionId: activeTab.sessionId
            }
          });
          
          ws.send(authMessage);
          term.writeln('\r\n\x1b[32m发送认证信息成功\x1b[0m');
          
          // 发送初始命令
          setTimeout(() => {
            try {
              ws.send('\r\n');
              setTimeout(() => ws.send('echo "终端连接成功!"\r\n'), 300);
            } catch (e) {
              console.error('发送初始命令失败:', e);
            }
          }, 500);
        } catch (e) {
          console.error('发送认证消息失败:', e);
          term.writeln('\r\n\x1b[31m发送认证信息失败\x1b[0m');
        }
        
        // 设置WebSocket事件处理
        ws.onmessage = (event) => {
          handleWebSocketMessage(event, term, activeTab.isGraphical);
        };
      };
      
      // WebSocket连接关闭时的处理
      ws.onclose = (event) => {
        console.log('WebSocket连接关闭:', event.code, event.reason);
        activeTab.isConnected = false;
        setIsConnected(false);
        term.writeln('\r\n\x1b[31mWebSocket连接已关闭\x1b[0m');
        
        // 显示重试界面
        onRetryInterface();
      };
      
      // WebSocket错误处理
      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
        term.writeln('\r\n\x1b[31mWebSocket错误，请检查后端服务\x1b[0m');
        
        // 出错时也显示重试界面
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            onRetryInterface();
          }
        }, 1000);
      };
      
      return true;
    } catch (e) {
      console.error('建立WebSocket连接失败:', e);
      if (term) term.writeln(`\r\n\x1b[31m建立WebSocket连接失败: ${e}\x1b[0m`);
      return false;
    }
  }, []);

  /**
   * 简化版连接函数，用于重连
   */
  const createSimpleConnection = useCallback((
    activeTab: TerminalTab,
    sessId?: number
  ) => {
    if (!activeTab || !activeTab.xtermRef?.current) {
      console.error('创建简易连接失败：缺少必要参数');
      return null;
    }
    
    const term = activeTab.xtermRef.current;
    const sessionId = sessId || activeTab.sessionId;
    
    if (!sessionId) {
      console.error('创建简易连接失败：无会话ID');
      term?.writeln('\r\n\x1b[31m创建简易连接失败：无会话ID\x1b[0m');
      return null;
    }
    
    try {
      // 构建WebSocket URL
      let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = localStorage.getItem('token') || '';
      
      // 获取后端配置
      const savedSettings = localStorage.getItem('terminal_settings');
      let backendUrl = window.location.hostname;
      let backendPort = 8080;

      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          backendUrl = settings.backendUrl || backendUrl;
          backendPort = settings.backendPort || backendPort;
        } catch (e) {
          console.error('读取终端设置失败:', e);
        }
      }
      
      const protocol = activeTab.connection?.protocol || 'ssh';
      let wsUrl = `${wsProtocol}//${backendUrl}:${backendPort}/ws/${protocol}/${sessionId}`;
      wsUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;
      
      console.log('创建简易WebSocket连接:', wsUrl);
      term.writeln(`\r\n\x1b[33m创建简易连接: ${wsUrl}\x1b[0m`);
      
      // 创建WebSocket
      const ws = new WebSocket(wsUrl);
      
      // 连接事件处理
      ws.onopen = () => {
        console.log('简易WebSocket连接成功!');
        term.writeln('\r\n\x1b[32m简易WebSocket连接成功!\x1b[0m');
        
        // 更新连接状态
        activeTab.webSocketRef.current = ws;
        activeTab.isConnected = true;
        setIsConnected(true);
        
        // 发送认证消息
        try {
          if (!activeTab.connection) return;
          
          const authMessage = JSON.stringify({
            type: 'auth',
            token: token,
            connectionInfo: {
              protocol: protocol,
              host: activeTab.connection.host,
              port: activeTab.connection.port,
              username: activeTab.connection.username,
              sessionId: sessionId
            }
          });
          
          ws.send(authMessage);
          term.writeln('\r\n\x1b[32m发送认证信息成功\x1b[0m');
          
          // 发送初始命令
          setTimeout(() => {
            try {
              ws.send('\r\n');
              setTimeout(() => ws.send('echo "简易连接成功!"\r\n'), 300);
            } catch (e) {
              console.error('发送初始命令失败:', e);
            }
          }, 500);
        } catch (e) {
          console.error('发送认证消息失败:', e);
          term.writeln('\r\n\x1b[31m发送认证信息失败\x1b[0m');
        }
        
        // 设置WebSocket事件处理
        ws.onmessage = (event) => {
          handleWebSocketMessage(event, term, activeTab.isGraphical);
        };
      };
      
      // 错误和关闭处理
      ws.onclose = () => {
        activeTab.isConnected = false;
        setIsConnected(false);
      };
      
      ws.onerror = (error) => {
        console.error('简易WebSocket连接错误:', error);
        term.writeln('\r\n\x1b[31m简易WebSocket连接错误\x1b[0m');
      };
      
      return ws;
    } catch (e) {
      console.error('创建简易WebSocket连接失败:', e);
      term.writeln(`\r\n\x1b[31m创建简易WebSocket连接失败: ${e}\x1b[0m`);
      return null;
    }
  }, []);

  /**
   * 创建连接帮助界面
   */
  const createConnectionHelp = useCallback((
    activeTab: TerminalTab, 
    retryCallback: () => void
  ) => {
    // 创建HTML帮助面板
    if (!activeTab.terminalRef?.current) return;
    
    // 检查是否已经存在帮助面板
    const existingHelp = activeTab.terminalRef.current.querySelector('#connection-help');
    if (existingHelp) return;
    
    const helpDiv = document.createElement('div');
    helpDiv.id = 'connection-help';
    helpDiv.style.position = 'absolute';
    helpDiv.style.top = '50%';
    helpDiv.style.left = '50%';
    helpDiv.style.transform = 'translate(-50%, -50%)';
    helpDiv.style.backgroundColor = 'rgba(0,0,0,0.9)';
    helpDiv.style.color = 'white';
    helpDiv.style.padding = '20px';
    helpDiv.style.borderRadius = '8px';
    helpDiv.style.zIndex = '1000';
    helpDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    helpDiv.style.fontSize = '14px';
    helpDiv.style.maxWidth = '500px';
    helpDiv.style.textAlign = 'left';
    helpDiv.style.lineHeight = '1.6';
    
    helpDiv.innerHTML = `
      <div style="margin-bottom:15px;font-weight:bold;font-size:16px;text-align:center">WebSocket连接问题</div>
      <div style="margin-bottom:15px">无法连接到WebSocket服务器。可能的原因：</div>
      <ul style="margin-bottom:15px;padding-left:20px">
        <li>后端服务未启动</li>
        <li>网络问题或防火墙拦截</li>
        <li>WebSocket端点不可用 (端口: 8080)</li>
        <li>会话ID无效: ${activeTab.sessionId}</li>
      </ul>
      <div style="margin-bottom:15px">解决方法：</div>
      <ol style="margin-bottom:15px;padding-left:20px">
        <li>确保后端服务已启动并监听端口8080</li>
        <li>检查网络连接和防火墙设置</li>
        <li>尝试刷新页面或重新连接</li>
      </ol>
      <div style="display:flex;justify-content:center;gap:10px;margin-top:20px">
        <button id="retry-connection" style="padding:8px 16px;background:#1677ff;border:none;color:white;border-radius:4px;cursor:pointer">重试连接</button>
        <button id="dismiss-help" style="padding:8px 16px;background:#666;border:none;color:white;border-radius:4px;cursor:pointer">关闭提示</button>
      </div>
    `;
    
    activeTab.terminalRef.current.appendChild(helpDiv);
    
    // 添加按钮事件
    setTimeout(() => {
      const retryButton = document.getElementById('retry-connection');
      const dismissButton = document.getElementById('dismiss-help');
      
      if (retryButton) {
        retryButton.onclick = () => {
          if (helpDiv.parentNode) {
            helpDiv.parentNode.removeChild(helpDiv);
          }
          // 重新尝试连接
          retryCallback();
        };
      }
      
      if (dismissButton) {
        dismissButton.onclick = () => {
          if (helpDiv.parentNode) {
            helpDiv.parentNode.removeChild(helpDiv);
          }
        };
      }
    }, 100);
  }, []);

  /**
   * 创建重试界面
   */
  const createRetryInterface = useCallback((
    activeTab: TerminalTab,
    retryCallback: () => void,
    showHelpCallback: () => void
  ) => {
    // 在连接关闭时添加重试按钮和帮助界面
    if (!activeTab.terminalRef?.current) return;
    
    // 检查是否已经存在重试按钮
    if (activeTab.terminalRef.current.querySelector('#retry-button')) return;
    
    const retryButton = document.createElement('button');
    retryButton.id = 'retry-button';
    retryButton.innerHTML = '重新连接';
    retryButton.style.position = 'absolute';
    retryButton.style.top = '10px';
    retryButton.style.right = '10px';
    retryButton.style.zIndex = '100';
    retryButton.style.padding = '8px 16px';
    retryButton.style.backgroundColor = '#1677ff';
    retryButton.style.color = 'white';
    retryButton.style.border = 'none';
    retryButton.style.borderRadius = '4px';
    retryButton.style.cursor = 'pointer';
    
    retryButton.onclick = () => {
      if (activeTab.xtermRef?.current) {
        activeTab.xtermRef.current.writeln('\r\n\x1b[33m重新尝试连接...\x1b[0m');
      }
      retryCallback();
    };
    
    activeTab.terminalRef.current.appendChild(retryButton);
    
    // 显示连接帮助
    showHelpCallback();
  }, []);

  /**
   * 发送数据到服务器
   */
  const sendData = useCallback((
    activeTab: TerminalTab,
    data: string
  ) => {
    if (!activeTab || !activeTab.xtermRef?.current) {
      console.error('发送数据失败：终端实例不存在');
      return;
    }
    
    const term = activeTab.xtermRef.current;
    
    if (!data) {
      console.warn('尝试发送空数据');
      return;
    }
    
    // WebSocket状态检查
    if (!activeTab.webSocketRef?.current) {
      console.warn('无法发送数据：WebSocket引用不存在');
      term.writeln('\r\n\x1b[31m无法发送数据：WebSocket未连接\x1b[0m');
      return;
    }
    
    if (activeTab.webSocketRef.current.readyState !== WebSocket.OPEN) {
      console.warn(`无法发送数据：WebSocket未处于开启状态 (当前状态: ${activeTab.webSocketRef.current.readyState})`);
      term.writeln('\r\n\x1b[31m无法发送数据：WebSocket未处于开启状态\x1b[0m');
      return;
    }
    
    try {
      // 修正回车键处理
      let processedData = data;
      
      // 对于回车键，确保发送\r\n
      if (data === '\r' || data === '\n') {
        processedData = '\r\n';
      }
      // 对于其他字符串，如果以\r结尾但不是\r\n，则添加\n
      else if (data.endsWith('\r') && !data.endsWith('\r\n')) {
        processedData = data + '\n';
      }
      
      // 记录活动时间
      activeTab.lastActivityTime = Date.now();
      
      // 确保存在连接信息
      if (!activeTab.connection) {
        console.warn('无法确定连接协议，默认使用SSH协议');
        activeTab.webSocketRef.current.send(processedData);
        return;
      }
      
      // 检查是否需要包装为JSON格式
      if (activeTab.connection.protocol === 'ssh' || activeTab.connection.protocol === 'telnet') {
        // SSH/Telnet协议直接发送数据
        activeTab.webSocketRef.current.send(processedData);
      } else {
        // 其他协议尝试包装为JSON格式
        const jsonData = JSON.stringify({
          type: 'data',
          data: processedData
        });
        activeTab.webSocketRef.current.send(jsonData);
      }
    } catch (error) {
      console.error('发送数据失败:', error);
      term.writeln(`\r\n\x1b[31m发送数据失败: ${error}\x1b[0m`);
    }
  }, []);

  /**
   * 注册全局辅助函数，便于调试
   */
  const registerGlobalHelpers = useCallback((activeTab: TerminalTab) => {
    if (typeof window === 'undefined') return;
    
    // 导出调试信息
    (window as any).debugActiveTab = activeTab;
    if (activeTab.xtermRef?.current) {
      (window as any).debugTerm = activeTab.xtermRef.current;
    }
    
    // 添加手动连接函数
    (window as any).manualConnect = () => {
      if (!activeTab || !activeTab.xtermRef?.current) {
        console.error('手动连接失败：缺少必要参数');
        return null;
      }
      
      const term = activeTab.xtermRef.current;
      term.writeln('\r\n\x1b[33m手动触发连接...\x1b[0m');
      
      // 创建连接
      return createSimpleConnection(activeTab);
    };
  }, [createSimpleConnection]);

  return {
    isConnected,
    setIsConnected,
    reconnectCountRef,
    connectionAttemptRef,
    createWebSocketConnection,
    createSimpleConnection,
    createConnectionHelp,
    createRetryInterface,
    sendData,
    registerGlobalHelpers
  };
};
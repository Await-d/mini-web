import { useCallback, useState, useRef } from 'react';
import { handleWebSocketMessage } from '../utils';
import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * 专门处理WebSocket连接的Hook
 * 从主Hook中分离出WebSocket连接逻辑，简化代码结构
 */
export const useWebSocketConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const reconnectCountRef = useRef(0);
  const connectionAttemptRef = useRef(false);

  /**
   * 创建直接的WebSocket连接
   */
  const createDirectWebSocket = useCallback((
    activeTab: TerminalTab,
    term: any,
    showConnectionHelp: () => void,
    showRetryInterface: () => void
  ) => {
    try {
      // 确保连接信息存在
      if (!activeTab.sessionId || !activeTab.connection) {
        const errorMsg = '无法连接：会话ID或连接信息不存在';
        console.error(errorMsg, { sessionId: activeTab.sessionId });
        term.writeln(`\r\n\x1b[31m${errorMsg}\x1b[0m`);
        return false;
      }

      // 直接构建WebSocket URL
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
          console.log('使用终端设置:', { backendUrl, backendPort });
        } catch (e) {
          console.error('读取终端设置失败:', e);
        }
      }

      const protocol = activeTab.connection.protocol;
      let wsUrl = `${wsProtocol}//${backendUrl}:${backendPort}/ws/${protocol}/${activeTab.sessionId}`;
      wsUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;

      console.log('🔴 直接创建WebSocket连接:', wsUrl);
      term.writeln(`\r\n\x1b[33m连接到: ${wsUrl}\x1b[0m`);

      // 把URL保存到window对象方便调试
      (window as any).lastWsUrl = wsUrl;

      // 直接创建WebSocket
      const ws = new WebSocket(wsUrl);
      console.log('WebSocket实例创建成功，等待连接...');

      // 将WebSocket实例导出到window对象便于调试
      (window as any).lastWebSocket = ws;
      (window as any).lastWebSocketTime = new Date().toISOString();

      // 为了让用户输入正确发送，创建一个辅助发送函数
      const sendToServer = (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(data);
            console.log('发送数据到服务器:', data);
            return true;
          } catch (e) {
            console.error('发送数据到服务器失败:', e);
            return false;
          }
        } else {
          console.warn('WebSocket未连接，无法发送数据');
          return false;
        }
      };

      // 将发送函数保存到activeTab
      activeTab.sendDataToServer = sendToServer;

      // 连接超时处理
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          term.writeln('\r\n\x1b[31m连接超时，请检查后端服务\x1b[0m');

          // 连接超时后提供帮助信息
          showConnectionHelp();
        }
      }, 5000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('🎉 WebSocket连接成功!');
        term.writeln('\r\n\x1b[32m🎉 WebSocket连接成功!\x1b[0m');

        // 更新连接状态
        activeTab.webSocketRef.current = ws;
        activeTab.isConnected = true;
        setIsConnected(true);

        // 设置输入处理
        term.onData((data) => {
          console.log('🔍 终端收到输入，准备发送到WebSocket:', data, '输入长度:', data.length, '字符码:', Array.from(data).map(c => c.charCodeAt(0)));

          // 首先发送数据到WebSocket
          if (ws.readyState === WebSocket.OPEN) {
            try {
              // 对回车键特殊处理，确保命令执行
              if (data === '\r' || data === '\n') {
                console.log('🔍 检测到回车键，发送\\r\\n确保命令执行');
                ws.send('\r\n');
                console.log('✅ 回车键数据已发送到WebSocket');
                // 对于回车键，确保终端显示换行
                term.write('\r\n');
              } else {
                console.log('🔍 准备发送普通输入到WebSocket');
                ws.send(data);
                console.log('✅ 普通输入已发送到WebSocket');
                // 本地回显确保输入显示在终端上
                term.write(data);
              }
            } catch (e) {
              console.error('❌ 通过WebSocket发送数据失败:', e);
            }
          } else {
            console.error('❌ 无法发送数据：WebSocket未连接，当前状态:', ws.readyState, getWebSocketStateText(ws.readyState));
            // 即使WebSocket未连接，也显示本地回显
            term.write(data);
          }
        });

        // 发送认证消息
        try {
          if (!activeTab.connection) {
            console.error('无法发送认证消息：连接信息不存在');
            term.writeln('\r\n\x1b[31m无法发送认证消息：连接信息不存在\x1b[0m');
            return;
          }

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
          console.log('收到WebSocket消息:', typeof event.data === 'string' ?
            (event.data.length > 100 ? event.data.substring(0, 100) + '...' : event.data) :
            '二进制数据');
          handleWebSocketMessage(event, term, activeTab.isGraphical);
        };
      };

      ws.onclose = (event) => {
        console.log('WebSocket连接关闭:', event.code, event.reason);
        activeTab.isConnected = false;
        setIsConnected(false);
        term.writeln('\r\n\x1b[31mWebSocket连接已关闭\x1b[0m');

        // 显示重试界面
        showRetryInterface();
      };

      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
        term.writeln('\r\n\x1b[31mWebSocket错误，请检查后端服务\x1b[0m');

        // 出错时也显示重试界面
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            showRetryInterface();
          }
        }, 1000);
      };

      return true;
    } catch (e) {
      console.error('建立WebSocket连接失败:', e);
      term.writeln(`\r\n\x1b[31m建立WebSocket连接失败: ${e}\x1b[0m`);
      return false;
    }
  }, []);

  /**
   * 简化版全局连接函数，便于在控制台调试
   */
  const simpleConnect = useCallback((
    activeTab: TerminalTab,
    term: any,
    sessId?: number
  ) => {
    const sessionId = sessId || activeTab.sessionId;
    console.log(`尝试创建简化版WebSocket连接，会话ID: ${sessionId}`);

    try {
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

      // 如果没有指定会话ID，尝试使用当前标签页的
      if (!sessionId) {
        console.error('simpleConnect: 未提供会话ID');
        return null;
      }

      const protocol = activeTab.connection?.protocol || 'ssh';
      let wsUrl = `${wsProtocol}//${backendUrl}:${backendPort}/ws/${protocol}/${sessionId}`;
      wsUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;

      console.log('simpleConnect: 创建WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);
      console.log('simpleConnect: WebSocket实例创建成功，等待连接...');

      (window as any).lastSimpleWs = ws;
      (window as any).lastSimpleWsTime = new Date().toISOString();

      ws.onopen = () => {
        console.log('simpleConnect: 连接成功!');

        // 发送认证消息
        try {
          const authMessage = JSON.stringify({
            type: 'auth',
            token: token,
            connectionInfo: {
              protocol: protocol,
              host: activeTab.connection?.host || 'localhost',
              port: activeTab.connection?.port || 22,
              username: activeTab.connection?.username || 'root',
              sessionId: sessionId
            }
          });

          ws.send(authMessage);
          console.log('simpleConnect: 发送认证消息成功');

          // 如果是当前标签页的会话，更新连接状态
          if (sessionId === activeTab.sessionId) {
            activeTab.webSocketRef.current = ws;
            activeTab.isConnected = true;
            setIsConnected(true);

            // 设置消息处理
            ws.onmessage = (event) => {
              if (term) {
                handleWebSocketMessage(event, term, activeTab.isGraphical);
              }
            };
          }
        } catch (e) {
          console.error('simpleConnect: 发送认证消息失败:', e);
        }
      };

      return ws;
    } catch (e) {
      console.error('simpleConnect: 创建WebSocket失败:', e);
      return null;
    }
  }, []);

  /**
   * 创建连接帮助界面
   */
  const createConnectionHelp = useCallback((
    activeTab: TerminalTab,
    createDirectWebSocket: any
  ) => {
    // 创建HTML帮助面板
    if (!activeTab.terminalRef.current) return;

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
          createDirectWebSocket();
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
    term: any,
    createDirectWebSocket: any,
    showConnectionHelp: () => void
  ) => {
    // 在连接关闭时添加重试按钮和帮助界面
    if (!activeTab.terminalRef.current) return;

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
      term.writeln('\r\n\x1b[33m重新尝试连接...\x1b[0m');
      createDirectWebSocket();
    };

    activeTab.terminalRef.current.appendChild(retryButton);

    // 显示连接帮助
    showConnectionHelp();
  }, []);

  /**
   * 发送数据到服务器的函数
   */
  const sendData = useCallback((
    activeTab: TerminalTab,
    data: string,
    term: any
  ) => {
    if (!data) {
      console.warn('⚠️ 尝试发送空数据');
      return;
    }

    console.log(`🔍 尝试发送数据到服务器:`, {
      数据: data.length > 20 ? data.substring(0, 20) + '...' : data,
      数据长度: data.length,
      数据类型: typeof data,
      字符码: Array.from(data.substring(0, 10)).map(c => c.charCodeAt(0))
    });

    if (!activeTab) {
      console.error('❌ 无法发送数据：activeTab不存在');
      return;
    }

    // WebSocket状态检查
    if (!activeTab.webSocketRef?.current) {
      console.error('❌ 无法发送数据：WebSocket引用不存在');

      // 在本地终端显示错误
      if (term) {
        term.writeln('\r\n\x1b[31m无法发送数据：WebSocket未连接\x1b[0m');
        // 尝试自动重连的代码...
      }
      return;
    }

    console.log('🔍 WebSocket状态检查：', activeTab.webSocketRef.current.readyState, getWebSocketStateText(activeTab.webSocketRef.current.readyState));

    if (activeTab.webSocketRef.current.readyState !== WebSocket.OPEN) {
      console.error(`❌ 无法发送数据：WebSocket未处于开启状态 (当前状态: ${activeTab.webSocketRef.current.readyState})`);

      // 在本地终端显示错误
      if (term) {
        term.writeln('\r\n\x1b[31m无法发送数据：WebSocket未处于开启状态\x1b[0m');
        term.writeln(`\r\n\x1b[33mWebSocket状态: ${getWebSocketStateText(activeTab.webSocketRef.current.readyState)}\x1b[0m`);

        // 尝试自动重连
        setTimeout(() => {
          if (activeTab && !activeTab.isConnected && activeTab.connection && activeTab.sessionId) {
            term.writeln('\r\n\x1b[33m尝试重新连接...\x1b[0m');

            // 使用简化版重连函数
            simpleConnect(activeTab, term, activeTab.sessionId);
          }
        }, 500);
      }
      return;
    }

    try {
      // 修正回车键处理：确保后端能正确识别命令结束
      let processedData = data;

      // 对于回车键，确保发送\r\n
      if (data === '\r' || data === '\n') {
        processedData = '\r\n';
        console.log('🔍 检测到回车键，处理为: \\r\\n');
      }
      // 对于其他字符串，如果以\r结尾但不是\r\n，则添加\n
      else if (data.endsWith('\r') && !data.endsWith('\r\n')) {
        processedData = data + '\n';
        console.log('🔍 检测到字符串以\\r结尾，添加\\n');
      }

      // 记录发送的命令
      activeTab.lastActivityTime = Date.now();

      // 确保存在连接信息
      if (!activeTab.connection) {
        console.warn('⚠️ 无法确定连接协议，默认使用SSH协议');

        // 直接发送数据
        console.log('🔍 准备直接发送数据 (无协议信息)');
        activeTab.webSocketRef.current.send(processedData);
        console.log('✅ 数据已直接发送到WebSocket');
        return;
      }

      // 检查是否需要包装为JSON格式
      if (activeTab.connection.protocol === 'ssh' || activeTab.connection.protocol === 'telnet') {
        // SSH/Telnet协议直接发送数据
        console.log(`🔍 准备发送数据到${activeTab.connection.protocol}连接`);
        activeTab.webSocketRef.current.send(processedData);
        console.log('✅ 数据已发送到SSH/Telnet连接');
      } else {
        // 其他协议尝试包装为JSON格式
        console.log('🔍 准备以JSON格式包装数据');
        const jsonData = JSON.stringify({
          type: 'data',
          data: processedData
        });
        activeTab.webSocketRef.current.send(jsonData);
        console.log('✅ JSON格式数据已发送');

        // 备份机制：如果包装发送后没有响应，尝试直接发送
        setTimeout(() => {
          if (activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
            console.log('🔍 备份：准备直接发送数据');
            activeTab.webSocketRef.current.send(processedData);
            console.log('✅ 备份：数据已直接发送');
          } else {
            console.error('❌ 备份发送失败：WebSocket已关闭');
          }
        }, 100);
      }

      console.log('✅ 数据发送成功');

      // 对于命令行输入，等待短暂延迟后再发送一个空回车，增加命令处理的可靠性
      if (data.includes('\r') || data.includes('\n')) {
        setTimeout(() => {
          if (activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
            console.log('🔍 发送额外的回车增强响应性');
            activeTab.webSocketRef.current.send('\r\n');
            console.log('✅ 额外回车已发送');
          } else {
            console.error('❌ 无法发送额外回车：WebSocket已关闭');
          }
        }, 300);
      }
    } catch (error) {
      console.error('❌ 发送数据失败:', error);

      // 在本地终端显示错误
      if (term) {
        term.writeln(`\r\n\x1b[31m发送数据失败: ${error}\x1b[0m`);
      }
    }
  }, [simpleConnect]);

  // 辅助函数：获取WebSocket状态文本
  const getWebSocketStateText = (state: number): string => {
    switch (state) {
      case WebSocket.CONNECTING:
        return "连接中 (CONNECTING)";
      case WebSocket.OPEN:
        return "已连接 (OPEN)";
      case WebSocket.CLOSING:
        return "关闭中 (CLOSING)";
      case WebSocket.CLOSED:
        return "已关闭 (CLOSED)";
      default:
        return `未知状态 (${state})`;
    }
  };

  return {
    isConnected,
    setIsConnected,
    reconnectCountRef,
    connectionAttemptRef,
    createDirectWebSocket,
    simpleConnect,
    createConnectionHelp,
    createRetryInterface,
    sendData
  };
};
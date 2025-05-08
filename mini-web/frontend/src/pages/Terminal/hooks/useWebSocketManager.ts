import { useState, useRef, useCallback, useEffect } from 'react';
import { XTerm } from 'xterm-for-react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { handleWebSocketMessage } from '../utils';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import { createConnectionHelp, createRetryInterface } from '../utils/connectionUtils';

/**
 * 管理WebSocket连接的生命周期的Hook
 */
export interface WebSocketManagerOptions {
  // ... 保留现有选项 ...
}

// 简单定义终端大小数据类型
interface TerminalSizeData {
  cols: number;
  rows: number;
}

// WebSocket管理器Hook
export const useWebSocketManager = () => {
  const [isConnected, setIsConnected] = useState(false);
  const reconnectCountRef = useRef(0);
  const connectionAttemptRef = useRef(false);
  // 保存心跳定时器的引用
  const heartbeatTimerRef = useRef<number | null>(null);

  /**
   * 开始心跳检测，定期发送ping消息保持连接活跃
   */
  const startHeartbeat = useCallback((
    ws: WebSocket,
    activeTab: TerminalTab,
    interval: number = 30000 // 默认30秒发送一次心跳
  ) => {
    // 清除已有的心跳定时器
    if (heartbeatTimerRef.current !== null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    // 开始新的心跳检测
    const timer = window.setInterval(() => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // 发送ping消息
          const pingMessage = JSON.stringify({ type: 'ping', timestamp: Date.now() });
          ws.send(pingMessage);
          console.log('发送心跳ping消息保持连接活跃');

          // 更新最后活动时间
          if (activeTab.lastActivityTime) {
            activeTab.lastActivityTime = Date.now();
          } else {
            activeTab.lastActivityTime = Date.now();
          }
        } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          // 连接已关闭，停止心跳
          console.log('WebSocket连接已关闭，停止心跳检测');
          clearInterval(timer);
          heartbeatTimerRef.current = null;
        }
      } catch (e) {
        console.error('发送心跳消息失败:', e);
        // 发送失败也停止心跳
        clearInterval(timer);
        heartbeatTimerRef.current = null;
      }
    }, interval);

    // 保存定时器引用
    heartbeatTimerRef.current = timer as unknown as number;
    console.log(`已启动WebSocket心跳检测，间隔: ${interval}ms`);

    // 返回清理函数
    return () => {
      if (heartbeatTimerRef.current !== null) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
        console.log('心跳检测已清除');
      }
    };
  }, []);

  /**
   * 创建WebSocket连接
   * 支持两种调用方式：
   * 1. createWebSocketConnection(activeTab, onConnectionHelp, onRetryInterface)
   * 2. createWebSocketConnection(connectionId, sessionId, tabKey)
   */
  const createWebSocketConnection = useCallback((
    activeTabOrConnectionId: TerminalTab | number,
    onConnectionHelpOrSessionId: (() => void) | number,
    onRetryInterfaceOrTabKey?: (() => void) | string
  ) => {
    // 判断参数类型并处理
    let activeTab: TerminalTab | undefined;
    let onConnectionHelp: (() => void) | undefined;
    let onRetryInterface: (() => void) | undefined;

    if (typeof activeTabOrConnectionId === 'number') {
      // 使用的是参数形式2：connectionId, sessionId, tabKey
      const connectionId = activeTabOrConnectionId;
      const sessionId = onConnectionHelpOrSessionId as number;
      const tabKey = onRetryInterfaceOrTabKey as string;

      console.log(`【WebSocket调试】使用ID调用: connectionId=${connectionId}, sessionId=${sessionId}, tabKey=${tabKey}`);

      // 从terminalStateRef中查找匹配的tab
      activeTab = terminalStateRef.current.tabs.find(t => t.key === tabKey) as TerminalTab | undefined;

      if (!activeTab) {
        console.error('【WebSocket调试】未找到匹配的标签页:', tabKey);
        return false;
      }

      // 创建默认的帮助和重试接口
      onConnectionHelp = () => {
        console.log('【WebSocket调试】显示连接帮助界面');
        createConnectionHelp(activeTab as TerminalTab, () => {
          createWebSocketConnection(connectionId, sessionId, tabKey);
        });
      };

      onRetryInterface = () => {
        console.log('【WebSocket调试】显示重试界面');
        createRetryInterface(activeTab as TerminalTab,
          () => createWebSocketConnection(connectionId, sessionId, tabKey),
          () => createConnectionHelp(activeTab as TerminalTab, () => {
            createWebSocketConnection(connectionId, sessionId, tabKey);
          })
        );
      };
    } else {
      // 使用的是参数形式1：直接传入activeTab对象和回调函数
      activeTab = activeTabOrConnectionId;
      onConnectionHelp = onConnectionHelpOrSessionId as () => void;
      onRetryInterface = onRetryInterfaceOrTabKey as (() => void) | undefined;
    }

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

        // 保存最新的标签页和WebSocket实例，用于导航后恢复连接
        (window as any).lastActiveTab = activeTab;
        (window as any).lastConnectionInfo = {
          sessionId: activeTab.sessionId,
          protocol: protocol,
          wsUrl: wsUrl
        };
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

        // 启动心跳检测 - 减少间隔到15秒，确保连接保持活跃
        startHeartbeat(ws, activeTab, 15000);

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
          // 收到消息时更新最后活动时间
          activeTab.lastActivityTime = Date.now();
          handleWebSocketMessage(event, term, activeTab.isGraphical);
        };
      };

      // WebSocket连接关闭时的处理
      ws.onclose = (event) => {
        console.log('WebSocket连接关闭:', event.code, event.reason);
        activeTab.isConnected = false;
        setIsConnected(false);
        term.writeln('\r\n\x1b[31mWebSocket连接已关闭\x1b[0m');

        // 停止心跳检测
        if (heartbeatTimerRef.current !== null) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }

        // 检查是否是导航后的关闭，如果是则尝试重新连接
        const navigationClose = document.visibilityState === 'visible' &&
          typeof (window as any).lastConnectionInfo !== 'undefined';

        if (navigationClose) {
          console.log('检测到可能是导航操作导致的连接关闭，尝试自动重连');
          term.writeln('\r\n\x1b[33m导航后尝试重新连接...\x1b[0m');

          setTimeout(() => {
            // 尝试使用保存的信息重新连接
            createSimpleConnection(activeTab);
          }, 1000);
        } else {
          // 不是导航引起的关闭，显示重试界面
          if (onRetryInterface) {
            onRetryInterface();
          }
        }
      };

      // WebSocket错误处理
      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
        term.writeln('\r\n\x1b[31mWebSocket错误，请检查后端服务\x1b[0m');

        // 出错时也显示重试界面
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN && onRetryInterface) {
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
  }, [startHeartbeat]);

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
      console.log('简易WebSocket实例创建成功，等待连接...');

      // 更新全局引用，便于调试和恢复
      if (typeof window !== 'undefined') {
        (window as any).lastWebSocket = ws;
        (window as any).lastWebSocketTime = new Date().toISOString();
        (window as any).lastActiveTab = activeTab;
      }

      // 连接事件处理
      ws.onopen = () => {
        console.log('简易WebSocket连接成功!');
        term.writeln('\r\n\x1b[32m简易WebSocket连接成功!\x1b[0m');

        // 更新连接状态
        activeTab.webSocketRef.current = ws;
        activeTab.isConnected = true;
        setIsConnected(true);

        // 启动心跳检测 - 使用更短的间隔确保连接活跃
        startHeartbeat(ws, activeTab, 15000);

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
          // 收到消息时更新最后活动时间
          activeTab.lastActivityTime = Date.now();
          handleWebSocketMessage(event, term, activeTab.isGraphical);
        };
      };

      // 错误和关闭处理
      ws.onclose = () => {
        activeTab.isConnected = false;
        setIsConnected(false);
        term.writeln('\r\n\x1b[31m简易WebSocket连接已关闭\x1b[0m');

        // 停止心跳检测
        if (heartbeatTimerRef.current !== null) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }

        // 添加重试逻辑
        if (reconnectCountRef.current < 7) {  // 增加重试次数
          reconnectCountRef.current++;
          term.writeln(`\r\n\x1b[33m尝试重新连接 (${reconnectCountRef.current}/7)...\x1b[0m`);

          setTimeout(() => {
            // 再次尝试连接
            createSimpleConnection(activeTab, sessionId);
          }, 2000 * reconnectCountRef.current);  // 随着重试次数增加延迟
        } else {
          term.writeln('\r\n\x1b[31m达到最大重试次数，请手动重新连接\x1b[0m');
          reconnectCountRef.current = 0;
        }
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
  }, [startHeartbeat]);

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

    // 导出当前活动标签页
    (window as any).currentActiveTab = activeTab;

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

    // 导出快速连接函数
    (window as any).quickConnect = (sessionId: number) => {
      console.log('快速连接函数被调用，会话ID:', sessionId);

      if (!activeTab || !activeTab.xtermRef?.current) {
        console.error('快速连接失败：缺少必要参数');
        return null;
      }

      return createSimpleConnection(activeTab, sessionId);
    };

    // 导出createSimpleConnection函数到window对象，便于在导航后直接使用
    (window as any).createSimpleConnectionGlobal = (tab: TerminalTab) => {
      console.log('全局创建简易连接函数被调用:', {
        tabKey: tab.key,
        sessionId: tab.sessionId,
        hasXterm: !!tab.xtermRef?.current
      });

      if (!tab.xtermRef?.current) {
        console.error('创建简易连接失败：缺少xterm引用');
        return null;
      }

      return createSimpleConnection(tab);
    };

    // 添加全局重连函数
    (window as any).globalReconnect = function (tabKey?: string) {
      console.log('【连接流程】执行全局重连函数:', { tabKey });

      // 如果提供了标签Key，找到对应标签
      if (tabKey && terminalStateRef.current) {
        const tab = terminalStateRef.current.tabs.find(t => t.key === tabKey) as TerminalTab | undefined;
        if (tab) {
          console.log('【连接流程】找到指定标签，尝试重连');
          return createSimpleConnection(tab);
        }
      }

      // 否则尝试找到活动标签
      if (terminalStateRef.current && terminalStateRef.current.activeTabKey) {
        const activeTab = terminalStateRef.current.tabs.find(
          t => t.key === terminalStateRef.current.activeTabKey
        ) as TerminalTab | undefined;

        if (activeTab) {
          console.log('【连接流程】找到活动标签，尝试重连');
          return createSimpleConnection(activeTab);
        }
      }

      // 如果没有找到标签，尝试从localStorage恢复
      console.log('【连接流程】没有找到标签，尝试从localStorage恢复');
      return quickReconnect();
    };

    // 添加连接恢复函数，用于处理URL清理或导航后的连接恢复
    (window as any).reconnectAfterNavigation = () => {
      const needsReconnect = (window as any).needsReconnect;
      const preservedTabKey = (window as any).preservedTabKey;

      console.log('【连接流程】检查是否需要恢复连接:', { needsReconnect, preservedTabKey });

      if (needsReconnect && preservedTabKey) {
        console.log('【连接流程】尝试恢复导航后的连接:', {
          preservedTabKey,
          tabCount: terminalStateRef.current?.tabs?.length || 0
        });

        // 类型断言确保tabs是TerminalTab[]类型
        const tabs = terminalStateRef.current?.tabs as TerminalTab[] || [];

        // 查找保存的标签
        const tab = tabs.find(t => t.key === preservedTabKey);

        if (tab) {
          console.log('【连接流程】找到保存的标签，尝试恢复连接', {
            tabKey: tab.key,
            hasXtermRef: !!tab.xtermRef?.current,
            sessionId: tab.sessionId
          });

          // 清除恢复标记，避免重复恢复
          (window as any).needsReconnect = false;

          // 等待一下确保DOM已更新
          setTimeout(() => {
            if (tab.xtermRef?.current) {
              console.log('【连接流程】DOM准备就绪，执行连接恢复');
              return createSimpleConnection(tab);
            } else {
              console.log('【连接流程】标签页DOM未就绪，再次尝试');
              // 再次尝试，延长等待时间
              setTimeout(() => {
                if (tab.xtermRef?.current) {
                  console.log('【连接流程】第二次尝试DOM已就绪，执行连接');
                  return createSimpleConnection(tab);
                } else {
                  console.log('【连接流程】DOM仍未就绪，尝试使用保存的会话信息');

                  // 尝试从localStorage恢复会话信息
                  const savedSession = localStorage.getItem('terminal_last_session');
                  if (savedSession) {
                    try {
                      const sessionInfo = JSON.parse(savedSession);
                      if (sessionInfo.sessionId && sessionInfo.connectionId) {
                        console.log('【连接流程】使用已保存的会话信息恢复连接', sessionInfo);
                        // 如果标签有xterm但没有创建连接，尝试使用会话ID创建连接
                        if (tab.xtermRef?.current) {
                          return createSimpleConnection(tab, sessionInfo.sessionId);
                        }
                      }
                    } catch (e) {
                      console.error('解析保存的会话信息失败:', e);
                    }
                  }
                }
              }, 500);
            }
          }, 300);
        } else {
          console.log('【连接流程】未找到对应标签页，尝试使用最后一个活动标签');
          // 尝试使用上一个保存的标签信息
          const lastTab = (window as any).lastActiveTab as TerminalTab | undefined;
          if (lastTab && lastTab.xtermRef?.current) {
            console.log('【连接流程】使用最后保存的标签信息尝试恢复', {
              tabKey: lastTab.key,
              sessionId: lastTab.sessionId
            });
            return createSimpleConnection(lastTab);
          } else {
            console.log('【连接流程】没有可用的标签页，尝试从localStorage恢复会话');
            // 尝试从localStorage恢复会话信息
            const savedSession = localStorage.getItem('terminal_last_session');
            if (savedSession && terminalStateRef.current?.tabs?.length > 0) {
              try {
                const sessionInfo = JSON.parse(savedSession);
                // 使用类型断言确保安全访问
                const firstTab = (terminalStateRef.current.tabs as TerminalTab[])[0];
                if (sessionInfo.sessionId && firstTab.xtermRef?.current) {
                  console.log('【连接流程】使用第一个标签和保存的会话ID尝试恢复', {
                    tabKey: firstTab.key,
                    sessionId: sessionInfo.sessionId
                  });
                  return createSimpleConnection(firstTab, sessionInfo.sessionId);
                }
              } catch (e) {
                console.error('尝试从localStorage恢复失败:', e);
              }
            }
          }
        }
      } else {
        // 即使没有明确的重连标记，也检查是否可以从localStorage恢复
        const savedSession = localStorage.getItem('terminal_last_session');
        if (savedSession && terminalStateRef.current?.tabs?.length > 0) {
          try {
            const sessionInfo = JSON.parse(savedSession);
            console.log('【连接流程】检测到保存的会话信息，尝试恢复:', sessionInfo);

            // 类型断言确保tabs是TerminalTab[]类型
            const tabs = terminalStateRef.current.tabs as TerminalTab[];

            // 找到第一个有效的标签页
            const availableTab = tabs.find(t => t.xtermRef?.current);

            if (availableTab && sessionInfo.sessionId) {
              console.log('【连接流程】找到可用标签页，尝试使用保存的会话ID连接', {
                tabKey: availableTab.key,
                sessionId: sessionInfo.sessionId
              });
              return createSimpleConnection(availableTab, sessionInfo.sessionId);
            }
          } catch (e) {
            console.error('解析保存的会话信息失败:', e);
          }
        } else {
          console.log('【连接流程】无需恢复连接或缺少必要参数', { needsReconnect, preservedTabKey });
        }
      }

      return null;
    };
  }, [createSimpleConnection]);

  // 快速重连函数
  const quickReconnect = useCallback((savedSessionId?: number) => {
    console.log('【连接流程】执行快速重连操作');

    try {
      // 从本地存储中获取会话信息
      const savedSessionInfo = localStorage.getItem('terminal_last_session');
      if (savedSessionInfo) {
        const sessionInfo = JSON.parse(savedSessionInfo);
        console.log('【连接流程】找到保存的会话信息:', sessionInfo);

        // 使用会话ID参数或从会话信息中获取
        const sessionId = savedSessionId || sessionInfo.sessionId;
        if (!sessionId) {
          console.warn('【连接流程】未提供会话ID且会话信息中无ID，无法重连');
          return false;
        }

        // 检查全局重连函数
        if (typeof window !== 'undefined') {
          // 优先使用新添加的全局重连函数
          if ((window as any).reconnectTerminal) {
            console.log('【连接流程】使用全局重连函数reconnectTerminal');
            (window as any).reconnectTerminal();
            return true;
          }

          // 尝试使用旧的重连函数（兼容性）
          if ((window as any).attemptGlobalRecovery) {
            console.log('【连接流程】使用全局恢复函数attemptGlobalRecovery');
            (window as any).attemptGlobalRecovery();
            return true;
          }
        }

        console.warn('【连接流程】重连函数未定义，尝试创建新连接');

        // 如果无法重连，可以尝试创建新连接
        if (sessionInfo.connectionId) {
          console.log('【连接流程】尝试使用保存的连接ID创建新连接:', sessionInfo.connectionId);
          // 可以在这里添加代码创建新连接
          return true;
        }
      } else {
        console.warn('【连接流程】未找到保存的会话信息，无法重连');
      }
    } catch (error) {
      console.error('【连接流程】重连操作失败:', error);
    }

    return false;
  }, []);

  return {
    isConnected,
    setIsConnected,
    reconnectCountRef,
    connectionAttemptRef,
    startHeartbeat,  // 导出心跳函数
    createWebSocketConnection,
    createSimpleConnection,
    createConnectionHelp,
    createRetryInterface,
    sendData,
    registerGlobalHelpers,
    quickReconnect
  };
};

/**
 * 全局快速重连函数，用于在URL清理后立即恢复连接
 * 这个函数会被导出到window对象，便于在任何地方调用
 */
export const quickReconnect = () => {
  if (typeof window === 'undefined') return;

  console.log('【连接流程】执行快速重连操作');

  // 1. 尝试从localStorage获取最后的会话信息
  const savedSession = localStorage.getItem('terminal_last_session');
  if (!savedSession) {
    console.log('【连接流程】无法重连：没有找到保存的会话信息');
    return;
  }

  try {
    const sessionInfo = JSON.parse(savedSession);
    console.log('【连接流程】找到保存的会话信息:', sessionInfo);

    if (!sessionInfo.sessionId || !sessionInfo.tabKey) {
      console.log('【连接流程】会话信息不完整，无法重连');
      return;
    }

    // 2. 设置重连标记和保存的标签key
    (window as any).needsReconnect = true;
    (window as any).preservedTabKey = sessionInfo.tabKey;

    // 3. 直接调用重连函数
    if (typeof (window as any).reconnectAfterNavigation === 'function') {
      console.log('【连接流程】调用重连函数');
      (window as any).reconnectAfterNavigation();
    } else {
      console.log('【连接流程】重连函数未定义，无法执行');
    }
  } catch (e) {
    console.error('【连接流程】解析会话信息失败:', e);
  }
};

// 导出到window对象便于全局调用
if (typeof window !== 'undefined') {
  (window as any).quickReconnect = quickReconnect;
}
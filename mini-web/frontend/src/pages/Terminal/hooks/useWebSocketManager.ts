/*
 * @Author: Await
 * @Date: 2025-05-09 17:49:44
 * @LastEditors: Await
 * @LastEditTime: 2025-05-09 18:29:24
 * @Description: 请填写简介
 */
import { useState, useRef, useCallback, useEffect, createRef } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { handleWebSocketMessage } from '../utils';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import { writeColorText } from '../utils/terminalUtils';

// 扩展TerminalTab接口以支持lastActivityTime属性
declare module '../../../contexts/TerminalContext' {
  interface TerminalTab {
    lastActivityTime?: number;
  }
}

/**
 * 管理WebSocket连接的生命周期的Hook
 */
export interface WebSocketManagerOptions {
  // ... 保留现有选项 ...
}

// 创建连接帮助界面
export const createConnectionHelp = (activeTab: TerminalTab, onRetry: () => void) => {
  if (!activeTab.xtermRef?.current) return;
  const term = activeTab.xtermRef.current;

  writeColorText(term, '\r\n\n=== 连接问题排查指南 ===\r\n\n', 'yellow');
  writeColorText(term, '1. 确保后端服务已启动\r\n', 'white');
  writeColorText(term, '2. 检查WebSocket端点是否正确配置\r\n', 'white');
  writeColorText(term, '3. 检查防火墙或代理设置\r\n', 'white');
  writeColorText(term, '4. 确认连接ID和会话ID有效\r\n', 'white');
  writeColorText(term, '\r\n按Enter键尝试重新连接...', 'green');

  const handleKey = (data: string) => {
    if (data === '\r' || data === '\n') {
      // 移除事件监听
      term.onData(handleKey);
      // 尝试重连
      onRetry();
    }
  };

  // 添加键盘事件监听
  term.onData(handleKey);
};

// 创建重试界面
export const createRetryInterface = (
  activeTab: TerminalTab,
  onRetry: () => void,
  onHelp: () => void
) => {
  if (!activeTab.xtermRef?.current) return;
  const term = activeTab.xtermRef.current;

  writeColorText(term, '\r\n\n连接失败，请选择操作:\r\n\n', 'red');
  writeColorText(term, '按 R 键: 重试连接\r\n', 'white');
  writeColorText(term, '按 H 键: 显示帮助\r\n', 'white');

  const handleKey = (data: string) => {
    if (data.toLowerCase() === 'r') {
      // 移除事件监听
      term.onData(handleKey);
      // 重试连接
      onRetry();
    } else if (data.toLowerCase() === 'h') {
      // 移除事件监听
      term.onData(handleKey);
      // 显示帮助
      onHelp();
    }
  };

  // 添加键盘事件监听
  term.onData(handleKey);
};

// WebSocket管理器Hook
export const useWebSocketManager = () => {
  const [isConnected, setIsConnected] = useState(false);
  const reconnectCountRef = useRef(0);
  const connectionAttemptRef = useRef(false);
  // 保存心跳定时器的引用
  const heartbeatTimerRef = useRef<number | null>(null);

  // 定义updateTab函数
  const updateTab = useCallback((key: string, updates: Partial<TerminalTab>) => {
    // 获取所有标签
    const tabs = terminalStateRef.current.tabs as TerminalTab[];

    // 找到要更新的标签
    const tabIndex = tabs.findIndex(tab => tab.key === key);
    if (tabIndex === -1) {
      console.error(`【更新标签】找不到标签: ${key}`);
      return;
    }

    // 更新标签
    const updatedTab = { ...tabs[tabIndex], ...updates };
    tabs[tabIndex] = updatedTab;

    // 更新状态引用
    terminalStateRef.current = {
      ...terminalStateRef.current,
      tabs: [...tabs],
    };

    console.log(`【更新标签】标签已更新: ${key}`, updates);
  }, []);

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
    let connectionId: number | undefined;
    let sessionId: number | undefined;
    let tabKey: string | undefined;
    let onConnectionHelp: (() => void) | undefined;
    let onRetryInterface: (() => void) | undefined;

    if (typeof activeTabOrConnectionId === 'number') {
      // 使用的是参数形式2：connectionId, sessionId, tabKey
      connectionId = activeTabOrConnectionId;
      sessionId = typeof onConnectionHelpOrSessionId === 'number' ? onConnectionHelpOrSessionId : undefined;
      tabKey = typeof onRetryInterfaceOrTabKey === 'string' ? onRetryInterfaceOrTabKey : undefined;

      console.log(`【WebSocket调试】使用ID调用: connectionId=${connectionId}, sessionId=${sessionId}, tabKey=${tabKey}`);

      // 从terminalStateRef中查找匹配的tab
      // 使用类型断言，确保tabs数组中的元素被识别为TerminalTab类型
      const tabs = terminalStateRef.current.tabs as unknown as TerminalTab[];
      activeTab = tabs.find(t =>
        t.connectionId === connectionId &&
        t.sessionId === sessionId &&
        (tabKey ? t.key === tabKey : true)
      );

      if (!activeTab) {
        console.error(`【WebSocket调试】找不到匹配的标签，无法创建连接: connectionId=${connectionId}, sessionId=${sessionId}`);
        return;
      }
    } else {
      // 使用的是参数形式1：activeTab, onConnectionHelp, onRetryInterface
      activeTab = activeTabOrConnectionId;
      onConnectionHelp = onConnectionHelpOrSessionId as (() => void);
      onRetryInterface = onRetryInterfaceOrTabKey as (() => void);

      connectionId = activeTab.connectionId;
      sessionId = activeTab.sessionId;
      tabKey = activeTab.key;
    }

    // 确保activeTab存在
    if (!activeTab) {
      console.error('【WebSocket】无效的活动标签，无法创建WebSocket连接');
      return;
    }

    // 准备DOM检查函数
    const ensureTerminalDOM = (tab: TerminalTab, maxAttempts = 10, currentAttempt = 0): Promise<boolean> => {
      return new Promise((resolve) => {
        // 如果已经有有效的DOM引用，直接返回成功
        if (tab.terminalRef?.current) {
          console.log('【DOM检查】terminalRef.current 已存在，无需创建');
          resolve(true);
          return;
        }

        console.log(`【DOM检查】尝试查找或创建DOM元素，尝试次数：${currentAttempt + 1}/${maxAttempts}`);

        // 尝试通过ID查找DOM元素
        const terminalElementId = `terminal-element-${tab.key}`;
        const containerElementId = `terminal-container-${tab.key}`;
        let domElement = document.getElementById(terminalElementId) ||
          document.getElementById(containerElementId);

        if (domElement) {
          console.log(`【DOM检查】找到已存在的DOM元素: ${domElement.id}`);

          // 确保tab.terminalRef存在
          if (!tab.terminalRef) {
            tab.terminalRef = createRef<HTMLDivElement>();
          }

          // 设置DOM引用
          tab.terminalRef.current = domElement as HTMLDivElement;
          resolve(true);
          return;
        }

        // 如果找不到DOM元素且尝试次数未达上限，就创建新元素
        if (currentAttempt < maxAttempts) {
          console.log(`【DOM检查】创建新的DOM元素: ${terminalElementId}`);

          // 创建容器元素
          const newElement = document.createElement('div');
          newElement.id = terminalElementId;
          newElement.className = `terminal-element terminal-element-${tab.key}`;
          newElement.style.width = '100%';
          newElement.style.height = '100%';
          newElement.style.position = 'relative';

          // 查找放置容器的父元素
          const terminalArea = document.querySelector('.terminal-area') ||
            document.getElementById('terminal-area') ||
            document.body;

          terminalArea.appendChild(newElement);

          // 确保tab.terminalRef存在
          if (!tab.terminalRef) {
            tab.terminalRef = createRef<HTMLDivElement>();
          }

          // 设置DOM引用
          tab.terminalRef.current = newElement;

          // 保存到全局对象便于调试
          if (typeof window !== 'undefined') {
            (window as any).terminalElements = (window as any).terminalElements || {};
            (window as any).terminalElements[tab.key] = newElement;
          }

          resolve(true);
          return;
        }

        // 尝试次数达到上限仍未成功
        console.error('【DOM检查】达到最大尝试次数，DOM元素准备失败');
        resolve(false);
      });
    };

    // 使用DOM检查函数
    if (!activeTab) {
      console.error('【WebSocket调试】创建WebSocket连接失败：标签页不存在');
      return false;
    }

    // 检查DOM并创建WebSocket连接
    ensureTerminalDOM(activeTab).then(domReady => {
      if (!domReady) {
        console.error('【WebSocket调试】DOM准备失败，无法创建WebSocket连接');
        return false;
      }

      if (!activeTab || !activeTab.terminalRef?.current) {
        console.error('【WebSocket调试】创建WebSocket连接失败：DOM引用不存在');
        return false;
      }

      const term = activeTab.xtermRef?.current;
      if (!term) {
        console.error('【WebSocket调试】创建WebSocket连接失败：xterm引用不存在');
        // 创建xterm实例的逻辑应在此之前完成
        return false;
      }

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

        // 添加认证令牌
        if (token) {
          wsUrl += `?token=${token}`;
        }

        console.log(`【WebSocket】尝试连接终端 [${activeTab.title}]，URL: ${wsUrl}`);

        // 创建WebSocket连接
        try {
          const ws = new WebSocket(wsUrl);
          // 保存WebSocket引用
          if (activeTab.webSocketRef) {
            activeTab.webSocketRef.current = ws;
          }

          // 设置WebSocket事件处理
          ws.onopen = () => {
            console.log(`【WebSocket】连接成功 [${activeTab.title}]`);
            // 更新连接状态
            activeTab.isConnected = true;

            // 保存到全局对象以便调试
            if (typeof window !== 'undefined') {
              (window as any).lastWebSocket = ws;
              (window as any).lastConnectedTime = new Date().toLocaleTimeString();
            }

            // 更新终端标签状态
            updateTab(activeTab.key, {
              isConnected: true
            });

            // 获取Term实例
            const term = activeTab.xtermRef?.current;

            if (!term) {
              console.error('【WebSocket】Term实例未初始化，无法发送初始化数据');
              return;
            }

            // 发送连接初始化数据
            const initData = JSON.stringify({
              type: 'init',
              connectionId: activeTab.connectionId,
              sessionId: activeTab.sessionId,
              cols: term.cols || 80,
              rows: term.rows || 24,
              protocol: activeTab.connection?.protocol || 'ssh',
              timestamp: Date.now()
            });

            console.log('【WebSocket】发送初始化数据:', initData);
            ws.send(initData);

            // 循环并发送队列中的消息
            if (activeTab.messageQueueRef?.current) {
              console.log(`【WebSocket】处理消息队列，共${activeTab.messageQueueRef.current.length}条消息`);

              // 类型断言确保TypeScript识别messageQueueRef.current为字符串数组
              const messageQueue = activeTab.messageQueueRef.current as string[];

              while (messageQueue.length > 0) {
                const message = messageQueue.shift();
                if (message) {
                  console.log(`【WebSocket】发送队列消息: ${message.substring(0, 20)}...`);
                  ws.send(message);
                }
              }
            }
          };

          ws.onmessage = (event) => {
            // 接收WebSocket消息
            const data = event.data;
            // 确保xtermRef存在
            if (activeTab.xtermRef?.current) {
              activeTab.xtermRef.current.write(data);
            } else {
              console.error('【WebSocket】无法写入终端，xtermRef不存在');
              // 保存到消息队列
              if (activeTab.messageQueueRef?.current) {
                // 类型断言确保TypeScript识别messageQueueRef.current为字符串数组
                const messageQueue = activeTab.messageQueueRef.current as string[];
                messageQueue.push(data);
                console.log(`【WebSocket】消息已保存到队列，当前队列长度: ${messageQueue.length}`);
              }
            }
          };

          ws.onerror = (error) => {
            console.error(`【WebSocket】连接错误 [${activeTab.title}]:`, error);

            // 如果终端已初始化，显示错误信息
            if (activeTab.xtermRef?.current) {
              activeTab.xtermRef.current.writeln('\r\n\x1b[31m连接错误，请检查网络或服务器状态\x1b[0m');
              // 提供重试界面
              if (onRetryInterface) {
                onRetryInterface();
              }
            }

            // 更新连接状态
            activeTab.isConnected = false;
            updateTab(activeTab.key, {
              isConnected: false
            });
          };

          ws.onclose = (event) => {
            console.log(`【WebSocket】连接关闭 [${activeTab.title}]，代码: ${event.code}，原因: ${event.reason || '未知'}`);

            // 如果终端已初始化，显示连接关闭信息
            if (activeTab.xtermRef?.current) {
              activeTab.xtermRef.current.writeln('\r\n\x1b[33m连接已关闭\x1b[0m');

              // 提供重试界面
              if (event.code !== 1000 && event.code !== 1005) {
                // 非正常关闭
                if (onRetryInterface) {
                  onRetryInterface();
                }
              } else {
                // 正常关闭
                activeTab.xtermRef.current.writeln('\r\n\x1b[32m会话已结束，按R键重新连接\x1b[0m');
              }
            }

            // 更新连接状态
            activeTab.isConnected = false;
            updateTab(activeTab.key, {
              isConnected: false
            });
          };

          // 保存全局重连函数
          if (typeof window !== 'undefined') {
            (window as any).reconnectTab = (tabKey?: string) => {
              const targetKey = tabKey || activeTab.key;
              console.log(`【重连】尝试重连标签: ${targetKey}`);

              // 类型断言确保tabs被识别为TerminalTab[]
              const tabs = terminalStateRef.current.tabs as unknown as TerminalTab[];
              const tab = tabs.find(t => t.key === targetKey);

              if (tab) {
                console.log('【重连】找到标签，尝试重新建立连接');
                createSimpleConnection(tab);
                return true;
              }
              console.error('【重连】找不到标签');
              return false;
            };
          }

          return ws;
        } catch (error) {
          console.error(`【WebSocket】创建连接失败 [${activeTab.title}]:`, error);

          // 显示错误信息
          if (activeTab.xtermRef?.current) {
            activeTab.xtermRef.current.writeln('\r\n\x1b[31m创建WebSocket连接失败\x1b[0m');

            // 提供帮助信息
            if (onConnectionHelp) {
              onConnectionHelp();
            }
          }

          // 更新连接状态
          activeTab.isConnected = false;
          updateTab(activeTab.key, {
            isConnected: false
          });

          return null;
        }
      } catch (e) {
        console.error('建立WebSocket连接失败:', e);
        if (term) term.writeln(`\r\n\x1b[31m建立WebSocket连接失败: ${e}\x1b[0m`);
        return false;
      }
    });
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
        // 使用类型断言，确保tabs数组中的元素被识别为TerminalTab类型
        const tabs = terminalStateRef.current.tabs as unknown as TerminalTab[];
        const tab = tabs.find(t => t.key === tabKey);
        if (tab) {
          console.log('【连接流程】找到指定标签，尝试重连');
          return createSimpleConnection(tab);
        }
      }

      // 否则尝试找到活动标签
      if (terminalStateRef.current && terminalStateRef.current.activeTabKey) {
        // 使用类型断言，确保tabs数组中的元素被识别为TerminalTab类型
        const tabs = terminalStateRef.current.tabs as unknown as TerminalTab[];
        const activeTab = tabs.find(
          t => t.key === terminalStateRef.current.activeTabKey
        );

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
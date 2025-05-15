import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTerminal, terminalStateRef } from '../../../contexts/TerminalContext';
import { initializeTerminal } from '../utils/terminalInit';
import { useWebSocketManager } from '../../../hooks/useWebSocketManager';
import { useParams, useSearchParams } from 'react-router-dom';
import TerminalToolbar from './TerminalToolbar';
import TerminalStatus from './TerminalStatus';
import TerminalContextMenu from './TerminalContextMenu';
import '../Terminal.css';
import '../styles/terminal-fixes.css'; // 确保加载终端修复样式
import { PlusOutlined, CopyOutlined, DownloadOutlined, CodeOutlined, BuildOutlined, SettingOutlined, FullscreenOutlined, CloseOutlined } from '@ant-design/icons';
import { Tabs, message } from 'antd';
import { Button } from 'antd';
import RdpTerminal from '../../../components/RdpTerminal';
import { getTabProtocol, isGraphicalProtocol, getDefaultPort } from '../utils/protocolHandler';

// 终端连接状态类型
type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

// 终端连接组件 - 显示并管理已连接的终端
function ConnectedTerminal() {
  // 确保样式正确加载
  useEffect(() => {
    // 添加terminal-fixes.css的样式链接
    const linkId = 'terminal-fixes-css';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = '/src/pages/Terminal/styles/terminal-fixes.css';
      document.head.appendChild(link);

      console.log('动态加载了terminal-fixes.css样式');
    }
  }, []);

  const { state, updateTab, addTab, setActiveTab, closeTab } = useTerminal();
  const { tabs, activeTabKey } = state;
  const [fontSize, setFontSize] = useState(14); // 默认字体大小
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [latency, setLatency] = useState<number | undefined>(undefined); // 添加延迟状态

  // 获取URL参数
  const { connectionId } = useParams<{ connectionId: string }>();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  const activeTab = tabs.find(tab => tab.key === activeTabKey);
  const containerRef = useRef<HTMLDivElement>(null);
  const { createWebSocketConnection, sendData } = useWebSocketManager();
  const termRef = useRef<any>(null);
  const initialized = useRef(false); // 添加初始化标志

  // 创建新标签的函数
  const createNewTab = () => {
    if (!connectionId) return null;

    const connId = parseInt(connectionId, 10);
    const sessionId = sessionParam ? parseInt(sessionParam, 10) : undefined;

    console.log(`【终端】创建新标签: 连接ID=${connId}, 会话ID=${sessionId}`);

    // 生成唯一的标签键
    const tabKey = `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 创建新标签所需的引用 - 使用强类型定义
    const terminalRef = React.createRef<HTMLDivElement>();
    const xtermRef = React.createRef<any>();
    const fitAddonRef = React.createRef<any>();
    const searchAddonRef = React.createRef<any>();
    const messageQueueRef = React.createRef<any[]>();
    const webSocketRef = React.createRef<WebSocket>();

    // 确保messageQueueRef正确初始化
    messageQueueRef.current = [];

    // 创建新标签
    const newTab = {
      key: tabKey,
      title: `连接 ${connId}`,
      connectionId: connId,
      sessionId: sessionId,
      connection: {
        id: connId.toString(),
        type: 'ssh', // 默认协议类型
        settings: {}, // 默认空设置
      },
      isConnected: false,
      terminalRef: terminalRef,
      xtermRef: xtermRef,
      webSocketRef: webSocketRef,
      fitAddonRef: fitAddonRef,
      searchAddonRef: searchAddonRef,
      messageQueueRef: messageQueueRef,
    } as any;

    // 添加标签到状态
    addTab(newTab);
    console.log(`【ConnectedTerminal】添加新标签: ${tabKey}，连接ID=${connId}，会话ID=${sessionParam || 'none'}`);

    // 设置活动标签键
    setActiveTab(tabKey);

    // 同时在引用中直接设置，确保立即生效
    if (terminalStateRef && terminalStateRef.current) {
      terminalStateRef.current.activeTabKey = tabKey;

      // 确保在引用中也正确添加了标签
      if (!terminalStateRef.current.tabs.some(t => t.key === tabKey)) {
        terminalStateRef.current.tabs.push(newTab);
      }
    }

    // 立即保存所有标签信息到localStorage，防止刷新丢失
    try {
      // 使用类型断言绕过TypeScript的类型检查
      const tabsToSave = (tabs as any[]).map(tab => {
        // 创建基本标签对象
        const serializedTab: any = {
          key: tab.key,
          title: tab.title,
          connectionId: tab.connectionId,
          sessionId: tab.sessionId,
          isConnected: tab.isConnected || false
        };

        // 添加可选属性
        if (tab.protocol) serializedTab.protocol = tab.protocol;
        if (tab.hostname) serializedTab.hostname = tab.hostname;
        if (tab.port) serializedTab.port = tab.port;
        if (tab.username) serializedTab.username = tab.username;

        // 安全地添加连接信息
        if (tab.connection) {
          // 创建连接对象的简化版本
          serializedTab.connection = {
            id: tab.connection.id,
            name: tab.connection.name || '',
            protocol: tab.connection.protocol || 'ssh'
          };

          // 添加可选连接属性
          if (tab.connection.host) serializedTab.connection.host = tab.connection.host;
          if (tab.connection.port) serializedTab.connection.port = tab.connection.port;
          if (tab.connection.username) serializedTab.connection.username = tab.connection.username;

          // 确保settings属性存在
          serializedTab.connection.settings = {};

          // 如果原连接有settings属性，复制它
          if ('settings' in tab.connection && tab.connection.settings) {
            serializedTab.connection.settings = { ...tab.connection.settings };
          }
        }

        return serializedTab;
      });

      // 保存到localStorage
      localStorage.setItem('terminal_tabs', JSON.stringify(tabsToSave));
      localStorage.setItem('terminal_active_tab', tabKey);
      console.log(`【ConnectedTerminal】标签信息已立即保存到localStorage: 活动标签=${tabKey}, 标签数量=${tabsToSave.length}`);
    } catch (error) {
      console.error('保存标签信息到localStorage失败:', error);
    }

    // 保存会话信息
    localStorage.setItem('current_terminal_session', JSON.stringify({
      connectionId: connId,
      sessionId: sessionParam ? parseInt(sessionParam, 10) : undefined,
      tabKey: tabKey,
      isConnected: false,
      timestamp: Date.now()
    }));

    // 标记为已初始化
    initialized.current = true;

    // 延迟触发DOM就绪事件
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('terminal-ready', {
        detail: { tabKey: tabKey }
      }));
    }, 300);

    // 确保返回tabKey
    return tabKey;
  };

  // 检查是否需要创建新标签并处理初始化
  useEffect(() => {
    console.log('【终端】检查是否需要创建标签，connectionId=', connectionId, 'activeTab=', activeTab?.key, 'sessionParam=', sessionParam, 'tabs=', tabs.length);

    // 首先检查是否已存在具有相同connectionId和sessionId的标签
    const existingTab = tabs.find(tab => {
      // 确保连接ID匹配
      const connectionIdMatches = tab.connectionId === parseInt(connectionId || '0', 10);

      // 会话ID检查更宽松 - 如果没有sessionParam，则忽略sessionId检查
      const sessionIdMatches = sessionParam
        ? tab.sessionId === parseInt(sessionParam, 10)
        : true; // 如果没有sessionParam，则认为会话ID匹配

      // 确保connectionId有效
      const connectionIdValid = connectionId !== null && connectionId !== undefined;

      // 所有条件都必须满足
      return connectionIdMatches && sessionIdMatches && connectionIdValid;
    });

    if (existingTab) {
      console.log(`【终端】检测到已存在标签 ${existingTab.key}，将激活此标签`);

      // 激活存在的标签 - 首先在上下文中设置
      setActiveTab(existingTab.key);

      // 直接在引用中设置，确保立即生效
      if (terminalStateRef && terminalStateRef.current) {
        console.log(`【终端】直接设置terminalStateRef.current.activeTabKey = ${existingTab.key}`);
        terminalStateRef.current.activeTabKey = existingTab.key;
      }

      // 确保initialized标志被重置，允许重新初始化
      initialized.current = false;
      return;
    }

    // 如果有连接ID但没有活动的标签或活动标签为no-tabs，或者没有匹配的标签，则创建新标签
    if (connectionId && (!activeTab || activeTab?.key === 'no-tabs' || !existingTab)) {
      // 解析参数
      const connId = parseInt(connectionId, 10);
      const sessId = sessionParam ? parseInt(sessionParam, 10) : undefined;

      // 生成唯一的标签键 - 即使没有sessionParam也能工作
      const timestamp = Date.now();
      const tabKey = `conn-${connId}-session-${sessId || 'direct'}-${timestamp}`;

      // 创建引用
      const terminalRef = React.createRef<HTMLDivElement>();
      const xtermRef = React.createRef<any>();
      const fitAddonRef = React.createRef<any>();
      const searchAddonRef = React.createRef<any>();
      const messageQueueRef = React.createRef<any[]>();
      const webSocketRef = React.createRef<WebSocket>();

      // 确保messageQueueRef正确初始化
      messageQueueRef.current = [];

      // 创建新标签
      const newTab = {
        key: tabKey,
        title: `连接 ${connId}`,
        connectionId: connId,
        sessionId: sessId,
        connection: {
          id: connId.toString(),
          type: 'ssh', // 默认协议类型
          settings: {}, // 默认空设置
        },
        isConnected: false,
        terminalRef: terminalRef,
        xtermRef: xtermRef,
        webSocketRef: webSocketRef,
        fitAddonRef: fitAddonRef,
        searchAddonRef: searchAddonRef,
        messageQueueRef: messageQueueRef,
      } as any;

      // 添加标签到状态
      addTab(newTab);

      // 设置活动标签键
      setActiveTab(tabKey);

      // 同时在引用中直接设置，确保立即生效
      if (terminalStateRef && terminalStateRef.current) {
        terminalStateRef.current.activeTabKey = tabKey;

        // 确保在引用中也正确添加了标签
        if (!terminalStateRef.current.tabs.some(t => t.key === tabKey)) {
          terminalStateRef.current.tabs.push(newTab);
        }
      }

      // 立即保存所有标签信息到localStorage，防止刷新丢失
      try {
        // 使用类型断言绕过TypeScript的类型检查
        const tabsToSave = (tabs as any[]).map(tab => {
          // 创建基本标签对象
          const serializedTab: any = {
            key: tab.key,
            title: tab.title,
            connectionId: tab.connectionId,
            sessionId: tab.sessionId,
            isConnected: tab.isConnected || false
          };

          // 添加可选属性
          if (tab.protocol) serializedTab.protocol = tab.protocol;
          if (tab.hostname) serializedTab.hostname = tab.hostname;
          if (tab.port) serializedTab.port = tab.port;
          if (tab.username) serializedTab.username = tab.username;

          // 安全地添加连接信息
          if (tab.connection) {
            // 创建连接对象的简化版本
            serializedTab.connection = {
              id: tab.connection.id,
              name: tab.connection.name || '',
              protocol: tab.connection.protocol || 'ssh'
            };

            // 添加可选连接属性
            if (tab.connection.host) serializedTab.connection.host = tab.connection.host;
            if (tab.connection.port) serializedTab.connection.port = tab.connection.port;
            if (tab.connection.username) serializedTab.connection.username = tab.connection.username;

            // 确保settings属性存在
            serializedTab.connection.settings = {};

            // 如果原连接有settings属性，复制它
            if ('settings' in tab.connection && tab.connection.settings) {
              serializedTab.connection.settings = { ...tab.connection.settings };
            }
          }

          return serializedTab;
        });

        // 保存到localStorage
        localStorage.setItem('terminal_tabs', JSON.stringify(tabsToSave));
        localStorage.setItem('terminal_active_tab', tabKey);
        console.log(`【ConnectedTerminal】标签信息已立即保存到localStorage: 活动标签=${tabKey}, 标签数量=${tabsToSave.length}`);
      } catch (error) {
        console.error('保存标签信息到localStorage失败:', error);
      }

      // 保存会话信息
      localStorage.setItem('current_terminal_session', JSON.stringify({
        connectionId: connId,
        sessionId: sessId,
        tabKey: tabKey,
        isConnected: false,
        timestamp: timestamp
      }));

      // 标记为已初始化
      initialized.current = true;

      // 延迟触发DOM就绪事件
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('terminal-ready', {
          detail: { tabKey: tabKey }
        }));
      }, 300);
    }
  }, [connectionId, activeTab, tabs, sessionParam, setActiveTab, addTab]);

  // 处理连接状态变化
  useEffect(() => {
    // 无活动标签时不处理
    if (!activeTab) return;

    // 获取连接状态，并更新UI
    const isTabConnected = activeTab.isConnected || false;
    if (isTabConnected !== (connectionStatus === 'connected')) {
      if (isTabConnected) {
        setConnectionStatus('connected');
        setErrorMessage('');
      } else if (connectionStatus === 'idle') {
        setConnectionStatus('connecting');
      }
    }

    // 如果当前标签处于未连接状态，但我们认为它已连接
    // 在这种情况下可能是后端连接断开，需要主动更新UI状态
    if (!isTabConnected && connectionStatus === 'connected') {
      console.log(`【终端状态】标签显示未连接，更新UI状态`);
      setConnectionStatus('disconnected');
    }
  }, [activeTab, connectionStatus]);

  // 初始化终端连接
  const initTerminalConnection = useCallback(() => {
    if (!activeTab) return;

    console.log('【终端】初始化终端连接...');

    // 设置连接状态为正在连接
    setConnectionStatus('connecting');

    // 如果终端已初始化，显示连接中信息
    if (activeTab.xtermRef?.current) {
      activeTab.xtermRef.current.writeln('\r\n\x1b[33m正在连接到服务器...\x1b[0m');
    }

    // 使用activeTab作为参数，兼容createWebSocketConnection函数
    try {
      // 使用activeTab作为第一个参数，兼容现有实现
      createWebSocketConnection(activeTab);
    } catch (error) {
      console.error('【终端】创建WebSocket连接失败:', error);
      setConnectionStatus('error');
      setErrorMessage('创建连接失败: ' + (error instanceof Error ? error.message : String(error)));

      // 更新标签页状态
      if (activeTab) {
        updateTab(activeTab.key, { isConnected: false });
      }
    }
  }, [activeTab, createWebSocketConnection, setConnectionStatus, updateTab]);

  // 处理连接错误恢复
  const handleReconnect = useCallback(() => {
    if (!activeTab) return;

    setConnectionStatus('connecting');
    setErrorMessage('');

    // 确保终端存在
    if (activeTab.xtermRef?.current) {
      activeTab.xtermRef.current.writeln('\r\n\x1b[33m尝试重新连接...\x1b[0m');
    }

    // 如果有连接ID和会话ID，尝试重新连接
    if (activeTab.connectionId && activeTab.sessionId) {
      console.log(`【终端重连】尝试重新连接: ${activeTab.key}`);

      // 调用初始化函数尝试重新连接
      initTerminalConnection();
    } else {
      console.error('【终端重连】缺少连接ID或会话ID，无法重连');
      setConnectionStatus('error');
      setErrorMessage('缺少连接信息，无法重连');
    }
  }, [activeTab, setConnectionStatus, initTerminalConnection]);

  // 监听标签页活跃状态变化
  useEffect(() => {
    if (!activeTab) return;

    // 如果标签状态已经是connected，但UI状态不是，更新UI
    if (activeTab.isConnected && connectionStatus !== 'connected') {
      setConnectionStatus('connected');
    }
    // 如果标签状态是未连接，但UI不是error或disconnected，更新状态
    else if (!activeTab.isConnected &&
      connectionStatus !== 'error' &&
      connectionStatus !== 'disconnected' &&
      connectionStatus !== 'connecting') {
      setConnectionStatus('disconnected');
    }

    // 跟踪标签状态变化
  }, [activeTab, connectionStatus]);

  // 处理复制终端内容
  const handleCopy = () => {
    if (activeTab?.xtermRef?.current) {
      const term = activeTab.xtermRef.current;
      const selection = term.getSelection();

      if (selection) {
        navigator.clipboard.writeText(selection)
          .then(() => console.log('终端内容已复制到剪贴板'))
          .catch(err => console.error('复制失败:', err));
      } else {
        // 如果没有选择，尝试复制所有可见内容
        try {
          const content = term.buffer.active.getLine(0).translateToString();
          navigator.clipboard.writeText(content)
            .then(() => console.log('终端内容已复制到剪贴板'))
            .catch(err => console.error('复制失败:', err));
        } catch (error) {
          console.error('获取终端内容失败:', error);
        }
      }
    }
  };

  // 处理清屏
  const handleClear = () => {
    if (activeTab?.xtermRef?.current) {
      activeTab.xtermRef.current.clear();
    }
  };

  // 处理全屏
  const handleFullscreen = () => {
    const terminalElement = containerRef.current?.closest('.terminal-connected-container');

    if (terminalElement instanceof HTMLElement) {
      if (!document.fullscreenElement) {
        terminalElement.requestFullscreen().catch(err => {
          console.error(`全屏模式错误: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  // 获取连接和会话延迟的函数
  const measureLatency = () => {
    if (activeTab?.webSocketRef?.current && connectionStatus === 'connected') {
      const startTime = Date.now();

      // 发送延迟测试消息
      try {
        // 创建一个简单的Ping消息
        const pingMessage = JSON.stringify({ type: 'ping', timestamp: startTime });

        if (activeTab.webSocketRef.current) {
          activeTab.webSocketRef.current.send(pingMessage);

          // 设置处理响应的函数
          const handlePongMessage = (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'pong' && data.timestamp === startTime) {
                // 计算往返时间
                const rtt = Date.now() - startTime;
                setLatency(rtt);

                // 移除监听器
                if (activeTab.webSocketRef.current) {
                  activeTab.webSocketRef.current.removeEventListener('message', handlePongMessage);
                }
              }
            } catch (error) {
              // 忽略非JSON消息
            }
          };

          // 添加临时消息监听器
          activeTab.webSocketRef.current.addEventListener('message', handlePongMessage);

          // 5秒后如果没有收到回复，清除延迟值
          setTimeout(() => {
            if (activeTab.webSocketRef.current) {
              activeTab.webSocketRef.current.removeEventListener('message', handlePongMessage);
            }
            if (latency === undefined) {
              setLatency(undefined);
            }
          }, 5000);
        }
      } catch (error) {
        console.error('测量延迟失败:', error);
      }
    }
  };

  // 每10秒测量一次延迟
  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    // 初始测量
    measureLatency();

    // 设置定时器每10秒测量一次
    const latencyInterval = setInterval(() => {
      measureLatency();
    }, 10000);

    return () => {
      clearInterval(latencyInterval);
    };
  }, [connectionStatus, activeTab]);

  // 处理字体大小变更
  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    if (activeTab?.xtermRef?.current) {
      try {
        // 设置终端字体大小
        activeTab.xtermRef.current.options.fontSize = size;
        // 重新调整大小
        if (activeTab.fitAddonRef?.current) {
          activeTab.fitAddonRef.current.fit();
        }
      } catch (error) {
        console.error('设置字体大小失败:', error);
      }
    }
  };

  // 为活动标签初始化终端和WebSocket连接
  useEffect(() => {
    if (!activeTab || !activeTabKey || activeTabKey === 'no-tabs') return;

    console.log(`【终端初始化】开始为标签 ${activeTabKey} 初始化终端和连接`);

    // 检查协议类型
    const protocol = getTabProtocol(activeTab);
    const isGraphical = isGraphicalProtocol(protocol);

    // 首先更新标签协议信息
    updateTab(activeTabKey, {
      protocol: protocol,
      isGraphical: isGraphical
    });

    console.log(`【终端初始化】标签协议: ${protocol}, 是否图形化: ${isGraphical}`);

    // 初始化xterm终端或图形化终端
    const terminalElement = containerRef.current;
    if (!terminalElement) return;

    console.log('【终端初始化】开始初始化终端');

    // 如果是图形协议，直接创建WebSocket而不初始化xterm
    initializeTerminal(
      terminalElement,
      {
        onData: (data: string) => {
          if (activeTab.webSocketRef?.current) {
            // 适配WebSocket要求的格式
            const webSocketTab: any = {
              key: activeTab.key,
              title: activeTab.title,
              connection: activeTab.connectionId ? {
                id: activeTab.connectionId.toString(),
                type: protocol || 'ssh',
                settings: {
                  host: activeTab.connection?.host || 'localhost',
                  port: activeTab.connection?.port || getDefaultPort(protocol)
                }
              } : undefined,
              status: activeTab.isConnected ? 'connected' : 'disconnected',
              isConnected: activeTab.isConnected,
              xtermRef: activeTab.xtermRef,
              fitAddonRef: activeTab.fitAddonRef,
              searchAddonRef: activeTab.searchAddonRef,
              messageQueueRef: activeTab.messageQueueRef,
              webSocketRef: activeTab.webSocketRef,
              protocol: protocol
            };

            sendData(webSocketTab, data);
          }
        },
        protocol: protocol,
        isGraphical: isGraphical
      }
    ).then(terminalResult => {
      if (!terminalResult) {
        console.error('【终端初始化】初始化失败');
        return;
      }

      const { term, fitAddon, searchAddon, messageQueue } = terminalResult;
      termRef.current = term;
      console.log('【终端初始化】终端初始化成功');

      // 设置终端引用 - 只有文本终端才需要这些引用
      if (!isGraphical) {
        if (term) activeTab.xtermRef.current = term;
        if (fitAddon) activeTab.fitAddonRef.current = fitAddon;
        if (searchAddon) activeTab.searchAddonRef.current = searchAddon;
        if (messageQueue) activeTab.messageQueueRef.current = messageQueue;

        // 更新Tab引用
        updateTab(activeTabKey, {
          xtermRef: activeTab.xtermRef,
          fitAddonRef: activeTab.fitAddonRef,
          searchAddonRef: activeTab.searchAddonRef,
          messageQueueRef: activeTab.messageQueueRef
        });

        // 显示欢迎信息
        if (term) {
          term.writeln('\r\n\x1b[1;34m欢迎使用Mini Web终端\x1b[0m');
          term.writeln('\r\n\x1b[33m正在尝试连接到服务器...\x1b[0m');
        }
      }

      // 创建WebSocket连接
      setTimeout(() => {
        initTerminalConnection();
      }, 500);

      // 每秒检查一次终端状态
      const checkInterval = setInterval(() => {
        // 检查终端大小，必要时调整
        if (!isGraphical && activeTab.fitAddonRef?.current && document.contains(terminalElement)) {
          try {
            activeTab.fitAddonRef.current.fit();
          } catch (error) {
            console.warn('【DOM检查】调整终端大小失败:', error);
          }
        }
      }, 2000);

      return () => {
        clearInterval(checkInterval);
      };
    });

  }, [activeTab, activeTabKey, createWebSocketConnection, sendData, updateTab]);

  // 判断是否显示状态层
  const shouldShowStatusOverlay = connectionStatus === 'connecting' ||
    connectionStatus === 'error' ||
    connectionStatus === 'idle';

  // 获取连接名称
  const getConnectionName = () => {
    if (!activeTab) return '服务器';

    if (activeTab.connectionId) {
      return `连接 ${activeTab.connectionId}`;
    } else {
      return activeTab.title || '服务器';
    }
  };

  // 确保在WebSocket实例上直接设置消息处理函数，以防其他组件的处理函数没有生效
  useEffect(() => {
    if (!activeTab?.webSocketRef?.current) return;

    const ws = activeTab.webSocketRef.current;
    const protocol = getTabProtocol(activeTab);
    const isRdp = protocol === 'rdp';

    // 创建一个额外的消息处理函数，只作为备份
    const directMessageHandler = (event: MessageEvent) => {
      console.log(`【直接WebSocket】收到消息类型: ${typeof event.data}, 协议: ${protocol}`);

      // 特别处理RDP消息
      if (isRdp && typeof event.data === 'string' && event.data.startsWith('RDP_')) {
        console.log(`【直接WebSocket】RDP消息: ${event.data.substring(0, Math.min(50, event.data.length))}${event.data.length > 50 ? '...' : ''}`);

        // 检查是否是截图消息
        if (event.data.startsWith('RDP_SCREENSHOT:')) {
          console.log(`【直接WebSocket】接收到RDP截图消息，长度: ${event.data.length}`);

          // 在全局对象上添加最新的消息和手动渲染函数，以便在控制台调试
          try {
            const parts = event.data.split(':');
            if (parts.length >= 4) {
              const width = parseInt(parts[1]);
              const height = parseInt(parts[2]);
              const base64Data = parts.slice(3).join(':');

              // 保存到全局
              (window as any).lastScreenshotData = {
                width,
                height,
                base64Data,
                time: new Date().toISOString()
              };

              // 添加手动渲染函数
              (window as any).renderLastScreenshot = () => {
                // 找到RDP显示区域
                const rdpContainers = document.querySelectorAll('.rdp-container');
                if (rdpContainers.length > 0) {
                  const displayElement = rdpContainers[0].querySelector('[class*="displayArea"]');
                  if (displayElement) {
                    (displayElement as HTMLElement).style.backgroundImage = `url(data:image/png;base64,${base64Data})`;
                    console.log('手动设置背景图像完成');
                    return true;
                  }
                }
                console.error('未找到RDP显示元素');
                return false;
              };

              // 尝试自动渲染图像
              console.log('尝试自动渲染RDP截图...');
              setTimeout(() => {
                const rdpContainers = document.querySelectorAll('.rdp-container');
                if (rdpContainers.length > 0) {
                  const displayElement = rdpContainers[0].querySelector('[class*="displayArea"]');
                  if (displayElement) {
                    console.log('找到RDP显示元素，应用图像');
                    (displayElement as HTMLElement).style.backgroundImage = `url(data:image/png;base64,${base64Data})`;
                    console.log('已设置背景图像');
                  } else {
                    console.error('未找到RDP显示元素，无法渲染图像');
                  }
                } else {
                  console.error('未找到RDP容器，无法渲染图像');
                }
              }, 100); // 短暂延迟以确保DOM已更新

              // 创建或更新调试显示
              let debugDiv = document.getElementById('rdp-debug-display');
              if (!debugDiv) {
                debugDiv = document.createElement('div');
                debugDiv.id = 'rdp-debug-display';
                debugDiv.style.position = 'fixed';
                debugDiv.style.top = '10px';
                debugDiv.style.right = '10px';
                debugDiv.style.zIndex = '9999';
                debugDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
                debugDiv.style.padding = '10px';
                debugDiv.style.color = 'white';
                debugDiv.style.fontSize = '12px';
                debugDiv.style.maxWidth = '400px';
                debugDiv.style.maxHeight = '300px';
                debugDiv.style.overflow = 'auto';
                debugDiv.style.border = '1px solid #333';
                document.body.appendChild(debugDiv);
              }

              debugDiv.innerHTML = `
                <div>接收RDP截图时间: ${new Date().toISOString()}</div>
                <div>尺寸: ${width}x${height}</div>
                <div>数据长度: ${base64Data.length}</div>
                <div>
                  <button onclick="window.renderLastScreenshot()">手动渲染</button>
                  <button onclick="this.parentNode.parentNode.style.display='none'">关闭</button>
                </div>
                <div>
                  <img src="data:image/png;base64,${base64Data}" style="max-width:100%; max-height:200px; margin-top:5px; border:1px solid #666;" />
                </div>
              `;

              console.log('已创建全局调试函数 window.renderLastScreenshot()');
            }
          } catch (error) {
            console.error('处理RDP截图消息失败:', error);
          }
        }
      }
    };

    // 添加消息处理函数，但不覆盖已有的
    ws.addEventListener('message', directMessageHandler);

    // 添加直接输出ws实例到控制台的方法，方便调试
    (window as any).getActiveWs = () => ws;
    console.log('已创建全局函数 window.getActiveWs() 获取当前WebSocket实例');

    return () => {
      ws.removeEventListener('message', directMessageHandler);
      delete (window as any).getActiveWs;
    };
  }, [activeTab, getTabProtocol]);

  // 在标签数据中添加更多协议信息
  useEffect(() => {
    // 检查当前标签的协议类型
    if (activeTab && connectionId) {
      const protocol = getTabProtocol(activeTab);

      console.log(`【标签协议检查】标签=${activeTab.key}, 当前协议=${protocol}, isGraphical=${isGraphicalProtocol(protocol)}`);

      // 强制更新协议信息
      if (protocol) {
        updateTab(activeTab.key, {
          protocol: protocol,
          isGraphical: isGraphicalProtocol(protocol),
          connection: {
            ...activeTab.connection,
            protocol: protocol
          }
        });

        console.log(`【强制更新协议】标签=${activeTab.key}, 设置协议=${protocol}, 图形=${isGraphicalProtocol(protocol)}`);

        // 还更新全局引用中的信息
        if (terminalStateRef.current) {
          const tabIndex = terminalStateRef.current.tabs.findIndex(t => t.key === activeTab.key);
          if (tabIndex >= 0) {
            terminalStateRef.current.tabs[tabIndex].protocol = protocol;
            terminalStateRef.current.tabs[tabIndex].isGraphical = isGraphicalProtocol(protocol);
            if (terminalStateRef.current.tabs[tabIndex].connection) {
              terminalStateRef.current.tabs[tabIndex].connection!.protocol = protocol;
            }
            console.log(`【全局引用更新】已更新terminalStateRef中的协议信息`);
          }
        }
      }
    }
  }, [activeTab, connectionId, updateTab]);

  // 渲染标签页组件
  return (
    <div className="terminal-connected-container">
      {/* 标签页组件 */}
      <div className="terminal-tabs-container">
        <Tabs
          type="editable-card"
          activeKey={activeTabKey || undefined}
          onChange={(key) => {
            if (key && key !== activeTabKey) {
              console.log(`【标签切换】从 ${activeTabKey} 切换到 ${key}`);

              // 在上下文中设置
              setActiveTab(key);

              // 直接在引用中设置，确保立即生效
              if (terminalStateRef && terminalStateRef.current) {
                console.log(`【标签切换】直接设置terminalStateRef.current.activeTabKey = ${key}`);
                terminalStateRef.current.activeTabKey = key;
              }

              // 立即保存所有标签信息到localStorage，防止刷新丢失
              try {
                // 使用类型断言绕过TypeScript的类型检查
                const tabsToSave = (tabs as any[]).map(tab => {
                  // 创建基本标签对象
                  const serializedTab: any = {
                    key: tab.key,
                    title: tab.title,
                    connectionId: tab.connectionId,
                    sessionId: tab.sessionId,
                    isConnected: tab.isConnected || false
                  };

                  // 添加可选属性
                  if (tab.protocol) serializedTab.protocol = tab.protocol;
                  if (tab.hostname) serializedTab.hostname = tab.hostname;
                  if (tab.port) serializedTab.port = tab.port;
                  if (tab.username) serializedTab.username = tab.username;

                  // 安全地添加连接信息
                  if (tab.connection) {
                    // 创建连接对象的简化版本
                    serializedTab.connection = {
                      id: tab.connection.id,
                      name: tab.connection.name || '',
                      protocol: tab.connection.protocol || 'ssh'
                    };

                    // 添加可选连接属性
                    if (tab.connection.host) serializedTab.connection.host = tab.connection.host;
                    if (tab.connection.port) serializedTab.connection.port = tab.connection.port;
                    if (tab.connection.username) serializedTab.connection.username = tab.connection.username;

                    // 确保settings属性存在
                    serializedTab.connection.settings = {};

                    // 如果原连接有settings属性，复制它
                    if ('settings' in tab.connection && tab.connection.settings) {
                      serializedTab.connection.settings = { ...tab.connection.settings };
                    }
                  }

                  return serializedTab;
                });

                // 保存到localStorage
                localStorage.setItem('terminal_tabs', JSON.stringify(tabsToSave));
                localStorage.setItem('terminal_active_tab', key);
                console.log(`【标签切换】立即保存${tabs.length}个标签的状态，活动标签已更新为: ${key}`);
              } catch (error) {
                console.error('保存标签状态失败:', error);
              }

              // 立即尝试调整终端大小
              setTimeout(() => {
                const tab = tabs.find(t => t.key === key);
                if (tab && tab.fitAddonRef?.current) {
                  try {
                    tab.fitAddonRef.current.fit();
                    console.log(`【标签切换】调整标签 ${key} 的终端大小`);
                  } catch (e) {
                    console.error('【标签切换】调整终端大小失败:', e);
                  }
                }
              }, 0);
            }
          }}
          onEdit={(targetKey, action) => {
            if (action === 'remove' && typeof targetKey === 'string') {
              const tab = tabs.find(t => t.key === targetKey);
              if (tab && tab.webSocketRef?.current) {
                try {
                  console.log(`【标签关闭】关闭标签 ${targetKey} 的WebSocket连接`);
                  tab.webSocketRef.current.close();
                } catch (e) {
                  console.error('【标签关闭】关闭WebSocket连接失败:', e);
                }
              }

              // 关闭标签
              closeTab(targetKey);
              console.log(`【标签关闭】已关闭标签 ${targetKey}`);
            }
          }}
          hideAdd
          tabBarStyle={{
            marginBottom: 0,
            backgroundColor: '#f0f2f5',
            paddingLeft: 8
          }}
          items={tabs.map((tab) => {
            const isActive = tab.key === activeTabKey;
            const protocol = getTabProtocol(tab);
            const isGraphical = isGraphicalProtocol(protocol);

            return (
              <div
                key={tab.key}
                style={{
                  width: '100%',
                  height: '100%',
                  display: isActive ? 'block' : 'none'
                }}
              >
                {isActive && (
                  <>
                    {/* 断开connection中的原始DOM渲染逻辑，改为先判断协议类型 */}
                    {(() => {
                      // 获取协议类型 - 确保返回明确的结果
                      const tabProtocol = getTabProtocol(tab) || 'ssh'; // 默认为SSH
                      const isRdp = tabProtocol === 'rdp';
                      const isGraphical = isGraphicalProtocol(tabProtocol);

                      console.log(`【终端渲染】标签=${tab.key}, 协议=${tabProtocol}, 是RDP=${isRdp}, 是图形=${isGraphical}`);

                      // RDP协议处理 - 强制优先
                      if (isRdp) {
                        return (
                          <div
                            className="rdp-container"
                            id={`rdp-container-${tab.key}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              position: 'relative',
                              zIndex: 20,
                              backgroundColor: '#000'
                            }}
                          >
                            <RdpTerminal
                              webSocketRef={tab.webSocketRef}
                              connectionId={tab.connectionId as number}
                              sessionId={(tab.sessionId || 'defaultSession').toString()}
                              onResize={(width, height) => {
                                console.log(`【RDP调整大小】宽度=${width}，高度=${height}`);
                                if (tab.webSocketRef.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                                  const resizeMsg = JSON.stringify({
                                    type: 'resize',
                                    width: width,
                                    height: height
                                  });
                                  tab.webSocketRef.current.send(resizeMsg);
                                }
                              }}
                              onInput={(data) => {
                                if (tab.webSocketRef.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                                  tab.webSocketRef.current.send(data);
                                }
                              }}
                            />
                          </div>
                        );
                      }
                      // 非图形协议处理 - SSH, Telnet等
                      else if (!isGraphical) {
                        return (
                          <div
                            ref={tab.terminalRef}
                            className="xterm-container"
                            style={{ width: '100%', height: '100%' }}
                          />
                        );
                      }

                      // 其他图形协议 - VNC等
                      return (
                        <div className="unsupported-protocol">
                          <p>不支持的协议类型: {tabProtocol}</p>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            );
          })}
        />
      </div>

      {/* 连接状态指示器 */}
      {connectionStatus !== 'idle' && (
        <TerminalStatus
          status={connectionStatus}
          connectionName={getConnectionName()}
          latency={latency}
        />
      )}

      {/* 使用增强的终端工具栏 */}
      <TerminalToolbar
        onCopy={handleCopy}
        onClear={handleClear}
        onFullscreen={handleFullscreen}
        onReconnect={handleReconnect}
        onFontSizeChange={handleFontSizeChange}
        connected={connectionStatus === 'connected'}
      />

      {/* 状态覆盖层 - 仅在连接中或出错时显示 */}
      {(connectionStatus === 'connecting' || connectionStatus === 'error') && (
        <TerminalStatus
          status={connectionStatus}
          connectionName={getConnectionName()}
          errorMessage={errorMessage}
          onReconnect={handleReconnect}
        />
      )}
    </div>
  );
}

export default ConnectedTerminal;

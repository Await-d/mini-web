import { useState, useCallback, useEffect, useRef, createRef } from 'react';
import { message } from 'antd';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { connectionAPI, sessionAPI } from '../../../services/api';
import type { Connection } from '../../../services/api';
import { useTerminal } from '../../../contexts/TerminalContext';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { WindowSize, TerminalMessage } from '../utils/terminalConfig';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';

// 导入拆分出的子Hook
import { useTerminalInitialization } from './useTerminalInitialization';
import { useWebSocketManager, quickReconnect } from './useWebSocketManager';
import { useTerminalData } from './useTerminalData';
import { useTerminalUI } from './useTerminalUI';

// 确保terminalStateRef.current.tabs被推断为TerminalTab[]类型
declare module '../../../contexts/TerminalContext' {
  interface TerminalState {
    tabs: TerminalTab[];
    activeTabKey: string;
  }
}

// 存储重试定时器的引用
const retryTimersRef = { current: [] as number[] };

/**
 * 清除所有终端重试定时器
 */
const clearRetryTimers = () => {
  if (retryTimersRef.current.length > 0) {
    console.log(`【终端】清除${retryTimersRef.current.length}个重试定时器`);
    retryTimersRef.current.forEach(timerId => {
      clearTimeout(timerId);
    });
    retryTimersRef.current = [];
  }
};

/**
 * 全局清除函数，可以从控制台调用
 */
if (typeof window !== 'undefined') {
  (window as any).clearTerminalRetries = clearRetryTimers;
}

/**
 * 保存会话信息到localStorage
 */
const saveSessionInfo = (connectionId: number, sessionId: number, tabKey: string, connection?: any) => {
  try {
    // 创建会话信息对象，包含更多详细信息
    const sessionInfo = {
      connectionId,
      sessionId,
      tabKey,
      isConnected: false,
      timestamp: Date.now(),
      // 如果有连接信息，添加更多详细信息
      ...(connection && {
        connectionProtocol: connection.protocol,
        connectionName: connection.name,
        host: connection.host,
        port: connection.port,
        username: connection.username
      })
    };

    // 保存到localStorage - 使用两个键以增加恢复成功率
    localStorage.setItem('current_terminal_session', JSON.stringify(sessionInfo));
    localStorage.setItem('terminal_last_session', JSON.stringify(sessionInfo));
    console.log(`【持久化】已保存标签状态到localStorage:`, {
      connectionId,
      sessionId,
      tabKey,
      timestamp: sessionInfo.timestamp
    });
  } catch (error) {
    console.error('【持久化】保存会话信息失败:', error);
  }
};

// 创建isLoadingRef
const isLoadingRef = { current: false }; // 使用对象模拟ref以避免重复渲染

/**
 * 终端连接的主Hook，整合各子Hook的功能
 */
export const useTerminalConnection = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const navigate = useNavigate();

  // 使用终端上下文
  const { state, addTab, closeTab, setActiveTab, updateTab } = useTerminal();
  const { tabs, activeTabKey } = state;

  // 使用拆分的终端初始化Hook
  const {
    initTerminal,
    attachTerminalFocusHandlers,
    resizeTerminal
  } = useTerminalInitialization();

  // 使用拆分的WebSocket管理Hook
  const {
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
  } = useWebSocketManager();

  // 使用拆分的终端数据Hook
  const {
    terminalMode,
    setTerminalMode,
    networkLatency,
    setNetworkLatency,
    setupModeDetection,
    setupLatencyMeasurement,
    createTerminalTools
  } = useTerminalData();

  // 使用拆分的终端UI Hook
  const {
    fullscreen,
    setFullscreen,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleFullscreen
  } = useTerminalUI();

  const [connection, setConnection] = useState<Connection | null>(null);
  const [terminalSize, setTerminalSize] = useState<WindowSize>({ cols: 80, rows: 24 });

  // 修改processedRef的定义
  const processedRef = useRef<Map<string, boolean>>(new Map());

  // 保存间隔定时器引用以便清理
  const intervalsRef = useRef<{ [key: string]: number }>({});

  // 添加一个useRef来跟踪已处理过的连接ID和会话ID组合
  const processedConnectionRef = useRef<Set<string>>(new Set());

  // 发送数据到服务器
  const sendDataToServer = useCallback((data: string) => {
    const activeTab = tabs.find(tab => tab.key === activeTabKey);
    if (!activeTab) return;

    // 发送数据
    sendData(activeTab, data);
  }, [activeTabKey, tabs, sendData]);

  // 清理URL中的查询参数，但保留连接ID，以便刷新页面后能恢复会话
  const cleanURL = useCallback(() => {
    console.log("【连接流程】清理URL参数...");
    // 获取当前路径名
    const currentPath = window.location.pathname;

    // 先查找活动标签，显式添加类型断言
    const activeTab = (tabs.find(tab => tab.key === activeTabKey) ||
      (terminalStateRef.current?.tabs as TerminalTab[])?.find(tab => tab.key === terminalStateRef.current?.activeTabKey)) as TerminalTab | undefined;

    // 标签信息调试
    console.log("【连接流程】清理URL时的标签状态:", {
      activeTabKey: activeTabKey,
      refTabsCount: terminalStateRef.current?.tabs?.length || 0,
      contextTabsCount: tabs.length,
      hasActiveTab: !!activeTab,
      activeTabDetails: activeTab ? {
        connectionId: activeTab.connectionId,
        sessionId: activeTab.sessionId,
        key: activeTab.key
      } : 'none'
    });

    // 保存会话信息到localStorage，确保刷新页面时可以恢复
    if (activeTab) {
      // 在导航前保存WebSocket引用和连接信息到window对象，便于导航后恢复
      if (typeof window !== 'undefined') {
        console.log("【连接流程】保存WebSocket和连接信息到window对象");
        (window as any).preservedTabKey = activeTab.key;
        (window as any).preservedSessionId = activeTab.sessionId;
        (window as any).preservedConnectionId = activeTab.connectionId;
        (window as any).needsReconnect = true;
      }

      const sessionInfo = {
        connectionId: activeTab.connectionId,
        sessionId: activeTab.sessionId,
        tabKey: activeTab.key,
        connectionProtocol: activeTab.connection?.protocol,
        connectionName: activeTab.connection?.name,
        isConnected: activeTab.isConnected,
        timestamp: Date.now() // 添加时间戳，便于验证会话新鲜度
      };

      // 保存到localStorage - 同时使用两个键存储，增加恢复成功率
      localStorage.setItem('current_terminal_session', JSON.stringify(sessionInfo));
      localStorage.setItem('terminal_last_session', JSON.stringify(sessionInfo));
      console.log("【连接流程】会话信息已保存到localStorage:", sessionInfo);

      // 使用history API更新URL，不触发导航
      try {
        window.history.replaceState(
          {
            preservedTabKey: activeTab.key,
            preservedConnectionId: activeTab.connectionId,
            preservedSessionId: activeTab.sessionId
          },
          '',
          currentPath
        );
        console.log("【连接流程】使用history API清理URL，无导航：", currentPath);

        // 设置一个标记，表示URL已清理但可能需要恢复连接
        if (typeof window !== 'undefined') {
          (window as any).urlCleanedTimestamp = Date.now();
        }

        // 立即检查连接状态并尝试恢复
        setTimeout(() => {
          console.log("【连接流程】URL清理后检查连接状态");

          // 重新获取当前标签页，添加类型断言
          const currentTab = (tabs.find(tab => tab.key === activeTab.key) ||
            (terminalStateRef.current?.tabs as TerminalTab[])?.find(tab => tab.key === activeTab.key)) as TerminalTab | undefined;

          if (currentTab && (!currentTab.isConnected || !currentTab.webSocketRef?.current)) {
            console.log("【连接流程】URL清理后发现连接丢失，尝试恢复连接");

            // 确保标签处于激活状态
            setActiveTab(currentTab.key);

            // 直接调用创建简单连接函数
            if (typeof window !== 'undefined') {
              // 尝试使用导入的quickReconnect函数
              if (typeof (window as any).quickReconnect === 'function') {
                console.log("【连接流程】使用quickReconnect函数恢复连接");
                (window as any).quickReconnect();
                return;
              }

              if ((window as any).createSimpleConnectionGlobal && currentTab.sessionId) {
                console.log("【连接流程】使用全局简单连接函数恢复连接");
                (window as any).createSimpleConnectionGlobal(currentTab);
              } else if ((window as any).manualConnect) {
                console.log("【连接流程】使用手动连接函数恢复连接");
                (window as any).manualConnect();
              } else if ((window as any).quickConnect && currentTab.sessionId) {
                console.log("【连接流程】使用快速连接函数恢复连接");
                (window as any).quickConnect(currentTab.sessionId);
              }
            }
          }
        }, 100);
      } catch (e) {
        console.error("【连接流程】使用history API清理URL失败:", e);
        // 回退到使用导航（但这可能导致WebSocket连接丢失）
        navigate(currentPath, { replace: true });
      }
    } else {
      console.warn("【连接流程】无法保存会话信息，活动标签不存在");
      // 保留URL参数直到标签创建成功
      if (tabs.length === 0 && (terminalStateRef.current?.tabs?.length || 0) === 0) {
        console.log("【连接流程】无标签，暂不清理URL参数");
        return;
      } else {
        // 如果有标签但找不到活动标签，尝试保存第一个标签的信息
        const firstTab = terminalStateRef.current?.tabs?.[0] || tabs[0];
        if (firstTab) {
          console.log("【连接流程】使用第一个标签保存会话信息");

          // 在导航前保存到window对象
          if (typeof window !== 'undefined') {
            // 明确类型断言为TerminalTab
            const tab = firstTab as TerminalTab;
            (window as any).preservedTabKey = tab.key;
            (window as any).preservedSessionId = tab.sessionId;
            (window as any).preservedConnectionId = tab.connectionId;
            (window as any).needsReconnect = true;
          }

          localStorage.setItem('current_terminal_session', JSON.stringify({
            connectionId: (firstTab as TerminalTab).connectionId,
            sessionId: (firstTab as TerminalTab).sessionId,
            tabKey: (firstTab as TerminalTab).key,
            connectionProtocol: (firstTab as TerminalTab).connection?.protocol,
            connectionName: (firstTab as TerminalTab).connection?.name,
            isConnected: (firstTab as TerminalTab).isConnected,
            timestamp: Date.now()
          }));

          // 使用history API
          try {
            window.history.replaceState({
              preservedTabKey: (firstTab as TerminalTab).key,
              preservedConnectionId: (firstTab as TerminalTab).connectionId,
              preservedSessionId: (firstTab as TerminalTab).sessionId
            }, '', currentPath);
            console.log("【连接流程】使用history API清理URL，无导航：", currentPath);
          } catch (e) {
            console.error("【连接流程】使用history API清理URL失败:", e);
            navigate(currentPath, { replace: true });
          }
        } else {
          console.log("【连接流程】找不到任何标签，暂不清理URL参数");
        }
      }
    }
  }, [activeTabKey, navigate, tabs]);

  // 自定义addTab函数，用于创建终端标签
  const addTabWithConnection = useCallback((connectionId: number, sessionId: number, connectionInfo: any) => {
    // 清除所有重试计时器，确保干净的开始
    clearRetryTimers();

    // 生成唯一的标签键
    const timestamp = Date.now();
    const tabKey = `conn-${connectionId}-session-${sessionId}-${timestamp}`;

    // 终端引用
    const terminalRef = createRef<HTMLDivElement>();
    const xtermRef = createRef<Terminal>();
    const webSocketRef = createRef<WebSocket>();
    const fitAddonRef = createRef<FitAddon>();
    const searchAddonRef = createRef<SearchAddon>();

    // 消息队列引用
    const messageQueueRef = createRef<string[]>();
    messageQueueRef.current = [];

    // 创建新标签对象
    const newTab: TerminalTab = {
      key: tabKey,
      title: connectionInfo.name || `连接${connectionId}`,
      connectionId: connectionId,
      sessionId: sessionId,
      connection: connectionInfo,
      isConnected: false,
      terminalRef,
      xtermRef,
      webSocketRef,
      fitAddonRef,
      searchAddonRef,
      messageQueueRef
    };

    // 添加标签
    addTab(newTab);
    console.log(`【addTabWithConnection】创建新标签: ${tabKey}，连接ID=${connectionId}，会话ID=${sessionId}`);

    // 设置为活动标签
    setActiveTab(tabKey);

    // 保存最新创建的标签到localStorage
    localStorage.setItem('terminal_last_created_tab', tabKey);

    // 直接更新terminalStateRef以确保立即生效
    if (terminalStateRef && terminalStateRef.current) {
      // 先确保标签在数组中
      if (!terminalStateRef.current.tabs.some(t => t.key === tabKey)) {
        terminalStateRef.current.tabs.push(newTab);
      }

      // 再设置活动标签
      terminalStateRef.current.activeTabKey = tabKey;
      console.log(`【addTabWithConnection】直接设置terminalStateRef.current.activeTabKey = ${tabKey}`);
    }

    // 触发DOM就绪事件，使用多个延迟以增加成功率
    [100, 250, 500, 750, 1000].forEach(delay => {
      setTimeout(() => {
        console.log(`【addTabWithConnection】${delay}ms后触发terminal-ready事件`);
        window.dispatchEvent(new CustomEvent('terminal-ready', {
          detail: { tabKey: tabKey }
        }));
      }, delay);
    });

    // 立即触发标签激活事件
    window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
      detail: { tabKey: tabKey, isNewTab: true }
    }));

    // 返回标签键，用于后续操作
    return tabKey;
  }, [addTab, setActiveTab, clearRetryTimers]);

  /**
   * 创建新的会话
   */
  const createNewSession = useCallback(async (connectionId: number): Promise<number | null> => {
    try {
      console.log(`【会话创建】开始为连接 ${connectionId} 创建新会话`);
      const response = await sessionAPI.createSession(connectionId);

      // 修改检查方式以适应API响应格式
      if (response && response.data && response.data.code === 200 && response.data.data) {
        const sessionId = response.data.data.id;
        console.log(`【会话创建】会话创建成功，ID: ${sessionId}`);
        return sessionId;
      } else {
        console.error('【会话创建】创建会话失败:', response?.data);
        return null;
      }
    } catch (error) {
      console.error('【会话创建】创建会话出现异常:', error);
      return null;
    }
  }, []);

  // DOM就绪检查和初始化函数
  const checkAndInitTerminal = useCallback((tabKey: string, retryCount = 0) => {
    if (!terminalStateRef.current) {
      console.error(`【连接流程】terminalStateRef.current为空，无法检查DOM就绪状态`);
      return;
    }

    const tab = terminalStateRef.current.tabs.find(t => t.key === tabKey);

    if (!tab) {
      console.error(`【连接流程】无法找到标签: ${tabKey}`);
      return;
    }

    // 保证connectionId和sessionId存在
    if (!tab.connectionId || !tab.sessionId) {
      console.error(`【连接流程】标签缺少connectionId或sessionId: ${tabKey}`);
      return;
    }

    const terminalElement = document.getElementById(`terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`);

    if (!terminalElement) {
      if (retryCount < 5) {
        console.log(`【连接流程】终端DOM元素不可用，${retryCount + 1}次尝试，将在250ms后重试`);
        setTimeout(() => checkAndInitTerminal(tabKey, retryCount + 1), 250);
      } else {
        console.error(`【连接流程】终端DOM元素不可用，已达到最大重试次数`);
        message.error('无法初始化终端界面，请刷新页面重试');
      }
      return;
    }

    // DOM已就绪，设置引用并初始化连接
    if (tab.terminalRef) {
      tab.terminalRef.current = terminalElement as HTMLDivElement;
      console.log(`【连接流程】已设置终端DOM引用: ${tabKey}`);

      // 分发DOM就绪事件
      window.dispatchEvent(new CustomEvent('terminal-ready', {
        detail: { tabKey }
      }));
      console.log(`【连接流程】分发终端就绪事件: ${tabKey}`);
    }

    // 初始化WebSocket连接，确保参数类型正确
    if (typeof tab.connectionId === 'number' && typeof tab.sessionId === 'number') {
      // 延迟初始化WebSocket连接，确保DOM和事件处理程序已就绪
      setTimeout(() => {
        try {
          createWebSocketConnection(tab.connectionId as number, tab.sessionId as number, tabKey);
          console.log(`【连接流程】DOM就绪检查通过，已初始化WebSocket连接: ${tabKey}`);
        } catch (error) {
          console.error(`【连接流程】初始化WebSocket连接失败:`, error);
          message.error('连接服务器失败，请重试');

          // 添加重试按钮
          if (tab.terminalRef?.current) {
            const retryButton = document.createElement('button');
            retryButton.innerText = '重试连接';
            retryButton.style.position = 'absolute';
            retryButton.style.top = '50%';
            retryButton.style.left = '50%';
            retryButton.style.transform = 'translate(-50%, -50%)';
            retryButton.style.padding = '8px 16px';
            retryButton.style.backgroundColor = '#1677ff';
            retryButton.style.color = 'white';
            retryButton.style.border = 'none';
            retryButton.style.borderRadius = '4px';
            retryButton.style.cursor = 'pointer';

            retryButton.onclick = () => {
              if (tab.terminalRef?.current) {
                tab.terminalRef.current.innerHTML = '';
                checkAndInitTerminal(tabKey, 0);
              }
            };

            tab.terminalRef.current.appendChild(retryButton);
          }
        }
      }, 300);
    } else {
      console.error(`【连接流程】无法初始化WebSocket连接，参数类型错误: ${tabKey}`);
    }
  }, [createWebSocketConnection]);

  // 将fetchConnectionAndCreateTab函数用useCallback包装
  const fetchConnectionAndCreateTab = useCallback(async (connectionId: number, sessionId?: number) => {
    console.log(`【获取连接】开始获取连接信息: 连接ID=${connectionId}, 会话ID=${sessionId}`);

    try {
      // 从API获取连接详情
      const response = await connectionAPI.getConnection(connectionId);
      if (response && response.data && response.data.data) {
        const connectionData = response.data.data;
        console.log(`【获取连接】成功获取连接详情:`, connectionData);

        // 生成唯一标签键，包含时间戳
        const timestamp = Date.now();
        const tabKey = `tab-${connectionId}-${sessionId || 'nosession'}-${timestamp}`;

        // 创建所有必要的引用
        const terminalRef = createRef<HTMLDivElement>();
        const xtermRef = createRef<Terminal>();
        const webSocketRef = createRef<WebSocket>();
        const fitAddonRef = createRef<FitAddon>();
        const searchAddonRef = createRef<SearchAddon>();
        const messageQueueRef = createRef<string[]>();

        // 初始化消息队列
        messageQueueRef.current = [];

        // 创建标签对象
        const tab: TerminalTab = {
          key: tabKey,
          title: connectionData.name || `Terminal ${connectionId}`,
          connectionId,
          sessionId,
          connection: connectionData, // 存储完整的连接信息
          terminalRef,
          xtermRef,
          webSocketRef,
          fitAddonRef,
          searchAddonRef,
          messageQueueRef,
          isConnected: false
        };

        // 保存会话信息到localStorage
        saveSessionInfo(connectionId, sessionId || 0, tabKey, connectionData);

        // 添加标签到context
        addTab(tab);

        // 确保状态更新
        terminalStateRef.current = {
          ...terminalStateRef.current!,
          tabs: [...terminalStateRef.current!.tabs, tab]
        };

        // 触发标签激活事件
        setTimeout(() => {
          setActiveTab(tabKey);
          window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
            detail: { tabKey, isNewTab: true }
          }));

          // 触发终端就绪事件
          window.dispatchEvent(new CustomEvent('terminal-ready', {
            detail: { tabKey }
          }));
        }, 100);

        // 返回创建的标签
        return tab;
      } else {
        const errorMsg = response?.data?.message || '未知错误';
        console.error(`【获取连接】无法获取连接信息: ${errorMsg}`);
        return null;
      }
    } catch (error) {
      console.error(`【获取连接】获取连接信息失败:`, error);
      throw error;
    }
  }, [addTab, setActiveTab, saveSessionInfo]);

  // 当没有标签时的特殊处理
  useEffect(() => {
    // 检查是否有存储在localStorage中的会话信息
    const savedSession = localStorage.getItem('current_terminal_session');

    // 优先使用引用状态判断是否有标签
    const hasTabsInRef = (terminalStateRef.current?.tabs?.length || 0) > 0;
    const hasTabsInContext = tabs.length > 0;

    console.log('【连接流程】检查恢复会话条件:', {
      refTabs: terminalStateRef.current?.tabs?.length || 0,
      contextTabs: tabs.length,
      hasConnectionId: !!connectionId,
      hasSavedSession: !!savedSession
    });

    // 如果引用和上下文都没有标签，且URL中没有connectionId但有保存的会话信息，则恢复会话
    if (!hasTabsInRef && !hasTabsInContext && !connectionId && savedSession) {
      try {
        const sessionInfo = JSON.parse(savedSession);
        if (sessionInfo.connectionId && sessionInfo.sessionId) {
          console.log('【连接流程】从本地存储恢复会话:', sessionInfo);

          // 检查是否正在处理URL参数中的连接
          if (processedRef.current.has(`${sessionInfo.connectionId}-${sessionInfo.sessionId}`)) {
            console.log('【连接流程】已有连接处理中，不恢复保存的会话');
            return;
          }

          // 导航到保存的会话
          console.log('【连接流程】导航到保存的会话');
          navigate(`/terminal/${sessionInfo.connectionId}?session=${sessionInfo.sessionId}`);
          return;
        }
      } catch (e) {
        console.error('【连接流程】解析保存的会话信息失败:', e);
        localStorage.removeItem('current_terminal_session');
      }
    }

    // 清理URL参数后仍然保持终端连接
    if (!hasTabsInRef && !hasTabsInContext && !connectionId && savedSession) {
      console.log('【连接流程】URL清理后发现连接丢失，尝试恢复连接');

      // 从本地存储获取会话信息
      const savedSessionInfo = localStorage.getItem('terminal_last_session');
      if (savedSessionInfo) {
        console.log('【连接流程】使用quickReconnect函数恢复连接');
        // 使用WebSocketManager提供的重连函数
        quickReconnect();
      }
    }
  }, [tabs.length, navigate, connectionId]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (tabs.length === 0) return;

      // 获取当前活动标签页
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      if (!activeTab || !activeTab.fitAddonRef?.current || !activeTab.xtermRef?.current) return;

      setTimeout(() => {
        try {
          activeTab.fitAddonRef.current!.fit();

          // 获取新的终端尺寸
          const newCols = activeTab.xtermRef.current!.cols;
          const newRows = activeTab.xtermRef.current!.rows;

          // 只有在尺寸变化时才更新状态和发送消息
          if (newCols !== terminalSize.cols || newRows !== terminalSize.rows) {
            setTerminalSize({ cols: newCols, rows: newRows });

            // 发送调整大小的消息到服务器
            if (activeTab.webSocketRef?.current &&
              activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
              const resizeMessage = {
                type: 'resize',
                cols: newCols,
                rows: newRows
              };
              activeTab.webSocketRef.current.send(JSON.stringify(resizeMessage));
            }
          }
        } catch (e) {
          console.error('调整终端大小失败:', e);
        }
      }, 0);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTabKey, tabs, terminalSize]);

  // 添加全局样式表来强制隐藏xterm-link-layer
  useEffect(() => {
    // 创建一个样式表强制隐藏xterm-link-layer
    const style = document.createElement('style');
    style.innerHTML = `
      .xterm-link-layer {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // 切换全屏
  const handleToggleFullscreen = useCallback(() => {
    // 调用子Hook中的toggleFullscreen来切换全屏状态
    toggleFullscreen();

    // 调整终端大小
    setTimeout(() => {
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      if (!activeTab) return;

      // 调整终端大小
      resizeTerminal(activeTab);
    }, 100);
  }, [activeTabKey, tabs, toggleFullscreen, resizeTerminal]);

  // 监听终端大小变化
  useEffect(() => {
    const handleResizeTerminal = () => {
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      if (!activeTab || !activeTab.fitAddonRef?.current || !activeTab.xtermRef?.current) return;

      try {
        activeTab.fitAddonRef.current.fit();

        // 获取新尺寸
        const newSize = {
          cols: activeTab.xtermRef.current.cols,
          rows: activeTab.xtermRef.current.rows
        };

        // 发送尺寸调整消息到服务器
        if (activeTab.isConnected &&
          activeTab.webSocketRef?.current &&
          activeTab.webSocketRef.current.readyState === WebSocket.OPEN &&
          (newSize.cols !== terminalSize.cols || newSize.rows !== terminalSize.rows)) {
          const resizeMessage = {
            type: 'resize',
            cols: newSize.cols,
            rows: newSize.rows
          };
          activeTab.webSocketRef.current.send(JSON.stringify(resizeMessage));

          // 更新状态
          setTerminalSize(newSize);
        }
      } catch (e) {
        console.error('调整终端大小失败', e);
      }
    };

    // 添加窗口大小变化事件监听
    window.addEventListener('resize', handleResizeTerminal);

    // 添加全屏变化监听
    document.addEventListener('fullscreenchange', handleResizeTerminal);
    document.addEventListener('webkitfullscreenchange', handleResizeTerminal);
    document.addEventListener('mozfullscreenchange', handleResizeTerminal);
    document.addEventListener('MSFullscreenChange', handleResizeTerminal);

    return () => {
      window.removeEventListener('resize', handleResizeTerminal);
      document.removeEventListener('fullscreenchange', handleResizeTerminal);
      document.removeEventListener('webkitfullscreenchange', handleResizeTerminal);
      document.removeEventListener('mozfullscreenchange', handleResizeTerminal);
      document.removeEventListener('MSFullscreenChange', handleResizeTerminal);
    };
  }, [activeTabKey, tabs, terminalSize]);

  // 全局恢复会话函数
  const attemptGlobalRecovery = () => {
    console.log('执行全局恢复函数');

    // 检查是否有保存的会话信息
    const savedSession = localStorage.getItem('terminal_last_session');
    if (!savedSession) {
      console.log('未找到保存的会话信息');
      return;
    }

    try {
      const sessionInfo = JSON.parse(savedSession);
      console.log('找到保存的会话信息:', sessionInfo);

      // 执行实际的恢复逻辑...
    } catch (e) {
      console.error('解析会话信息失败:', e);
    }
  };

  // 导航后重连函数
  const reconnectAfterNavigation = () => {
    console.log('执行导航后重连函数');

    // 执行全局恢复
    attemptGlobalRecovery();
  };

  // 注册全局函数
  useEffect(() => {
    console.log('注册全局恢复函数');

    if (typeof window !== 'undefined') {
      (window as any).attemptGlobalRecovery = attemptGlobalRecovery;
      (window as any).reconnectAfterNavigation = reconnectAfterNavigation;
    }

    return () => {
      // 清理
      if (typeof window !== 'undefined') {
        delete (window as any).attemptGlobalRecovery;
        delete (window as any).reconnectAfterNavigation;
      }
    };
  }, []);

  // URL清理后检查连接状态
  useEffect(() => {
    console.log('【连接流程】URL清理后检查连接状态');

    // 检查是否有标签和连接
    const hasActiveTab = (terminalStateRef.current?.tabs?.length || 0) > 0 || tabs.length > 0;
    const hasSavedSession = localStorage.getItem('terminal_last_session') !== null;

    // 如果没有活动标签但有保存的会话，尝试恢复连接
    if (!hasActiveTab && hasSavedSession) {
      console.log('【连接流程】URL清理后发现连接丢失，尝试恢复连接');

      // 尝试使用全局重连函数
      if (typeof window !== 'undefined' && (window as any).reconnectTerminal) {
        console.log('【连接流程】使用全局重连函数恢复连接');
        (window as any).reconnectTerminal();
      }
    }
  }, [tabs.length, connectionId, quickReconnect]);

  // 监听DOM准备事件
  useEffect(() => {
    console.log('注册终端准备事件监听器');

    const handleTerminalReady = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.tabKey) {
        const tabKey = customEvent.detail.tabKey;
        console.log(`【事件响应】收到终端准备事件，标签: ${tabKey}`);

        // 获取标签信息
        const tab = terminalStateRef.current?.tabs.find(t => t.key === tabKey);
        if (tab && tab.terminalRef?.current) {
          console.log(`【事件响应】标签 ${tabKey} 的DOM已准备就绪，尝试初始化终端`);

          // 执行初始化和连接逻辑
          const handleTerminalData = (data: string) => {
            if (!data) return;
            // 发送数据到服务器
            sendDataToServer(data);
          };

          try {
            // 初始化终端实例
            const initialized = initTerminal(tab, handleTerminalData);
            if (initialized) {
              console.log(`【事件响应】终端初始化成功: ${tabKey}`);

              // 准备连接
              if (tab.connectionId && tab.sessionId) {
                console.log(`【事件响应】准备创建WebSocket连接: ${tabKey}`);
                // 使用参数形式2: connectionId, sessionId, tabKey
                const connectionId = Number(tab.connectionId);
                const sessionId = Number(tab.sessionId);

                if (!isNaN(connectionId) && !isNaN(sessionId)) {
                  createWebSocketConnection(connectionId, sessionId, tabKey);
                } else {
                  console.error(`【事件响应】无法创建WebSocket连接，参数无效: connectionId=${tab.connectionId}, sessionId=${tab.sessionId}`);
                }
              } else {
                console.error(`【事件响应】无法创建WebSocket连接，缺少connectionId或sessionId: ${tabKey}`);
              }
            } else {
              console.error(`【事件响应】终端初始化失败: ${tabKey}`);
            }
          } catch (err) {
            console.error(`【事件响应】终端初始化出错: ${tabKey}`, err);
          }
        } else if (tab && !tab.terminalRef?.current) {
          // DOM元素不存在，尝试重新查找
          const domId = `terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`;
          console.log(`【事件响应】标签 ${tabKey} 的DOM不存在，尝试查找: ${domId}`);

          const terminalElement = document.getElementById(domId);
          if (terminalElement) {
            // 设置DOM引用并重新触发事件
            console.log(`【事件响应】找到DOM元素 ${domId}，设置引用并重新触发事件`);
            tab.terminalRef.current = terminalElement as HTMLDivElement;

            // 重新触发终端就绪事件
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('terminal-ready', {
                detail: { tabKey: tabKey }
              }));
            }, 100);
          } else {
            console.error(`【事件响应】无法找到DOM元素: ${domId}，将在500ms后重试`);

            // 添加重试
            const timerId = setTimeout(() => {
              console.log(`【事件响应】重试触发terminal-ready事件: ${tabKey}`);
              window.dispatchEvent(new CustomEvent('terminal-ready', {
                detail: { tabKey: tabKey }
              }));
            }, 500);

            // 保存定时器ID以便清理
            retryTimersRef.current.push(timerId);
          }
        } else {
          console.error(`【事件响应】找不到标签: ${tabKey}`);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('terminal-ready', handleTerminalReady);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('terminal-ready', handleTerminalReady);
      }
    };
  }, []);

  // 添加useEffect监听connectionId和sessionParam变化
  useEffect(() => {
    if (connectionId && parseInt(connectionId) > 0) {
      // 创建唯一标识符来跟踪这个连接ID和会话ID组合是否已处理
      const connectionKey = `${connectionId}-${sessionParam || 'nosession'}`;

      // 如果已经处理过这个组合，直接返回避免重复处理
      if (processedConnectionRef.current.has(connectionKey)) {
        return;
      }

      console.log(`【主useEffect】连接ID参数变化: ${connectionId}, 会话: ${sessionParam || '未设置'}`);

      // 确保显示加载提示
      if (isLoadingRef.current) {
        console.log(`【主useEffect】已显示加载提示`);
      } else {
        console.log(`【主useEffect】显示加载提示`);
        message.loading(`正在连接到远程服务器...`, 0.5);
        isLoadingRef.current = true;
      }

      // 使用terminalStateRef获取最新的tabs状态，而不是依赖于tabs props
      const currentTabs = terminalStateRef.current?.tabs || [];

      // 检查是否已存在相同连接的标签
      const existingTab = currentTabs.find(tab =>
        tab.connectionId === parseInt(connectionId) &&
        (!sessionParam || tab.sessionId === parseInt(sessionParam))
      );

      if (existingTab) {
        console.log(`【主useEffect】发现现有标签: ${existingTab.key}，激活此标签`);
        setActiveTab(existingTab.key);

        // 分发激活事件
        window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
          detail: { tabKey: existingTab.key, isNewTab: false }
        }));

        // 记录最后活动的标签
        localStorage.setItem('terminal_active_tab', existingTab.key);

        // 标记为已处理
        processedConnectionRef.current.add(connectionKey);

        return;
      }

      // 创建新标签
      console.log(`【主useEffect】准备创建新标签，连接ID: ${connectionId}`);

      // 转换参数类型
      const connId = parseInt(connectionId);
      const sessId = sessionParam ? parseInt(sessionParam) : undefined;

      // 标记为已处理，防止重复创建
      processedConnectionRef.current.add(connectionKey);

      // 调用fetchConnectionAndCreateTab创建标签
      fetchConnectionAndCreateTab(connId, sessId)
        .then(newTab => {
          if (newTab) {
            console.log(`【主useEffect】标签创建成功: ${newTab.key}`);
            message.success('连接创建成功');
          } else {
            console.error(`【主useEffect】标签创建失败`);
            message.error('连接创建失败');
            // 如果创建失败，移除标记以允许再次尝试
            processedConnectionRef.current.delete(connectionKey);
          }
        })
        .catch(error => {
          console.error(`【主useEffect】标签创建出错:`, error);
          message.error('创建连接时发生错误');
          // 如果创建失败，移除标记以允许再次尝试
          processedConnectionRef.current.delete(connectionKey);
        })
        .finally(() => {
          isLoadingRef.current = false;
        });
    } else {
      console.log(`【主useEffect】无连接ID参数 或 ID无效: ${connectionId}`);
    }
  }, [connectionId, sessionParam, setActiveTab, fetchConnectionAndCreateTab]);

  return {
    connection,
    tabs,
    activeTabKey,
    fullscreen,
    isConnected,
    terminalSize,
    networkLatency,
    terminalMode,
    sidebarCollapsed,
    cleanURL,
    toggleFullscreen: handleToggleFullscreen,
    sendDataToServer,
    setNetworkLatency,
    setTerminalMode,
    setSidebarCollapsed,
    setIsConnected,
    clearRetryTimers, // 导出清除重试函数
    // 导出额外的有用函数
    createConnectionHelp,
    createRetryInterface
  };
};

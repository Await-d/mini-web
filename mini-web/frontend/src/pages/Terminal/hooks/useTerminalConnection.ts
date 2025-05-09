import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { connectionAPI, sessionAPI } from '../../../services/api';
import type { Connection } from '../../../services/api';
import { useTerminal } from '../../../contexts/TerminalContext';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { WindowSize, TerminalMessage } from '../utils/terminalConfig';

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

  // 缓存已处理的连接参数，避免重复处理同一个URL参数
  const processedRef = useRef(false);

  // 保存间隔定时器引用以便清理
  const intervalsRef = useRef<{ [key: string]: number }>({});

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
      (terminalStateRef.current.tabs as TerminalTab[]).find(tab => tab.key === terminalStateRef.current.activeTabKey)) as TerminalTab | undefined;

    // 标签信息调试
    console.log("【连接流程】清理URL时的标签状态:", {
      activeTabKey: activeTabKey,
      refTabsCount: terminalStateRef.current.tabs?.length || 0,
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
            (terminalStateRef.current.tabs as TerminalTab[]).find(tab => tab.key === activeTab.key)) as TerminalTab | undefined;

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
      if (tabs.length === 0 && terminalStateRef.current.tabs.length === 0) {
        console.log("【连接流程】无标签，暂不清理URL参数");
        return;
      } else {
        // 如果有标签但找不到活动标签，尝试保存第一个标签的信息
        const firstTab = terminalStateRef.current.tabs[0] || tabs[0];
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

  // 将fetchConnectionAndCreateTab提升为hook级别函数
  const fetchConnectionAndCreateTab = useCallback(async (connectionId: number, sessionId?: number) => {
    if (!connectionId) {
      console.log('【连接流程】无连接ID，跳过创建标签');
      return;
    }

    console.log(`【连接流程】开始获取连接信息和创建标签，连接ID=${connectionId}`);

    try {
      console.log(`【连接流程】请求连接API获取连接信息，ID=${connectionId}`);
      const response = await connectionAPI.getConnection(Number(connectionId));

      if (response.data && response.data.code === 200) {
        const conn = response.data.data;
        console.log('【连接流程】成功获取连接信息:', {
          id: conn.id,
          name: conn.name,
          protocol: conn.protocol,
          host: conn.host
        });
        setConnection(conn);

        // 如果URL中包含会话ID，使用它；否则创建新会话
        let session = null;
        if (sessionId) {
          console.log(`【连接流程】使用URL中的会话ID: ${sessionId}`);
          session = { id: Number(sessionId) };
        } else {
          console.log(`【连接流程】为连接创建新会话, 连接ID=${conn.id}`);
          const sessResponse = await sessionAPI.createSession(conn.id);
          if (sessResponse.data && sessResponse.data.code === 200) {
            session = sessResponse.data.data;
            console.log(`【连接流程】成功创建新会话，ID=${session.id}`);
          } else {
            console.error('【连接流程】创建会话失败:', sessResponse.data);
            message.error('创建会话失败');
            return;
          }
        }

        if (session) {
          // 检查是否已存在相同的标签
          console.log(`【连接流程】检查标签是否已存在，连接ID=${conn.id}，会话ID=${session.id}`);
          const existingTab = tabs.find(
            tab => tab.connectionId === conn.id && tab.sessionId === session?.id
          );

          if (!existingTab) {
            console.log(`【连接流程】调用addTab创建新标签，连接ID=${conn.id}，会话ID=${session.id}`);
            // 使用上下文管理器添加标签，获取返回的标签key
            const newTabKey = addTab(conn.id, session.id, conn);

            // 使用全局引用直接检查状态
            console.log(`【连接流程】添加标签后，当前状态:`, {
              contextTabs: tabs.length,
              refTabs: terminalStateRef.current.tabs.length,
              newTabKey
            });

            // 立即强制激活标签，不等待状态更新
            if (terminalStateRef.current.tabs && terminalStateRef.current.tabs.length > 0) {
              // 检查newTabKey是否为字符串类型
              if (typeof newTabKey === 'string') {
                console.log(`【连接流程】立即强制激活标签: ${newTabKey}`);
                setActiveTab(newTabKey);

                // 手动更新activeTabKey状态，以便后续处理
                const tabRef = (terminalStateRef.current.tabs as TerminalTab[]).find(t => t.key === newTabKey);
                if (tabRef) {
                  console.log('【连接流程】已找到标签引用，可供后续处理');
                }
              } else {
                console.log('【连接流程】newTabKey不是字符串类型，无法激活标签');
              }
            } else if (tabs.length === 0) {
              console.log('【连接流程】标签列表为空，将在1秒后检查状态');
              setTimeout(() => {
                console.log(`【连接流程】延迟检查:`, {
                  contextTabs: tabs.length,
                  refTabs: terminalStateRef.current.tabs.length
                });
              }, 1000);
            }
          } else {
            console.log(`【连接流程】已存在标签，激活标签，Key=${existingTab.key}`);
            // 如果已存在，只激活该标签
            setActiveTab(existingTab.key);
          }
        }
      } else {
        console.error('【连接流程】获取连接信息失败:', response.data);
        message.error('获取连接信息失败');
        navigate('/connections');
      }
    } catch (error) {
      console.error('【连接流程】获取连接信息出现异常:', error);
      message.error('获取连接信息失败，请稍后再试');
      navigate('/connections');
    }
  }, [navigate, tabs, addTab, setActiveTab, setConnection]);

  // 处理连接ID和会话ID参数
  useEffect(() => {
    // 如果有连接ID和会话ID，并且尚未处理，则创建新标签
    if (connectionId && sessionParam && !processedRef.current) {
      console.log(`检测到连接参数: 连接ID=${connectionId}, 会话ID=${sessionParam}`);

      // 标记为已处理，避免在组件重新渲染时重复处理相同参数
      processedRef.current = true;

      // 保存当前会话信息到localStorage，用于页面刷新时恢复
      localStorage.setItem('current_terminal_session', JSON.stringify({
        connectionId: Number(connectionId),
        sessionId: Number(sessionParam)
      }));

      // 添加检查以防止重复请求
      const existingTab = tabs.find(
        tab => tab.connectionId === Number(connectionId) && tab.sessionId === Number(sessionParam)
      );

      if (!existingTab) {
        console.log("【连接流程】未找到匹配的标签页，创建新标签...");

        // 延迟创建标签，确保组件已完全挂载
        setTimeout(() => {
          console.log("【连接流程】执行延迟创建新标签操作");
          // 创建新标签页
          fetchConnectionAndCreateTab(Number(connectionId), Number(sessionParam)).then(() => {
            // 使用引用状态判断标签是否创建成功，而不是上下文状态
            console.log("【连接流程】创建标签页完成，状态:", {
              contextTabs: tabs.length,
              refTabs: terminalStateRef.current.tabs.length
            });

            // 重要：使用引用状态判断标签是否成功创建
            if (terminalStateRef.current.tabs.length > 0) {
              console.log("【连接流程】标签创建成功（引用验证），清理URL");
              cleanURL();
            } else if (tabs.length > 0) {
              console.log("【连接流程】标签创建成功（上下文验证），清理URL");
              cleanURL();
            } else {
              console.error("【连接流程】标签未成功创建（引用和上下文都为空），将重试");
              // 添加重试逻辑，延迟更长时间
              setTimeout(() => fetchConnectionAndCreateTab(Number(connectionId), Number(sessionParam)), 1500);
            }
          }).catch(err => {
            console.error("【连接流程】创建标签页失败:", err);
          });
        }, 500);
      } else {
        console.log(`【连接流程】找到匹配的标签页: ${existingTab.key}，激活此标签`);
        // 如果已存在，只激活该标签并清理URL
        setActiveTab(existingTab.key);
        cleanURL();
      }
    }
  }, [connectionId, sessionParam, navigate, addTab, setActiveTab, tabs, cleanURL, fetchConnectionAndCreateTab]);

  // 当没有标签时的特殊处理
  useEffect(() => {
    // 检查是否有存储在localStorage中的会话信息
    const savedSession = localStorage.getItem('current_terminal_session');

    // 优先使用引用状态判断是否有标签
    const hasTabsInRef = terminalStateRef.current.tabs.length > 0;
    const hasTabsInContext = tabs.length > 0;

    console.log('【连接流程】检查恢复会话条件:', {
      refTabs: terminalStateRef.current.tabs.length,
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
          if (processedRef.current) {
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

  // 标签切换时初始化终端并连接WebSocket
  useEffect(() => {
    console.log(`【连接调试】检测到活动标签页变化，尝试执行初始化和连接: ${activeTabKey || 'no-tabs'}`);

    // 检查全局引用中的标签列表
    const refTabs = terminalStateRef.current.tabs;
    console.log(`【连接调试】状态比较:`, {
      contextTabs: tabs.length,
      refTabs: refTabs.length,
      contextActiveKey: activeTabKey,
      refActiveKey: terminalStateRef.current.activeTabKey
    });

    // 优先使用引用中的标签列表，防止状态延迟更新问题
    const tabsToUse = refTabs.length > tabs.length ? refTabs : tabs;

    console.log(`【连接调试】当前标签页列表:`, tabsToUse.map(t => ({
      key: t.key,
      connectionId: t.connectionId,
      sessionId: t.sessionId,
      hasTerminalRef: !!t.terminalRef?.current,
      hasXtermRef: !!t.xtermRef?.current,
      isConnected: t.isConnected,
      protocol: t.connection?.protocol
    })));

    // 优先使用引用查找活动标签
    let activeTab;
    if (activeTabKey !== 'no-tabs') {
      activeTab = tabsToUse.find(tab => tab.key === activeTabKey);
    } else if (terminalStateRef.current.activeTabKey !== 'no-tabs') {
      // 使用引用中的activeTabKey作为备选
      activeTab = tabsToUse.find(tab => tab.key === terminalStateRef.current.activeTabKey);
    }

    if (!activeTab || !activeTab.terminalRef?.current) {
      console.log(`【连接调试】terminalRef未初始化: activeTab ${activeTab ? '存在' : '不存在'}, terminalRef ${activeTab?.terminalRef?.current ? '存在' : '不存在'}`);

      // 如果activeTab存在但terminalRef未初始化，设置延迟重试
      if (activeTab) {
        console.log('检测到activeTab但terminalRef未初始化，设置延迟重试');

        // 增加重试次数和间隔，提高成功率
        const retryIntervals = [300, 600, 1000, 1500, 2000, 3000, 5000]; // 增加更多间隔和更长的时间

        let retryAttempt = 0;
        const maxRetries = retryIntervals.length;

        // 创建递归重试函数，更可靠
        const attemptInitialization = (delay: number, attempt: number) => {
          setTimeout(() => {
            // 每次重试时重新获取最新状态，优先从引用中获取
            const currentTabs = terminalStateRef.current.tabs.length > 0 ?
              terminalStateRef.current.tabs : tabsToUse;

            const currentActiveKey = activeTabKey !== 'no-tabs' ?
              activeTabKey : terminalStateRef.current.activeTabKey;

            // 获取当前活动标签
            const currentActiveTab = currentTabs.find(tab => tab.key === currentActiveKey);

            // 添加调试输出，显示DOM元素查询信息
            if (currentActiveTab && currentActiveTab.key) {
              const terminalElement = document.querySelector(`.terminal-element-${currentActiveTab.key}`);
              console.log(`【DOM检查】标签 ${currentActiveTab.key}: DOM元素存在: ${!!terminalElement}, ref存在: ${!!currentActiveTab.terminalRef?.current}`);
            }

            console.log(`重试初始化(${attempt}/${maxRetries}): activeTab ${currentActiveTab ? '存在' : '不存在'}, ` +
              `terminalRef ${currentActiveTab?.terminalRef?.current ? '存在' : '不存在'}, ` +
              `连接尝试 ${connectionAttemptRef.current ? '已进行' : '未进行'}`);

            if (currentActiveTab?.terminalRef?.current && !connectionAttemptRef.current) {
              console.log(`延迟重试${attempt}成功：terminalRef已初始化，开始连接`);
              connectionAttemptRef.current = true; // 标记为已尝试连接，避免重复

              // 执行初始化和连接逻辑
              const handleTerminalData = (data: string) => {
                if (!data) return;
                console.log('终端输入数据:', data.length > 10 ? data.substring(0, 10) + '...' : data);
                sendDataToServer(data);
              };

              // 初始化终端实例
              console.log('延迟初始化终端实例...');
              const initialized = initTerminal(currentActiveTab, handleTerminalData);

              if (initialized) {
                console.log('终端实例初始化成功，附加事件处理程序');

                // 添加终端焦点事件
                const cleanup = attachTerminalFocusHandlers(currentActiveTab);

                // 创建终端工具按钮
                createTerminalTools(currentActiveTab);

                // 设置定期检测终端模式
                const modeCleanup = setupModeDetection(currentActiveTab);

                // 设置定期测量网络延迟
                const latencyCleanup = setupLatencyMeasurement(currentActiveTab);

                // 尝试建立WebSocket连接
                console.log('延迟尝试建立WebSocket连接...');

                // 定义重连函数，确保它被正确定义
                const reconnectFunction = () => {
                  console.log('执行重连函数...');
                  createWebSocketConnection(
                    currentActiveTab.connectionId,
                    currentActiveTab.sessionId,
                    currentActiveTab.key
                  );
                };

                // 保存重连函数到全局，确保可被其他地方调用
                if (typeof window !== 'undefined') {
                  (window as any).reconnectTerminal = reconnectFunction;
                }

                const onConnectionHelp = () => {
                  createConnectionHelp(currentActiveTab, () => {
                    createWebSocketConnection(
                      currentActiveTab.connectionId,
                      currentActiveTab.sessionId,
                      currentActiveTab.key
                    );
                  });
                };

                const onRetryInterface = () => {
                  createRetryInterface(
                    currentActiveTab,
                    () => createWebSocketConnection(
                      currentActiveTab.connectionId,
                      currentActiveTab.sessionId,
                      currentActiveTab.key
                    ),
                    () => createConnectionHelp(
                      currentActiveTab,
                      () => createWebSocketConnection(
                        currentActiveTab.connectionId,
                        currentActiveTab.sessionId,
                        currentActiveTab.key
                      )
                    )
                  );
                };

                // 立即尝试连接
                createWebSocketConnection(
                  currentActiveTab.connectionId,
                  currentActiveTab.sessionId,
                  currentActiveTab.key
                );

                // 更新标签状态
                const updatedTab = {
                  ...currentActiveTab,
                  initialized: true
                };
                updateTab(currentActiveTab.key, updatedTab);
              } else {
                console.error('终端实例初始化失败，尝试下一次重试');
                if (attempt < maxRetries) {
                  attemptInitialization(retryIntervals[attempt], attempt + 1);
                }
              }
            } else {
              // 如果还未达到最大重试次数，继续重试
              if (attempt < maxRetries) {
                console.log(`重试${attempt}失败：terminalRef未初始化或已有连接，将在${retryIntervals[attempt]}ms后重试`);
                attemptInitialization(retryIntervals[attempt], attempt + 1);
              } else {
                console.warn(`达到最大重试次数(${maxRetries})：终端初始化失败`);

                // 尝试清理状态并重新激活标签
                if (currentActiveTab) {
                  console.log('尝试重新激活标签，可能会触发新的渲染周期');
                  setActiveTab(currentActiveTab.key);

                  // 最后一次尝试，强制更新DOM后检查
                  setTimeout(() => {
                    const finalCheck = currentTabs.find(tab => tab.key === currentActiveKey);
                    if (finalCheck?.terminalRef?.current) {
                      console.log('最终检查发现terminalRef已初始化，尝试连接');
                      attemptInitialization(0, 1); // 重新开始尝试
                    } else {
                      console.error('最终尝试失败：无法初始化终端');
                    }
                  }, 1000);
                }
              }
            }
          }, delay);
        };

        // 开始第一次尝试
        attemptInitialization(retryIntervals[0], 1);
      } else {
        console.log(`【连接调试】未找到活动标签页，activeTabKey:`, activeTabKey);
        console.log(`【连接调试】引用中的activeTabKey:`, terminalStateRef.current.activeTabKey);
      }

      return;
    }

    // 重置连接尝试状态
    connectionAttemptRef.current = false;

    // 终端已初始化，调整大小确保正确显示
    if (activeTab.xtermRef?.current && activeTab.fitAddonRef?.current) {
      console.log(`标签页 ${activeTabKey} 终端已初始化，调整大小`);

      // 立即调整一次
      try {
        if (activeTab.fitAddonRef.current) {
          console.log('立即尝试调整终端大小');
          activeTab.fitAddonRef.current.fit();
        }
      } catch (e) {
        console.error(`立即调整终端大小错误:`, e);
      }

      // 延迟多次调整以确保DOM已更新
      [100, 300, 500, 1000].forEach(delay => {
        setTimeout(() => {
          try {
            if (activeTab.fitAddonRef?.current) {
              console.log(`${delay}ms后尝试调整终端大小`);
              activeTab.fitAddonRef.current.fit();

              // 发送一个回车确保有内容显示
              if (delay === 1000 && activeTab.webSocketRef?.current &&
                activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
                console.log('发送回车以确保终端内容可见');
                activeTab.webSocketRef.current.send('\r');
              }
            }
          } catch (e) {
            console.error(`${delay}ms后调整终端大小错误:`, e);
          }
        }, delay);
      });

      // 更新状态
      setIsConnected(activeTab.isConnected || false);
      if (activeTab.networkLatency !== undefined && activeTab.networkLatency !== null) {
        setNetworkLatency(activeTab.networkLatency);
      }
      if (activeTab.terminalMode) {
        setTerminalMode(activeTab.terminalMode);
      }

      return;
    }

    // 改进的终端数据处理函数
    const handleTerminalData = (data: string) => {
      if (!data) {
        console.warn('终端输入数据为空');
        return;
      }

      console.log('终端输入数据:', data.length > 10 ? data.substring(0, 10) + '...' : data);
      sendDataToServer(data);
    };

    // 初始化终端实例
    console.log('初始化终端实例...');
    const initialized = initTerminal(activeTab, handleTerminalData);

    if (!initialized) {
      console.error('终端初始化失败，无法继续');
      return;
    }

    // 添加终端焦点事件
    const cleanup = attachTerminalFocusHandlers(activeTab);

    // 创建终端工具按钮
    createTerminalTools(activeTab);

    // 设置定期检测终端模式
    const modeCleanup = setupModeDetection(activeTab);

    // 设置定期测量网络延迟
    const latencyCleanup = setupLatencyMeasurement(activeTab);

    // 注册全局辅助函数
    registerGlobalHelpers(activeTab);

    // 尝试建立WebSocket连接
    const onConnectionHelp = () => {
      createConnectionHelp(activeTab, () => {
        createWebSocketConnection(
          activeTab.connectionId,
          activeTab.sessionId,
          activeTab.key
        );
      });
    };

    const onRetryInterface = () => {
      createRetryInterface(
        activeTab,
        () => createWebSocketConnection(
          activeTab.connectionId,
          activeTab.sessionId,
          activeTab.key
        ),
        () => createConnectionHelp(
          activeTab,
          () => createWebSocketConnection(
            activeTab.connectionId,
            activeTab.sessionId,
            activeTab.key
          )
        )
      );
    };

    // 立即尝试连接
    console.log('尝试建立WebSocket连接...');
    createWebSocketConnection(
      activeTab.connectionId,
      activeTab.sessionId,
      activeTab.key
    );

    // 清理函数
    return () => {
      if (cleanup) cleanup();
      if (modeCleanup) modeCleanup();
      if (latencyCleanup) latencyCleanup();
    };
  }, [
    activeTabKey,
    tabs,
    initTerminal,
    attachTerminalFocusHandlers,
    createWebSocketConnection,
    createConnectionHelp,
    createRetryInterface,
    registerGlobalHelpers,
    setupModeDetection,
    setupLatencyMeasurement,
    createTerminalTools,
    sendDataToServer
  ]);

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
    const hasActiveTab = terminalStateRef.current.tabs.length > 0 || tabs.length > 0;
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
        const tab = terminalStateRef.current.tabs.find(t => t.key === tabKey);
        if (tab && tab.terminalRef?.current) {
          console.log(`【事件响应】标签 ${tabKey} 的DOM已准备就绪，尝试初始化终端`);

          // 执行初始化和连接逻辑
          const handleTerminalData = (data: string) => {
            if (!data) return;
            // 发送数据到服务器
            sendDataToServer(data);
          };

          // 初始化终端实例
          const initialized = initTerminal(tab, handleTerminalData);
          if (initialized) {
            console.log(`【事件响应】终端初始化成功，准备连接`);

            // 准备连接 - 使用参数形式2: connectionId, sessionId, tabKey
            createWebSocketConnection(
              tab.connectionId,
              tab.sessionId,
              tab.key
            );
          }
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
    // 导出额外的有用函数
    createConnectionHelp,
    createRetryInterface
  };
};
import React, { useState, useEffect, lazy, Suspense, useRef, createRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Spin, Empty, message, Button } from 'antd';
import { useTerminal } from '../../contexts/TerminalContext';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import type { TerminalTab } from '../../contexts/TerminalContext';
import TerminalConnector from './components/TerminalConnectionWrapper';
import './styles.module.css';
// 导入API服务和类型
import { connectionAPI, sessionAPI } from '../../services/api';
import type { Connection } from '../../services/api';
// 直接在文件中定义saveSessionInfo函数，避免额外创建文件

// 组件 - 静态导入基本组件
import TerminalHeader from './components/TerminalHeader';
import TerminalTabs from './components/TerminalTabs';
import TerminalGuide from './components/TerminalGuide';
import TerminalContainers from './components/TerminalContainers';
import TerminalEventManager from './components/TerminalEventManager';
import TerminalSettingsApplier, { applyTerminalSettings } from './components/TerminalSettingsApplier';
import TerminalTabPersistence from './components/TerminalTabPersistence';

// 终端设置组件
import TerminalSettings from './TerminalSettings';
import type { TerminalSettings as TermSettings } from './TerminalSettings';

// 批量命令组件
import QuickCommands from '../../components/QuickCommands';
import BatchCommands from '../../components/BatchCommands';

// 自定义Hooks - 静态导入关键Hooks
import { useTerminalEvents } from './hooks/useTerminalEvents';
import { useTerminalConnection } from './hooks/useTerminalConnection';
import { useWebSocketManager } from './hooks/useWebSocketManager';
import { useTerminalInitialization } from './hooks/useTerminalInitialization'; // 导入终端初始化Hook

// 样式
import styles from './styles.module.css';
import './Terminal.css'; // 引入额外的终端样式

// 添加import导入loadTerminalDependencies
import loadTerminalDependencies from './utils/loadTerminalDependencies';

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
        username: connection.username,
        // 保存完整的连接对象，确保恢复时有足够信息
        connection: connection
      })
    };

    // 保存到localStorage - 使用两个键以增加恢复成功率
    localStorage.setItem('current_terminal_session', JSON.stringify(sessionInfo));
    localStorage.setItem('terminal_last_session', JSON.stringify(sessionInfo));

    // 确保标记为未关闭所有标签 - 标记"所有标签关闭"标志为false
    localStorage.removeItem('all_tabs_closed');
  } catch (error) {
    console.error('保存会话信息失败:', error);
  }
};

/**
 * 终端组件
 * 集成了SSH, Telnet, RDP, VNC等多种远程连接协议支持
 */
function TerminalComponent(): React.ReactNode {
  const { connectionId } = useParams<{ connectionId: string }>();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quickCommandsVisible, setQuickCommandsVisible] = useState(false);
  const [batchCommandsVisible, setBatchCommandsVisible] = useState(false);
  // 添加一个标记，用于跟踪是否已经从localStorage恢复过标签
  const [tabsRestored, setTabsRestored] = useState(false);

  // 使用状态存储连接参数
  const { search } = useLocation();
  const queryParams = new URLSearchParams(search);
  const sessionId = queryParams.get('session');

  // 添加一个标记表示是否应该处理URL参数
  const shouldProcessUrlParams = useRef(true);

  // 将连接信息转换为正确的类型
  const connectionParamsForConnector = connectionId ? {
    connectionId: parseInt(connectionId),
    sessionId: sessionId ? parseInt(sessionId) : undefined
  } : undefined;

  // 终端事件处理
  const {
    handleCloseSession,
    handleCopyContent,
    handleDownloadLog,
    handleTabChange: originalHandleTabChange,
    handleToggleSidebar,
    getActiveTab
  } = useTerminalEvents();

  // 从useTerminal中获取状态
  const { state: terminalState, closeTab, setActiveTab, updateTab, addTab } = useTerminal();

  const { tabs, activeTabKey } = terminalState;

  // 获取WebSocket管理hook
  const {
    createWebSocketConnection
  } = useWebSocketManager();

  // 获取终端初始化hook
  const {
    initTerminal
  } = useTerminalInitialization();

  // 添加导航函数
  const navigate = useNavigate();

  // 标签切换处理函数，负责更新活动标签并清理URL参数
  const handleTabChange = (key: string) => {
    // 调用原始的处理函数
    originalHandleTabChange(key);

    // 用户手动切换了标签，禁止后续URL参数的处理
    shouldProcessUrlParams.current = false;

    // 保存标签状态
    localStorage.setItem('terminal_active_tab', key);

    // 触发标签激活事件
    window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
      detail: {
        tabKey: key,
        isManualSwitch: true
      }
    }));

    // 始终清理URL参数，避免刷新页面时重复创建标签
    try {
      window.history.replaceState({}, '', '/terminal/');
    } catch (e) {
      setTimeout(() => {
        navigate('/terminal/');
      }, 0);
    }
  };

  // 处理URL参数和标签选择之间的优先级关系
  useEffect(() => {
    // 如果用户已经禁止处理URL参数，则直接返回
    if (!shouldProcessUrlParams.current) {
      return;
    }

    // 如果没有URL参数，也不需要处理
    if (!connectionId || !sessionId) {
      return;
    }

    // 首先尝试从localStorage获取用户选择的活动标签
    const savedActiveTab = localStorage.getItem('terminal_active_tab');

    // 如果有已保存的活动标签且该标签存在于当前标签列表中
    if (savedActiveTab && tabs.length > 0) {
      const hasActiveTab = tabs.some(tab => tab.key === savedActiveTab);

      if (hasActiveTab) {
        // 优先使用用户选择的标签
        setActiveTab(savedActiveTab);

        // 清理URL参数
        try {
          window.history.replaceState({}, '', '/terminal/');
        } catch (e) {
          setTimeout(() => {
            navigate('/terminal/');
          }, 0);
        }

        // 标记已处理URL参数，防止后续重复处理
        shouldProcessUrlParams.current = false;
        return;
      }
    }

    // 如果没有已保存的有效活动标签，继续处理URL参数
    // 此时会保留处理标志为true，以便fetchConnectionAndCreateTab可以处理
  }, [tabs, connectionId, sessionId, navigate, setActiveTab]);

  // 在组件初始化时，尝试从localStorage恢复标签状态
  useEffect(() => {
    try {
      const savedTabs = localStorage.getItem('terminal_tabs');
      const savedActiveTab = localStorage.getItem('terminal_active_tab');
      const allTabsClosed = localStorage.getItem('all_tabs_closed');

      // 如果标记了所有标签已关闭，或者没有保存的标签数据，则不恢复
      if (allTabsClosed === 'true' || !savedTabs) {
        return;
      }

      // 解析保存的标签数据
      let parsedTabs;
      try {
        parsedTabs = JSON.parse(savedTabs);
      } catch (e) {
        return;
      }

      // 恢复所有标签，不进行过滤
      if (parsedTabs.length === 0) {
        return;
      }

      // 为每个标签创建引用并恢复连接
      const processTabPromises = parsedTabs.map(async (tabData: {
        key: string;
        title?: string;
        connectionId?: number;
        sessionId?: number;
        connection?: any;
      }) => {
        try {
          // 创建所有必要的引用
          const terminalRef = createRef<HTMLDivElement>();
          const xtermRef = createRef<XTerminal>();
          const webSocketRef = createRef<WebSocket>();

          // 尝试获取完整的连接信息
          let connection = tabData.connection;
          if (!connection && tabData.connectionId) {
            try {
              const response = await connectionAPI.getConnection(tabData.connectionId);
              if (response && response.data && response.data.data) {
                connection = response.data.data;
              }
            } catch (error) {
              // 错误处理但不打印日志
            }
          }

          // 创建新标签
          return {
            key: tabData.key,
            title: tabData.title || connection?.name || `终端-${tabData.connectionId}`,
            connectionId: tabData.connectionId,
            sessionId: tabData.sessionId,
            terminalRef,
            xtermRef,
            webSocketRef,
            connection,
            isConnected: false,
            status: 'disconnected'
          } as TerminalTab;
        } catch (error) {
          return null;
        }
      });

      // 等待所有标签处理完成
      Promise.all(processTabPromises).then((restoredTabs) => {
        // 过滤掉处理失败的标签
        const validTabs = restoredTabs.filter(Boolean) as TerminalTab[];

        if (validTabs.length === 0) {
          return;
        }

        // 预先确定活动标签
        const activeTabToSet = savedActiveTab || validTabs[0].key;

        // 逐个添加每个恢复的标签，每个添加之间有延迟，确保正确处理
        let delay = 0;
        const delayStep = 100; // 每个标签添加间隔100ms

        validTabs.forEach((tab, index) => {
          setTimeout(() => {
            // 使用tab.key代替connectionId和sessionId作为标识符
            addTab(tab);

            // 如果是最后一个标签，设置活动标签
            if (index === validTabs.length - 1) {
              setActiveTab(activeTabToSet);
            }
          }, delay);
          delay += delayStep;
        });

        // 设置标记表示已经从localStorage恢复了标签
        setTabsRestored(true);

        // 设置一个标志，表示标签已从localStorage恢复，避免useTerminalConnection中重复恢复
        localStorage.setItem('tabs_restored', 'true');

        // 清除all_tabs_closed标记，因为标签已经被成功恢复了
        localStorage.removeItem('all_tabs_closed');

        // 恢复标签后应该禁止处理URL参数
        shouldProcessUrlParams.current = false;

        // 同时清理URL中的参数
        if (window.location.search ||
          (window.location.pathname.includes('/terminal/') &&
            !window.location.pathname.endsWith('/terminal/'))) {
          try {
            window.history.replaceState({}, '', '/terminal/');
          } catch (e) {
            console.error('清理URL参数失败:', e);
          }
        }

        // 直接设置活动标签，避免在Effect中嵌套setTimeout
        if (terminalState.activeTabKey !== activeTabToSet) {
          setActiveTab(activeTabToSet);
        }
      });
    } catch (error) {
      // 错误处理但不打印日志
    }
  }, []);

  // 模拟组件加载
  useEffect(() => {
    // 短暂延迟后设置加载完成，确保连接包装器已加载
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // 添加一个新的useEffect来加载xterm依赖
  useEffect(() => {
    // 加载xterm依赖
    loadTerminalDependencies()
  }, []);

  // 添加清理tabs_restored标记的useEffect
  useEffect(() => {
    return () => {
      // 组件卸载时清理tabs_restored标记
      localStorage.removeItem('tabs_restored');

      // 如果有all_tabs_closed标记，确保还清理所有会话数据
      const allTabsClosed = localStorage.getItem('all_tabs_closed');
      if (allTabsClosed === 'true') {
        localStorage.removeItem('session_info');
        localStorage.removeItem('terminal_last_session');
        localStorage.removeItem('current_terminal_session');
      }
    };
  }, []);

  // 终端设置应用函数已移至TerminalSettingsApplier组件

  // 标签编辑处理
  const handleTabEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: "add" | "remove"
  ) => {
    if (action === "remove" && typeof targetKey === "string") {
      // 判断是否是最后一个标签，但不立即设置all_tabs_closed标记
      // 我们会在组件卸载时根据需要设置此标记
      if (tabs.length === 1) {
        // 不再此处设置all_tabs_closed标记，以允许在刷新后恢复标签
        // localStorage.setItem('all_tabs_closed', 'true');
      }

      closeTab(targetKey);
    }
  };

  // 监控标签页连接状态
  useEffect(() => {
    if (!tabs || tabs.length === 0) return;

    // 定义监控函数
    const monitorConnectionStatus = () => {
      const currentTabs = [...tabs];

      // 检查每个标签的连接状态
      currentTabs.forEach(tab => {
        if (tab && tab.key === activeTabKey) {
          // 如果WebSocket已关闭或不存在，但标签仍标记为已连接
          if (tab.isConnected && (!tab.webSocketRef?.current ||
            tab.webSocketRef.current.readyState === WebSocket.CLOSED ||
            tab.webSocketRef.current.readyState === WebSocket.CLOSING)) {

            console.log(`【标签监控】标签 ${tab.key} 的WebSocket已关闭但标记为已连接，更新标签状态`);

            // 更新标签状态
            updateTab(tab.key, { isConnected: false });

            // 通知用户
            message.warning('连接已关闭，请点击重新连接');
          }
        }
      });
    };

    // 设置定期检查
    const intervalId = setInterval(monitorConnectionStatus, 5000);

    // 清理函数
    return () => {
      clearInterval(intervalId);
    };
  }, [tabs, activeTabKey, updateTab]);

  // 终端DOM引用
  const termRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 连接消息记录
  const [connectionMessages, setConnectionMessages] = useState<string[]>([]);

  // 记录连接事件和错误消息
  const addConnectionMessage = useCallback((message: string) => {
    setConnectionMessages(prev => [...prev, message]);
  }, []);

  // 监听WebSocket事件
  useEffect(() => {
    const handleWebSocketMessage = (event: CustomEvent) => {
      const { data } = event.detail;
      if (typeof data === 'string' && data.includes('handshake')) {
        addConnectionMessage(data);
      }
    };

    const handleWebSocketError = (event: CustomEvent) => {
      const { error } = event.detail;
      addConnectionMessage(`连接已关闭: ${error || '未知错误'}`);
    };

    window.addEventListener('websocket-message', handleWebSocketMessage as EventListener);
    window.addEventListener('websocket-error', handleWebSocketError as EventListener);

    return () => {
      window.removeEventListener('websocket-message', handleWebSocketMessage as EventListener);
      window.removeEventListener('websocket-error', handleWebSocketError as EventListener);
    };
  }, [addConnectionMessage]);

  // 在TerminalComponent函数中适当位置添加handleTabClose函数定义
  const handleTabClose = (key: string) => {
    console.log(`【终端页面】关闭标签: ${key}`);
    handleTabEdit(key, 'remove');
  };

  // 修改添加连接ID监听和标签创建逻辑
  const processedConnectionsRef = useRef<Set<string>>(new Set());
  const createTabDebouncedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 如果没有标签被恢复，则需要处理URL参数
    if (connectionId && sessionId) {
      // 创建连接标识符
      const connectionKey = `${connectionId}-${sessionId}`;

      // 检查是否已处理过这个连接，避免重复处理导致无限循环
      if (processedConnectionsRef.current.has(connectionKey)) {
        return;
      }

      // 检查全局锁以防止与useTerminalConnection中的逻辑重复创建标签
      const lockKey = `global_tab_creation_lock_${connectionId}_${sessionId || 'nosession'}`;
      if ((window as any)[lockKey]) {
        return;
      }

      // 设置全局钩子阻止子组件创建相同标签
      (window as any).PARENT_CREATING_TAB = connectionKey;

      // 自动清除全局钩子，确保不会导致标签无法创建
      setTimeout(() => {
        if ((window as any).PARENT_CREATING_TAB === connectionKey) {
          delete (window as any).PARENT_CREATING_TAB;
        }
      }, 5000);

      // 标记此连接已被处理
      processedConnectionsRef.current.add(connectionKey);

      // 取消之前的延时创建标签任务
      if (createTabDebouncedRef.current) {
        clearTimeout(createTabDebouncedRef.current);
      }

      // 使用防抖延迟处理，确保短时间内不会创建多个标签
      createTabDebouncedRef.current = setTimeout(() => {
        try {
          // 先检查localStorage中是否有保存的活动标签
          const savedActiveTab = localStorage.getItem('terminal_active_tab');

          // 如果localStorage中有保存的有效活动标签，优先使用它
          if (savedActiveTab && tabs.some(tab => tab.key === savedActiveTab)) {
            // 直接设置活动标签，不需要等待
            setActiveTab(savedActiveTab);

            // 使用history API清理URL，而不是使用导航
            try {
              window.history.replaceState({}, '', '/terminal/');
            } catch (e) {
              // 备选方案：使用导航
              navigate('/terminal/', { replace: true });
            }

            return;
          }

          // 检查是否已存在匹配的标签页 - 合并来自context和状态的标签以确保查找最新的标签
          const contextTabs = (window as any).terminalStateRef?.current?.tabs || [];
          const allTabs = [...tabs, ...contextTabs];

          // 过滤重复标签并检查存在匹配的标签
          const uniqueTabs = new Map<string, TerminalTab>();

          // 对所有可能的标签进行去重
          allTabs.forEach(tab => {
            if (tab.connectionId && (tab.sessionId !== undefined)) {
              const key = `${tab.connectionId}-${tab.sessionId || 'nosession'}`;
              if (!uniqueTabs.has(key) ||
                parseInt(tab.key.split('-').pop() || '0') >
                parseInt(uniqueTabs.get(key)!.key.split('-').pop() || '0')) {
                uniqueTabs.set(key, tab);
              }
            }
          });

          // 查找匹配的标签
          const lookupKey = `${parseInt(connectionId)}-${parseInt(sessionId)}`;
          const existingTab = uniqueTabs.get(lookupKey) || allTabs.find(tab =>
            tab.connectionId === parseInt(connectionId) &&
            (tab.sessionId === parseInt(sessionId) ||
              (tab.sessionId === undefined && sessionId === 'undefined'))
          );

          if (existingTab) {
            // 如果标签已存在，只需激活它
            setActiveTab(existingTab.key);

            // 同时更新localStorage中的活动标签
            localStorage.setItem('terminal_active_tab', existingTab.key);

            // 分发标签激活事件
            window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
              detail: { tabKey: existingTab.key, isNewTab: false }
            }));

            // 清理URL，不需要额外的导航
            try {
              window.history.replaceState({}, '', '/terminal/');
            } catch (e) {
              console.error('清理URL参数失败:', e);
            }
          } else {
            // 获取连接信息并创建标签
            fetchConnectionAndCreateTab();
          }
        } finally {
          // 处理完成后移除全局钩子
          if ((window as any).PARENT_CREATING_TAB === connectionKey) {
            delete (window as any).PARENT_CREATING_TAB;
          }
        }
      }, 150); // 延长延迟，确保有足够时间进行检测
    }

    // 组件卸载时清理
    return () => {
      processedConnectionsRef.current.clear();
      if (createTabDebouncedRef.current) {
        clearTimeout(createTabDebouncedRef.current);
      }
    };
  }, [connectionId, sessionId]);

  // 获取连接信息并创建标签页
  const fetchConnectionAndCreateTab = async () => {
    if (!connectionId) return;

    // 清理URL参数，防止重复触发
    try {
      window.history.replaceState({}, '', '/terminal/');
    } catch (e) {
      console.error('清理URL参数失败:', e);
    }

    try {
      // 获取连接详情
      const connectionResult = await connectionAPI.getConnection(parseInt(connectionId));

      if (!connectionResult || !connectionResult.data) {
        console.error('获取连接信息失败');
        return;
      }

      const connection = connectionResult.data?.data;
      if (!connection) {
        console.error('连接数据为空');
        return;
      }

      // 创建新标签
      const parsedSessionId = sessionId ? parseInt(sessionId) : undefined;
      addTabWithConnection(connection, parseInt(connectionId), parsedSessionId);

    } catch (error) {
      console.error('获取连接信息或创建标签失败:', error);
    }
  };

  // 使用连接信息添加标签
  const addTabWithConnection = (connection: Connection, connectionId: number, sessionId?: number) => {
    const now = Date.now();
    // 统一标签key格式
    const tabKey = `tab-${connectionId}-${sessionId || 'nosession'}-${now}`;

    // 创建新标签
    const newTab: TerminalTab = {
      key: tabKey,
      title: connection.name || `${connection.host}:${connection.port}`,
      protocol: connection.protocol,
      status: 'connecting',
      connectionId,
      sessionId,
      connection,
      isConnected: false,
      // 创建所需的引用
      terminalRef: createRef<HTMLDivElement>(),
      xtermRef: createRef<XTerminal>(),
      webSocketRef: createRef<WebSocket>(),
      fitAddonRef: createRef<FitAddon>(),
      searchAddonRef: createRef<SearchAddon>(),
      messageQueueRef: createRef<string[]>(),
      // 添加额外的属性
      hostname: connection.host,
      port: connection.port,
      username: connection.username
    };

    // 添加标签
    addTab(newTab);

    // 保存会话信息到localStorage
    if (sessionId) {
      saveSessionInfo(connectionId, sessionId, tabKey, connection);
    }

    // 设置活动标签
    setActiveTab(newTab.key);

    // 清理URL参数，避免刷新页面时重复创建标签
    try {
      window.history.replaceState({}, '', '/terminal/');
    } catch (e) {
      console.error('清理URL参数失败:', e);
    }

    // 触发标签激活事件
    window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
      detail: {
        tabKey: tabKey,
        isNewTab: true
      }
    }));

    return tabKey;
  };

  // 如果正在加载，显示加载指示器
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column'
      }}>
        <Spin size="large" />
        <div style={{ marginTop: '20px' }}>正在加载终端组件...</div>
      </div>
    );
  }

  return (
    <div className={styles.terminalPage}>
      <TerminalConnector connectionParams={connectionParamsForConnector}>
        {(connProps) => {
          // 确保总是有tab数组
          const displayTabs = connProps.tabs || [];

          // 如果connProps.tabs为空但上下文有数据，使用上下文中的tabs
          const finalTabs = (displayTabs && displayTabs.length > 0)
            ? displayTabs
            : terminalState?.tabs || [];

          return (
            <TerminalTabPersistence
              tabs={finalTabs}
              activeTabKey={connProps.activeTabKey}
            >
              <TerminalSettingsApplier>
                <TerminalEventManager
                  tabs={finalTabs}
                  activeTabKey={connProps.activeTabKey}
                  setActiveTab={setActiveTab}
                  createWebSocketConnection={createWebSocketConnection}
                  initTerminal={initTerminal}
                >
                  {/* 终端标题 */}
                  <div className={`${styles.terminalHeader} ${connProps.fullscreen ? styles.fullscreenHeader : ''}`}>
                    <TerminalTabs
                      tabs={finalTabs}
                      activeKey={connProps.activeTabKey}
                      onTabChange={handleTabChange}
                      onTabEdit={(targetKey, action) => {
                        if (action === 'remove') {
                          handleTabClose(targetKey.toString());
                        }
                      }}
                      onTabClose={handleTabClose}
                    />
                    {/* 工具栏 */}
                    <div className={styles.terminalToolbar}>
                      <TerminalHeader
                        onCopyContent={handleCopyContent}
                        onDownloadLog={handleDownloadLog}
                        networkLatency={connProps.networkLatency}
                        terminalMode={connProps.terminalMode || 'normal'}
                        onToggleCode={() => { }}
                        onToggleSplit={() => { }}
                        onOpenSettings={() => setSettingsVisible(true)}
                        onToggleFullscreen={connProps.toggleFullscreen || (() => { })}
                        onCloseTab={() => handleTabClose(connProps.activeTabKey)}
                      />
                    </div>
                  </div>

                  {/* 终端内容区域 */}
                  {connProps.tabsCount > 0 ? (
                    <TerminalContainers
                      tabs={finalTabs}
                      activeTabKey={connProps.activeTabKey}
                    />
                  ) : connProps.hasConnection ? (
                    <TerminalGuide
                      onToggleSidebar={handleToggleSidebar}
                      sidebarCollapsed={!!connProps.sidebarCollapsed}
                    />
                  ) : (
                    <div className={styles.notConnectedContainer}>
                      <Empty
                        description="未连接到任何终端"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    </div>
                  )}

                  {/* 设置面板 */}
                  <TerminalSettings
                    visible={settingsVisible}
                    onCancel={() => setSettingsVisible(false)}
                    onApply={(settings) => {
                      const activeTab = getActiveTab();
                      if (
                        activeTab &&
                        activeTab.xtermRef?.current &&
                        activeTab.fitAddonRef?.current
                      ) {
                        applyTerminalSettings(
                          settings,
                          activeTab,
                          activeTab.xtermRef.current,
                          activeTab.fitAddonRef.current
                        );
                      }
                      setSettingsVisible(false);
                    }}
                  />

                  {/* 快速命令面板 */}
                  <QuickCommands
                    visible={quickCommandsVisible}
                    onClose={() => setQuickCommandsVisible(false)}
                    onSendCommand={(command: string) => {
                      const activeTab = getActiveTab();
                      if (
                        activeTab &&
                        activeTab.webSocketRef?.current &&
                        activeTab.webSocketRef.current.readyState === WebSocket.OPEN
                      ) {
                        activeTab.webSocketRef.current.send(command + '\r');
                      }
                      setQuickCommandsVisible(false);
                    }}
                  />

                  {/* 批量命令面板 */}
                  <BatchCommands
                    visible={batchCommandsVisible}
                    onClose={() => setBatchCommandsVisible(false)}
                    onSendCommands={(commands: string[]) => {
                      const activeTab = getActiveTab();
                      if (
                        activeTab &&
                        activeTab.webSocketRef?.current &&
                        activeTab.webSocketRef.current.readyState === WebSocket.OPEN
                      ) {
                        // 顺序执行命令
                        let delay = 0;
                        commands.forEach((cmd: string) => {
                          setTimeout(() => {
                            if (
                              activeTab.webSocketRef?.current &&
                              activeTab.webSocketRef.current.readyState === WebSocket.OPEN
                            ) {
                              activeTab.webSocketRef.current.send(cmd.trim() + '\r');
                            }
                          }, delay);
                          delay += 500; // 每条命令间隔500ms
                        });
                      }
                      setBatchCommandsVisible(false);
                    }}
                  />

                  {/* Loading状态遮罩 */}
                  {loading && (
                    <div className={styles.loadingContainer}>
                      <Spin size="large" tip="正在加载终端组件..." />
                    </div>
                  )}
                </TerminalEventManager>
              </TerminalSettingsApplier>
            </TerminalTabPersistence>
          )
        }}
      </TerminalConnector>
    </div>
  );
}

export default TerminalComponent;

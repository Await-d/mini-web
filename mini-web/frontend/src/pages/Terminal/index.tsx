import React, { useState, useEffect, lazy, Suspense, useRef, createRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
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

// 在文件顶部添加全局类型声明
declare global {
  interface Window {
    removeTerminalContextMenu?: () => void;
  }
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

// 添加类型声明，确保TypeScript能识别_closeTerminalMenu全局函数
declare global {
  interface Window {
    _terminalMenuVisible?: boolean;
    _closeTerminalMenu?: () => void;
    _terminalMenu?: HTMLElement | null;
  }
}

/**
 * 终端组件
 * 集成了SSH, Telnet, RDP, VNC等多种远程连接协议支持
 */
function TerminalComponent(): React.ReactNode {
  // 使用上下文获取标签页状态和操作
  const {
    state: terminalState,
    addTab,
    closeTab,
    setActiveTab,
    updateTab
  } = useTerminal();
  const tabs = terminalState?.tabs || [];

  // 获取路由参数
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();

  // 从URL搜索参数获取会话值
  const searchParams = useSearchParams();
  const sessionParam = searchParams[0]?.get('session');
  const quickReconnect = searchParams[0]?.get('reconnect') === 'true';

  // 加载状态
  const [loading, setLoading] = useState(true);

  // 设置面板显示状态
  const [settingsVisible, setSettingsVisible] = useState(false);

  // 侧边栏折叠状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 使用终端连接Hook
  const connectionProps = useTerminalConnection();

  // 每次加载组件时清除手动关闭标记，确保可以正常创建标签
  useEffect(() => {
    localStorage.removeItem('manually_closed_tabs');
  }, []);

  // 使用状态存储连接参数
  const { search } = useLocation();
  const queryParams = new URLSearchParams(search);

  // 添加一个标记表示是否应该处理URL参数
  const shouldProcessUrlParams = useRef(true);

  // 将连接信息转换为正确的类型
  const connectionParamsForConnector = connectionId ? {
    connectionId: parseInt(connectionId),
    sessionId: sessionParam ? parseInt(sessionParam) : undefined
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

  // 获取WebSocket管理hook
  const {
    createWebSocketConnection
  } = useWebSocketManager();

  // 获取终端初始化hook
  const {
    initTerminal
  } = useTerminalInitialization();

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
    if (!connectionId || !sessionParam) {
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
  }, [tabs, connectionId, navigate, setActiveTab]);

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
        localStorage.setItem('tabs_restored', 'true');

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
        if (tab && tab.key === terminalState.activeTabKey) {
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
  }, [tabs, terminalState.activeTabKey, updateTab]);

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
    if (connectionId && sessionParam) {
      // 创建连接标识符
      const connectionKey = `${connectionId}-${sessionParam}`;

      // 检查是否已处理过这个连接，避免重复处理导致无限循环
      if (processedConnectionsRef.current.has(connectionKey)) {
        return;
      }

      // 检查全局锁以防止与useTerminalConnection中的逻辑重复创建标签
      const lockKey = `global_tab_creation_lock_${connectionId}_${sessionParam || 'nosession'}`;
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
          const lookupKey = `${parseInt(connectionId)}-${parseInt(sessionParam)}`;
          const existingTab = uniqueTabs.get(lookupKey) || allTabs.find(tab =>
            tab.connectionId === parseInt(connectionId) &&
            (tab.sessionId === parseInt(sessionParam) ||
              (tab.sessionId === undefined && sessionParam === 'undefined'))
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
  }, [connectionId, sessionParam]);

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
      const parsedSessionId = sessionParam ? parseInt(sessionParam) : undefined;
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

  // 在TerminalComponent函数开始处添加CSS加载逻辑
  useEffect(() => {
    // 加载终端菜单增强CSS
    const linkId = 'terminal-menu-css';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = '/terminal-menu.css';
      document.head.appendChild(link);
      console.log('已加载终端菜单增强CSS');
    }

    // 修改全局右键事件处理函数，添加自定义事件触发
    const handleGlobalContextMenu = (e: MouseEvent) => {
      // 检查点击是否在终端区域内
      const terminalElements = document.querySelectorAll('.terminal');
      for (let i = 0; i < terminalElements.length; i++) {
        const terminal = terminalElements[i];
        if (terminal.contains(e.target as Node)) {
          console.log('全局拦截器: 检测到终端区域内的右键点击');
          e.preventDefault();
          e.stopPropagation();

          // 触发自定义事件，传递点击位置
          const customEvent = new CustomEvent('terminal-contextmenu', {
            detail: {
              x: e.clientX,
              y: e.clientY,
              timestamp: Date.now()
            }
          });

          // 分发事件到window和document对象
          window.dispatchEvent(customEvent);
          document.dispatchEvent(customEvent);

          // 额外的方法: 直接创建和显示菜单元素
          const createAndShowMenu = () => {
            // 检查是否已存在菜单
            let menu = document.querySelector('.terminal-context-menu') as HTMLElement;

            // 不存在则创建
            if (!menu) {
              menu = document.createElement('div');
              menu.className = 'terminal-context-menu';
              menu.innerHTML = `
                <ul class="ant-menu">
                  <li class="ant-menu-item">复制</li>
                  <li class="ant-menu-item">粘贴</li>
                  <li class="ant-menu-item">全选</li>
                  <li class="ant-menu-item">清空屏幕</li>
                  <li class="ant-menu-item">终端设置</li>
                </ul>
              `;
              document.body.appendChild(menu);

              // 添加点击事件关闭菜单
              menu.addEventListener('click', () => {
                menu.style.display = 'none';
              });

              // 点击外部关闭菜单
              document.addEventListener('click', (event) => {
                if (!menu.contains(event.target as Node)) {
                  menu.style.display = 'none';
                }
              }, { once: true });
            }

            // 设置样式并显示
            Object.assign(menu.style, {
              display: 'block',
              position: 'fixed',
              top: `${e.clientY}px`,
              left: `${e.clientX}px`,
              zIndex: '99999',
              backgroundColor: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              border: '1px solid #d9d9d9',
              borderRadius: '2px',
              padding: '4px 0',
              minWidth: '160px'
            });
          };

          // 200ms后尝试直接创建菜单元素（如果自定义事件没有被正确处理）
          setTimeout(createAndShowMenu, 200);

          return false;
        }
      }
    };

    // 使用捕获阶段注册全局右键拦截器
    document.addEventListener('contextmenu', handleGlobalContextMenu, true);

    return () => {
      // 清理函数
      document.removeEventListener('contextmenu', handleGlobalContextMenu, true);
    };
  }, []);

  // 改进右键菜单和覆盖层删除函数
  const removeMenuAndOverlay = () => {
    console.log('【右键菜单】执行移除菜单和覆盖层');

    // 查找所有可能的菜单元素
    const menuSelectors = [
      '#terminal-context-menu',
      '.terminal-context-menu',
      'div.ant-menu',
      'ul.ant-menu'
    ];

    // 针对每个选择器查找并删除元素
    menuSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        try {
          document.body.removeChild(element);
          console.log(`【右键菜单】成功移除菜单元素: ${selector}`);
        } catch (error) {
          // 可能不是document.body的直接子元素，尝试使用parentNode
          try {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
              console.log(`【右键菜单】通过父元素移除菜单: ${selector}`);
            }
          } catch (err) {
            console.warn(`【右键菜单】移除菜单失败: ${selector}`, err);
          }
        }
      });
    });

    // 移除覆盖层
    const overlaySelectors = [
      '#terminal-context-menu-overlay',
      'div[style*="position: fixed"][style*="width: 100%"][style*="height: 100%"][style*="background-color: transparent"]'
    ];

    overlaySelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        try {
          document.body.removeChild(element);
          console.log(`【右键菜单】成功移除覆盖层: ${selector}`);
        } catch (error) {
          // 可能不是document.body的直接子元素
          try {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
              console.log(`【右键菜单】通过父元素移除覆盖层: ${selector}`);
            }
          } catch (err) {
            console.warn(`【右键菜单】移除覆盖层失败: ${selector}`, err);
          }
        }
      });
    });
  };

  // 修改全局点击处理函数
  const handleGlobalClick = (e: MouseEvent) => {
    console.log('【右键菜单调试】检测到全局点击:', {
      target: e.target,
      button: e.button,
      x: e.clientX,
      y: e.clientY,
      className: (e.target as HTMLElement)?.className || 'no-class',
      tagName: (e.target as HTMLElement)?.tagName || 'unknown'
    });

    // 检查是否存在菜单元素
    const menu = document.querySelector('#terminal-context-menu') ||
      document.querySelector('.terminal-context-menu');

    if (!menu) {
      // 菜单不存在，无需处理
      return;
    }

    // 改进点击检测逻辑
    const clickTarget = e.target as HTMLElement;

    // 检查是否点击了菜单项或菜单内部元素
    const isMenuItem =
      clickTarget.classList?.contains('ant-menu-item') ||
      clickTarget.classList?.contains('terminal-menu-item') ||
      clickTarget.closest('.ant-menu-item') !== null ||
      clickTarget.closest('.terminal-menu-item') !== null;

    const isInsideMenu = menu.contains(clickTarget);

    console.log('【右键菜单调试】点击检查:', {
      isMenuItem,
      isInsideMenu,
      targetElement: clickTarget.outerHTML?.substring(0, 50)
    });

    // 如果点击了菜单项或菜单外部，应该关闭菜单
    if (isMenuItem || !isInsideMenu) {
      console.log('【右键菜单调试】需要关闭菜单 - ' +
        (isMenuItem ? '点击了菜单项' : '点击了菜单外部'));

      // 如果是菜单项，稍微延迟关闭，让菜单项点击事件先执行
      if (isMenuItem) {
        setTimeout(removeMenuAndOverlay, 10);
      } else {
        removeMenuAndOverlay();
      }
    }
  };

  // 在组件顶部添加一个全局键盘事件监听器
  useEffect(() => {
    console.log('【右键菜单调试】设置全局事件监听器');

    // ESC键关闭菜单处理函数
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      console.log('【右键菜单调试】检测到键盘事件:', e.key);

      // ESC键关闭菜单
      if (e.key === 'Escape') {
        console.log('【右键菜单调试】检测到ESC键，尝试关闭菜单');
        removeMenuAndOverlay();
      }
    };

    // 右键菜单事件处理
    const handleGlobalContextMenu = (e: MouseEvent) => {
      console.log('【右键菜单调试】检测到全局右键点击:', {
        target: e.target,
        classes: (e.target as HTMLElement)?.className || 'no-class'
      });

      // 检查是否在终端区域内
      const isInTerminal = (e.target as HTMLElement)?.closest?.('.terminal');

      if (isInTerminal) {
        console.log('【右键菜单调试】右键点击位于终端区域内');
      }
    };

    // 初始检查是否有残留的菜单元素
    const checkForExistingMenu = () => {
      const menu = document.querySelector('#terminal-context-menu') ||
        document.querySelector('.terminal-context-menu');
      const overlay = document.getElementById('terminal-context-menu-overlay');

      if (menu) {
        console.log('【右键菜单调试】发现残留的菜单元素:', menu);
      }

      if (overlay) {
        console.log('【右键菜单调试】发现残留的覆盖层:', overlay);
      }
    };

    // 注册所有事件监听器
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    window.addEventListener('click', handleGlobalClick, true);
    window.addEventListener('contextmenu', handleGlobalContextMenu, true);

    // 立即检查一次
    checkForExistingMenu();

    // 定期检查是否有菜单元素
    const checkInterval = setInterval(checkForExistingMenu, 3000);

    // 返回清理函数
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('contextmenu', handleGlobalContextMenu, true);
      clearInterval(checkInterval);
      console.log('【右键菜单调试】已清理全局事件监听器');
    };
  }, []);

  // 在Terminal组件内部添加ESC键监听
  useEffect(() => {
    // 添加ESC键监听，用于关闭菜单和取消操作
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.log('【终端页面】检测到ESC键，尝试关闭菜单');

        // 尝试调用全局菜单关闭函数
        if (typeof window.removeTerminalContextMenu === 'function') {
          window.removeTerminalContextMenu();
          console.log('【终端页面】已调用全局菜单关闭函数');
        }

        // 尝试删除DOM中的菜单元素
        const menu = document.getElementById('terminal-context-menu');
        const overlay = document.getElementById('terminal-context-menu-overlay');

        if (menu || overlay) {
          console.log('【终端页面】发现菜单元素，尝试删除');

          if (menu && document.body.contains(menu)) {
            document.body.removeChild(menu);
          }

          if (overlay && document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }

          console.log('【终端页面】菜单元素已删除');
        }
      }
    };

    // 添加全局键盘事件监听
    document.addEventListener('keydown', handleEscKey, true);

    // 清理函数
    return () => {
      document.removeEventListener('keydown', handleEscKey, true);
    };
  }, []);

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
                  ) : (
                    <TerminalGuide
                      onToggleSidebar={handleToggleSidebar}
                      sidebarCollapsed={!!connProps.sidebarCollapsed}
                    />
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
                    visible={quickReconnect}
                    onClose={() => {
                      // 关闭快速重连
                      localStorage.removeItem('reconnect');
                      localStorage.removeItem('session');
                      navigate('/terminal/');
                    }}
                    onSendCommand={(command: string) => {
                      const activeTab = getActiveTab();
                      if (
                        activeTab &&
                        activeTab.webSocketRef?.current &&
                        activeTab.webSocketRef.current.readyState === WebSocket.OPEN
                      ) {
                        activeTab.webSocketRef.current.send(command + '\r');
                      }
                      localStorage.setItem('reconnect', 'true');
                      localStorage.setItem('session', sessionParam || '');
                      navigate('/terminal/');
                    }}
                  />

                  {/* 批量命令面板 */}
                  <BatchCommands
                    visible={false}
                    onClose={() => { }}
                    onSendCommands={(commands: string[]) => { }}
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

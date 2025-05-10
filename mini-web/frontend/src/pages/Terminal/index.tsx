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
    handleAddNewTab,
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

    // 将活动标签保存到localStorage，确保页面刷新后被恢复
    localStorage.setItem('terminal_active_tab', key);

    // 用户手动切换了标签，禁止后续URL参数的处理
    shouldProcessUrlParams.current = false;

    // 在切换标签时，总是清理URL参数
    const currentUrl = window.location.href;
    if (currentUrl.includes('?') || (currentUrl.includes('/terminal/') && !currentUrl.endsWith('/terminal/'))) {
      // 使用history API直接更新URL而不触发导航
      try {
        window.history.replaceState({}, '', '/terminal/');
      } catch (e) {
        // 备选方案：使用导航
        setTimeout(() => {
          navigate('/terminal/');
        }, 0);
      }
    }
  };

  // 处理activeTabKey的变化，确保保存到localStorage
  const previousActiveTabRef = useRef<string | null>(null);
  useEffect(() => {
    // 只有当activeTabKey与之前的值不同时才更新localStorage
    if (activeTabKey &&
      activeTabKey !== 'no-tabs' &&
      previousActiveTabRef.current !== activeTabKey) {

      // 更新引用以跟踪当前值
      previousActiveTabRef.current = activeTabKey;

      // 将活动标签保存到localStorage
      localStorage.setItem('terminal_active_tab', activeTabKey);
    }
  }, [activeTabKey]);

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
    // 如果URL中有connectionId和sessionId参数，且我们需要处理它们，则不从localStorage恢复标签
    if (connectionId && sessionId && shouldProcessUrlParams.current) {
      return;
    }

    try {
      const savedTabs = localStorage.getItem('terminal_tabs');
      const savedActiveTab = localStorage.getItem('terminal_active_tab');
      const allTabsClosed = localStorage.getItem('all_tabs_closed');

      // 如果标记了所有标签已关闭，或者没有保存的标签数据，则不恢复
      if (allTabsClosed === 'true' || !savedTabs) {
        console.log('【恢复检查】检测到all_tabs_closed标记或无保存标签，不执行恢复');
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
                console.log(`【持久化】成功获取连接信息:`, {
                  id: connection.id,
                  name: connection.name,
                  protocol: connection.protocol
                });
              }
            } catch (error) {
              console.error(`【持久化】获取连接${tabData.connectionId}的信息失败:`, error);
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
          console.error(`【持久化】处理标签${tabData.key}失败:`, error);
          return null;
        }
      });

      // 等待所有标签处理完成
      Promise.all(processTabPromises).then((restoredTabs) => {
        // 过滤掉处理失败的标签
        const validTabs = restoredTabs.filter(Boolean) as TerminalTab[];

        if (validTabs.length === 0) {
          console.log('【恢复检查】没有有效的恢复标签，恢复失败');
          return;
        }

        // 成功从localStorage恢复标签

        // 添加所有恢复的标签
        validTabs.forEach(tab => {
          addTab(tab);
        });

        // 设置活动标签
        const activeTabToSet = savedActiveTab || validTabs[0].key;

        // 设置活动标签
        setActiveTab(activeTabToSet);

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
      console.error('【恢复检查】从localStorage恢复标签失败:', error);
    }
  }, []);

  // 添加新的useEffect来处理标签关闭
  useEffect(() => {
    // 监听标签关闭事件
    // 使用Set防止重复处理同一个tabKey
    const processedTabKeys = new Set<string>();

    const handleTabClose = (event: CustomEvent) => {
      const { tabKey, tabData } = event.detail;

      if (!tabKey) return;

      // 防止重复处理同一个tabKey
      if (processedTabKeys.has(tabKey)) {
        console.log(`【关闭处理】忽略重复的标签关闭事件: ${tabKey}`);
        return;
      }

      // 标记此tabKey已被处理
      processedTabKeys.add(tabKey);

      console.log(`【关闭处理】接收到标签关闭事件: ${tabKey}`);

      // 获取已关闭标签列表
      const closedTabsStr = localStorage.getItem('terminal_closed_tabs') || '[]';
      let closedTabs = [];

      try {
        closedTabs = JSON.parse(closedTabsStr);
      } catch (e) {
        console.error('【关闭处理】解析关闭标签数据失败:', e);
        closedTabs = [];
      }

      // 将新关闭的标签添加到列表中
      closedTabs.push(tabData || { key: tabKey });

      // 保存更新后的关闭标签列表
      localStorage.setItem('terminal_closed_tabs', JSON.stringify(closedTabs));
      console.log(`【关闭处理】已将标签 ${tabKey} 添加到关闭列表`);

      // 检查剩余标签数量
      if (tabs.length <= 1) {  // 如果当前关闭的是最后一个标签
        console.log('【关闭处理】检测到用户关闭了最后一个标签，清理标签持久化状态并设置all_tabs_closed标记');
        // 设置all_tabs_closed标记，防止自动恢复已手动关闭的标签
        localStorage.setItem('all_tabs_closed', 'true');
        // 清除标签相关数据，因为用户已手动关闭
        localStorage.removeItem('terminal_tabs');
        localStorage.removeItem('terminal_active_tab');
        // 清除会话信息，确保不会自动恢复
        localStorage.removeItem('session_info');
        localStorage.removeItem('terminal_last_session');
        localStorage.removeItem('current_terminal_session');
      } else {
        // 如果还有其他标签，确保移除"all_tabs_closed"标记
        localStorage.removeItem('all_tabs_closed');
      }
    };

    // 注册事件监听器
    window.addEventListener('terminal-tab-closed' as any, handleTabClose);

    // 清理函数
    return () => {
      window.removeEventListener('terminal-tab-closed' as any, handleTabClose);
    };
  }, [tabs]);

  // 在组件卸载前保存标签状态
  useEffect(() => {
    return () => {
      try {
        // 如果没有标签，不要清除localStorage中的标签数据
        // 这样可以保留之前的标签状态，方便用户重新访问时恢复
        if (tabs.length === 0) {
          return;
        }

        // 首先检查是否设置了all_tabs_closed标记，如果设置了则不进行保存
        // 这表示用户已经手动关闭了所有标签，我们应该尊重这个设置
        const allTabsClosed = localStorage.getItem('all_tabs_closed');
        if (allTabsClosed === 'true') {
          console.log('【持久化】检测到all_tabs_closed标记已设置，不保存标签状态');
          return;
        }

        // 保存标签状态前先去重
        const uniqueTabsMap = new Map<string, TerminalTab>();

        tabs.forEach((tab: TerminalTab) => {
          // 保存所有标签，无论是否已连接
          const groupKey = `conn-${tab.connectionId}-session-${tab.sessionId}`;

          // 如果Map中已有相同组的标签，检查哪个更新
          if (uniqueTabsMap.has(groupKey)) {
            const existingTab = uniqueTabsMap.get(groupKey)!;
            // 使用key中的时间戳判断哪个更新
            const existingTimestamp = parseInt(existingTab.key.split('-').pop() || '0', 10);
            const newTimestamp = parseInt(tab.key.split('-').pop() || '0', 10);

            if (newTimestamp > existingTimestamp) {
              uniqueTabsMap.set(groupKey, tab);
            }
          } else {
            uniqueTabsMap.set(groupKey, tab);
          }
        });

        // 将Map转换回数组
        const uniqueTabs = Array.from(uniqueTabsMap.values());

        // 即使没有有效标签，也不清除localStorage
        // 因为用户可能想在下次访问时恢复标签
        if (uniqueTabs.length === 0) {
          console.log('【持久化】无有效标签，但保留现有标签数据以便于下次恢复');
          return;
        }

        // 创建可序列化的标签数组（移除引用，但保留更多信息）
        const serializableTabs = uniqueTabs.map(tab => ({
          key: tab.key,
          title: tab.title,
          connectionId: tab.connectionId,
          sessionId: tab.sessionId,
          isConnected: tab.isConnected, // 保存连接状态
          connection: tab.connection,    // 保存完整的连接对象
          timestamp: parseInt(tab.key.split('-').pop() || '0', 10) // 提取时间戳用于排序
        }));

        localStorage.setItem('terminal_tabs', JSON.stringify(serializableTabs));

        // 首先尝试使用当前选中的标签作为活动标签
        if (activeTabKey !== 'no-tabs' && uniqueTabs.some(tab => tab.key === activeTabKey)) {
          localStorage.setItem('terminal_active_tab', activeTabKey);
          console.log(`【持久化】保存当前选中的标签为活动标签: ${activeTabKey}`);
        } else {
          // 如果当前选中的标签无效，找出时间戳最新的标签（最近创建的）
          const sortedTabs = [...serializableTabs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          if (sortedTabs.length > 0) {
            localStorage.setItem('terminal_active_tab', sortedTabs[0].key);
            console.log(`【持久化】选择时间戳最新的标签为活动标签: ${sortedTabs[0].key}, 时间戳: ${sortedTabs[0].timestamp}`);
          }
        }

        console.log(`【持久化】已保存${serializableTabs.length}个标签到localStorage`);
      } catch (error) {
        console.error('保存标签状态时出错:', error);
      }
    };
  }, [tabs, activeTabKey]);
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

  /**
   * 应用终端设置
   */
  const handleApplySettings = (settings: TermSettings, activeTab: any, terminalInstance: any, fitAddon: any) => {
    if (terminalInstance) {
      try {
        // 应用外观设置 - 兼容不同版本的xterm.js API
        if (typeof terminalInstance.setOption === 'function') {
          // 使用setOption API (旧版方法)
          const currentTheme = terminalInstance.getOption?.('theme') || {};
          terminalInstance.setOption('theme', {
            ...currentTheme,
            background: settings.background,
            foreground: settings.foreground,
          });
          terminalInstance.setOption('fontSize', settings.fontSize);
          terminalInstance.setOption('fontFamily', settings.fontFamily);
          terminalInstance.setOption('cursorBlink', settings.cursorBlink);

          // 应用滚动行数设置
          if (settings.scrollback) {
            terminalInstance.setOption('scrollback', settings.scrollback);
          }
        }
        // 直接设置options对象 (新版方法)
        else if (terminalInstance.options) {
          terminalInstance.options.theme = {
            ...(terminalInstance.options.theme || {}),
            background: settings.background,
            foreground: settings.foreground,
          };
          terminalInstance.options.fontSize = settings.fontSize;
          terminalInstance.options.fontFamily = settings.fontFamily;
          terminalInstance.options.cursorBlink = settings.cursorBlink;

          // 应用滚动行数设置
          if (settings.scrollback) {
            terminalInstance.options.scrollback = settings.scrollback;
          }
        }

        console.log('成功应用终端设置:', {
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          background: settings.background,
          foreground: settings.foreground
        });
      } catch (e) {
        console.error('应用终端设置发生错误:', e);
      }

      // 调整终端大小
      if (fitAddon) {
        try {
          fitAddon.fit();
        } catch (e) {
          console.error('调整终端大小失败:', e);
        }
      }
    }
  };

  // 标签编辑处理
  const handleTabEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: "add" | "remove"
  ) => {
    if (action === "add") {
      handleAddNewTab();
    } else if (action === "remove" && typeof targetKey === "string") {
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

  // 处理标签激活事件
  useEffect(() => {
    const handleTabActivated = (event: CustomEvent) => {
      const { tabKey, isNewTab } = event.detail;

      // 激活标签
      if (tabKey && tabKey !== 'no-tabs') {
        setActiveTab(tabKey);

        // 查找标签对象
        const tab = tabs.find(t => t.key === tabKey);
        if (!tab) {
          console.error(`无法找到标签: ${tabKey}`);
          return;
        }

        // 延迟执行，确保DOM已经更新
        setTimeout(() => {
          // 尝试获取DOM元素
          const terminalElement = document.getElementById(`terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`);

          // 如果DOM元素存在但terminalRef.current不存在，则设置引用
          if (terminalElement && tab.terminalRef && !tab.terminalRef.current) {
            tab.terminalRef.current = terminalElement as HTMLDivElement;

            // 触发terminal-ready事件，以便初始化终端
            window.dispatchEvent(new CustomEvent('terminal-ready', {
              detail: { tabKey }
            }));
          }

          // 如果已经初始化过终端，则调整大小
          if (tab.xtermRef?.current && tab.fitAddonRef?.current) {
            try {
              tab.fitAddonRef.current.fit();
            } catch (e) {
              console.error(`调整终端大小失败: ${tabKey}`, e);
            }
          }

          // 检查WebSocket连接状态
          if (!tab.webSocketRef?.current && tab.connectionId && tab.sessionId) {
            // 创建WebSocket连接
            if (typeof createWebSocketConnection === 'function') {
              createWebSocketConnection(tab.connectionId, tab.sessionId, tabKey);
            }
          }
        }, 200);
      }
    };

    window.addEventListener('terminal-tab-activated' as any, handleTabActivated);

    return () => {
      window.removeEventListener('terminal-tab-activated' as any, handleTabActivated);
    };
  }, [tabs, setActiveTab, createWebSocketConnection]);

  // 添加terminal-ready事件处理
  useEffect(() => {
    const handleTerminalReady = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail?.tabKey) {
        console.error('缺少tabKey');
        return;
      }

      const tabKey = customEvent.detail.tabKey;

      // 查找标签对象
      const tab = tabs.find(t => t.key === tabKey);
      if (!tab) {
        console.error(`找不到标签: ${tabKey}`);
        return;
      }

      // 检查是否已经初始化过终端
      if (tab.xtermRef?.current) {
        if (tab.fitAddonRef?.current) {
          try {
            tab.fitAddonRef.current.fit();
          } catch (e) {
            console.error('调整终端大小失败:', e);
          }
        }
        return;
      }

      // 确保DOM元素已经挂载
      if (!tab.terminalRef?.current) {
        const terminalElement = document.getElementById(`terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`);

        if (terminalElement) {
          tab.terminalRef.current = terminalElement as HTMLDivElement;
        } else {
          console.error(`找不到终端DOM元素: ${tabKey}`);

          // 尝试延迟再次触发ready事件
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('terminal-ready', {
              detail: { tabKey }
            }));
          }, 500);

          return;
        }
      }

      // 初始化终端
      try {
        // 创建数据处理函数
        const handleTerminalData = (data: string) => {
          if (tab.webSocketRef?.current) {
            try {
              tab.webSocketRef.current.send(data);
            } catch (e) {
              console.error('发送数据到服务器失败:', e);
            }
          } else {
            console.error('WebSocket未连接，无法发送数据');
            // 缓存消息，待连接恢复后发送
            if (tab.messageQueueRef?.current) {
              tab.messageQueueRef.current.push(data);
            }
          }
        };

        const success = initTerminal(tab, handleTerminalData);

        // 初始化成功后，确保WebSocket已连接
        if (success && !tab.webSocketRef?.current && tab.connectionId && tab.sessionId) {
          // 使用确定的类型
          const connectionId = tab.connectionId as number;
          const sessionId = tab.sessionId as number;
          createWebSocketConnection(connectionId, sessionId, tabKey);
        }
      } catch (e) {
        console.error(`初始化终端异常: ${tabKey}`, e);
      }
    };

    window.addEventListener('terminal-ready', handleTerminalReady);

    return () => {
      window.removeEventListener('terminal-ready', handleTerminalReady);
    };
  }, [tabs, initTerminal, createWebSocketConnection]);

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
        console.log(`【Terminal页面】已处理过的连接，跳过: ${connectionKey}`);
        return;
      }

      // 检查全局锁以防止与useTerminalConnection中的逻辑重复创建标签
      const lockKey = `global_tab_creation_lock_${connectionId}_${sessionId || 'nosession'}`;
      if ((window as any)[lockKey]) {
        console.log(`【Terminal页面】检测到全局锁，其他组件正在创建标签，跳过: ${lockKey}`);
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
          console.log(`【Terminal页面】处理连接参数: ${connectionId}, 会话: ${sessionId}`);

          // 先检查localStorage中是否有保存的活动标签
          const savedActiveTab = localStorage.getItem('terminal_active_tab');

          // 如果localStorage中有保存的有效活动标签，优先使用它
          if (savedActiveTab && tabs.some(tab => tab.key === savedActiveTab)) {
            console.log(`【Terminal页面】找到已保存的活动标签: ${savedActiveTab}，激活此标签`);

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
            console.log(`【Terminal页面】找到匹配的标签: ${existingTab.key}，激活此标签`);

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
            console.log(`【Terminal页面】未找到匹配标签，创建新标签`);

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

    // 添加标签并保存会话信息
    addTab(newTab);

    // 保存会话信息到localStorage
    if (sessionId) {
      saveSessionInfo(connectionId, sessionId, tabKey, connection);
    }

    // 设置活动标签 - 直接设置，避免在Effect中设置导致无限递归
    setActiveTab(newTab.key);
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
            <>
              {/* 终端标题 */}
              <div className={`${styles.terminalHeader} ${connProps.fullscreen ? styles.fullscreenHeader : ''}`}>
                <TerminalTabs
                  tabs={finalTabs}
                  activeKey={connProps.activeTabKey}
                  onTabChange={handleTabChange}
                  onTabEdit={(targetKey, action) => {
                    if (action === 'remove') {
                      handleTabClose(targetKey.toString());
                    } else if (action === 'add') {
                      handleAddNewTab();
                    }
                  }}
                  onTabClose={handleTabClose}
                  onAddTab={handleAddNewTab}
                />
                {/* 工具栏 */}
                <div className={styles.terminalToolbar}>
                  <TerminalHeader
                    addNewTab={handleAddNewTab}
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
                <div className={styles.terminalContainer}>
                  {/* 为每个标签创建终端容器 */}
                  {finalTabs.map((tab) => {
                    // 为每个标签定义唯一的初始化标记变量名
                    const initializedKey = `terminal_initialized_${tab.key}`;

                    // 为每个标签创建的DOM创建一个唯一的初始化ID
                    const uniqueDomId = `terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`;
                    const uniqueInitKey = `initialized-${uniqueDomId}`;

                    return (
                      <div
                        key={tab.key}
                        id={uniqueDomId}
                        ref={el => {
                          // 只在元素存在且引用未设置时设置引用
                          if (el && tab.terminalRef && !tab.terminalRef.current) {
                            // 设置DOM引用
                            tab.terminalRef.current = el;

                            // 检查全局初始化标记 - 使用DOM ID作为唯一标识符，而不是标签的key
                            if (connProps.activeTabKey === tab.key && !tab.xtermRef?.current && !(window as any)[uniqueInitKey]) {
                              // 触发终端就绪事件

                              // 设置初始化标记，防止重复触发
                              (window as any)[uniqueInitKey] = true;

                              // 防止重复触发同一个DOM元素的初始化
                              const eventName = `terminal-ready-${uniqueDomId}`;
                              if (!(window as any)[eventName]) {
                                (window as any)[eventName] = true;

                                // 延迟触发，确保DOM完全渲染
                                // 只触发一次事件
                                console.log(`【终端初始化】触发一次性初始化事件: ${tab.key} (DOM: ${uniqueDomId})`);
                                setTimeout(() => {
                                  // 创建一个DOM元素唯一初始化ID，确保即使标签key不同但DOM元素相同时不会重复初始化
                                  const domInitializationId = `dom-initialized-${uniqueDomId}`;

                                  // 检查DOM元素是否已初始化
                                  if ((window as any)[domInitializationId]) {
                                    console.log(`【终端初始化】DOM元素已初始化，跳过: ${uniqueDomId}`);
                                    return;
                                  }

                                  // 再次检查该标签是否仍然是活动标签
                                  if (connProps.activeTabKey === tab.key) {
                                    console.log(`【终端初始化】触发终端初始化事件: ${tab.key}, DOM: ${uniqueDomId}`);

                                    // 标记DOM元素为已初始化
                                    (window as any)[domInitializationId] = true;

                                    // 分派初始化事件
                                    window.dispatchEvent(new CustomEvent('terminal-ready', {
                                      detail: {
                                        tabKey: tab.key,
                                        domId: uniqueDomId,
                                        connectionId: tab.connectionId,
                                        sessionId: tab.sessionId
                                      }
                                    }));
                                  } else {
                                    console.log(`【终端初始化】标签不再活动，跳过初始化: ${tab.key}`);
                                  }

                                  // 5秒后清除事件标记，以便于必要时重新初始化
                                  setTimeout(() => {
                                    (window as any)[eventName] = false;

                                    // 同时检查DOM元素是否仍然存在，如果不存在则清除初始化标记
                                    if (!document.getElementById(uniqueDomId)) {
                                      delete (window as any)[domInitializationId];
                                    }
                                  }, 5000);
                                }, 200);
                              }
                            }
                          }
                        }}
                        className={`${styles.terminalContainerInner} ${connProps.activeTabKey === tab.key ? styles.activeTerminal : styles.inactiveTerminal}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          zIndex: connProps.activeTabKey === tab.key ? 10 : 1, // 确保活动标签在最上层
                          opacity: connProps.activeTabKey === tab.key ? 1 : 0, // 非活动标签完全透明
                          visibility: connProps.activeTabKey === tab.key ? 'visible' : 'hidden',
                          display: connProps.activeTabKey === tab.key ? 'block' : 'none' // 同时控制display属性
                        }}
                      ></div>
                    );
                  })}
                </div>
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
                  <Button type="primary" onClick={handleAddNewTab}>
                    创建新连接
                  </Button>
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
                    handleApplySettings(
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
            </>
          )
        }}
      </TerminalConnector>
    </div>
  );
}

export default TerminalComponent;

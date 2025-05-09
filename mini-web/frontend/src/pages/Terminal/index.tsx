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

  // 使用状态存储连接参数
  const { search } = useLocation();
  const queryParams = new URLSearchParams(search);
  const sessionId = queryParams.get('session');

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
    handleTabChange,
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

  // 在组件初始化时，尝试从localStorage恢复标签状态
  useEffect(() => {
    try {
      const savedTabs = localStorage.getItem('terminal_tabs');
      const savedActiveTab = localStorage.getItem('terminal_active_tab');
      const lastCreatedTab = localStorage.getItem('terminal_last_created_tab');
      // 检查是否存在强制选择的标签
      const forceSelectTab = localStorage.getItem('force_select_tab');

      console.log('【恢复检查】当前localStorage中的标签数据:', savedTabs ? JSON.parse(savedTabs) : '无', {
        savedActiveTab,
        lastCreatedTab,
        forceSelectTab
      });

      // 检查是否有标签关闭的标记
      const closedTabsStr = localStorage.getItem('terminal_closed_tabs') || '[]';
      let closedTabs = [];
      try {
        closedTabs = JSON.parse(closedTabsStr);
      } catch (e) {
        console.error('【恢复检查】解析关闭标签数据失败:', e);
        closedTabs = [];
      }

      // 检查是否存在强制清除所有标签的标记
      const allTabsClosed = localStorage.getItem('all_tabs_closed') === 'true';
      if (allTabsClosed) {
        console.log('【恢复检查】检测到所有标签已关闭标记，不恢复任何标签');
        localStorage.removeItem('all_tabs_closed');
        localStorage.removeItem('force_select_tab');
        return;
      }

      if (savedTabs && tabs.length === 0) {
        let parsedTabs = JSON.parse(savedTabs);
        console.log('【持久化】从localStorage恢复标签状态:', parsedTabs);

        if (Array.isArray(parsedTabs) && parsedTabs.length > 0) {
          // 过滤掉已关闭的标签
          if (closedTabs.length > 0) {
            const originalCount = parsedTabs.length;
            parsedTabs = parsedTabs.filter(tabData => {
              // 检查标签是否在关闭列表中
              const isTabClosed = closedTabs.some((closedTab: any) =>
                closedTab.key === tabData.key ||
                (closedTab.connectionId === tabData.connectionId &&
                  closedTab.sessionId === tabData.sessionId)
              );

              return !isTabClosed;
            });

            console.log(`【恢复检查】已过滤${originalCount - parsedTabs.length}个关闭的标签`);
          }

          // 如果过滤后没有标签，不进行恢复
          if (parsedTabs.length === 0) {
            console.log('【恢复检查】过滤后没有有效标签，不进行恢复');
            // 移除标签数据，防止再次尝试恢复
            localStorage.removeItem('terminal_tabs');
            localStorage.removeItem('terminal_active_tab');
            localStorage.removeItem('force_select_tab');
            return;
          }

          // 创建带有必要引用的完整标签对象
          // 使用Map进行去重，保留最新的标签
          const uniqueTabsMap = new Map<string, any>();

          // 按连接ID+会话ID进行分组，仅保留每组中最新的标签
          parsedTabs.forEach((tabData: {
            key: string;
            connectionId?: number;
            sessionId?: number;
          }) => {
            const groupKey = `conn-${tabData.connectionId}-session-${tabData.sessionId}`;

            // 如果Map中已有相同组的标签，检查哪个更新
            if (uniqueTabsMap.has(groupKey)) {
              const existingTab = uniqueTabsMap.get(groupKey);
              // 使用key中的时间戳判断哪个更新
              const existingTimestamp = parseInt(existingTab.key.split('-').pop() || '0', 10);
              const newTimestamp = parseInt(tabData.key.split('-').pop() || '0', 10);

              if (newTimestamp > existingTimestamp) {
                uniqueTabsMap.set(groupKey, tabData);
                console.log(`【持久化】替换旧标签为更新的版本: ${groupKey}`);
              }
            } else {
              uniqueTabsMap.set(groupKey, tabData);
            }
          });

          // 将Map转换回数组
          parsedTabs = Array.from(uniqueTabsMap.values());
          console.log(`【持久化】去重后剩余标签数: ${parsedTabs.length}`);

          // 如果没有有效标签，直接返回
          if (parsedTabs.length === 0) {
            console.log('【恢复检查】过滤后没有有效标签，不进行恢复');
            return;
          }

          parsedTabs.forEach((tabData: {
            key: string;
            title: string;
            connectionId?: number;
            sessionId?: number;
          }) => {
            // 创建所有必要的引用
            const terminalRef = createRef<HTMLDivElement>();
            const xtermRef = createRef<XTerminal>();
            const webSocketRef = createRef<WebSocket>();
            const fitAddonRef = createRef<FitAddon>();
            const searchAddonRef = createRef<SearchAddon>();
            const messageQueueRef = createRef<string[]>();

            // 初始化消息队列
            messageQueueRef.current = [];

            // 创建标签
            const tab: TerminalTab = {
              ...tabData,
              terminalRef,
              xtermRef,
              webSocketRef,
              fitAddonRef,
              searchAddonRef,
              messageQueueRef,
              isConnected: false, // 恢复时重置连接状态
            };

            // 将标签添加到上下文
            addTab(tab);
          });

          // 确定要激活的标签
          let tabKeyToActivate: string | null = null;

          // 优先级：
          // 1. 首先检查是否有强制选择的标签
          if (forceSelectTab && parsedTabs.some((tab: { key: string }) => tab.key === forceSelectTab)) {
            tabKeyToActivate = forceSelectTab;
            console.log(`【持久化】使用强制选择的标签: ${forceSelectTab}`);
            // 使用后清除强制选择标记
            localStorage.removeItem('force_select_tab');
          }
          // 2. 其次尝试使用保存的活动标签
          else if (savedActiveTab && parsedTabs.some((tab: { key: string }) => tab.key === savedActiveTab)) {
            tabKeyToActivate = savedActiveTab;
            console.log(`【持久化】使用保存的活动标签: ${savedActiveTab}`);
          }
          // 3. 再次尝试使用最后创建的标签
          else if (lastCreatedTab && parsedTabs.some((tab: { key: string }) => tab.key === lastCreatedTab)) {
            tabKeyToActivate = lastCreatedTab;
            console.log(`【持久化】使用最后创建的标签作为活动标签: ${lastCreatedTab}`);
          }
          // 4. 最后，按时间戳排序选择最新的标签
          else if (parsedTabs.length > 0) {
            // 以时间戳排序
            const sortedTabs = [...parsedTabs].sort((a, b) => {
              const aTimestamp = parseInt(a.key.split('-').pop() || '0', 10);
              const bTimestamp = parseInt(b.key.split('-').pop() || '0', 10);
              return bTimestamp - aTimestamp; // 降序排列
            });
            tabKeyToActivate = sortedTabs[0].key;
            console.log(`【持久化】使用时间戳最新的标签: ${tabKeyToActivate}`);
          }

          // 设置活动标签
          if (tabKeyToActivate) {
            setActiveTab(tabKeyToActivate);

            // 分发激活事件
            window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
              detail: { tabKey: tabKeyToActivate, isNewTab: false }
            }));
            console.log(`【持久化】分发标签激活事件: ${tabKeyToActivate}`);
          }

          console.log('【持久化】标签状态已恢复');
        }
      }
    } catch (error) {
      console.error('恢复标签状态时出错:', error);
      // 如果恢复失败，清除localStorage中的数据
      localStorage.removeItem('terminal_tabs');
      localStorage.removeItem('terminal_active_tab');
      localStorage.removeItem('terminal_closed_tabs');
      localStorage.removeItem('terminal_last_created_tab');
    }
  }, []);

  // 添加新的useEffect来处理标签关闭
  useEffect(() => {
    // 监听标签关闭事件
    const handleTabClose = (event: CustomEvent) => {
      const { tabKey, tabData } = event.detail;

      if (tabKey) {
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

        // 如果关闭后没有标签了，设置一个标记表示所有标签都已关闭
        // 这将阻止在刷新页面时自动恢复标签
        if (tabs.length <= 1) {  // 如果当前关闭的是最后一个标签
          console.log('【关闭处理】关闭了最后一个标签，设置全部关闭标记');
          localStorage.setItem('all_tabs_closed', 'true');
          // 清除其他标签相关数据
          localStorage.removeItem('terminal_tabs');
          localStorage.removeItem('terminal_active_tab');
          localStorage.removeItem('terminal_last_created_tab');
        }
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
        // 如果没有标签，直接清除localStorage中的标签数据
        if (tabs.length === 0) {
          localStorage.removeItem('terminal_tabs');
          localStorage.removeItem('terminal_active_tab');
          console.log('【持久化】无标签，已清除localStorage中的标签数据');
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

        // 如果没有有效标签，清除localStorage
        if (uniqueTabs.length === 0) {
          localStorage.removeItem('terminal_tabs');
          localStorage.removeItem('terminal_active_tab');
          console.log('【持久化】无有效标签，已清除localStorage中的标签数据');
          return;
        }

        // 创建可序列化的标签数组（移除引用）
        const serializableTabs = uniqueTabs.map(tab => ({
          key: tab.key,
          title: tab.title,
          connectionId: tab.connectionId,
          sessionId: tab.sessionId,
          isConnected: tab.isConnected, // 保存连接状态
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
      console.log("【加载完成】终端组件准备就绪");
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // 添加一个新的useEffect来加载xterm依赖
  useEffect(() => {
    // 加载xterm依赖
    loadTerminalDependencies()
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
      // 通知Context关闭标签
      console.log(`【终端页面】关闭标签: ${targetKey}, 当前总标签数: ${tabs.length}`);

      // 判断是否是最后一个标签
      if (tabs.length === 1) {
        console.log('【终端页面】关闭最后一个标签，设置全部关闭标记');
        localStorage.setItem('all_tabs_closed', 'true');
        // 清除所有标签相关数据
        localStorage.removeItem('terminal_tabs');
        localStorage.removeItem('terminal_active_tab');
        localStorage.removeItem('terminal_last_created_tab');
        localStorage.removeItem('force_select_tab');
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

  // 添加标签激活事件监听
  useEffect(() => {
    const handleTabActivated = (event: CustomEvent) => {
      const { tabKey, isNewTab } = event.detail;
      console.log(`【主组件】收到标签激活事件: ${tabKey}, 是否新标签: ${isNewTab}`);

      // 激活标签
      if (tabKey && tabKey !== 'no-tabs') {
        console.log(`【主组件】处理标签激活: ${tabKey}`);
        setActiveTab(tabKey);

        // 查找标签对象
        const tab = tabs.find(t => t.key === tabKey);
        if (!tab) {
          console.error(`【主组件】无法找到标签: ${tabKey}`);
          return;
        }

        // 记录引用状态，用于调试
        console.log(`【主组件】标签引用状态:`, {
          terminalRef: !!tab.terminalRef?.current,
          xtermRef: !!tab.xtermRef?.current,
          webSocketRef: !!tab.webSocketRef?.current,
          connectionId: tab.connectionId,
          sessionId: tab.sessionId
        });

        // 延迟执行，确保DOM已经更新
        setTimeout(() => {
          console.log(`【主组件】延迟执行标签激活后处理: ${tabKey}`);

          // 尝试获取DOM元素
          const terminalElement = document.getElementById(`terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`);

          // 如果DOM元素存在但terminalRef.current不存在，则设置引用
          if (terminalElement && tab.terminalRef && !tab.terminalRef.current) {
            console.log(`【主组件】设置终端DOM引用: ${tabKey}`);
            tab.terminalRef.current = terminalElement as HTMLDivElement;

            // 触发terminal-ready事件，以便初始化终端
            window.dispatchEvent(new CustomEvent('terminal-ready', {
              detail: { tabKey }
            }));
          }

          // 如果已经初始化过终端，则调整大小
          if (tab.xtermRef?.current && tab.fitAddonRef?.current) {
            try {
              console.log(`【主组件】调整已存在终端大小: ${tabKey}`);
              tab.fitAddonRef.current.fit();
            } catch (e) {
              console.error(`【主组件】调整终端大小失败: ${tabKey}`, e);
            }
          }

          // 检查WebSocket连接状态
          if (!tab.webSocketRef?.current && tab.connectionId && tab.sessionId) {
            console.log(`【主组件】创建WebSocket连接: ${tabKey}`);
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
  }, [tabs, activeTabKey, setActiveTab]);

  // 添加terminal-ready事件处理
  useEffect(() => {
    console.log('注册terminal-ready事件监听器');

    const handleTerminalReady = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail?.tabKey) {
        console.error('【终端就绪事件】缺少tabKey');
        return;
      }

      const tabKey = customEvent.detail.tabKey;
      console.log(`【终端就绪事件】收到终端就绪事件: ${tabKey}`);

      // 查找标签对象
      const tab = tabs.find(t => t.key === tabKey);
      if (!tab) {
        console.error(`【终端就绪事件】找不到标签: ${tabKey}`);
        return;
      }

      console.log(`【终端就绪事件】标签状态:`, {
        key: tab.key,
        terminalRef: !!tab.terminalRef?.current,
        xtermRef: !!tab.xtermRef?.current,
        connectionId: tab.connectionId,
        sessionId: tab.sessionId
      });

      // 检查是否已经初始化过终端
      if (tab.xtermRef?.current) {
        console.log(`【终端就绪事件】终端已初始化，仅调整大小: ${tabKey}`);
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
          console.log(`【终端就绪事件】手动设置终端DOM引用: ${tabKey}`);
          tab.terminalRef.current = terminalElement as HTMLDivElement;
        } else {
          console.error(`【终端就绪事件】找不到终端DOM元素: ${tabKey}`);

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
        console.log(`【终端就绪事件】开始初始化终端: ${tabKey}`);

        // 创建数据处理函数
        const handleTerminalData = (data: string) => {
          console.log(`【终端就绪事件】终端数据处理: ${tabKey}`);

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
        console.log(`【终端就绪事件】终端初始化${success ? '成功' : '失败'}: ${tabKey}`);

        // 初始化成功后，确保WebSocket已连接
        if (success && !tab.webSocketRef?.current && tab.connectionId && tab.sessionId) {
          console.log(`【终端就绪事件】初始化WebSocket连接: ${tabKey}`);
          // 使用确定的类型
          const connectionId = tab.connectionId as number;
          const sessionId = tab.sessionId as number;
          createWebSocketConnection(connectionId, sessionId, tabKey);
        }
      } catch (e) {
        console.error(`【终端就绪事件】初始化终端异常: ${tabKey}`, e);
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

  // 添加连接ID监听和标签创建逻辑
  useEffect(() => {
    if (connectionId && sessionId) {
      console.log(`【连接监听】检测到连接ID和会话ID变化: 连接ID=${connectionId}, 会话ID=${sessionId}`);

      // 检查是否已存在匹配的标签页
      const existingTab = tabs.find(tab =>
        tab.connectionId === parseInt(connectionId) &&
        tab.sessionId === parseInt(sessionId)
      );

      if (existingTab) {
        console.log(`【连接监听】已存在匹配的标签页: ${existingTab.key}, 设置为活动标签`);
        // 如果标签已存在，只需激活它
        setActiveTab(existingTab.key);

        // 分发标签激活事件
        window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
          detail: { tabKey: existingTab.key, isNewTab: false }
        }));
      } else {
        console.log(`【连接监听】未找到匹配的标签页，准备创建新标签`);
        // 获取连接信息并创建标签
        fetchConnectionAndCreateTab();
      }
    }
  }, [connectionId, sessionId]);

  // 获取连接信息并创建标签页
  const fetchConnectionAndCreateTab = async () => {
    if (!connectionId) return;

    try {
      // 转换为数字类型
      const connId = parseInt(connectionId);
      const sessId = sessionId ? parseInt(sessionId) : undefined;

      console.log(`【标签创建】获取连接信息: 连接ID=${connId}, 会话ID=${sessId}`);

      // 从API获取连接详情
      const response = await connectionAPI.getConnection(connId);
      if (response && response.data && response.data.data) {
        console.log(`【标签创建】成功获取连接详情:`, response.data.data);

        // 创建新标签
        addTabWithConnection(response.data.data, connId, sessId);
      } else {
        const errorMsg = response?.data?.message || '未知错误';
        console.error(`【标签创建】无法获取连接信息: ${errorMsg}`);
        message.error(`无法获取连接信息: ${errorMsg}`);
      }
    } catch (error) {
      console.error(`【标签创建】获取连接信息失败:`, error);
      message.error(`获取连接信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 使用连接信息添加标签
  const addTabWithConnection = (connection: Connection, connectionId: number, sessionId?: number) => {
    console.log(`【标签创建】创建标签: 连接ID=${connectionId}, 会话ID=${sessionId}`);

    // 生成唯一标签键，包含时间戳
    const timestamp = Date.now();
    const tabKey = `tab-${connectionId}-${sessionId || 'nosession'}-${timestamp}`;

    // 创建所有必要的引用
    const terminalRef = createRef<HTMLDivElement>();
    const xtermRef = createRef<XTerminal>();
    const webSocketRef = createRef<WebSocket>();
    const fitAddonRef = createRef<FitAddon>();
    const searchAddonRef = createRef<SearchAddon>();
    const messageQueueRef = createRef<string[]>();

    // 初始化消息队列
    messageQueueRef.current = [];

    // 创建标签对象
    const tab: TerminalTab = {
      key: tabKey,
      title: connection.name || `Terminal ${connectionId}`,
      connectionId,
      sessionId,
      connection, // 存储完整的连接信息
      terminalRef,
      xtermRef,
      webSocketRef,
      fitAddonRef,
      searchAddonRef,
      messageQueueRef,
      isConnected: false
    };

    // 保存会话信息到localStorage
    saveSessionInfo(connectionId, sessionId || 0, tabKey, connection);

    // 添加标签到context
    addTab(tab);

    // 异步设置活动标签，确保状态更新完成
    setTimeout(() => {
      console.log(`【标签创建】设置新创建的标签为活动标签: ${tabKey}`);
      setActiveTab(tabKey);

      // 分发标签激活事件
      window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
        detail: { tabKey, isNewTab: true }
      }));

      // 更新localStorage中的最后创建标签记录
      localStorage.setItem('terminal_last_created_tab', tabKey);
    }, 100);
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
        {(connProps) => (
          <>
            {/* 终端标题 */}
            <div className={`${styles.terminalHeader} ${connProps.fullscreen ? styles.fullscreenHeader : ''}`}>
              <TerminalTabs
                tabs={connProps.tabs}
                activeKey={connProps.activeTabKey}
                onTabChange={setActiveTab}
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
                {connProps.tabs.map((tab) => {
                  // 为每个标签定义唯一的初始化标记变量名
                  const initializedKey = `terminal_initialized_${tab.key}`;

                  return (
                    <div
                      key={tab.key}
                      id={`terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`}
                      ref={el => {
                        // 只在元素存在且引用未设置时设置引用
                        if (el && tab.terminalRef && !tab.terminalRef.current) {
                          console.log(`【终端容器】设置DOM引用: ${tab.key}`);
                          tab.terminalRef.current = el;

                          // 检查全局初始化标记
                          if (connProps.activeTabKey === tab.key && !tab.xtermRef?.current && !(window as any)[initializedKey]) {
                            console.log(`【终端容器】触发终端就绪事件: ${tab.key}`);

                            // 设置初始化标记，防止重复触发
                            (window as any)[initializedKey] = true;

                            // 延迟触发，确保DOM完全渲染
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('terminal-ready', {
                                detail: { tabKey: tab.key }
                              }));
                            }, 100);
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
        )}
      </TerminalConnector>
    </div>
  );
}

export default TerminalComponent;

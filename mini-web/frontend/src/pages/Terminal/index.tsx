import React, { useState, useEffect, lazy, Suspense, useRef, createRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Spin, Empty, message, Button } from 'antd';
import { useTerminal } from '../../contexts/TerminalContext';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import type { TerminalTab } from '../../contexts/TerminalContext';
import TerminalSider from './components/TerminalSider';
import TerminalConnectionWrapper from './components/TerminalConnectionWrapper';
import TerminalLayout from '../../layouts/TerminalLayout';
import './styles.module.css';

// 组件 - 静态导入基本组件
import TerminalHeader from './components/TerminalHeader';
import TerminalFooter from './components/TerminalFooter';
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

// 样式
import styles from './styles.module.css';
import './Terminal.css'; // 引入额外的终端样式

// 添加import导入loadTerminalDependencies
import loadTerminalDependencies from './utils/loadTerminalDependencies';

/**
 * 终端组件
 * 集成了SSH, Telnet, RDP, VNC等多种远程连接协议支持
 */
const Terminal: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quickCommandsVisible, setQuickCommandsVisible] = useState(false);
  const [batchCommandsVisible, setBatchCommandsVisible] = useState(false);

  // 使用状态存储连接参数
  const connectionParams = connectionId ? {
    connectionId: parseInt(connectionId, 10)
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

  const [sessionParams, setSessionParams] = useState({});
  const [hasConnection, setHasConnection] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // 从useTerminal中获取状态
  const { state: terminalState, closeTab, setActiveTab, updateTab, addTab } = useTerminal();

  const { tabs, activeTabKey } = terminalState;

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
          parsedTabs.forEach(tabData => {
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
            const xtermRef = createRef<Terminal>();
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
          if (forceSelectTab && parsedTabs.some(tab => tab.key === forceSelectTab)) {
            tabKeyToActivate = forceSelectTab;
            console.log(`【持久化】使用强制选择的标签: ${forceSelectTab}`);
            // 使用后清除强制选择标记
            localStorage.removeItem('force_select_tab');
          }
          // 2. 其次尝试使用保存的活动标签
          else if (savedActiveTab && parsedTabs.some(tab => tab.key === savedActiveTab)) {
            tabKeyToActivate = savedActiveTab;
            console.log(`【持久化】使用保存的活动标签: ${savedActiveTab}`);
          }
          // 3. 再次尝试使用最后创建的标签
          else if (lastCreatedTab && parsedTabs.some(tab => tab.key === lastCreatedTab)) {
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

  // 添加ref记录已处理的标签
  const initializedTabs = useRef<Set<string>>(new Set());

  // 监听标签变化，强制重新初始化DOM
  useEffect(() => {
    if (!activeTabKey || activeTabKey === 'no-tabs' || tabs.length === 0) return;

    // 强制重新验证所有标签的terminalRef
    tabs.forEach((tab: any) => {
      if (!tab.terminalRef?.current) {
        console.log(`【DOM初始化】检测到标签 ${tab.key} 的terminalRef未初始化，尝试触发DOM更新`);

        // 查找DOM元素并手动设置ref
        const element = document.querySelector(`.terminal-element-${tab.key}`);
        if (element && tab.terminalRef) {
          console.log(`【DOM初始化】手动设置标签 ${tab.key} 的terminalRef`);
          tab.terminalRef.current = element as HTMLDivElement;

          // 如果是当前激活的标签，尝试触发终端初始化
          if (tab.key === activeTabKey && !initializedTabs.current.has(tab.key)) {
            console.log(`【DOM初始化】尝试为激活标签 ${tab.key} 触发终端初始化`);
            initializedTabs.current.add(tab.key);

            // 派发一个全局事件，通知标签准备好了
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('terminal-ready', { detail: { tabKey: tab.key } }));
            }
          }
        }
      }
    });
  }, [tabs, activeTabKey]);

  // 模拟组件加载
  useEffect(() => {
    // 短暂延迟后设置加载完成，确保连接包装器已加载
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // 添加依赖加载状态
  const [xtermLoaded, setXtermLoaded] = useState(false);

  // 添加一个新的useEffect来加载xterm依赖
  useEffect(() => {
    // 加载xterm依赖
    loadTerminalDependencies()
      .then(() => {
        console.log('【终端页面】xterm依赖加载成功');
        setXtermLoaded(true);
      })
      .catch(error => {
        console.error('【终端页面】xterm依赖加载失败:', error);
        message.error('终端组件加载失败，请刷新页面重试');
      });
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

      console.log(`【终端页面】收到标签激活事件: ${tabKey}, 新标签?: ${isNewTab}`);

      if (tabKey && typeof tabKey === 'string') {
        // 验证标签是否存在
        const tabExists = tabs.some(tab => tab.key === tabKey);

        // 如果标签已经是活动标签，且不是新标签，则不做任何操作
        if (tabKey === activeTabKey && !isNewTab) {
          console.log(`【终端页面】标签${tabKey}已经是活动标签，跳过处理`);
          return;
        }

        if (tabExists) {
          // 立即激活标签
          setActiveTab(tabKey);
          console.log(`【终端页面】立即设置活动标签为: ${tabKey}`);

          // 如果是新标签，添加额外的延迟更新确保UI正确显示
          if (isNewTab) {
            // 将新标签ID保存到localStorage的最新创建标签记录中
            localStorage.setItem('terminal_last_created_tab', tabKey);
            console.log(`【终端页面】保存最新创建的标签: ${tabKey}`);

            // 额外等待DOM渲染完成后确认激活状态
            setTimeout(() => {
              if (activeTabKey !== tabKey) {
                console.log(`【终端页面】确认激活新标签: ${tabKey}`);
                setActiveTab(tabKey);
              }
            }, 300);
          }
        } else {
          console.warn(`【终端页面】标签${tabKey}不存在，无法激活`);
        }
      }
    };

    window.addEventListener('terminal-tab-activated' as any, handleTabActivated);

    return () => {
      window.removeEventListener('terminal-tab-activated' as any, handleTabActivated);
    };
  }, [tabs, activeTabKey, setActiveTab]);

  // 监控标签页选择状态
  useEffect(() => {
    // 打印当前活动标签信息
    console.log(`【终端页面】当前活动标签: ${activeTabKey}`, {
      标签总数: tabs.length,
      活动标签详情: tabs.find(t => t.key === activeTabKey)
    });

    // 检查当前是否有活动标签，但DOM引用缺失
    const activeTab = tabs.find(t => t.key === activeTabKey);
    if (activeTab && !activeTab.terminalRef?.current) {
      console.log(`【终端页面】活动标签${activeTabKey}缺少DOM引用，尝试获取DOM元素`);

      // 尝试获取DOM元素
      const element = document.querySelector(`.terminal-element-${activeTab.key}`);
      if (element && activeTab.terminalRef) {
        console.log(`【终端页面】成功找到标签${activeTabKey}的DOM元素，设置ref`);
        activeTab.terminalRef.current = element as HTMLDivElement;

        // 触发终端准备事件
        window.dispatchEvent(new CustomEvent('terminal-ready', {
          detail: { tabKey: activeTab.key }
        }));
      }
    }
  }, [activeTabKey, tabs]);

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
    <TerminalConnectionWrapper connectionParams={connectionParams}>
      {({
        hasConnection,
        tabsCount,
        activeTabKey,
        isConnected,
        tabs = [],
        connection,
        fullscreen = false,
        terminalSize,
        networkLatency,
        terminalMode = 'normal',
        sidebarCollapsed = false,
        toggleFullscreen,
        sendDataToServer
      }) => {
        console.log('【主组件调试】终端连接组件就绪，接收到的属性:', {
          hasConnection, tabsCount, activeTabKey, isConnected
        });

        // 无连接ID时显示引导页面
        if (!connectionId && tabsCount === 0) {
          return (
            <TerminalGuide
              onToggleSidebar={handleToggleSidebar}
              sidebarCollapsed={sidebarCollapsed}
            />
          );
        }

        // 获取当前活动标签
        const activeTab = tabs.find((tab: any) => tab.key === activeTabKey);

        return (
          <div className={`${styles.terminalContainer} ${fullscreen ? styles.fullscreen : ''}`}>
            <TerminalHeader
              connection={connection}
              fullscreen={fullscreen}
              onToggleFullscreen={toggleFullscreen}
              onOpenSettings={() => setSettingsVisible(true)}
              onOpenQuickCommands={() => setQuickCommandsVisible(true)}
              onOpenBatchCommands={() => setBatchCommandsVisible(true)}
              terminalMode={terminalMode}
              networkLatency={networkLatency as number | undefined}
              isConnected={isConnected}
              onCopyContent={handleCopyContent}
              onDownloadLog={handleDownloadLog}
              onAddTab={handleAddNewTab}
              onCloseSession={handleCloseSession}
            />

            {/* 临时调试工具 - 开发阶段使用 */}
            {process.env.NODE_ENV !== 'production' && (
              <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 1000 }}>
                <Button
                  size="small"
                  type="primary"
                  danger
                  onClick={() => {
                    if (connectionId && sessionParams) {
                      // 强制创建标签
                      const connId = parseInt(connectionId, 10);
                      const sessId = parseInt(sessionParams, 10);
                      const timestamp = Date.now();
                      const tabKey = `debug-${connId}-${sessId}-${timestamp}`;

                      // 创建引用
                      const terminalRef = createRef<HTMLDivElement>();
                      const xtermRef = createRef<Terminal>();
                      const webSocketRef = createRef<WebSocket>();
                      const fitAddonRef = createRef<FitAddon>();
                      const searchAddonRef = createRef<SearchAddon>();
                      const messageQueueRef = createRef<string[]>();
                      messageQueueRef.current = [];

                      // 创建标签
                      const newTab: TerminalTab = {
                        key: tabKey,
                        title: `调试 ${connId}`,
                        connectionId: connId,
                        sessionId: sessId,
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
                      console.log(`【调试】创建标签 ${tabKey}`);

                      // 设置活动标签
                      setActiveTab(tabKey);

                      // 直接操作引用
                      if (terminalState) {
                        terminalState.activeTabKey = tabKey;
                        // 确保标签在数组中
                        if (!terminalState.tabs.some(t => t.key === tabKey)) {
                          terminalState.tabs.push(newTab);
                        }
                      }

                      // 触发DOM就绪事件
                      setTimeout(() => {
                        console.log(`【调试】触发终端就绪事件: ${tabKey}`);
                        window.dispatchEvent(new CustomEvent('terminal-ready', {
                          detail: { tabKey: tabKey }
                        }));
                      }, 300);

                      message.success('调试标签已创建');
                    } else {
                      message.error('缺少连接ID或会话ID');
                    }
                  }}
                >
                  调试
                </Button>
              </div>
            )}

            <div className={styles.terminalContent}>
              <TerminalTabs
                tabs={tabs}
                activeKey={activeTabKey}
                onTabChange={(key) => handleTabChange(key)}
                onTabEdit={handleTabEdit}
                onTabClose={(key) => handleTabEdit(key, 'remove')}
                onAddTab={handleAddNewTab}
              />

              <div className={styles.terminalArea}>
                {hasConnection && tabs.length > 0 ? (
                  tabs.map((tab: any) => {
                    // 添加调试信息
                    console.log(`【DOM调试】渲染标签 ${tab.key}, terminalRef存在: ${!!tab.terminalRef}`);

                    return (
                      <div
                        key={tab.key}
                        className={styles.terminalTabContent}
                        style={{
                          display: tab.key === activeTabKey ? 'flex' : 'none',
                          flex: 1,
                          height: '100%',
                          position: 'relative'
                        }}
                      >
                        <div
                          className={`${styles.terminalWrapper} terminal-element-${tab.key}`}
                          ref={(element) => {
                            // 更明确的ref绑定方式
                            if (element && tab.terminalRef) {
                              console.log(`【DOM调试】成功绑定terminalRef到DOM元素, 标签: ${tab.key}`);
                              // 直接设置current属性，确保引用被正确设置
                              tab.terminalRef.current = element;

                              // 派发一个DOM就绪事件，通知系统terminalRef已准备好
                              if (typeof window !== 'undefined' && !initializedTabs.current.has(tab.key)) {
                                initializedTabs.current.add(tab.key);
                                console.log(`【DOM初始化】触发终端准备事件，标签: ${tab.key}`);
                                window.dispatchEvent(new CustomEvent('terminal-ready', {
                                  detail: { tabKey: tab.key }
                                }));
                              }
                            }
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            position: 'relative',
                            display: 'flex',
                            flex: '1'
                          }}
                        ></div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyTerminal}>
                    <Empty description="请选择或创建一个连接" />
                  </div>
                )}
              </div>
            </div>

            <TerminalFooter
              isConnected={isConnected}
              terminalSize={terminalSize}
              networkLatency={networkLatency as number | null}
              terminalMode={terminalMode || 'normal'}
              activeConnection={connection}
              onCopyContent={handleCopyContent}
              onDownloadLog={handleDownloadLog}
              onCloseSession={handleCloseSession}
            />

            {/* 设置弹窗 */}
            <TerminalSettings
              visible={settingsVisible}
              onCancel={() => setSettingsVisible(false)}
              onApply={(settings) => {
                if (activeTab?.xtermRef?.current) {
                  handleApplySettings(
                    settings,
                    activeTab,
                    activeTab.xtermRef.current,
                    activeTab.fitAddonRef?.current
                  );
                }
                setSettingsVisible(false);
              }}
            />

            {/* 快速命令面板 */}
            <QuickCommands
              visible={quickCommandsVisible}
              onClose={() => setQuickCommandsVisible(false)}
              onSendCommand={(command) => {
                if (sendDataToServer && command) {
                  sendDataToServer(command + '\r\n');
                  setQuickCommandsVisible(false);
                }
              }}
            />

            {/* 批量命令面板 */}
            <BatchCommands
              visible={batchCommandsVisible}
              onClose={() => setBatchCommandsVisible(false)}
              onSendCommands={(commands) => {
                if (sendDataToServer && commands.length > 0) {
                  // 逐个发送命令，每个命令之间间隔500ms
                  commands.forEach((cmd, index) => {
                    setTimeout(() => {
                      sendDataToServer(cmd + '\r\n');
                    }, index * 500);
                  });
                  setBatchCommandsVisible(false);
                }
              }}
            />
          </div>
        );
      }}
    </TerminalConnectionWrapper>
  );
};

export default Terminal;
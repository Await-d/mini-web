import React, { createContext, useContext, useReducer, useRef, useEffect, createRef } from 'react';
import type { ReactNode, RefObject } from 'react';
// 移除未使用的导入
import { message } from 'antd';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { type Connection, sessionAPI } from '../services/api';

// 定义终端标签类型
export interface TerminalTab {
  key: string;
  title: string;
  icon?: React.ReactNode; // 添加可选的图标属性
  status?: string; // 添加可选的状态属性
  connectionId?: number;
  sessionId?: number;
  connection?: Connection;
  isConnected: boolean;
  terminalRef: RefObject<HTMLDivElement | null>;
  xtermRef: RefObject<Terminal | null>;
  webSocketRef: RefObject<WebSocket | null>;
  fitAddonRef: RefObject<FitAddon | null>;
  searchAddonRef: RefObject<SearchAddon | null>;
  messageQueueRef: RefObject<string[] | null>;
  protocol?: string; // 添加协议类型
  hostname?: string; // 添加主机名
  port?: number; // 添加端口
  username?: string; // 添加用户名
}

// 定义上下文状态类型
interface TerminalContextState {
  tabs: TerminalTab[];
  activeTabKey: string;
}

// 添加清除所有标签的操作类型
export interface ClearTabsAction {
  type: 'CLEAR_TABS';
}

// 所有可能的action类型
export type TerminalAction =
  | { type: 'ADD_TAB'; payload: TerminalTab }
  | { type: 'UPDATE_TAB'; payload: { key: string; updates: Partial<TerminalTab> } }
  | { type: 'CLOSE_TAB'; payload: string }
  | { type: 'SET_ACTIVE_TAB'; payload: string }
  | { type: 'CLEAR_TABS' };

// 定义上下文类型
interface TerminalContextType {
  state: TerminalContextState;
  addTab: (tab: TerminalTab) => void;
  updateTab: (key: string, updates: Partial<TerminalTab>) => void;
  closeTab: (key: string) => void;
  setActiveTab: (key: string) => void;
  clearTabs: () => void;
}

// 创建上下文
const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

// 创建全局状态引用（为高级功能服务）
export const terminalStateRef = React.createRef<TerminalContextState>();

// 辅助函数，用于更新localStorage中的标签状态
const updateTabsInLocalStorage = (tabs: TerminalTab[], activeKey: string) => {
  try {
    if (!tabs || tabs.length === 0) {
      return;
    }

    // 创建可序列化的标签数组，保存所有标签
    const serializableTabs = tabs.map(tab => {
      // 针对每个标签提取必要信息
      return {
        key: tab.key,
        title: tab.title,
        connectionId: tab.connectionId,
        sessionId: tab.sessionId,
        isConnected: tab.isConnected,
        timestamp: parseInt(tab.key.split('-').pop() || '0', 10),
        protocol: tab.protocol,
        hostname: tab.hostname,
        port: tab.port,
        username: tab.username,
        // 保存完整的连接对象
        connection: tab.connection ? {
          ...tab.connection
        } : undefined
      };
    });

    // 保存所有标签信息
    localStorage.setItem('terminal_tabs', JSON.stringify(serializableTabs));

    // 获取当前用户手动选择的标签
    const userSelectedTab = localStorage.getItem('terminal_active_tab');

    // 检查用户选择的标签是否存在于当前标签列表
    const userTabExists = tabs.some(tab => tab.key === userSelectedTab);

    // 只有在以下情况更新活动标签：
    // 1. 没有用户选择的标签记录
    // 2. 用户选择的标签不存在于当前标签列表
    // 3. 传入的activeKey是由用户手动选择的(与userSelectedTab相同)
    // 4. localStorage中没有存储活动标签
    if (!userSelectedTab || !userTabExists || activeKey === userSelectedTab) {
      localStorage.setItem('terminal_active_tab', activeKey);
    }

    // 移除所有标签关闭的标志
    localStorage.removeItem('all_tabs_closed');
  } catch (error) {
    console.error('保存标签状态失败:', error);
  }
};

// 创建Provider组件
export const TerminalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 定义reducer函数
  const reducer = (state: TerminalContextState, action: TerminalAction): TerminalContextState => {
    let newState: TerminalContextState = state;

    switch (action.type) {
      case 'ADD_TAB': {
        // 检查是否已存在相同key的标签
        const existingTabIndex = state.tabs.findIndex(tab => tab.key === action.payload.key);

        if (existingTabIndex >= 0) {
          // 如果标签已存在，更新它而不是添加新标签
          const updatedTabs = [...state.tabs];
          updatedTabs[existingTabIndex] = {
            ...state.tabs[existingTabIndex],
            ...action.payload,
            // 保留原有引用，除非新标签提供了新的引用
            terminalRef: action.payload.terminalRef || state.tabs[existingTabIndex].terminalRef,
            xtermRef: action.payload.xtermRef || state.tabs[existingTabIndex].xtermRef,
            webSocketRef: action.payload.webSocketRef || state.tabs[existingTabIndex].webSocketRef,
            fitAddonRef: action.payload.fitAddonRef || state.tabs[existingTabIndex].fitAddonRef,
            searchAddonRef: action.payload.searchAddonRef || state.tabs[existingTabIndex].searchAddonRef,
            messageQueueRef: action.payload.messageQueueRef || state.tabs[existingTabIndex].messageQueueRef,
          };

          newState = {
            ...state,
            tabs: updatedTabs,
            activeTabKey: action.payload.key, // 设置为活动标签
          };
        } else {
          // 确保在添加前深度验证标签数据
          const newTab = {
            ...action.payload,
            // 确保所有必要的引用存在
            terminalRef: action.payload.terminalRef || createRef<HTMLDivElement>(),
            xtermRef: action.payload.xtermRef || createRef<Terminal>(),
            webSocketRef: action.payload.webSocketRef || createRef<WebSocket>(),
            fitAddonRef: action.payload.fitAddonRef || createRef<FitAddon>(),
            searchAddonRef: action.payload.searchAddonRef || createRef<SearchAddon>(),
            messageQueueRef: action.payload.messageQueueRef || createRef<string[]>(),
            isConnected: action.payload.isConnected || false,
          };

          // 在新的标签数组中添加新标签
          const newTabs = [...state.tabs, newTab];

          newState = {
            ...state,
            tabs: newTabs,
            activeTabKey: action.payload.key, // 设置为活动标签
          };
        }

        terminalStateRef.current = newState;

        // 保存新创建的标签ID到localStorage
        localStorage.setItem('terminal_last_created_tab', action.payload.key);

        // 延迟更新localStorage，确保状态已完全更新
        setTimeout(() => updateTabsInLocalStorage(newState.tabs, newState.activeTabKey), 0);

        return newState;
      }

      case 'UPDATE_TAB': {
        const { key, updates } = action.payload;
        const existingTabIndex = state.tabs.findIndex(tab => tab.key === key);

        if (existingTabIndex === -1) {
          console.warn(`无法更新标签 ${key}：找不到该标签`);
          return state;
        }

        const updatedTab = {
          ...state.tabs[existingTabIndex],
          ...updates,
        };

        const updatedTabs = [...state.tabs];
        updatedTabs[existingTabIndex] = updatedTab;

        newState = {
          ...state,
          tabs: updatedTabs,
        };

        terminalStateRef.current = newState;

        // 延迟更新localStorage，确保状态已完全更新
        setTimeout(() => updateTabsInLocalStorage(newState.tabs, newState.activeTabKey), 0);

        return newState;
      }

      case 'CLOSE_TAB': {
        // 获取要关闭的标签
        const tabToClose = state.tabs.find(tab => tab.key === action.payload);

        // 过滤掉要关闭的标签
        const filteredTabs = state.tabs.filter(tab => tab.key !== action.payload);

        // 将关闭的标签添加到关闭记录中
        if (tabToClose) {
          const closedTabsStr = localStorage.getItem('terminal_closed_tabs') || '[]';
          let closedTabs = [];
          try {
            closedTabs = JSON.parse(closedTabsStr);
          } catch (e) {
            console.error('解析关闭标签数据失败:', e);
            closedTabs = [];
          }

          // 添加到关闭记录
          closedTabs.push({
            key: tabToClose.key,
            connectionId: tabToClose.connectionId,
            sessionId: tabToClose.sessionId
          });

          // 更新关闭记录
          localStorage.setItem('terminal_closed_tabs', JSON.stringify(closedTabs));

          // 触发关闭事件
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('terminal-tab-closed', {
              detail: {
                tabKey: tabToClose.key,
                tabData: {
                  key: tabToClose.key,
                  connectionId: tabToClose.connectionId,
                  sessionId: tabToClose.sessionId
                }
              }
            }));
          }
        }

        // 确定新的活动标签
        let newActiveTabKey = state.activeTabKey;

        // 如果关闭的是当前活动标签，需要选择新的活动标签
        if (state.activeTabKey === action.payload) {
          if (filteredTabs.length > 0) {
            // 尝试选择时间戳最新的标签
            const sortedTabs = [...filteredTabs].sort((a, b) => {
              const aTimestamp = parseInt(a.key.split('-').pop() || '0', 10);
              const bTimestamp = parseInt(b.key.split('-').pop() || '0', 10);
              return bTimestamp - aTimestamp; // 降序排列
            });
            newActiveTabKey = sortedTabs[0].key;
          } else {
            newActiveTabKey = 'no-tabs';
          }
        }

        newState = {
          ...state,
          tabs: filteredTabs,
          activeTabKey: newActiveTabKey,
        };

        terminalStateRef.current = newState;

        // 更新localStorage
        updateTabsInLocalStorage(filteredTabs, newActiveTabKey);

        return newState;
      }

      case 'SET_ACTIVE_TAB': {
        newState = {
          ...state,
          activeTabKey: action.payload,
        };

        terminalStateRef.current = newState;

        // 更新活动标签到localStorage
        localStorage.setItem('terminal_active_tab', action.payload);

        // 确保更新整体标签状态
        updateTabsInLocalStorage(state.tabs, action.payload);

        return newState;
      }

      case 'CLEAR_TABS': {
        // 尝试关闭所有WebSocket连接
        state.tabs.forEach(tab => {
          try {
            if (tab.webSocketRef?.current &&
              tab.webSocketRef.current.readyState !== WebSocket.CLOSED &&
              tab.webSocketRef.current.readyState !== WebSocket.CLOSING) {
              tab.webSocketRef.current.close();
            }

            if (tab.xtermRef?.current) {
              // 先移除插件
              if (tab.fitAddonRef?.current) {
                tab.fitAddonRef.current.dispose();
              }

              if (tab.searchAddonRef?.current) {
                tab.searchAddonRef.current.dispose();
              }

              // 销毁终端实例
              tab.xtermRef.current.dispose();
            }
          } catch (e) {
            console.error(`清理标签资源失败:`, e);
          }
        });

        // 创建空状态
        newState = {
          ...state,
          tabs: [],
          activeTabKey: '',
        };

        // 更新terminalStateRef
        terminalStateRef.current = newState;

        // 清除localStorage中的标签相关数据
        localStorage.removeItem('terminal_tabs');
        localStorage.removeItem('terminal_active_tab');
        localStorage.removeItem('terminal_last_created_tab');
        localStorage.setItem('all_tabs_closed', 'true');

        return newState;
      }

      default:
        return state;
    }
  };

  // 初始化状态
  const initialState: TerminalContextState = {
    tabs: [],
    activeTabKey: 'no-tabs',
  };

  // 使用useReducer管理状态
  const [state, dispatch] = useReducer(reducer, initialState);

  // 更新全局状态引用
  useEffect(() => {
    terminalStateRef.current = state;
  }, [state]);

  // 添加标签
  const addTab = (tab: TerminalTab) => {
    // 防止添加没有key的标签
    if (!tab.key) {
      console.error('错误：尝试添加没有key的标签');
      return;
    }

    // 检查是否存在同样connectionId和sessionId的标签
    // 这样可以避免为同一个连接创建多个标签
    const existingConnectionTab = state.tabs.find(t =>
      t.connectionId === tab.connectionId &&
      t.sessionId === tab.sessionId &&
      tab.connectionId !== undefined &&
      tab.sessionId !== undefined
    );

    // 如果找到了现有标签，直接激活它而不是创建新标签
    if (existingConnectionTab) {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: existingConnectionTab.key });
      return;
    }

    // 准备标签数据，确保包含所有必要的引用
    const completeTab = {
      ...tab,
      terminalRef: tab.terminalRef || createRef<HTMLDivElement>(),
      xtermRef: tab.xtermRef || createRef<Terminal>(),
      webSocketRef: tab.webSocketRef || createRef<WebSocket>(),
      fitAddonRef: tab.fitAddonRef || createRef<FitAddon>(),
      searchAddonRef: tab.searchAddonRef || createRef<SearchAddon>(),
      messageQueueRef: tab.messageQueueRef || createRef<string[]>(),
      isConnected: tab.isConnected || false,
    };

    // 分发添加标签的action
    dispatch({ type: 'ADD_TAB', payload: completeTab });
  };

  // 更新标签
  const updateTab = (key: string, updates: Partial<TerminalTab>) => {
    dispatch({ type: 'UPDATE_TAB', payload: { key, updates } });
  };

  // 关闭标签
  const closeTab = (key: string) => {
    // 获取标签信息
    const tabToClose = state.tabs.find(tab => tab.key === key);
    if (!tabToClose) {
      console.warn(`无法关闭标签 ${key}：找不到该标签`);
      return;
    }

    // 尝试关闭WebSocket连接
    try {
      if (tabToClose.webSocketRef?.current &&
        tabToClose.webSocketRef.current.readyState !== WebSocket.CLOSED &&
        tabToClose.webSocketRef.current.readyState !== WebSocket.CLOSING) {
        tabToClose.webSocketRef.current.close();
      }
    } catch (e) {
      console.error(`关闭WebSocket失败:`, e);
    }

    // 尝试销毁xterm实例
    try {
      if (tabToClose.xtermRef?.current) {
        // 先移除插件
        if (tabToClose.fitAddonRef?.current) {
          tabToClose.fitAddonRef.current.dispose();
        }

        if (tabToClose.searchAddonRef?.current) {
          tabToClose.searchAddonRef.current.dispose();
        }

        // 销毁终端实例
        tabToClose.xtermRef.current.dispose();
      }
    } catch (e) {
      console.error(`销毁xterm实例失败:`, e);
    }

    // 保存关闭的标签信息到localStorage，防止刷新后重新出现
    try {
      // 读取现有的关闭标签列表
      const closedTabsStr = localStorage.getItem('terminal_closed_tabs') || '[]';
      let closedTabs = [];

      try {
        closedTabs = JSON.parse(closedTabsStr);
      } catch (e) {
        console.error('解析关闭标签数据失败:', e);
        closedTabs = [];
      }

      // 添加当前关闭的标签
      closedTabs.push({
        key: tabToClose.key,
        connectionId: tabToClose.connectionId,
        sessionId: tabToClose.sessionId,
        timestamp: Date.now()
      });

      // 保存回localStorage
      localStorage.setItem('terminal_closed_tabs', JSON.stringify(closedTabs));

      // 检查最后创建的标签是否为当前关闭的标签
      const lastCreatedTab = localStorage.getItem('terminal_last_created_tab');
      if (lastCreatedTab === key) {
        // 如果是，移除此记录
        localStorage.removeItem('terminal_last_created_tab');
      }

      // 获取剩余标签的数量
      const remainingTabs = state.tabs.filter(tab => tab.key !== key);

      // 如果关闭后没有标签了，或者是最后一个标签
      if (remainingTabs.length === 0 || state.tabs.length === 1) {
        localStorage.removeItem('terminal_tabs');
        localStorage.removeItem('terminal_active_tab');

        // 设置标记，表示所有标签都已关闭
        localStorage.setItem('all_tabs_closed', 'true');

        // 保留关闭标签列表，防止刷新后重新创建
        // localStorage.removeItem('terminal_closed_tabs');
      } else {
        // 更新标签状态到localStorage
        updateTabsInLocalStorage(remainingTabs, remainingTabs[0].key);
      }
    } catch (e) {
      console.error('保存关闭标签信息失败:', e);
    }

    // 分发标签关闭事件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('terminal-tab-closed', {
        detail: {
          tabKey: key,
          tabData: {
            key: tabToClose.key,
            connectionId: tabToClose.connectionId,
            sessionId: tabToClose.sessionId,
            timestamp: Date.now()
          }
        }
      }));
    }

    // 正常情况下通知上下文关闭标签
    dispatch({ type: 'CLOSE_TAB', payload: key });

    // 特殊情况：如果是最后一个标签，手动清理状态
    if (state.tabs.length === 1) {
      dispatch({ type: 'CLEAR_TABS' });
    }
  };

  // 设置活动标签
  const setActiveTab = (key: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: key });
  };

  // 清空所有标签
  const clearTabs = () => {
    // 关闭所有连接的会话
    state.tabs.forEach(tab => {
      if (tab.isConnected && tab.sessionId) {
        try {
          sessionAPI.closeSession(tab.sessionId).catch(err => {
            console.error(`关闭会话 ${tab.sessionId} 时出错:`, err);
          });
        } catch (error) {
          console.error(`关闭会话异常:`, error);
        }
      }
    });

    // 清空标签列表
    dispatch({ type: 'CLEAR_TABS' });
  };

  // 提供上下文值
  const contextValue = {
    state,
    addTab,
    updateTab,
    closeTab,
    setActiveTab,
    clearTabs,
  };

  return (
    <TerminalContext.Provider value={contextValue}>
      {children}
    </TerminalContext.Provider>
  );
};

// 创建自定义hook，便于组件使用
export const useTerminal = (): TerminalContextType => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal必须在TerminalProvider内部使用');
  }
  return context;
};

// 其他类型定义，如果需要的话
export interface Tab {
  key: string;
  title: string;
  connection?: {
    id: string;
    type: string;
    settings: any;
  };
  status: string;
  isConnected: boolean;
  // 终端引用，使用RefObject以便与DOM交互
  xtermRef: RefObject<any>;
  fitAddonRef: RefObject<any>;
  searchAddonRef: RefObject<any>;
  messageQueueRef: RefObject<any[]>;
  webSocketRef: RefObject<WebSocket>;
}
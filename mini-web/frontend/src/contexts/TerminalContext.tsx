import React, { createContext, useContext, useReducer, useRef, useEffect, createRef, useCallback } from 'react';
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

    // 保存当前活动标签
    localStorage.setItem('terminal_active_tab', activeKey);

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
        let newTabs = [...state.tabs];
        let isNewTab = false;

        if (existingTabIndex >= 0) {
          // 如果标签已存在，更新它而不是添加新标签
          const updatedTab = {
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

          newTabs[existingTabIndex] = updatedTab;
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
          newTabs.push(newTab);
          isNewTab = true;
        }

        newState = {
          ...state,
          tabs: newTabs,
          activeTabKey: action.payload.key, // 设置为活动标签
        };

        terminalStateRef.current = newState;

        // 保存新创建的标签ID到localStorage
        localStorage.setItem('terminal_last_created_tab', action.payload.key);

        // 保存活动标签
        localStorage.setItem('terminal_active_tab', action.payload.key);

        // 更新localStorage
        updateTabsInLocalStorage(newState.tabs, newState.activeTabKey);

        // 触发标签激活事件
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
            detail: {
              tabKey: action.payload.key,
              isNewTab: true,
              fromReducer: true
            }
          }));
        }

        // 触发标签添加事件
        if (isNewTab && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('terminal-tab-added', {
            detail: {
              tab: action.payload,
              activeTabKey: action.payload.key,
              totalTabs: newTabs.length
            }
          }));
        }

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

        // 更新localStorage
        updateTabsInLocalStorage(newState.tabs, newState.activeTabKey);

        return newState;
      }

      case 'CLOSE_TAB': {
        // 找到要关闭的标签
        const tabIndex = state.tabs.findIndex(tab => tab.key === action.payload);
        if (tabIndex === -1) {
          // 标签不存在，返回原状态
          return state;
        }

        // 保存关闭前的标签信息，用于触发事件
        const closedTab = state.tabs[tabIndex];

        // 创建新的标签数组，排除要关闭的标签
        const updatedTabs = state.tabs.filter(tab => tab.key !== action.payload);

        // 如果关闭的是当前活动标签，需要更新活动标签
        let newActiveTabKey = state.activeTabKey;
        if (state.activeTabKey === action.payload) {
          // 选择最后一个标签作为新的活动标签
          newActiveTabKey = updatedTabs.length > 0
            ? updatedTabs[updatedTabs.length - 1].key
            : 'no-tabs';
        }

        newState = {
          ...state,
          tabs: updatedTabs,
          activeTabKey: newActiveTabKey,
        };

        terminalStateRef.current = newState;

        // 更新localStorage
        updateTabsInLocalStorage(newState.tabs, newState.activeTabKey);

        // 触发标签关闭事件
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('terminal-tab-removed', {
            detail: {
              tabKey: action.payload,
              tabData: {
                key: closedTab.key,
                connectionId: closedTab.connectionId,
                sessionId: closedTab.sessionId,
                timestamp: Date.now()
              },
              newActiveTabKey,
              remainingTabs: updatedTabs.length
            }
          }));
        }

        return newState;
      }

      case 'SET_ACTIVE_TAB': {
        // 如果新的活动标签与当前活动标签相同，则不需要更新
        if (state.activeTabKey === action.payload) {
          return state;
        }

        // 设置活动标签
        newState = {
          ...state,
          activeTabKey: action.payload,
        };

        terminalStateRef.current = newState;

        // 更新活动标签到localStorage
        localStorage.setItem('terminal_active_tab', action.payload);

        // 更新整体标签状态
        updateTabsInLocalStorage(state.tabs, action.payload);

        // 触发标签切换事件
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
            detail: {
              tabKey: action.payload,
              previousTabKey: state.activeTabKey,
              totalTabs: state.tabs.length
            }
          }));
        }

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
  const addTab = useCallback((tab: TerminalTab) => {
    // 确保标签有一个唯一的key
    if (!tab.key) {
      tab.key = `tab-${Date.now()}`;
    }

    // 检查标签是否已存在，如果存在则不添加
    const exists = state.tabs.some(t => t.key === tab.key);
    if (exists) {
      return;
    }

    // 发送添加标签事件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('terminal-tab-added', {
        detail: { tab }
      }));
    }

    // 修改localStorage以表示有活动的标签页
    localStorage.removeItem('all_tabs_closed');

    // 更新状态
    dispatch({
      type: 'ADD_TAB',
      payload: tab
    });
  }, [state.tabs, dispatch]);

  // 更新标签
  const updateTab = (key: string, updates: Partial<TerminalTab>) => {
    dispatch({ type: 'UPDATE_TAB', payload: { key, updates } });
  };

  // 关闭标签
  const closeTab = (key: string) => {
    // 找到要关闭的标签
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
  const setActiveTab = useCallback((key: string) => {
    // 不需要重复设置相同的活动标签
    if (state.activeTabKey === key) {
      return;
    }

    // 检查标签是否存在
    const tabExists = state.tabs.some(tab => tab.key === key);
    if (!tabExists) {
      // 如果找不到指定标签，使用第一个标签
      if (state.tabs.length > 0) {
        const firstTabKey = state.tabs[0].key;
        localStorage.setItem('terminal_active_tab', firstTabKey);
        dispatch({
          type: 'SET_ACTIVE_TAB',
          payload: firstTabKey
        });
      }
      return;
    }

    // 保存活动标签到localStorage
    localStorage.setItem('terminal_active_tab', key);

    // 更新状态
    dispatch({
      type: 'SET_ACTIVE_TAB',
      payload: key
    });
  }, [state.activeTabKey, state.tabs, dispatch]);

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
import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode, RefObject } from 'react';
// 移除未使用的导入
import { message } from 'antd';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { type Connection, sessionAPI } from '../services/api';

// 终端标签接口
export interface TerminalTab {
  key: string;
  title: string;
  sessionId: number;
  connectionId: number;
  connection: Connection | null;
  terminalRef: RefObject<HTMLDivElement>;
  xtermRef: RefObject<XTerm | null>;
  fitAddonRef: RefObject<FitAddon | null>;
  searchAddonRef: RefObject<SearchAddon | null>;
  webSocketRef: RefObject<WebSocket | null>;
  isConnected: boolean;
  isGraphical: boolean; // 是否为图形化终端（RDP或VNC）
}

// 终端状态接口
interface TerminalState {
  tabs: TerminalTab[];
  activeTabKey: string;
}

// 终端上下文接口
interface TerminalContextType {
  state: TerminalState;
  addTab: (connectionId: number, sessionId: number, connection: Connection) => void;
  closeTab: (tabKey: string) => void;
  setActiveTab: (tabKey: string) => void;
}

// 创建上下文
const TerminalContext = createContext<TerminalContextType | null>(null);

// 上下文提供者属性
interface TerminalProviderProps {
  children: ReactNode;
}

// Action类型
type TerminalAction =
  | { type: 'ADD_TAB'; payload: TerminalTab }
  | { type: 'CLOSE_TAB'; payload: { tabKey: string } }
  | { type: 'SET_ACTIVE_TAB'; payload: { tabKey: string } }
  | { type: 'UPDATE_TAB'; payload: { tabKey: string; updates: Partial<TerminalTab> } };

// 终端状态Reducer
function terminalReducer(state: TerminalState, action: TerminalAction): TerminalState {
  switch (action.type) {
    case 'ADD_TAB':
      return {
        ...state,
        tabs: [...state.tabs, action.payload],
        activeTabKey: action.payload.key,
      };

    case 'CLOSE_TAB': {
      // 找到要关闭的标签的索引
      const closedIndex = state.tabs.findIndex(tab => tab.key === action.payload.tabKey);

      // 移除要关闭的标签
      const newTabs = state.tabs.filter(tab => tab.key !== action.payload.tabKey);

      // 如果关闭的标签是当前活动标签，则选择一个新的活动标签
      let newActiveTabKey = state.activeTabKey;

      if (action.payload.tabKey === state.activeTabKey && newTabs.length > 0) {
        // 如果关闭的是当前活动标签，则选择下一个标签作为活动标签
        // 或者如果是最后一个标签，则选择前一个标签
        newActiveTabKey = newTabs.length > closedIndex
          ? newTabs[closedIndex].key
          : newTabs[newTabs.length - 1].key;
      }

      // 如果没有标签了，使用一个不存在的key，后续逻辑会处理没有标签的情况
      const fallbackKey = 'no-tabs';
      
      return {
        ...state,
        tabs: newTabs,
        activeTabKey: newTabs.length > 0 ? newActiveTabKey : fallbackKey,
      };
    }

    case 'SET_ACTIVE_TAB':
      return {
        ...state,
        activeTabKey: action.payload.tabKey,
      };

    case 'UPDATE_TAB': {
      const { tabKey, updates } = action.payload;
      const newTabs = state.tabs.map(tab =>
        tab.key === tabKey ? { ...tab, ...updates } : tab
      );

      return {
        ...state,
        tabs: newTabs,
      };
    }

    default:
      return state;
  }
}

// 终端上下文提供者
export const TerminalProvider: React.FC<TerminalProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(terminalReducer, {
    tabs: [],
    activeTabKey: 'no-tabs' // 使用一个不可能重复的初始key
  });

  // 添加新标签
  const addTab = (connectionId: number, sessionId: number, connection: Connection) => {
    // 使用时间戳和随机数生成唯一的标签key
    const newTabKey = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 判断是否为图形协议
    const isGraphical = connection.protocol === 'rdp' || connection.protocol === 'vnc';

    const newTab: TerminalTab = {
      key: newTabKey,
      title: connection.name,
      sessionId: sessionId,
      connectionId: connectionId,
      connection: connection,
      terminalRef: React.createRef<HTMLDivElement>(),
      xtermRef: React.createRef<XTerm | null>(),
      fitAddonRef: React.createRef<FitAddon | null>(),
      searchAddonRef: React.createRef<SearchAddon | null>(),
      webSocketRef: React.createRef<WebSocket | null>(),
      isConnected: false,
      isGraphical: isGraphical
    };

    dispatch({ type: 'ADD_TAB', payload: newTab });
  };

  // 关闭标签
  const closeTab = (tabKey: string) => {
    const tab = state.tabs.find(t => t.key === tabKey);
    if (tab) {
      // 关闭WebSocket连接
      if (tab.webSocketRef.current) {
        tab.webSocketRef.current.close();
      }

      // 关闭会话
      if (tab.sessionId) {
        sessionAPI.closeSession(tab.sessionId).catch(error => {
          console.error('关闭会话失败:', error);
        });
      }

      dispatch({ type: 'CLOSE_TAB', payload: { tabKey } });
    }
  };

  // 设置活动标签
  const setActiveTab = (tabKey: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: { tabKey } });
  };

  // 上下文值
  const contextValue: TerminalContextType = {
    state,
    addTab,
    closeTab,
    setActiveTab
  };

  return (
    <TerminalContext.Provider value={contextValue}>
      {children}
    </TerminalContext.Provider>
  );
};

// 自定义Hook，用于使用终端上下文
export const useTerminal = () => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal必须在TerminalProvider内使用');
  }
  return context;
};
import React, { createContext, useContext, useReducer, useEffect, createRef, useCallback } from 'react';
import type { ReactNode, RefObject } from 'react';
import { type Connection, sessionAPI } from '../services/api';

// 跟踪已关闭或正在关闭的会话，避免重复关闭请求
const closingSessionsSet = new Set<number>();

// 安全关闭会话，避免重复请求
const closeSessionSafely = async (sessionId?: number) => {
  if (!sessionId) return;

  // 如果会话已在关闭列表中，跳过
  if (closingSessionsSet.has(sessionId)) {
    return;
  }

  // 添加到关闭列表
  closingSessionsSet.add(sessionId);

  try {
    await sessionAPI.closeSession(sessionId);
  } catch (err) {
    console.error(`【会话关闭】关闭会话 ${sessionId} 失败:`, err);
    // 即使失败也假定会话已关闭或将被关闭，以防止重复请求
  } finally {
    // 设置一个定时器来清理记录，以允许未来可能的重用
    setTimeout(() => {
      closingSessionsSet.delete(sessionId);
    }, 10000); // 10秒后移除记录
  }
};

// 安全关闭WebSocket的辅助函数
const safelyCloseWebSocket = (ws: WebSocket, sessionId?: number) => {
  try {
    // 检查WebSocket是否有效
    if (!ws) return;

    // 检查WebSocket状态并适当处理
    switch (ws.readyState) {
      case WebSocket.CONNECTING: // 0 - 连接尚未建立
        console.log(`WebSocket处于CONNECTING状态，直接关闭而不发送消息`);
        try {
          // 对于CONNECTING状态，不要调用close()方法，避免触发错误
          // 而是简单地让它静默失败，后端会自动清理过期连接
          // ws.close() 可能会引发"WebSocket is closed before the connection is established"错误
        } catch (err) {
          console.warn(`关闭CONNECTING状态的WebSocket失败:`, err);
        }
        break;

      case WebSocket.OPEN: // 1 - 连接已建立，可以通信
        console.log(`WebSocket处于OPEN状态，发送终止消息并关闭`);
        if (sessionId) {
          try {
            ws.send(JSON.stringify({ type: 'terminate', sessionId }));
          } catch (err) {
            console.warn(`发送终止消息失败:`, err);
          }
        }
        try {
          ws.close();
        } catch (err) {
          console.warn(`关闭OPEN状态的WebSocket失败:`, err);
        }
        break;

      case WebSocket.CLOSING: // 2 - 连接正在关闭
      case WebSocket.CLOSED:  // 3 - 连接已关闭或无法打开
        console.log(`WebSocket处于${ws.readyState === WebSocket.CLOSING ? 'CLOSING' : 'CLOSED'}状态，不执行任何操作`);
        // 不需要任何操作，连接已经在关闭或已关闭
        break;

      default:
        console.log(`WebSocket处于未知状态(${ws.readyState})，尝试关闭`);
        try {
          ws.close();
        } catch (err) {
          console.warn(`关闭未知状态WebSocket失败:`, err);
        }
    }
  } catch (err) {
    console.error(`关闭WebSocket时发生错误:`, err);
  }
};

// 定义终端标签类型
export interface TerminalTab {
  key: string;
  title: string;
  icon?: React.ReactNode; // 添加可选的图标属性
  status?: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting'; // 标签状态
  error?: string; // 错误信息
  connectionId?: number;
  sessionId?: number;
  connection?: Connection;
  isConnected: boolean;
  terminalRef: RefObject<HTMLDivElement | null>;
  webSocketRef: RefObject<WebSocket | null>;
  messageQueueRef: RefObject<Array<{ type: string; data: string | number[]; timestamp: number }> | null>;
  queueProcessorTimer?: NodeJS.Timeout; // 消息队列处理定时器
  cleanupRef?: RefObject<(() => void) | null>; // 添加清理函数引用
  protocol?: string; // 添加协议类型
  hostname?: string; // 添加主机名
  port?: number; // 添加端口
  username?: string; // 添加用户名
  sendDataToServer?: (data: string) => boolean; // 添加发送数据到服务器的方法
  networkLatency?: number | null; // 添加网络延迟属性
  terminalMode?: string; // 添加终端模式属性
  isGraphical?: boolean; // 添加是否图形化属性
  forceCreate?: boolean; // 添加强制创建标志
  lastReconnectTime?: string; // 最后重连时间
  reconnectCount?: number; // 重连次数
  lastError?: string; // 最后一次错误
  errorTime?: string; // 错误发生时间
  // RDP特有属性
  rdpWidth?: number; // RDP窗口宽度
  rdpHeight?: number; // RDP窗口高度
  rdpResolution?: string; // RDP分辨率设置
  rdpSettings?: {
    resolution?: string;
    colorDepth?: number;
    audioMode?: string;
    redirectPrinters?: boolean;
    redirectClipboard?: boolean;
    redirectDrives?: boolean;
    remoteApp?: string;
    [key: string]: any;
  };
  // 图形化协议组件引用
  rdpComponentRef?: RefObject<any>; // RDP组件引用
  vncComponentRef?: RefObject<any>; // VNC组件引用
  lastActivityTime?: number; // 最后活动时间
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
      // 确保使用统一的标签键格式
      let tabKey = tab.key;
      if (tabKey.startsWith('tab-') && tab.connectionId && tab.sessionId) {
        const timestamp = tabKey.split('-').pop() || Date.now().toString();
        tabKey = `conn-${tab.connectionId}-session-${tab.sessionId}-${timestamp}`;
      }

      // 针对每个标签提取必要信息
      return {
        key: tabKey, // 使用统一格式的键
        title: tab.title,
        connectionId: tab.connectionId,
        sessionId: tab.sessionId,
        isConnected: tab.isConnected,
        timestamp: parseInt(tabKey.split('-').pop() || '0', 10),
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

// 清理函数，用于清除localStorage中的旧格式标签页
const cleanupOldFormatTabs = () => {
  try {
    // 首先检查是否有关闭标志，如果有，应该跳过处理并清理标签数据
    const forceClosingLastTab = localStorage.getItem('force_closing_last_tab') === 'true';
    const allTabsClosed = localStorage.getItem('all_tabs_closed') === 'true';

    if (forceClosingLastTab || allTabsClosed) {
      localStorage.removeItem('terminal_tabs');
      return;
    }

    const savedTabsRaw = localStorage.getItem('terminal_tabs');
    if (savedTabsRaw) {
      const savedTabs = JSON.parse(savedTabsRaw);
      if (Array.isArray(savedTabs) && savedTabs.length > 0) {
        let hasOldFormat = false;

        // 检查是否有旧格式标签
        const cleanedTabs = savedTabs.map(tab => {
          if (tab.key.startsWith('tab-') && tab.connectionId && tab.sessionId) {
            hasOldFormat = true;
            const timestamp = tab.key.split('-').pop() || Date.now().toString();
            return {
              ...tab,
              key: `conn-${tab.connectionId}-session-${tab.sessionId}-${timestamp}`
            };
          }
          return tab;
        });

        // 如果有旧格式标签，更新localStorage
        if (hasOldFormat) {
          localStorage.setItem('terminal_tabs', JSON.stringify(cleanedTabs));
        }
      }
    }
  } catch (error) {
    console.error('清理旧格式标签失败:', error);
  }
};

// 添加清除所有标签关闭标志的函数
const clearAllTabClosingFlags = () => {
  localStorage.removeItem('force_closing_last_tab');
  localStorage.removeItem('all_tabs_closed');
  localStorage.removeItem('recently_closed_tab');
};

// 在合适的位置添加检查标签关闭状态的辅助函数
const isTabClosingActive = (): boolean => {
  const forceClosingLastTab = localStorage.getItem('force_closing_last_tab') === 'true';
  const allTabsClosed = localStorage.getItem('all_tabs_closed') === 'true';
  const recentlyClosedTab = localStorage.getItem('recently_closed_tab');

  // 判断是否设置了过期时间
  const flagExpiry = parseInt(localStorage.getItem('closing_flags_expiry') || '0', 10);
  const now = Date.now();

  // 如果过期时间已到，自动清除标志
  if (flagExpiry > 0 && now > flagExpiry) {
    clearAllTabClosingFlags();
    return false;
  }

  return forceClosingLastTab || allTabsClosed || !!recentlyClosedTab;
};

// 创建Provider组件
export const TerminalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 定义reducer函数
  const reducer = (state: TerminalContextState, action: TerminalAction): TerminalContextState => {
    let newState: TerminalContextState = state;

    switch (action.type) {
      case 'ADD_TAB': {
        // 检查是否有强制创建标志
        const forceCreate = action.payload.forceCreate === true;

        // 如果是强制创建，清除所有关闭标志
        if (forceCreate) {
          // 清除所有关闭标志
          localStorage.removeItem('force_closing_last_tab');
          localStorage.removeItem('all_tabs_closed');
          localStorage.removeItem('recently_closed_tab');
          localStorage.removeItem('closing_flags_expiry');
          localStorage.removeItem('last_tab_close_time');
        }
        // 如果不是强制创建，才检查关闭标志
        else {
          // 检查是否处于标签关闭状态
          const forceClosingLastTab = localStorage.getItem('force_closing_last_tab') === 'true';
          const allTabsClosed = localStorage.getItem('all_tabs_closed') === 'true';
          const recentlyClosedTab = localStorage.getItem('recently_closed_tab');

          if (forceClosingLastTab || allTabsClosed || recentlyClosedTab) {
            return state;
          }
        }

        // 首先检查是否已有相同connectionId和sessionId的标签
        const existingTabWithSameConnection = state.tabs.find(
          t => t.connectionId === action.payload.connectionId &&
            t.sessionId === action.payload.sessionId
        );

        if (existingTabWithSameConnection) {
          // 如果已存在相同连接和会话的标签，激活它而不是创建新标签
          newState = {
            ...state,
            activeTabKey: existingTabWithSameConnection.key,
          };
          terminalStateRef.current = newState;
          return newState;
        }

        // 以下是原有的逻辑
        const existingTabIndex = state.tabs.findIndex(tab => tab.key === action.payload.key);
        let newTabs = [...state.tabs];
        let isNewTab = false;

        if (existingTabIndex >= 0) {
          // 如果标签已存在，激活它，但通常不应通过ADD_TAB来激活，而是通过SET_ACTIVE_TAB
          // 这里我们假设如果key相同，则可能是更新或重新打开的意图，所以先更新信息
          const updatedTab = {
            ...state.tabs[existingTabIndex],
            ...action.payload, // 使用新的payload覆盖，除了ref相关的可以保留旧的
            title: action.payload.title || state.tabs[existingTabIndex].title, // 确保标题更新
            isConnected: action.payload.isConnected !== undefined ? action.payload.isConnected : state.tabs[existingTabIndex].isConnected,
            terminalRef: action.payload.terminalRef || state.tabs[existingTabIndex].terminalRef,
            webSocketRef: action.payload.webSocketRef || state.tabs[existingTabIndex].webSocketRef,
            messageQueueRef: action.payload.messageQueueRef || state.tabs[existingTabIndex].messageQueueRef,
          };
          newTabs[existingTabIndex] = updatedTab;
          newState = {
            ...state,
            tabs: newTabs,
            activeTabKey: action.payload.key, // 激活这个被"重新添加/更新"的标签
          };
        } else {
          const newTabPayload = {
            ...action.payload,
            terminalRef: action.payload.terminalRef || createRef<HTMLDivElement>(),
            webSocketRef: action.payload.webSocketRef || createRef<WebSocket | null>(),
            messageQueueRef: action.payload.messageQueueRef || createRef<string[] | null>(),
            isConnected: action.payload.isConnected !== undefined ? action.payload.isConnected : false, // 初始连接状态为false
            // 确保其他从payload传递的属性被正确设置
            connectionId: action.payload.connectionId,
            sessionId: action.payload.sessionId,
            connection: action.payload.connection,
            protocol: action.payload.protocol,
            hostname: action.payload.hostname,
            port: action.payload.port,
            username: action.payload.username,
            isGraphical: action.payload.isGraphical,
            rdpSettings: action.payload.rdpSettings,
          };
          newTabs.push(newTabPayload);
          isNewTab = true;
          newState = {
            ...state,
            tabs: newTabs,
            activeTabKey: action.payload.key,
          };
        }

        terminalStateRef.current = newState;
        updateTabsInLocalStorage(newState.tabs, newState.activeTabKey);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
            detail: { tabKey: action.payload.key, isNewTab, fromReducer: true }
          }));
          if (isNewTab) {
            window.dispatchEvent(new CustomEvent('terminal-tab-added', {
              detail: { tab: action.payload, activeTabKey: action.payload.key, totalTabs: newTabs.length }
            }));
          }
        }
        return newState;
      }

      case 'UPDATE_TAB': {
        const { key, updates } = action.payload;
        const existingTabIndex = state.tabs.findIndex(tab => tab.key === key);
        if (existingTabIndex === -1) return state;
        const updatedTabs = [...state.tabs];
        updatedTabs[existingTabIndex] = { ...updatedTabs[existingTabIndex], ...updates };
        newState = { ...state, tabs: updatedTabs };
        terminalStateRef.current = newState;
        updateTabsInLocalStorage(newState.tabs, newState.activeTabKey);
        return newState;
      }

      case 'CLOSE_TAB': {
        const tabIndex = state.tabs.findIndex(tab => tab.key === action.payload);
        if (tabIndex === -1) return state;
        const closedTab = state.tabs[tabIndex];

        // 检查是否是最后一个标签
        const isLastTab = state.tabs.length === 1;
        if (isLastTab) {
          // 设置标志以防止URL变化触发标签创建
          localStorage.setItem('force_closing_last_tab', 'true');
          localStorage.setItem('all_tabs_closed', 'true');
          // 记录关闭时间，用于自动超时
          localStorage.setItem('last_tab_close_time', Date.now().toString());
          // 设置标志过期时间 - 5秒后自动失效，而不是10秒
          localStorage.setItem('closing_flags_expiry', (Date.now() + 5000).toString());

          // 立即清除标签数据，防止重新创建
          localStorage.removeItem('terminal_tabs');
          localStorage.removeItem('terminal_active_tab');
        } else {
          // 如果不是最后一个标签，只记录当前标签正在关闭
          localStorage.setItem('recently_closed_tab', action.payload);
          // 设置较短的过期时间 - 3秒后自动失效
          localStorage.setItem('closing_flags_expiry', (Date.now() + 3000).toString());
        }

        // 清理 WebSocket 等资源
        try {
          // 立即清理WebSocket连接
          if (closedTab.webSocketRef?.current) {
            console.log(`立即关闭WebSocket连接: ${action.payload} (状态: ${closedTab.webSocketRef.current.readyState})`);

            // 无论WebSocket当前状态如何，都尝试安全关闭
            try {
              // 调用安全关闭WebSocket辅助函数
              safelyCloseWebSocket(closedTab.webSocketRef.current, closedTab.sessionId);

              // 清除WebSocket引用
              closedTab.webSocketRef.current = null;
            } catch (wsError) {
              console.error(`关闭WebSocket连接时出错:`, wsError);
            }
          }
          // 执行任何自定义清理函数
          if (closedTab.cleanupRef?.current) {
            console.log(`执行自定义清理函数: ${action.payload}`);
            closedTab.cleanupRef.current();
            closedTab.cleanupRef.current = null;
          }

          // 清理会话相关的localStorage存储
          if (closedTab.sessionId) {
            // 使用安全的会话关闭函数
            closeSessionSafely(closedTab.sessionId);

            // 清理该会话的localStorage存储
            localStorage.removeItem(`session_${closedTab.sessionId}`);
          }
        } catch (e) {
          console.error(`关闭标签资源时出错 ${action.payload}:`, e);
        }

        const updatedTabs = state.tabs.filter(tab => tab.key !== action.payload);
        let newActiveTabKey = state.activeTabKey;
        if (state.activeTabKey === action.payload) {
          newActiveTabKey = updatedTabs.length > 0 ? updatedTabs[updatedTabs.length - 1].key : 'no-tabs';
        }

        // 如果这是最后一个被关闭的标签，执行更彻底的清理
        if (updatedTabs.length === 0) {

          // 清理所有标签相关的localStorage
          localStorage.removeItem('terminal_tabs');
          localStorage.removeItem('terminal_active_tab');

          // 保留recently_closed_tab标志，防止立即重新创建
          // 但设置定时器在5秒后清除
          setTimeout(() => {
            localStorage.removeItem('recently_closed_tab');
          }, 5000);

          // 设置防止自动恢复的标志
          localStorage.setItem('all_tabs_closed', 'true');
          localStorage.setItem('force_closing_last_tab', 'true');

          // 查找并清理所有会话和终端相关的存储
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.startsWith('session_') ||
              key.startsWith('terminal_') ||
              key.includes('tab-') ||
              key.includes('conn-')
            )) {
              keysToRemove.push(key);
            }
          }

          // 删除找到的所有相关键
          keysToRemove.forEach(key => {
            if (key !== 'all_tabs_closed' && key !== 'force_closing_last_tab' && key !== 'recently_closed_tab') {
              localStorage.removeItem(key);
            }
          });

          // 延迟检查并移除force_closing_last_tab标志，但保留all_tabs_closed标志
          setTimeout(() => {
            // 再次检查当前是否确实没有标签了
            if (terminalStateRef.current && terminalStateRef.current.tabs.length === 0) {
              // 标签确实已关闭，可以安全移除标志
              localStorage.removeItem('force_closing_last_tab');
            }
          }, 1000);
        } else {
          // 还有其他标签，只更新标签状态
          updateTabsInLocalStorage(updatedTabs, newActiveTabKey);
        }

        newState = { ...state, tabs: updatedTabs, activeTabKey: newActiveTabKey };
        terminalStateRef.current = newState;

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('terminal-tab-removed', {
            detail: { tabKey: action.payload, tabData: { key: closedTab.key, connectionId: closedTab.connectionId, sessionId: closedTab.sessionId, timestamp: Date.now() }, newActiveTabKey, remainingTabs: updatedTabs.length }
          }));
        }
        return newState;
      }

      case 'SET_ACTIVE_TAB': {
        if (state.activeTabKey === action.payload) return state;
        newState = { ...state, activeTabKey: action.payload };
        terminalStateRef.current = newState;
        localStorage.setItem('terminal_active_tab', action.payload);
        updateTabsInLocalStorage(state.tabs, action.payload); // 这里用 state.tabs 因为只改变 activeKey
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
            detail: { tabKey: action.payload, previousTabKey: state.activeTabKey, totalTabs: state.tabs.length }
          }));
        }
        return newState;
      }

      case 'CLEAR_TABS': {
        state.tabs.forEach(tab => {
          if (tab.sessionId) {
            closeSessionSafely(tab.sessionId);

            // 清理该会话的localStorage存储
            localStorage.removeItem(`session_${tab.sessionId}`);
          }
          try {
            if (tab.webSocketRef?.current) {
              safelyCloseWebSocket(tab.webSocketRef.current, tab.sessionId);
            }
          } catch (e) {
            console.error(`清理所有标签资源时出错:`, e);
          }
        });

        // 清理所有标签和会话相关的localStorage存储
        localStorage.removeItem('terminal_tabs');
        localStorage.removeItem('terminal_active_tab');
        localStorage.removeItem('recently_closed_tab');

        // 设置标志，防止页面刷新时重新创建标签
        localStorage.setItem('all_tabs_closed', 'true');
        localStorage.setItem('force_closing_last_tab', 'true');

        // 查找并清理所有会话和终端相关的存储
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.startsWith('session_') ||
            key.startsWith('terminal_') ||
            key.includes('tab-') ||
            key.includes('conn-')
          )) {
            keysToRemove.push(key);
          }
        }

        // 移除找到的相关键
        keysToRemove.forEach(key => {
          if (key !== 'all_tabs_closed' && key !== 'force_closing_last_tab') {
            localStorage.removeItem(key);
          }
        });

        // 延迟移除force_closing_last_tab标志，但保留all_tabs_closed标志
        setTimeout(() => {
          localStorage.removeItem('force_closing_last_tab');
        }, 1000);

        newState = { ...state, tabs: [], activeTabKey: 'no-tabs' };
        terminalStateRef.current = newState;

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('terminal-tabs-cleared', {
            detail: { timestamp: Date.now() }
          }));
        }

        return newState;
      }

      default:
        return state;
    }
  };

  const initialState: TerminalContextState = {
    tabs: [],
    activeTabKey: 'no-tabs',
  };
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    terminalStateRef.current = state;
  }, [state]);

  // 修改openOrActivateTab函数
  const openOrActivateTab = useCallback((tabData: any) => {
    // 首先检查是否处于标签关闭状态，如果是则跳过创建
    if (isTabClosingActive()) {
      return;
    }

    // 检查标签键格式，如果没有或是旧格式，重新生成
    let standardTabKey = tabData.tabKey;
    if (!standardTabKey || standardTabKey.startsWith('tab-')) {
      // 使用统一的格式重新生成标签键
      const timestamp = tabData.timestamp || Date.now();
      standardTabKey = `conn-${tabData.connectionId}-session-${tabData.sessionId}-${timestamp}`;
    }

    // 首先检查是否已存在具有相同connectionId和sessionId的标签，无论键是什么
    const existingTabBySameConnection = state.tabs.find(t =>
      t.connectionId === tabData.connectionId &&
      t.sessionId === tabData.sessionId
    );

    if (existingTabBySameConnection) {
      // 如果标签已存在，并且当前不是活动标签，则激活它
      if (state.activeTabKey !== existingTabBySameConnection.key) {
        dispatch({ type: 'SET_ACTIVE_TAB', payload: existingTabBySameConnection.key });
      }
      return;
    }

    // 然后按键检查标签是否存在
    const existingTab = state.tabs.find(t => t.key === standardTabKey);
    if (existingTab) {
      // 如果标签已存在，并且当前不是活动标签，则激活它
      if (state.activeTabKey !== standardTabKey) {
        dispatch({ type: 'SET_ACTIVE_TAB', payload: standardTabKey });
      }
    } else {
      // 再次检查标签关闭状态，确保安全
      if (isTabClosingActive()) {
        return;
      }

      // 标签不存在，创建新标签
      const newTab: TerminalTab = {
        key: standardTabKey,
        title: tabData.connectionName || '新终端',
        connectionId: tabData.connectionId,
        sessionId: tabData.sessionId,
        isConnected: false, // 初始设为未连接，连接成功后更新
        terminalRef: createRef<HTMLDivElement | null>(),
        webSocketRef: createRef<WebSocket | null>(), // WebSocket连接将在此之后建立
        messageQueueRef: createRef<Array<{ type: string; data: string | number[]; timestamp: number }> | null>(),
        protocol: tabData.connectionProtocol,
        hostname: tabData.host,
        port: tabData.port,
        username: tabData.username,
        isGraphical: tabData.connectionProtocol === 'rdp' || tabData.connectionProtocol === 'vnc',
      };

      // 先清除关闭标志，然后再添加标签
      localStorage.removeItem('all_tabs_closed');
      localStorage.removeItem('force_closing_last_tab');
      localStorage.removeItem('recently_closed_tab');

      dispatch({ type: 'ADD_TAB', payload: newTab });
    }
  }, [state.tabs, state.activeTabKey, dispatch]);

  // 监听来自OperationLayout的打开标签请求
  useEffect(() => {
    const handleOpenTerminalTab = (event: Event) => {
      const customEvent = event as CustomEvent;
      // 检查是否是强制创建模式
      const forceCreate = customEvent.detail?.forceCreate === true;

      // 如果是强制创建模式，清除所有关闭标志
      if (forceCreate) {
        clearAllTabClosingFlags();
      } else {
        // 先检查是否处于标签关闭状态
        if (isTabClosingActive()) {
          // 检查上次设置标志的时间是否超过5秒
          const lastCloseTime = parseInt(localStorage.getItem('last_tab_close_time') || '0', 10);
          const now = Date.now();

          if (now - lastCloseTime > 5000) {
            // 超过5秒，自动清除标志
            clearAllTabClosingFlags();
          }
          return;
        }
      }

      if (customEvent.detail) {
        openOrActivateTab(customEvent.detail);
      }
    };
    window.addEventListener('open-terminal-tab', handleOpenTerminalTab);
    return () => {
      window.removeEventListener('open-terminal-tab', handleOpenTerminalTab);
    };
  }, [openOrActivateTab]);

  // 页面加载时从localStorage恢复状态 (基础版，未包含WebSocket重连)
  useEffect(() => {
    // 首先清理localStorage中的旧格式标签页
    cleanupOldFormatTabs();

    // 检查是否有任何标签关闭的标志
    const forceClosingLastTab = localStorage.getItem('force_closing_last_tab') === 'true';
    const allTabsClosed = localStorage.getItem('all_tabs_closed') === 'true';

    if (forceClosingLastTab || allTabsClosed) {
      // 清除所有可能导致重新创建标签的存储
      localStorage.removeItem('terminal_tabs');
      localStorage.removeItem('terminal_active_tab');
      // 不清除关闭标志，保持该标志直到明确创建新标签
      return;
    }

    const savedTabsRaw = localStorage.getItem('terminal_tabs');
    const savedActiveTabKey = localStorage.getItem('terminal_active_tab');
    let shouldInitialize = true;

    if (state.tabs.length > 0) { // 如果Context中已有标签（例如HMR），则不从localStorage恢复
      shouldInitialize = false;
    }

    if (shouldInitialize && savedTabsRaw) {
      try {
        // 再次检查，确保在处理过程中没有设置关闭标志
        if (localStorage.getItem('force_closing_last_tab') === 'true' ||
          localStorage.getItem('all_tabs_closed') === 'true') {
          localStorage.removeItem('terminal_tabs');
          localStorage.removeItem('terminal_active_tab');
          return;
        }

        const savedTabs: any[] = JSON.parse(savedTabsRaw);
        if (Array.isArray(savedTabs) && savedTabs.length > 0) {
          const restoredTabs: TerminalTab[] = savedTabs.map(tabInfo => {
            // 检查并确保使用统一的标签格式
            let tabKey = tabInfo.key;
            // 如果是旧格式（以tab-开头），转换为新格式（conn-前缀）
            if (tabKey.startsWith('tab-') && tabInfo.connectionId && tabInfo.sessionId) {
              const timestamp = tabKey.split('-').pop() || Date.now().toString();
              tabKey = `conn-${tabInfo.connectionId}-session-${tabInfo.sessionId}-${timestamp}`;
            }

            return {
              key: tabKey,
              title: tabInfo.title || '恢复的终端',
              connectionId: tabInfo.connectionId,
              sessionId: tabInfo.sessionId,
              isConnected: false, // 恢复时总是先设为未连接
              terminalRef: createRef<HTMLDivElement | null>(),
              webSocketRef: createRef<WebSocket | null>(),
              messageQueueRef: createRef<Array<{ type: string; data: string | number[]; timestamp: number }> | null>(),
              protocol: tabInfo.protocol,
              hostname: tabInfo.hostname,
              port: tabInfo.port,
              username: tabInfo.username,
              connection: tabInfo.connection, // 恢复完整的connection对象
              isGraphical: tabInfo.protocol === 'rdp' || tabInfo.protocol === 'vnc',
              status: 'disconnected' // 恢复时的初始状态
            };
          });

          // 最终检查，确保没有设置任何关闭标志
          if (localStorage.getItem('force_closing_last_tab') === 'true' ||
            localStorage.getItem('all_tabs_closed') === 'true') {
            localStorage.removeItem('terminal_tabs');
            localStorage.removeItem('terminal_active_tab');
            return;
          }

          // 批量添加恢复的标签，但不立即激活，等待activeKey设置
          restoredTabs.forEach(tab => {
            // 直接修改initialState的副本或通过一个特殊的init action
            // 这里简单地dispatch ADD_TAB，但注意这会触发一些副作用
            // 一个更好的方法是有一个 'INITIALIZE_TABS' action
            dispatch({ type: 'ADD_TAB', payload: tab });
          });

          if (savedActiveTabKey && restoredTabs.some(tab => tab.key === savedActiveTabKey)) {
            dispatch({ type: 'SET_ACTIVE_TAB', payload: savedActiveTabKey });
          } else if (restoredTabs.length > 0) {
            dispatch({ type: 'SET_ACTIVE_TAB', payload: restoredTabs[0].key });
          }

          // 标签成功恢复后，清除all_tabs_closed标志
          localStorage.removeItem('all_tabs_closed');
        }
      } catch (error) {
        console.error("恢复标签状态失败:", error);
        localStorage.removeItem('terminal_tabs');
        localStorage.removeItem('terminal_active_tab');
      }
    }
    // WebSocket的重连逻辑需要在此之后，例如在Terminal.tsx中检测到tab.webSocketRef为空且应连接时进行
  }, [dispatch]); // 依赖dispatch，确保只在初始化时运行一次，或者在dispatch变化时（理论上不变）

  // 修改addTab函数
  const addTab = useCallback((tab: TerminalTab) => {
    // 检查是否强制创建
    const forceCreate = tab.forceCreate === true;

    // 如果是强制创建，清除所有关闭标志
    if (forceCreate) {
      clearAllTabClosingFlags();
    }
    // 如果不是强制创建，才检查关闭标志
    else if (isTabClosingActive()) {
      return;
    }

    // 确保使用统一的标签页键格式
    if (!tab.key) {
      const timestamp = Date.now();
      tab.key = `conn-${tab.connectionId}-session-${tab.sessionId}-${timestamp}`;
    } else if (tab.key.startsWith('tab-')) {
      tab.key = tab.key.replace('tab-', 'conn-');
    }

    // 清除全部标签关闭的标志
    localStorage.removeItem('all_tabs_closed');
    localStorage.removeItem('recently_closed_tab');
    localStorage.removeItem('force_closing_last_tab');
    localStorage.removeItem('closing_flags_expiry');
    localStorage.removeItem('last_tab_close_time');

    // 直接调用 openOrActivateTab 来处理添加或激活逻辑
    openOrActivateTab({
      tabKey: tab.key,
      connectionName: tab.title,
      connectionId: tab.connectionId,
      sessionId: tab.sessionId,
      connectionProtocol: tab.protocol,
      host: tab.hostname,
      port: tab.port,
      username: tab.username,
      connection: tab.connection,
      isGraphical: tab.isGraphical,
      forceCreate: forceCreate, // 传递强制创建标志
    });
  }, [openOrActivateTab]);

  const updateTab = (key: string, updates: Partial<TerminalTab>) => {
    dispatch({ type: 'UPDATE_TAB', payload: { key, updates } });
  };

  const closeTab = (key: string) => {
    const tabToClose = state.tabs.find(tab => tab.key === key);
    if (!tabToClose) return;

    // 检查是否是最后一个标签
    const isLastTab = state.tabs.length === 1;
    if (isLastTab) {
      // 设置标志以防止URL变化触发标签创建
      localStorage.setItem('force_closing_last_tab', 'true');
      localStorage.setItem('all_tabs_closed', 'true');
      // 记录关闭时间，用于自动超时
      localStorage.setItem('last_tab_close_time', Date.now().toString());
      // 设置标志过期时间 - 5秒后自动失效，而不是10秒
      localStorage.setItem('closing_flags_expiry', (Date.now() + 5000).toString());

      // 立即清除标签数据，防止重新创建
      localStorage.removeItem('terminal_tabs');
      localStorage.removeItem('terminal_active_tab');
    } else {
      // 如果不是最后一个标签，只记录当前标签正在关闭
      localStorage.setItem('recently_closed_tab', key);
      // 设置较短的过期时间 - 3秒后自动失效
      localStorage.setItem('closing_flags_expiry', (Date.now() + 3000).toString());
    }

    // 清理 WebSocket 等资源
    try {
      // 立即清理WebSocket连接
      if (tabToClose.webSocketRef?.current) {
        console.log(`立即关闭WebSocket连接: ${key} (状态: ${tabToClose.webSocketRef.current.readyState})`);

        // 无论WebSocket当前状态如何，都尝试安全关闭
        try {
          // 调用安全关闭WebSocket辅助函数
          safelyCloseWebSocket(tabToClose.webSocketRef.current, tabToClose.sessionId);

          // 清除WebSocket引用
          tabToClose.webSocketRef.current = null;
        } catch (wsError) {
          console.error(`关闭WebSocket连接时出错:`, wsError);
        }
      }
      // 执行任何自定义清理函数
      if (tabToClose.cleanupRef?.current) {
        console.log(`执行自定义清理函数: ${key}`);
        tabToClose.cleanupRef.current();
        tabToClose.cleanupRef.current = null;
      }

      // 清理会话相关的localStorage存储
      if (tabToClose.sessionId) {
        // 使用安全的会话关闭函数
        closeSessionSafely(tabToClose.sessionId);

        // 清理该会话的localStorage存储
        localStorage.removeItem(`session_${tabToClose.sessionId}`);
      }
    } catch (e) {
      console.error(`关闭标签资源时出错 ${key}:`, e);
    }

    // 延迟清理标签关闭标志，确保有足够时间处理URL变化
    setTimeout(() => {
      // 如果不是最后一个标签，清除标签关闭标志
      if (!isLastTab) {
        localStorage.removeItem('recently_closed_tab');
      }
    }, 1000);

    dispatch({ type: 'CLOSE_TAB', payload: key });
  };

  const setActiveTab = useCallback((key: string) => {
    if (state.activeTabKey === key && state.tabs.some(t => t.key === key)) return;
    const tabExists = state.tabs.some(tab => tab.key === key);
    if (!tabExists && state.tabs.length > 0) {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: state.tabs[0].key });
      return;
    }
    if (tabExists) {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: key });
    }
  }, [state.activeTabKey, state.tabs, dispatch]);

  const clearTabs = () => {
    // 清理每个标签的资源和会话
    state.tabs.forEach(tab => {
      if (tab.sessionId) {
        closeSessionSafely(tab.sessionId);

        // 清理该会话的localStorage存储
        localStorage.removeItem(`session_${tab.sessionId}`);
      }
      try {
        if (tab.webSocketRef?.current) {
          safelyCloseWebSocket(tab.webSocketRef.current, tab.sessionId);
        }
      } catch (e) {
        console.error(`清理所有标签资源时出错:`, e);
      }
    });

    // 清理所有标签和会话相关的localStorage存储
    localStorage.removeItem('terminal_tabs');
    localStorage.removeItem('terminal_active_tab');
    localStorage.removeItem('recently_closed_tab');

    // 设置标志，防止页面刷新时重新创建标签
    localStorage.setItem('all_tabs_closed', 'true');
    localStorage.setItem('force_closing_last_tab', 'true');

    // 查找并清理所有会话和终端相关的存储
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('session_') ||
        key.startsWith('terminal_') ||
        key.includes('tab-') ||
        key.includes('conn-')
      )) {
        keysToRemove.push(key);
      }
    }

    // 移除找到的相关键
    keysToRemove.forEach(key => {
      if (key !== 'all_tabs_closed' && key !== 'force_closing_last_tab') {
        localStorage.removeItem(key);
      }
    });

    // 延迟移除force_closing_last_tab标志，但保留all_tabs_closed标志
    setTimeout(() => {
      localStorage.removeItem('force_closing_last_tab');
    }, 1000);

    dispatch({ type: 'CLEAR_TABS' });
  };

  const contextValue = {
    state,
    addTab, // 保持addTab接口，但内部调用新的处理函数
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
  messageQueueRef: RefObject<any[]>;
  webSocketRef: RefObject<WebSocket>;
}
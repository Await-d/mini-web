/*
 * @Author: Await
 * @Date: 2025-05-09 18:05:28
 * @LastEditors: Await
 * @LastEditTime: 2025-05-25 19:53:33
 * @Description: 终端连接包装器组件
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { TerminalConnectionWrapperProps, ConnectionChildProps, Connection } from '../Terminal.d';
import { connectionAPI, sessionAPI, API_BASE_URL } from '../../../services/api';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import webSocketService from '../services/WebSocketService';
import type { WebSocketEventHandlers } from '../services/WebSocketService';

/**
 * 终端连接包装器组件
 * 
 * 负责连接管理和状态维护，将所有连接状态和操作传递给子组件
 */
const TerminalConnectionWrapper: React.FC<TerminalConnectionWrapperProps> = ({
  children,
  connectionParams
}) => {
  const navigate = useNavigate();
  const { state, addTab, updateTab, closeTab, setActiveTab } = useTerminal();
  const { tabs, activeTabKey } = state;
  const [connection, setConnection] = useState<Connection | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [terminalSize, setTerminalSize] = useState({ cols: 80, rows: 24 });
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [terminalMode, setTerminalMode] = useState('normal');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 连接状态跟踪
  const connectionState = useRef({
    connecting: false,
    connected: false,
    connectionId: null as number | null,
    sessionId: null as number | null,
    fetchingConnection: false
  });

  // 从connectionParams中获取连接ID和会话ID
  const connectionId = connectionParams?.connectionId;
  const sessionId = connectionParams?.sessionId;

  // 处理全屏切换
  const toggleFullscreen = () => {
    setFullscreen(prev => !prev);
  };

  // 获取连接信息
  const fetchConnection = async (connId: number) => {
    // 避免重复获取
    if (connectionState.current.fetchingConnection) {
      return;
    }

    // 标记为正在获取
    connectionState.current.fetchingConnection = true;

    try {
      const response = await connectionAPI.getConnection(connId);
      if (response.data.code === 200) {
        const connData = response.data.data;
        setConnection(connData);
        return connData;
      } else {
        message.error(response.data.message || '获取连接信息失败');
        return null;
      }
    } catch (error) {
      console.error('获取连接信息出错:', error);
      message.error('获取连接信息出错');
      return null;
    } finally {
      // 标记为已完成获取
      connectionState.current.fetchingConnection = false;
    }
  };

  // 创建WebSocket连接
  const createWsConnection = useCallback((sessionId: number | string, tabKey: string): WebSocket | null => {
    if (!sessionId) {
      console.error('无法创建WebSocket连接: 缺少sessionId');
      message.error('终端连接失败：会话ID不存在');
      return null;
    }

    try {
      // 查找对应的标签页，获取连接信息
      const tab = terminalStateRef.current?.tabs.find(t => t.key === tabKey);
      if (!tab) {
        console.error('无法创建WebSocket连接: 找不到对应的标签页');
        return null;
      }

      // 创建消息队列和处理器
      const messageQueue: any[] = [];
      let isProcessing = false;

      // 处理消息队列中的消息
      const processMessageQueue = async () => {
        if (isProcessing || messageQueue.length === 0) return;

        isProcessing = true;

        try {
          // 获取队列中的第一条消息
          const message = messageQueue.shift();

          // 处理消息内容
          await processMessage(message, tabKey);

          // 处理完一条消息后，如果队列中还有消息，继续处理
          if (messageQueue.length > 0) {
            setTimeout(processMessageQueue, 5); // 添加短暂延迟，防止UI阻塞
          }
        } catch (error) {
          console.error(`处理消息队列时出错: ${tabKey}`, error);
        } finally {
          isProcessing = false;

          // 如果队列中还有消息，继续处理
          if (messageQueue.length > 0) {
            setTimeout(processMessageQueue, 5);
          }
        }
      };

      // 设置WebSocket事件处理器
      const handlers: WebSocketEventHandlers = {
        onOpen: (ws: WebSocket) => {
          console.log(`WebSocket连接已打开: ${tabKey}`);
          setIsConnected(true);

          // 更新标签页状态
          updateTab(tabKey, {
            status: 'connected',
            webSocketRef: { current: ws }
          });

          // 触发连接事件
          window.dispatchEvent(new CustomEvent('terminal-ws-connected', {
            detail: { tabKey, sessionId, connectionId }
          }));
        },

        onMessage: (event: MessageEvent) => {
          // 处理消息队列
          messageQueue.push(event.data);
          processMessageQueue();
        },

        onClose: () => {
          console.log(`WebSocket连接已关闭: ${tabKey}`);
          setIsConnected(false);

          // 更新标签页状态
          updateTab(tabKey, {
            status: 'disconnected',
            webSocketRef: { current: null }
          });

          // 触发断开事件
          window.dispatchEvent(new CustomEvent('terminal-ws-disconnected', {
            detail: { tabKey }
          }));
        },

        onError: (event: Event) => {
          console.error(`WebSocket连接错误: ${tabKey}`, event);
          setIsConnected(false);

          // 更新标签页状态
          updateTab(tabKey, {
            status: 'error',
            webSocketRef: { current: null }
          });

          // 触发错误事件
          window.dispatchEvent(new CustomEvent('terminal-ws-error', {
            detail: { tabKey, error: event }
          }));
        }
      };

      // 使用WebSocketService创建连接
      const ws = webSocketService.connect(tab, handlers);

      if (!ws) {
        console.error('WebSocketService创建连接失败');
        return null;
      }

      // 处理单条消息
      const processMessage = async (data: any, tabKey: string) => {
        try {
          // 如果数据是Blob类型，需要先转换为文本
          if (data instanceof Blob) {
            data = await data.text();
          }

          // 尝试解析JSON
          if (typeof data === 'string') {
            try {
              // 预处理字符串，修复常见JSON格式错误
              let processedData = data;

              // 修复1: 处理多余的花括号
              if (processedData.endsWith('}}') && processedData.split('{').length === processedData.split('}').length) {
                processedData = processedData.slice(0, -1);
                console.log(`修复了多余的花括号: ${tabKey}`);
              }

              // 修复2: 处理"datta"拼写错误
              processedData = processedData.replace(/"datta":/g, '"data":');

              const jsonData = JSON.parse(processedData);
              // 处理JSON数据
              console.log(`收到WebSocket消息(JSON): ${tabKey}`, jsonData);

              // 在这里处理特定类型的消息
              if (jsonData.type === 'terminal_data') {
                // 处理终端数据
              } else if (jsonData.type === 'status') {
                // 处理状态更新
              }

              // 触发消息处理事件，让终端组件处理
              window.dispatchEvent(new CustomEvent('terminal-message', {
                detail: {
                  tabKey,
                  data: jsonData,
                  dataType: 'json'
                }
              }));
            } catch (jsonError) {
              // 如果不是JSON格式，按照原始文本处理
              console.log(`收到WebSocket消息(文本): ${tabKey}`, data);

              // 触发消息处理事件，让终端组件处理
              window.dispatchEvent(new CustomEvent('terminal-message', {
                detail: {
                  tabKey,
                  data: data,
                  dataType: 'text'
                }
              }));
            }
          } else {
            // 处理其他类型数据
            console.log(`收到WebSocket消息(其他类型): ${tabKey}`, typeof data);

            // 触发消息处理事件，让终端组件处理
            window.dispatchEvent(new CustomEvent('terminal-message', {
              detail: {
                tabKey,
                data: data,
                dataType: 'other',
                dataTypeName: typeof data
              }
            }));
          }
        } catch (error) {
          console.error(`处理WebSocket消息时出错: ${tabKey}`, error);
        }
      };

      return ws;
    } catch (error) {
      console.error(`创建WebSocket连接时出错: ${error}`);
      message.error('终端连接失败：' + (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }, [updateTab]);

  // 向服务器发送数据
  const sendDataToServer = (data: string): boolean => {
    const activeTab = tabs.find(tab => tab.key === activeTabKey);
    if (!activeTab || !activeTab.webSocketRef || !activeTab.webSocketRef.current) {
      console.error('无法发送数据: WebSocket未连接或标签不存在');
      return false;
    }

    try {
      activeTab.webSocketRef.current.send(data);
      return true;
    } catch (error) {
      console.error('发送数据失败:', error);
      return false;
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 清除定时器
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // 准备传递给子组件的props
  const connectionProps: ConnectionChildProps = {
    // 基本连接状态
    hasConnection: !!connection,
    tabsCount: tabs.length,
    activeTabKey,
    isConnected,

    // 核心数据
    tabs,
    connection: connection || undefined,

    // UI状态
    fullscreen,
    terminalSize,
    networkLatency,
    terminalMode,
    sidebarCollapsed,

    // 功能方法
    toggleFullscreen,
    sendDataToServer,
    createWebSocketConnection: createWsConnection
  };

  // 渲染子组件
  return children(connectionProps);
};

export default TerminalConnectionWrapper;
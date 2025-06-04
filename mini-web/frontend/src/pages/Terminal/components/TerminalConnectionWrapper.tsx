/*
 * @Author: Await
 * @Date: 2025-05-09 18:05:28
 * @LastEditors: Await
 * @LastEditTime: 2025-06-02 18:40:23
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

  // 监听心跳延迟事件
  useEffect(() => {
    const handleHeartbeatLatency = (event: CustomEvent) => {
      const { tabKey, latency } = event.detail;

      // 更新对应标签的网络延迟
      updateTab(tabKey, { networkLatency: latency });

      // 如果是当前活动标签，也更新本地状态
      if (tabKey === activeTabKey) {
        setNetworkLatency(latency);
      }
    };

    window.addEventListener('terminal-heartbeat-latency', handleHeartbeatLatency as EventListener);

    return () => {
      window.removeEventListener('terminal-heartbeat-latency', handleHeartbeatLatency as EventListener);
    };
  }, [updateTab, activeTabKey]);

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

        onMessage: (event: MessageEvent & { protocolMessage?: any; isBinaryProtocol?: boolean; isLegacyJson?: boolean; isRawBinary?: boolean }) => {
          console.log(`🎯 [${tabKey}] 接收到WebSocket消息:`, {
            isBinaryProtocol: event.isBinaryProtocol,
            isLegacyJson: event.isLegacyJson,
            isRawBinary: event.isRawBinary,
            dataType: typeof event.data,
            protocolMessageType: event.protocolMessage?.header?.messageType
          });

          // 对于已经解析过的消息，添加标记信息
          const messageData = {
            data: event.data,
            isBinaryProtocol: event.isBinaryProtocol,
            isLegacyJson: event.isLegacyJson,
            isRawBinary: event.isRawBinary,
            protocolMessage: event.protocolMessage
          };

          messageQueue.push(messageData);
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
      const processMessage = async (messageData: any, tabKey: string) => {
        try {
          // 检查是否为新的消息格式（带有标记信息）
          let data: any;
          let isBinaryProtocol = false;
          let isLegacyJson = false;
          let isRawBinary = false;

          if (messageData && typeof messageData === 'object' && messageData.data !== undefined) {
            // 新格式：包含标记信息
            data = messageData.data;
            isBinaryProtocol = messageData.isBinaryProtocol;
            isLegacyJson = messageData.isLegacyJson;
            isRawBinary = messageData.isRawBinary;

            console.log(`📨 [${tabKey}] 收到带标记的消息:`, {
              type: typeof data,
              isBinaryProtocol,
              isLegacyJson,
              isRawBinary,
              dataPreview: typeof data === 'string' ? `"${data.substring(0, 50)}${data.length > 50 ? '...' : ''}"` : data
            });
          } else {
            // 旧格式：直接数据
            data = messageData;
            console.log(`📨 [${tabKey}] 收到原始数据:`, {
              type: typeof data,
              isBlob: data instanceof Blob,
              isArrayBuffer: data instanceof ArrayBuffer,
              isString: typeof data === 'string',
              isObject: typeof data === 'object',
              data: data
            });
          }

          // 如果数据是Blob类型，需要先转换为文本
          if (data instanceof Blob) {
            console.log(`🔄 [${tabKey}] 转换Blob为文本, 大小: ${data.size} bytes`);
            data = await data.text();
            console.log(`✅ [${tabKey}] Blob转换后的文本:`, data);
          }

          // 对于二进制协议解析后的终端数据，直接作为终端输出处理
          if (isBinaryProtocol && typeof data === 'string') {
            console.log(`🚀 [${tabKey}] 二进制协议终端输出, 长度: ${data.length}, 内容: "${data}"`);
            // 直接作为终端输出，不尝试JSON解析
            window.dispatchEvent(new CustomEvent('terminal-message', {
              detail: {
                tabKey,
                data: data,
                dataType: 'terminal-output'
              }
            }));
            return;
          }

          // 处理其他类型的数据
          if (typeof data === 'string') {
            console.log(`📝 [${tabKey}] 处理字符串数据, 长度: ${data.length}, 内容预览: "${data.substring(0, 100)}${data.length > 100 ? '...' : ''}"`);

            // 字符串数据 - 可能是终端输出或JSON
            try {
              // 尝试解析为JSON
              console.log(`🔍 [${tabKey}] 尝试解析为JSON...`);
              const jsonData = JSON.parse(data);
              console.log(`✅ [${tabKey}] 成功解析为JSON:`, jsonData);

              // 处理特殊命令等JSON消息
              if (jsonData.type === 'special_command') {
                console.log(`🔥 [${tabKey}] 检测到特殊命令: ${jsonData.command || jsonData.message}`);
                // 触发特殊命令事件
                window.dispatchEvent(new CustomEvent('terminal-special-command', {
                  detail: { tabKey, ...jsonData }
                }));
                console.log(`🚀 [${tabKey}] 特殊命令事件已触发`);
                return; // 特殊命令消息不显示在终端
              }

              // 其他JSON消息
              console.log(`📤 [${tabKey}] 发送JSON消息事件:`, jsonData);
              window.dispatchEvent(new CustomEvent('terminal-message', {
                detail: {
                  tabKey,
                  data: jsonData,
                  dataType: 'json'
                }
              }));
            } catch (jsonError: any) {
              console.log(`❌ [${tabKey}] JSON解析失败, 作为普通文本处理:`, jsonError?.message || jsonError);
              console.log(`📤 [${tabKey}] 发送文本消息事件, 内容: "${data}"`);

              // 不是JSON，作为普通文本处理（终端输出）
              window.dispatchEvent(new CustomEvent('terminal-message', {
                detail: {
                  tabKey,
                  data: data,
                  dataType: 'text'
                }
              }));
            }
          } else if (typeof data === 'object' && data !== null) {
            console.log(`🔧 [${tabKey}] 处理对象数据:`, data);

            // 已解析的对象数据
            if (data.type === 'special_command') {
              console.log(`🔥 [${tabKey}] 检测到对象形式的特殊命令: ${data.command || data.message}`);
              // 触发特殊命令事件
              window.dispatchEvent(new CustomEvent('terminal-special-command', {
                detail: { tabKey, ...data }
              }));
              console.log(`🚀 [${tabKey}] 特殊命令事件已触发`);
              return; // 特殊命令消息不显示在终端
            }

            // 其他对象数据
            console.log(`📤 [${tabKey}] 发送对象消息事件:`, data);
            window.dispatchEvent(new CustomEvent('terminal-message', {
              detail: {
                tabKey,
                data: data,
                dataType: 'object'
              }
            }));
          } else {
            // 其他类型数据
            console.log(`❓ [${tabKey}] 收到未知类型数据:`, {
              type: typeof data,
              data: data
            });
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
          console.error(`❌ [${tabKey}] 处理WebSocket消息时出错:`, error);
          console.error(`❌ [${tabKey}] 出错时的原始数据:`, messageData);
        }
      };

      return ws;
    } catch (error) {
      console.error(`创建WebSocket连接时出错: ${error}`);
      message.error('终端连接失败：' + (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }, [updateTab]);

  // 向服务器发送数据（使用二进制协议）
  const sendDataToServer = async (data: string): Promise<boolean> => {
    const activeTab = tabs.find(tab => tab.key === activeTabKey);
    if (!activeTab) {
      console.error('无法发送数据: 找不到活动标签');
      return false;
    }

    try {
      // 使用WebSocketService的sendData方法，自动启用二进制协议
      const success = await webSocketService.sendData(activeTab, data, true);
      if (success) {
        console.log(`通过二进制协议发送数据: ${data.length} 字符`);
      } else {
        console.warn('二进制协议发送失败，可能回退到传统模式');
      }
      return success;
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
/*
 * @Author: Await
 * @Date: 2025-05-19 10:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-19 10:30:00
 * @Description: 统一的WebSocket连接Hook，基于WebSocketService
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { WebSocketService } from '../services/WebSocketService';

/**
 * WebSocket连接Hook
 * 基于WebSocketService实现，提供React组件友好的接口
 * @param tab 终端标签对象
 * @param customHandlers 自定义处理函数 (可选)
 */
export const useWebSocketConnection = (
  tab: TerminalTab,
  customHandlers?: {
    onOpen?: () => void;
    onMessage?: (event: MessageEvent) => void;
    onClose?: () => void;
    onError?: (event: Event) => void;
  }
) => {
  // 状态
  const [isConnected, setIsConnected] = useState(false);
  const [latestActivityTime, setLatestActivityTime] = useState(0);

  // 监听器引用 - 用于在cleanup时移除
  const listenersRef = useRef<{
    onOpen?: (ws: WebSocket) => void;
    onMessage?: (event: MessageEvent) => void;
    onClose?: () => void;
    onError?: (event: Event) => void;
  }>({});

  // 更新自定义处理函数
  useEffect(() => {
    listenersRef.current = customHandlers || {};
  }, [customHandlers]);

  // 监控连接状态
  useEffect(() => {
    // 如果标签无效，直接返回
    if (!tab || !tab.key) return;

    // 获取WebSocket实例 (如果已存在连接将复用)
    const ws = WebSocketService.connect(tab);

    if (ws) {
      // 保存原始处理函数
      const originalOnOpen = ws.onopen;
      const originalOnMessage = ws.onmessage;
      const originalOnClose = ws.onclose;
      const originalOnError = ws.onerror;

      // 设置新的处理函数
      ws.onopen = (event) => {
        // 调用原始处理函数
        if (originalOnOpen) {
          // @ts-ignore - 处理不同的事件处理器接口
          originalOnOpen.call(ws, event);
        }

        // 更新状态
        setIsConnected(true);
        setLatestActivityTime(Date.now());

        // 调用自定义处理函数
        listenersRef.current.onOpen?.(ws);
      };

      ws.onmessage = (event) => {
        // 调用原始处理函数
        if (originalOnMessage) {
          // @ts-ignore
          originalOnMessage.call(ws, event);
        }

        // 更新活动时间
        setLatestActivityTime(Date.now());

        // 调用自定义处理函数 (如果有)
        if (listenersRef.current.onMessage) {
          listenersRef.current.onMessage(event);
        }
      };

      ws.onclose = (event) => {
        // 调用原始处理函数
        if (originalOnClose) {
          // @ts-ignore
          originalOnClose.call(ws, event);
        }

        // 更新状态
        setIsConnected(false);

        // 调用自定义处理函数
        listenersRef.current.onClose?.();
      };

      ws.onerror = (event) => {
        // 调用原始处理函数
        if (originalOnError) {
          // @ts-ignore
          originalOnError.call(ws, event);
        }

        // 调用自定义处理函数
        listenersRef.current.onError?.(event);
      };
    }

    // 清理函数 - 组件卸载或tab变化时调用
    return () => {
      // 只有在存在有效的标签键时才关闭连接
      if (tab && tab.key) {
        WebSocketService.closeConnection(tab.key);
      }
    };
  }, [tab?.key]); // 只在标签键变化时重新建立连接

  // 封装发送数据的方法
  const sendData = useCallback((data: string | ArrayBuffer | Blob): boolean => {
    if (!tab) return false;
    return WebSocketService.sendData(tab, data);
  }, [tab]);

  // 重新连接
  const reconnect = useCallback(() => {
    if (!tab) return;
    WebSocketService.refreshConnection(tab);
  }, [tab]);

  // 返回接口
  return {
    isConnected,
    latestActivityTime,
    sendData,
    reconnect
  };
};

export default useWebSocketConnection;
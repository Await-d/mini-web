/*
 * @Author: Await
 * @Date: 2025-05-25 11:45:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-25 11:45:00
 * @Description: WebSocket适配器Hook
 */

import { useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { WebSocketEventHandlers } from '../services/WebSocketService';

/**
 * WebSocket适配器Hook
 * 用于转换不同类型的WebSocket连接函数
 */
export const useWebSocketAdapter = () => {
    /**
     * 适配Context的createWebSocketConnection函数到WebSocketManager期望的格式
     * @param createContextWebSocket Context的WebSocket创建函数
     * @returns 适配后的WebSocket创建函数
     */
    const adaptContextToManagerWebSocket = useCallback(
        (createContextWebSocket?: (sessionId: string | number, tabKey: string) => WebSocket | null) => {
            if (!createContextWebSocket) return undefined;

            // 返回适配后的函数
            return (tab: TerminalTab, handlers?: WebSocketEventHandlers): WebSocket | null => {
                if (!tab.sessionId) return null;

                // 调用Context的WebSocket创建函数
                const ws = createContextWebSocket(tab.sessionId, tab.key);

                // 如果创建成功且有处理函数，添加事件处理器
                if (ws && handlers) {
                    // 添加处理函数
                    if (handlers.onOpen) {
                        const originalOnOpen = ws.onopen;
                        ws.onopen = (event) => {
                            // 先调用原始处理函数
                            if (originalOnOpen) {
                                originalOnOpen.call(ws, event);
                            }
                            // 再调用适配的处理函数
                            handlers.onOpen!(ws);
                        };
                    }

                    if (handlers.onMessage) {
                        const originalOnMessage = ws.onmessage;
                        ws.onmessage = (event) => {
                            // 先调用原始处理函数
                            if (originalOnMessage) {
                                originalOnMessage.call(ws, event);
                            }
                            // 再调用适配的处理函数
                            handlers.onMessage!(event);
                        };
                    }

                    if (handlers.onClose) {
                        const originalOnClose = ws.onclose;
                        ws.onclose = (event) => {
                            // 先调用原始处理函数
                            if (originalOnClose) {
                                originalOnClose.call(ws, event);
                            }
                            // 再调用适配的处理函数
                            handlers.onClose!();
                        };
                    }

                    if (handlers.onError) {
                        const originalOnError = ws.onerror;
                        ws.onerror = (event) => {
                            // 先调用原始处理函数
                            if (originalOnError) {
                                originalOnError.call(ws, event);
                            }
                            // 再调用适配的处理函数
                            handlers.onError!(event);
                        };
                    }
                }

                return ws;
            };
        },
        []
    );

    /**
     * 适配Manager的closeConnection函数到Context期望的格式
     * @param closeManagerWebSocket Manager的WebSocket关闭函数
     * @returns 适配后的WebSocket关闭函数
     */
    const adaptManagerToContextCloseWebSocket = useCallback(
        (closeManagerWebSocket?: (tabKey: string) => void) => {
            if (!closeManagerWebSocket) return undefined;

            // 返回适配后的函数
            return (tabKey: string): void => {
                closeManagerWebSocket(tabKey);
            };
        },
        []
    );

    return {
        adaptContextToManagerWebSocket,
        adaptManagerToContextCloseWebSocket
    };
};

export default useWebSocketAdapter; 
/*
 * @Author: Await
 * @Date: 2025-05-09 17:49:44
 * @LastEditors: Await
 * @LastEditTime: 2025-05-18 10:30:14
 * @Description: WebSocket管理钩子 - WebSocketService的React Hook封装
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import { writeColorText } from '../utils/terminalUtils';
import { WebSocketService } from '../services/WebSocketService';

// 扩展TerminalTab接口以支持lastActivityTime和isGraphical属性
declare module '../../../contexts/TerminalContext' {
    interface TerminalTab {
        lastActivityTime?: number;
        isGraphical?: boolean;
    }
}

/**
 * 快速重连函数 - 导出以便外部调用
 */
export const quickReconnect = (tab?: TerminalTab) => {
    if (!tab && terminalStateRef.current) {
        // 尝试获取活动标签页
        const activeTab = terminalStateRef.current.tabs.find(
            t => t.key === terminalStateRef.current?.activeTabKey
        );
        if (activeTab) {
            console.log('【WebSocket】执行快速重连', activeTab.key);
            WebSocketService.refreshConnection(activeTab);
        }
    } else if (tab) {
        WebSocketService.refreshConnection(tab);
    }
};

/**
 * WebSocket管理器Hook - WebSocketService的React封装
 * 提供React状态和方法，内部调用WebSocketService
 */
export const useWebSocketManager = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [latestActivityTime, setLatestActivityTime] = useState(0);
    // 保留这些ref用于跟踪状态，与原API兼容
    const connectingRef = useRef<Set<string>>(new Set());
    const reconnectTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

    // 封装writeColorText以处理类型兼容性
    const writeTerminalText = useCallback((tab: TerminalTab, color: string, text: string) => {
        if (tab.xtermRef?.current) {
            writeColorText(tab.xtermRef.current, text, color);
        }
    }, []);

    /**
     * 创建WebSocket连接
     * 现在是WebSocketService.connect的封装
     */
    const createWebSocketConnection = useCallback((tab: TerminalTab, onOpen?: () => void, onMessage?: (event: MessageEvent) => void, onClose?: () => void) => {
        if (!tab.connectionId || !tab.sessionId) {
            if (tab.xtermRef?.current) {
                writeTerminalText(tab, 'red', '错误: 缺少必要的连接参数\r\n');
            }
            return null;
        }

        // 记录自定义回调
        const tabKey = tab.key;
        const customCallbacks = {
            onOpen,
            onMessage,
            onClose
        };

        // 存储到全局Map中，以便在事件中调用
        if (!window._webSocketCallbacks) {
            window._webSocketCallbacks = new Map();
        }
        window._webSocketCallbacks.set(tabKey, customCallbacks);

        // 创建定制的协议处理器
        const customHandler = {
            handleMessage: (t: TerminalTab, event: MessageEvent) => {
                // 如果有自定义onMessage，则调用
                const callbacks = window._webSocketCallbacks?.get(t.key);
                if (callbacks?.onMessage) {
                    callbacks.onMessage(event);
                }
            },
            handleOpen: (t: TerminalTab) => {
                // 更新Hook状态
                setIsConnected(true);

                // 如果有自定义onOpen，则调用
                const callbacks = window._webSocketCallbacks?.get(t.key);
                if (callbacks?.onOpen) {
                    callbacks.onOpen();
                }
            },
            handleClose: (t: TerminalTab) => {
                // 更新Hook状态
                setIsConnected(false);

                // 如果有自定义onClose，则调用
                const callbacks = window._webSocketCallbacks?.get(t.key);
                if (callbacks?.onClose) {
                    callbacks.onClose();
                }
            }
        };

        // 记录连接中状态
        connectingRef.current.add(tab.key);

        // 调用WebSocketService创建连接
        const ws = WebSocketService.connect(tab);

        // 如果创建成功，返回WS对象
        if (ws) {
            return ws;
        }

        // 创建失败，清理状态
        connectingRef.current.delete(tab.key);
        return null;
    }, [writeTerminalText]);

    /**
     * 关闭WebSocket连接
     * WebSocketService.closeConnection的封装
     */
    const closeWebSocketConnection = useCallback((tab: TerminalTab) => {
        // 清除自定义回调
        window._webSocketCallbacks?.delete(tab.key);

        // 清除本地状态
        connectingRef.current.delete(tab.key);
        if (reconnectTimersRef.current[tab.key]) {
            clearTimeout(reconnectTimersRef.current[tab.key]);
            delete reconnectTimersRef.current[tab.key];
        }

        // 调用服务关闭连接
        WebSocketService.closeConnection(tab.key);
    }, []);

    /**
     * 关闭所有WebSocket连接
     * WebSocketService.closeAllConnections的封装
     */
    const closeAllConnections = useCallback(() => {
        // 清除所有自定义回调
        if (window._webSocketCallbacks) {
            window._webSocketCallbacks.clear();
        }

        // 清除本地状态
        connectingRef.current.clear();
        Object.keys(reconnectTimersRef.current).forEach(key => {
            clearTimeout(reconnectTimersRef.current[key]);
            delete reconnectTimersRef.current[key];
        });

        // 调用服务关闭所有连接
        WebSocketService.closeAllConnections();
    }, []);

    /**
     * 向WebSocket发送数据
     * WebSocketService.sendData的封装
     */
    const sendData = useCallback((tab: TerminalTab, data: string | ArrayBuffer | Blob) => {
        // 调用服务发送数据
        const success = WebSocketService.sendData(tab, data);

        // 如果发送成功，更新活动时间
        if (success && tab.lastActivityTime) {
            setLatestActivityTime(tab.lastActivityTime);
        }

        return success;
    }, []);

    /**
     * 检查WebSocket状态
     */
    const checkWebSocketState = useCallback((tab: TerminalTab) => {
        if (!tab.webSocketRef?.current) {
            return 'CLOSED';
        }

        const readyState = tab.webSocketRef.current.readyState;
        switch (readyState) {
            case WebSocket.CONNECTING:
                return 'CONNECTING';
            case WebSocket.OPEN:
                return 'OPEN';
            case WebSocket.CLOSING:
                return 'CLOSING';
            case WebSocket.CLOSED:
                return 'CLOSED';
            default:
                return 'UNKNOWN';
        }
    }, []);

    // 定期更新连接状态
    useEffect(() => {
        const updateActivityInterval = setInterval(() => {
            // 获取当前活动标签
            const activeTab = terminalStateRef.current?.tabs.find(
                t => t.key === terminalStateRef.current?.activeTabKey
            );

            if (activeTab) {
                // 获取连接状态
                const status = WebSocketService.getConnectionStatus(activeTab.key);
                // 更新React状态
                setIsConnected(status.isConnected);
                setLatestActivityTime(status.lastActivityTime);
            }
        }, 2000);

        return () => {
            clearInterval(updateActivityInterval);
        };
    }, []);

    return {
        isConnected,
        latestActivityTime,
        createWebSocketConnection,
        closeWebSocketConnection,
        closeAllConnections,
        sendData,
        checkWebSocketState,
        // 添加setIsConnected以便外部组件可以更新连接状态
        setIsConnected
    };
};

// 为自定义回调扩展Window接口
declare global {
    interface Window {
        _webSocketCallbacks?: Map<string, {
            onOpen?: () => void;
            onMessage?: (event: MessageEvent) => void;
            onClose?: () => void;
        }>;
    }
}

export default useWebSocketManager;

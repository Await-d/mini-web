/*
 * @Author: Await
 * @Date: 2025-05-09 17:49:44
 * @LastEditors: Await
 * @LastEditTime: 2025-05-18 17:55:18
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
     * 支持两种调用方式:
     * 1. createWebSocketConnection(tab) - 直接传递标签对象
     * 2. createWebSocketConnection(connectionId, sessionId, tabKey) - 传递参数
     */
    const createWebSocketConnection = useCallback((
        tabOrConnectionId: TerminalTab | number,
        sessionId?: number,
        tabKey?: string
    ) => {
        let tab: TerminalTab | undefined;

        // 检查第一个参数是否是标签对象
        if (typeof tabOrConnectionId === 'object') {
            tab = tabOrConnectionId;
            tabKey = tab.key;
        } else if (typeof tabOrConnectionId === 'number' && typeof sessionId === 'number' && tabKey) {
            // 查找对应的标签
            tab = terminalStateRef.current?.tabs.find(t => t.key === tabKey);

            // 如果没有找到标签，但有连接ID和会话ID，尝试通过这些信息查找
            if (!tab) {
                tab = terminalStateRef.current?.tabs.find(t =>
                    t.connectionId === tabOrConnectionId &&
                    t.sessionId === sessionId
                );
            }

            // 如果仍然没有找到标签，尝试从活动标签获取
            if (!tab && terminalStateRef.current?.activeTabKey) {
                const activeTab = terminalStateRef.current.tabs.find(t =>
                    t.key === terminalStateRef.current?.activeTabKey
                );
                if (activeTab) {
                    console.warn(`通过tabKey=${tabKey}未找到标签，使用活动标签: ${activeTab.key}`);
                    tab = activeTab;
                    tabKey = activeTab.key;
                }
            }
        }

        if (!tab) {
            console.error(`找不到标签: ${tabKey || 'undefined'}, 连接ID: ${typeof tabOrConnectionId === 'number' ? tabOrConnectionId : 'N/A'
                }, 会话ID: ${sessionId || 'undefined'}`);

            // 如果找不到标签但有足够的信息，可以考虑创建新标签
            if (typeof tabOrConnectionId === 'number' && sessionId) {
                console.log('未找到标签，将在下次渲染时重试');
                // 延迟执行，期望下一次渲染后标签已创建
                setTimeout(() => {
                    createWebSocketConnection(tabOrConnectionId, sessionId, tabKey);
                }, 1000);
            }
            return null;
        }

        // 更新标签连接信息（如果是通过参数调用的情况）
        if (typeof tabOrConnectionId === 'number') {
            tab.connectionId = tabOrConnectionId;
            if (sessionId) tab.sessionId = sessionId;
        }

        // 检查是否已经有活跃连接
        if (tab.webSocketRef?.current) {
            const readyState = tab.webSocketRef.current.readyState;
            if (readyState === WebSocket.CONNECTING || readyState === WebSocket.OPEN) {
                console.log(`标签 ${tab.key} 已有活跃WebSocket连接(状态: ${readyState})，跳过创建`);
                return tab.webSocketRef.current;
            } else {
                // 如果连接已关闭或正在关闭，清理它
                console.log(`标签 ${tab.key} 的WebSocket连接已关闭或正在关闭(状态: ${readyState})，将创建新连接`);
                try {
                    tab.webSocketRef.current.close();
                    tab.webSocketRef.current = null;
                } catch (e) {
                    console.warn('关闭旧WebSocket连接失败:', e);
                }
            }
        }

        // 调用WebSocketService创建连接
        console.log(`创建WebSocket连接: connectionId=${tab.connectionId}, sessionId=${tab.sessionId}, tabKey=${tab.key}`);
        const ws = WebSocketService.connect(tab);

        if (ws) {
            console.log(`WebSocket连接创建成功: ${tab.key}`);
            // 确保更新标签的WebSocketRef
            if (!tab.webSocketRef) {
                tab.webSocketRef = { current: null };
            }
            tab.webSocketRef.current = ws;
        } else {
            console.error(`WebSocket连接创建失败: ${tab.key}`);
        }

        return ws;
    }, []);

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

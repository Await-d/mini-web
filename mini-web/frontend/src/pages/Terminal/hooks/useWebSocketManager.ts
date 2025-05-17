/*
 * @Author: Await
 * @Date: 2025-05-09 17:49:44
 * @LastEditors: Await
 * @LastEditTime: 2025-05-17 17:32:14
 * @Description: WebSocket管理钩子
 */
import { useState, useRef, useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { getWebSocketStateText } from '../utils/websocket';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import { writeColorText } from '../utils/terminalUtils';
import { Terminal } from 'xterm';

// 处理WebSocket消息的兼容函数
const handleWebSocketMessage = (tab: TerminalTab, event: MessageEvent) => {
    // 处理WebSocket消息的逻辑
    if (!tab || !event) return;

    // 如果是xterm终端，处理text数据
    if (tab.xtermRef?.current && typeof event.data === 'string') {
        tab.xtermRef.current.write(event.data);
    }
};

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
            console.log('执行快速重连', activeTab.key);
            // 执行实际的重连逻辑
        }
    }
};

/**
 * WebSocket管理器Hook
 * 负责创建、管理WebSocket连接的生命周期
 */
export const useWebSocketManager = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [latestActivityTime, setLatestActivityTime] = useState(0);
    const connectingRef = useRef<Set<string>>(new Set());
    const reconnectTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

    // 封装writeColorText以处理类型兼容性
    const writeTerminalText = useCallback((tab: TerminalTab, color: string, text: string) => {
        if (tab.xtermRef?.current) {
            writeColorText(tab.xtermRef.current, color, text);
        }
    }, []);

    /**
     * 创建WebSocket连接
     */
    const createWebSocketConnection = useCallback((tab: TerminalTab, onOpen?: () => void, onMessage?: (event: MessageEvent) => void, onClose?: () => void) => {
        if (!tab.connectionId || !tab.sessionId) {
            if (tab.xtermRef?.current) {
                writeTerminalText(tab, 'red', '错误: 缺少必要的连接参数\r\n');
            }
            return null;
        }

        // 如果已经存在连接或正在连接中，则返回
        if (tab.webSocketRef?.current || connectingRef.current.has(tab.key)) {
            return null;
        }

        // 标记为正在连接
        connectingRef.current.add(tab.key);

        // 创建WebSocket连接
        try {
            const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/terminal/${tab.connectionId}/${tab.sessionId}`;
            const ws = new WebSocket(wsUrl);

            // 设置WebSocket引用
            if (!tab.webSocketRef) {
                tab.webSocketRef = { current: null };
            }
            tab.webSocketRef.current = ws;

            // 设置WebSocket事件处理器
            ws.onopen = () => {
                setIsConnected(true);
                connectingRef.current.delete(tab.key);

                // 清除重连定时器
                if (reconnectTimersRef.current[tab.key]) {
                    clearTimeout(reconnectTimersRef.current[tab.key]);
                    delete reconnectTimersRef.current[tab.key];
                }

                if (tab.xtermRef?.current) {
                    writeTerminalText(tab, 'green', '连接建立成功!\r\n');
                }

                // 更新活动时间
                tab.lastActivityTime = Date.now();
                setLatestActivityTime(tab.lastActivityTime);

                // 调用自定义onOpen回调
                onOpen?.();
            };

            ws.onmessage = (event) => {
                // 更新活动时间
                tab.lastActivityTime = Date.now();
                setLatestActivityTime(tab.lastActivityTime);

                // 优先使用自定义消息处理器
                if (onMessage) {
                    onMessage(event);
                } else {
                    // 使用自定义的消息处理器
                    handleWebSocketMessage(tab, event);
                }
            };

            ws.onclose = () => {
                // 只有当前引用和关闭的WebSocket相同时才清空引用
                if (tab.webSocketRef?.current === ws) {
                    tab.webSocketRef.current = null;
                }

                connectingRef.current.delete(tab.key);
                setIsConnected(false);

                if (tab.xtermRef?.current) {
                    writeTerminalText(tab, 'red', '连接已关闭，将在5秒后尝试重连...\r\n');
                }

                // 调用自定义onClose回调
                onClose?.();

                // 设置重连定时器
                reconnectTimersRef.current[tab.key] = setTimeout(() => {
                    if (terminalStateRef.current?.tabs.find(t => t.key === tab.key)) {
                        createWebSocketConnection(tab, onOpen, onMessage, onClose);
                    }
                }, 5000);
            };

            ws.onerror = () => {
                if (tab.xtermRef?.current) {
                    writeTerminalText(tab, 'red', '连接发生错误\r\n');
                }
            };

            return ws;
        } catch (error) {
            connectingRef.current.delete(tab.key);
            if (tab.xtermRef?.current) {
                writeTerminalText(tab, 'red', `创建WebSocket连接失败: ${error}\r\n`);
            }
            return null;
        }
    }, [writeTerminalText]);

    /**
     * 关闭WebSocket连接
     */
    const closeWebSocketConnection = useCallback((tab: TerminalTab) => {
        // 清除重连定时器
        if (reconnectTimersRef.current[tab.key]) {
            clearTimeout(reconnectTimersRef.current[tab.key]);
            delete reconnectTimersRef.current[tab.key];
        }

        // 关闭WebSocket连接
        if (tab.webSocketRef?.current) {
            try {
                tab.webSocketRef.current.close();
            } catch (e) {
                // 忽略关闭错误
            }
            tab.webSocketRef.current = null;
        }

        connectingRef.current.delete(tab.key);
    }, []);

    /**
     * 关闭所有WebSocket连接
     */
    const closeAllConnections = useCallback(() => {
        // 获取所有标签
        const tabs = terminalStateRef.current?.tabs || [];

        // 关闭每个标签的WebSocket连接
        tabs.forEach(tab => {
            closeWebSocketConnection(tab);
        });

        // 清除所有重连定时器
        Object.keys(reconnectTimersRef.current).forEach(key => {
            clearTimeout(reconnectTimersRef.current[key]);
            delete reconnectTimersRef.current[key];
        });

        // 清空连接中集合
        connectingRef.current.clear();
    }, [closeWebSocketConnection]);

    /**
     * 向WebSocket发送数据
     */
    const sendData = useCallback((tab: TerminalTab, data: string | ArrayBuffer | Blob) => {
        // 如果WebSocket连接不存在或未打开，则尝试重新连接
        if (!tab.webSocketRef?.current || tab.webSocketRef.current.readyState !== WebSocket.OPEN) {
            if (!connectingRef.current.has(tab.key)) {
                createWebSocketConnection(tab);
            }
            return false;
        }

        try {
            tab.webSocketRef.current.send(data);

            // 更新活动时间
            tab.lastActivityTime = Date.now();
            setLatestActivityTime(tab.lastActivityTime);

            return true;
        } catch (error) {
            if (tab.xtermRef?.current) {
                writeTerminalText(tab, 'red', `发送数据失败: ${error}\r\n`);
            }
            return false;
        }
    }, [createWebSocketConnection, writeTerminalText]);

    /**
     * 检查WebSocket状态
     */
    const checkWebSocketState = useCallback((tab: TerminalTab) => {
        if (!tab.webSocketRef?.current) {
            return 'CLOSED';
        }

        return getWebSocketStateText(tab.webSocketRef.current.readyState);
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

export default useWebSocketManager;

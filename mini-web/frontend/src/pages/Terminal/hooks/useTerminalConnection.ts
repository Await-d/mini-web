/*
 * @Author: Await
 * @Date: 2025-05-21 20:15:30
 * @LastEditors: Await
 * @LastEditTime: 2025-05-21 21:11:26
 * @Description: 终端连接自定义Hook
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../Terminal.d';
import { connectionAPI } from '../../../services/api';

/**
 * 终端连接Hook返回类型
 */
interface UseTerminalConnectionReturn {
    tabs: TerminalTab[];
    activeTabKey: string;
    connection: any | null;
    isConnected: boolean;
    fullscreen: boolean;
    terminalSize: { cols: number; rows: number };
    networkLatency: number | null;
    terminalMode: string;
    sidebarCollapsed: boolean;
    toggleFullscreen: () => void;
    sendDataToServer: (data: string) => void;
    refreshTab: (tabKey: string) => void;
    duplicateTab: (tabKey: string) => void;
    closeWebSocketConnection: (tab: TerminalTab) => void;
    createWebSocketConnection: (sessionId: number | string, tabKey: string) => void;
}

/**
 * 终端连接自定义Hook
 * 提供终端连接的状态和方法
 */
export const useTerminalConnection = (): UseTerminalConnectionReturn => {
    // 获取终端上下文
    const { state, addTab, setActiveTab, closeTab } = useTerminal();
    const { tabs, activeTabKey } = state;

    // 从URL获取参数
    const { connectionId } = useParams<{ connectionId: string }>();
    const [searchParams] = useSearchParams();
    const sessionParam = searchParams.get('session');
    const tabKeyParam = searchParams.get('tabKey');

    // 状态
    const [connection, setConnection] = useState<any>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [fullscreen, setFullscreen] = useState<boolean>(false);
    const [terminalSize, setTerminalSize] = useState<{ cols: number; rows: number }>({ cols: 80, rows: 24 });
    const [networkLatency, setNetworkLatency] = useState<number | null>(null);
    const [terminalMode, setTerminalMode] = useState<string>('default');
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

    // 引用
    const websocketRef = useRef<WebSocket | null>(null);

    // 加载连接信息
    useEffect(() => {
        if (connectionId) {
            connectionAPI.getConnection(Number(connectionId))
                .then(response => {
                    if (response.data && response.data.code === 200) {
                        setConnection(response.data.data);
                    } else {
                        message.error(response.data?.message || '获取连接信息失败');
                    }
                })
                .catch(error => {
                    console.error('获取连接信息失败:', error);
                    message.error('获取连接信息失败');
                });
        }
    }, [connectionId]);

    // 切换全屏模式
    const toggleFullscreen = useCallback(() => {
        setFullscreen(prev => !prev);
    }, []);

    // 发送数据到服务器
    const sendDataToServer = useCallback((data: string) => {
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
            websocketRef.current.send(data);
        }
    }, []);

    // 刷新标签页
    const refreshTab = useCallback((tabKey: string) => {
        const tab = tabs.find(t => t.key === tabKey);
        if (!tab) {
            message.error('找不到要刷新的标签页');
            return;
        }

        // 在这里可以实现具体的刷新逻辑
        window.dispatchEvent(new CustomEvent('terminal-tab-refresh', {
            detail: { tabKey }
        }));

    }, [tabs]);

    // 复制标签页
    const duplicateTab = useCallback((tabKey: string) => {
        const tab = tabs.find(t => t.key === tabKey);
        if (!tab) {
            message.error('找不到要复制的标签页');
            return;
        }

        // 在这里可以实现复制标签页的逻辑
        window.dispatchEvent(new CustomEvent('terminal-tab-duplicate', {
            detail: { tabKey }
        }));

    }, [tabs]);

    // 关闭WebSocket连接
    const closeWebSocketConnection = useCallback((tab: TerminalTab) => {
        if (tab.webSocketRef?.current) {
            tab.webSocketRef.current.close();
        }
    }, []);

    // 创建WebSocket连接
    const createWebSocketConnection = useCallback((sessionId: number | string, tabKey: string) => {
        // 在这里实现WebSocket连接创建逻辑
        console.log(`创建WebSocket连接: 会话ID=${sessionId}, 标签Key=${tabKey}`);

        // 可以根据协议类型和其他参数创建不同的连接
        // 这里只是一个示例
        const tab = tabs.find(t => t.key === tabKey);
        if (!tab) {
            message.error('找不到对应的标签页');
            return;
        }

        // 创建WebSocket连接
        try {
            // 这里应该使用实际的WebSocket连接创建逻辑
            // const ws = new WebSocket(...);
            // tab.webSocketRef.current = ws;
            setIsConnected(true);
        } catch (error) {
            message.error('创建WebSocket连接失败');
            console.error('创建WebSocket连接失败:', error);
        }
    }, [tabs]);

    return {
        tabs,
        activeTabKey,
        connection,
        isConnected,
        fullscreen,
        terminalSize,
        networkLatency,
        terminalMode,
        sidebarCollapsed,
        toggleFullscreen,
        sendDataToServer,
        refreshTab,
        duplicateTab,
        closeWebSocketConnection,
        createWebSocketConnection
    };
}; 
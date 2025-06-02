/*
 * @Author: Await
 * @Date: 2025-05-25 09:45:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-02 08:28:33
 * @Description: WebSocket管理器Hook
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import webSocketService, { WebSocketService } from '../services/WebSocketService';
import type { WebSocketStats, WebSocketEventHandlers } from '../services/WebSocketService';
import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * WebSocket管理器Hook返回接口
 */
export interface UseWebSocketManagerReturn {
    // 连接状态
    stats: WebSocketStats;
    // 连接WebSocket
    connect: (tab: TerminalTab, handlers?: WebSocketEventHandlers) => WebSocket | null;
    // 断开WebSocket连接
    disconnect: (tabKey: string) => void;
    // 断开所有WebSocket连接
    disconnectAll: () => void;
    // 刷新WebSocket连接
    refresh: (tab: TerminalTab) => WebSocket | null;
    // 发送数据
    sendData: (tab: TerminalTab, data: string | ArrayBuffer | Blob) => Promise<boolean>;
    // 重置统计信息
    resetStats: () => void;
    // 获取活动连接
    getActiveConnections: () => { tabKey: string, ws: WebSocket }[];
}

/**
 * WebSocket管理器Hook
 * @returns WebSocket管理器接口
 */
export const useWebSocketManager = (): UseWebSocketManagerReturn => {
    // 统计数据状态
    const [stats, setStats] = useState<WebSocketStats>(webSocketService.getStats());

    // 用于跟踪组件挂载状态
    const isMounted = useRef(true);

    // 更新统计数据
    const updateStats = useCallback(() => {
        if (isMounted.current) {
            setStats(webSocketService.getStats());
        }
    }, []);

    // 连接WebSocket
    const connect = useCallback((tab: TerminalTab, handlers?: WebSocketEventHandlers): WebSocket | null => {
        return webSocketService.connect(tab, handlers);
    }, []);

    // 断开WebSocket连接
    const disconnect = useCallback((tabKey: string): void => {
        webSocketService.closeConnection(tabKey);
        updateStats();
    }, [updateStats]);

    // 断开所有WebSocket连接
    const disconnectAll = useCallback((): void => {
        webSocketService.closeAllConnections();
        updateStats();
    }, [updateStats]);

    // 刷新WebSocket连接
    const refresh = useCallback((tab: TerminalTab): WebSocket | null => {
        const result = webSocketService.refreshConnection(tab);
        updateStats();
        return result;
    }, [updateStats]);

    // 发送数据（使用二进制协议）
    const sendData = useCallback(async (tab: TerminalTab, data: string | ArrayBuffer | Blob): Promise<boolean> => {
        if (!tab || !tab.key) return false;

        try {
            // 优先使用WebSocketService的二进制协议发送
            return await webSocketService.sendData(tab, data, true); // 启用二进制协议
        } catch (error) {
            console.error(`发送数据到WebSocket失败: ${tab.key}`, error);
            return false;
        }
    }, []);

    // 获取所有活动连接
    const getActiveConnections = useCallback((): { tabKey: string, ws: WebSocket }[] => {
        return webSocketService.getActiveConnections();
    }, []);

    // 重置统计信息
    const resetStats = useCallback((): void => {
        webSocketService.resetStats();
        updateStats();
    }, [updateStats]);

    // 定期更新统计数据
    useEffect(() => {
        // 确保isMounted标记正确设置
        isMounted.current = true;

        // 每5秒更新一次统计数据
        const statsTimer = window.setInterval(() => {
            updateStats();
        }, 5000);

        // 组件卸载时清理
        return () => {
            isMounted.current = false;
            clearInterval(statsTimer);
        };
    }, [updateStats]);

    // 监听WebSocket事件，更新统计数据
    useEffect(() => {
        const handleWebSocketConnected = () => {
            updateStats();
        };

        const handleWebSocketDisconnected = () => {
            updateStats();
        };

        const handleWebSocketError = () => {
            updateStats();
        };

        // 添加事件监听
        window.addEventListener('terminal-ws-connected', handleWebSocketConnected);
        window.addEventListener('terminal-ws-disconnected', handleWebSocketDisconnected);
        window.addEventListener('terminal-ws-error', handleWebSocketError);

        // 组件卸载时移除事件监听
        return () => {
            window.removeEventListener('terminal-ws-connected', handleWebSocketConnected);
            window.removeEventListener('terminal-ws-disconnected', handleWebSocketDisconnected);
            window.removeEventListener('terminal-ws-error', handleWebSocketError);
        };
    }, [updateStats]);

    return {
        stats,
        connect,
        disconnect,
        disconnectAll,
        refresh,
        sendData,
        getActiveConnections,
        resetStats
    };
};

import React, { useState, useCallback, useEffect, useRef, createRef } from 'react';
import { message } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
import { connectionAPI, sessionAPI } from '../../../services/api';
import type { Connection } from '../../../services/api';
import { useTerminal } from '../../../contexts/TerminalContext';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { WindowSize } from '../utils/terminalConfig';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';

// 导入拆分出的子Hook
import { useTerminalInitialization } from './useTerminalInitialization';
import { useWebSocketManager } from './useWebSocketManager';
import { useTerminalData } from './useTerminalData';
import { useTerminalUI } from './useTerminalUI';

// 确保terminalStateRef.current.tabs被推断为TerminalTab[]类型
declare module '../../../contexts/TerminalContext' {
    interface TerminalState {
        tabs: TerminalTab[];
        activeTabKey: string;
    }
}

// 已初始化的终端标签跟踪
const initializedTabs = new Set<string>();

/**
 * 格式化创建标签的数据
 */
const formatTabData = (connection: any, sessionId?: number): TerminalTab => {
    const protocol = connection.protocol || 'SSH';
    const hostname = connection.host || 'localhost';
    const port = connection.port || 22;
    const username = connection.username || 'root';

    return {
        key: `tab-${connection.id}-${sessionId || 'nosession'}-${Date.now()}`,
        title: connection.name || `${hostname}:${port}`,
        icon: null,
        status: 'connecting',
        connectionId: connection.id,
        sessionId: sessionId,
        connection: connection,
        isConnected: false,
        terminalRef: createRef<HTMLDivElement>(),
        xtermRef: createRef<Terminal>(),
        webSocketRef: createRef<WebSocket>(),
        fitAddonRef: createRef<FitAddon>(),
        searchAddonRef: createRef<SearchAddon>(),
        messageQueueRef: createRef<string[]>(),
        protocol,
        hostname,
        port,
        username
    };
};

/**
 * 终端连接的主Hook，整合各子Hook的功能
 */
export const useTerminalConnection = () => {
    const { connectionId } = useParams<{ connectionId: string }>();
    const [searchParams] = useSearchParams();
    const sessionParam = searchParams.get('session');

    // 使用终端上下文
    const { state, addTab, setActiveTab } = useTerminal();
    const { tabs, activeTabKey } = state;

    // 使用拆分的子Hooks
    const { initializeTerminal, resizeTerminal } = useTerminalInitialization();
    const { isConnected, createWebSocketConnection, closeWebSocketConnection, closeAllConnections, sendData } = useWebSocketManager();
    const { terminalMode, networkLatency } = useTerminalData();
    const { fullscreen, sidebarCollapsed, toggleFullscreen } = useTerminalUI();

    const [connection, setConnection] = useState<Connection | null>(null);
    const [terminalSize, setTerminalSize] = useState<WindowSize>({ cols: 80, rows: 24 });

    // 发送数据到服务器
    const sendDataToServer = useCallback((data: string) => {
        const activeTab = tabs.find(tab => tab.key === activeTabKey);
        if (!activeTab) return;
        sendData(activeTab, data);
    }, [activeTabKey, tabs, sendData]);

    // 切换全屏并调整终端大小
    const handleToggleFullscreen = useCallback(() => {
        toggleFullscreen();

        // 延迟调整终端大小，以便DOM更新完成
        setTimeout(() => {
            const activeTab = tabs.find(tab => tab.key === activeTabKey);
            if (activeTab) resizeTerminal(activeTab);
        }, 100);
    }, [activeTabKey, tabs, toggleFullscreen, resizeTerminal]);

    // 初始化终端标签页
    const initializeTerminalTab = useCallback((tabKey: string) => {
        // 确保终端状态存在
        if (!terminalStateRef.current) return;

        // 找到相应标签
        const tab = terminalStateRef.current.tabs.find(t => t.key === tabKey);
        if (!tab || !tab.connectionId) return;

        // 防止重复初始化
        if (initializedTabs.has(tabKey)) return;
        initializedTabs.add(tabKey);

        // 创建WebSocket连接
        if (typeof tab.connectionId === 'number' && tab.sessionId) {
            createWebSocketConnection(tab);
        }
    }, [createWebSocketConnection]);

    // 创建新标签页
    const fetchConnectionAndCreateTab = useCallback(async (connectionId: number, sessionId?: number) => {
        // 检查是否已存在相应标签
        const existingTab = tabs.find(tab =>
            tab.connectionId === connectionId && tab.sessionId === sessionId
        );

        if (existingTab) {
            setActiveTab(existingTab.key);
            return existingTab;
        }

        try {
            // 获取连接详情
            const response = await connectionAPI.getConnection(connectionId);
            if (response?.data?.data) {
                // 创建新标签并添加到状态
                const newTab = formatTabData(response.data.data, sessionId);
                addTab(newTab);
                setActiveTab(newTab.key);
                return newTab;
            }

            message.error('无法获取连接详情');
            return null;
        } catch (error) {
            message.error('无法获取连接详情');
            return null;
        }
    }, [addTab, setActiveTab, tabs]);

    // 处理URL参数，创建标签页
    useEffect(() => {
        if (connectionId && parseInt(connectionId) > 0) {
            const sessionId = sessionParam ? parseInt(sessionParam) : undefined;
            fetchConnectionAndCreateTab(parseInt(connectionId), sessionId);
        }
    }, [connectionId, sessionParam, fetchConnectionAndCreateTab]);

    // 监听终端就绪事件，触发初始化
    useEffect(() => {
        const handleTerminalReady = (event: CustomEvent) => {
            if (event.detail?.tabKey) {
                initializeTerminalTab(event.detail.tabKey);
            }
        };

        window.addEventListener('terminal-ready', handleTerminalReady as EventListener);
        return () => {
            window.removeEventListener('terminal-ready', handleTerminalReady as EventListener);
        };
    }, [initializeTerminalTab]);

    // 监听窗口大小变化，调整终端大小
    useEffect(() => {
        const handleResize = () => {
            const activeTab = tabs.find(tab => tab.key === activeTabKey);
            if (activeTab) resizeTerminal(activeTab);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeTabKey, tabs, resizeTerminal]);

    // 激活标签页时触发初始化
    useEffect(() => {
        if (activeTabKey && !initializedTabs.has(activeTabKey)) {
            // 查找对应的标签以获取完整信息
            const activeTab = tabs.find(tab => tab.key === activeTabKey);
            if (activeTab) {
                const event = new CustomEvent('terminal-ready', {
                    detail: {
                        tabKey: activeTabKey,
                        connectionId: activeTab.connectionId,
                        sessionId: activeTab.sessionId,
                        protocol: activeTab.protocol || 'ssh'
                    }
                });
                window.dispatchEvent(event);
                console.log(`激活标签: ${activeTabKey}, 准备触发终端就绪事件`);
            }
        }
    }, [activeTabKey, tabs]);

    // 组件卸载时清理资源
    useEffect(() => {
        return () => {
            closeAllConnections();
            initializedTabs.clear();
        };
    }, [closeAllConnections]);

    // 刷新标签页和连接
    const refreshTab = useCallback((tabKey: string) => {
        // 查找需要刷新的标签
        const tab = tabs.find(tab => tab.key === tabKey);
        if (!tab) return;

        // 关闭现有的连接
        if (tab.webSocketRef?.current) {
            closeWebSocketConnection(tab);
        }

        // 重置标签状态
        const updatedTab = {
            ...tab,
            isConnected: false,
            status: 'connecting'
        };

        // 更新标签状态
        setTimeout(() => {
            createWebSocketConnection(updatedTab);
        }, 500);

        // 触发刷新事件
        window.dispatchEvent(new CustomEvent('terminal-tab-refreshed', {
            detail: { tabKey }
        }));
    }, [tabs, closeWebSocketConnection, createWebSocketConnection]);

    // 复制连接并创建新标签
    const duplicateTab = useCallback((tabKey: string) => {
        // 查找需要复制的标签
        const sourceTab = tabs.find(tab => tab.key === tabKey);
        if (!sourceTab || !sourceTab.connectionId) return;

        // 使用现有连接创建新会话
        sessionAPI.createSession(Number(sourceTab.connectionId))
            .then(response => {
                if (response?.data?.data) {
                    const sessionId = response.data.data.id;
                    // 复制连接信息并使用新的会话ID创建标签
                    const timestamp = Date.now();
                    const newTabKey = `tab-${sourceTab.connectionId}-${sessionId}-${timestamp}`;

                    // 创建新的标签对象
                    const newTab: TerminalTab = {
                        key: newTabKey,
                        title: `${sourceTab.title} (复制)`,
                        connectionId: sourceTab.connectionId,
                        sessionId: sessionId,
                        connection: sourceTab.connection,
                        isConnected: false,
                        status: 'connecting',
                        protocol: sourceTab.protocol,
                        hostname: sourceTab.hostname,
                        port: sourceTab.port,
                        username: sourceTab.username,
                        terminalRef: createRef<HTMLDivElement>(),
                        xtermRef: createRef<Terminal>(),
                        webSocketRef: createRef<WebSocket>(),
                        fitAddonRef: createRef<FitAddon>(),
                        searchAddonRef: createRef<SearchAddon>(),
                        messageQueueRef: createRef<string[]>(),
                        isGraphical: sourceTab.isGraphical,
                        rdpSettings: sourceTab.rdpSettings
                    };

                    // 添加新标签并设为活动
                    addTab(newTab);
                    setActiveTab(newTabKey);

                    message.success('连接已复制，正在建立新会话...');
                } else {
                    message.error('复制连接失败: 无法创建新会话');
                }
            })
            .catch(error => {
                message.error('复制连接失败: ' + (error.message || '未知错误'));
            });
    }, [tabs, addTab, setActiveTab]);

    return {
        connection,
        tabs,
        activeTabKey,
        fullscreen,
        isConnected,
        terminalSize,
        networkLatency,
        terminalMode,
        sidebarCollapsed,
        toggleFullscreen: handleToggleFullscreen,
        fetchConnectionAndCreateTab,
        sendDataToServer,
        createWebSocketConnection,
        closeWebSocketConnection,
        closeAllConnections,
        refreshTab,
        duplicateTab
    };
};

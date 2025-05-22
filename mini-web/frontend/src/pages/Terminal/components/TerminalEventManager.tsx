/*
 * @Author: Await
 * @Date: 2025-05-21 21:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-21 21:35:00
 * @Description: 终端事件管理器组件
 */
import React, { useEffect } from 'react';
import type { TerminalEventManagerProps } from '../Terminal.d';

/**
 * 终端事件管理器组件
 * 负责监听和处理终端相关的事件，例如创建WebSocket连接
 */
const TerminalEventManager: React.FC<TerminalEventManagerProps> = ({
    tabs,
    activeTabKey,
    setActiveTab,
    createWebSocketConnection,
    children
}) => {
    // 监听终端就绪事件
    useEffect(() => {
        const handleTerminalReady = (event: CustomEvent) => {
            const { tabKey, connectionId, sessionId } = event.detail;
            console.log(`收到终端就绪事件: tabKey=${tabKey}, connectionId=${connectionId}, sessionId=${sessionId}`);

            // 查找对应的标签
            const tab = tabs.find(t => t.key === tabKey);
            if (!tab) {
                console.error(`找不到标签: ${tabKey}`);
                return;
            }

            // 创建WebSocket连接
            if (createWebSocketConnection) {
                createWebSocketConnection(tab);
            } else {
                console.error('createWebSocketConnection方法不存在');
            }
        };

        // 监听标签刷新事件
        const handleTabRefresh = (event: CustomEvent) => {
            const { tabKey } = event.detail;
            console.log(`刷新标签: ${tabKey}`);

            // 查找对应的标签
            const tab = tabs.find(t => t.key === tabKey);
            if (!tab) {
                console.error(`找不到标签: ${tabKey}`);
                return;
            }

            // 关闭现有WebSocket连接
            if (tab.webSocketRef?.current) {
                tab.webSocketRef.current.close();
            }

            // 创建新的WebSocket连接
            if (createWebSocketConnection) {
                setTimeout(() => {
                    createWebSocketConnection(tab);
                }, 500);
            }
        };

        // 监听标签激活事件
        const handleTabActivated = (event: CustomEvent) => {
            const { tabKey } = event.detail;
            console.log(`激活标签: ${tabKey}`);

            if (tabKey && tabKey !== activeTabKey) {
                setActiveTab(tabKey);
            }
        };

        // 添加事件监听器
        window.addEventListener('terminal-ready', handleTerminalReady as EventListener);
        window.addEventListener('terminal-tab-refresh', handleTabRefresh as EventListener);
        window.addEventListener('terminal-tab-activated', handleTabActivated as EventListener);

        // 清理函数
        return () => {
            window.removeEventListener('terminal-ready', handleTerminalReady as EventListener);
            window.removeEventListener('terminal-tab-refresh', handleTabRefresh as EventListener);
            window.removeEventListener('terminal-tab-activated', handleTabActivated as EventListener);
        };
    }, [tabs, activeTabKey, setActiveTab, createWebSocketConnection]);

    // 渲染子组件
    return <>{children}</>;
};

export default TerminalEventManager; 
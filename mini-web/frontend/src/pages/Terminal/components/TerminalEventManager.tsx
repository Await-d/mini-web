import React, { useEffect } from 'react';
import type { FC, PropsWithChildren } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';

interface TerminalEventManagerProps {
    tabs: TerminalTab[];
    activeTabKey: string;
    setActiveTab: (key: string) => void;
    createWebSocketConnection?: (connectionId: number, sessionId: number, tabKey: string) => void;
    initTerminal?: (tab: TerminalTab, dataHandler: (data: string) => void) => boolean;
}

/**
 * 终端事件管理组件
 * 负责监听和处理所有与终端相关的事件
 * 这是一个无UI的组件，专注于事件逻辑处理
 */
const TerminalEventManager: FC<PropsWithChildren<TerminalEventManagerProps>> = ({
    children,
    tabs,
    activeTabKey,
    setActiveTab,
    createWebSocketConnection,
    initTerminal
}) => {
    // 处理标签激活事件
    useEffect(() => {
        const handleTabActivated = (event: CustomEvent) => {
            const { tabKey, isNewTab } = event.detail;
            if (tabKey && tabKey !== activeTabKey) {
                setActiveTab(tabKey);
            }
        };

        window.addEventListener('terminal-tab-activated', handleTabActivated as EventListener);
        return () => {
            window.removeEventListener('terminal-tab-activated', handleTabActivated as EventListener);
        };
    }, [activeTabKey, setActiveTab]);

    // 监听终端准备就绪事件
    useEffect(() => {
        const handleTerminalReady = (event: CustomEvent) => {
            const { tabKey,  connectionId, sessionId } = event.detail;
            // 查找对应的标签
            const tab = tabs.find(t => t.key === tabKey);
            if (!tab) {
                return;
            }

            // 先初始化终端
            let terminalInitialized = false;
            if (tab && initTerminal) {
                // 创建数据处理器函数
                const dataHandler = (data: string) => {
                    if (tab.webSocketRef && tab.webSocketRef.current) {
                        try {
                            tab.webSocketRef.current.send(data);
                        } catch (error) {
                            console.error('发送数据到WebSocket失败:', error);
                        }
                    }
                };

                // 初始化终端
                terminalInitialized = initTerminal(tab, dataHandler);
                if (!terminalInitialized) {
                    console.error(`初始化终端失败: ${tabKey}`);
                    return;
                }
            }

            // 确保终端初始化成功后，再创建WebSocket连接
            if (terminalInitialized && connectionId && sessionId && createWebSocketConnection) {
                // 延迟一点创建WebSocket连接，确保终端完全初始化
                setTimeout(() => {
                    // 创建WebSocket连接
                    createWebSocketConnection(connectionId, sessionId, tabKey);
                }, 100);
            }
        };

        window.addEventListener('terminal-ready', handleTerminalReady as EventListener);
        return () => {
            window.removeEventListener('terminal-ready', handleTerminalReady as EventListener);
        };
    }, [tabs, createWebSocketConnection, initTerminal]);

    // 标签关闭事件处理
    useEffect(() => {
        const handleTabClose = (event: CustomEvent) => {
            const { tabKey } = event.detail;
            // 这里不直接处理关闭逻辑，而是触发一个标准DOM事件
            // 这样可以让主组件决定如何处理关闭操作
            const closeEvent = new CustomEvent('terminal-tab-close-request', {
                detail: { tabKey }
            });
            window.dispatchEvent(closeEvent);
        };

        window.addEventListener('terminal-tab-close', handleTabClose as EventListener);
        return () => {
            window.removeEventListener('terminal-tab-close', handleTabClose as EventListener);
        };
    }, []);

    // 返回子组件
    return <>{children}</>;
};

export default TerminalEventManager;

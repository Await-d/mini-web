/*
 * @Author: Await
 * @Date: 2025-05-21 15:32:12
 * @LastEditors: Await
 * @LastEditTime: 2025-05-22 21:05:44
 * @Description: 终端事件管理器组件
 */
import React, { useEffect } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalEventManagerProps } from '../Terminal.d';
import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * 终端事件管理器组件
 * 处理各种终端相关的自定义事件
 */
const TerminalEventManager: React.FC<TerminalEventManagerProps> = ({
    children,
    tabs,
    activeTabKey,
    setActiveTab,
    createWebSocketConnection
}) => {
    // 使用Context中的状态和方法，但优先使用传入的props
    const terminalContext = useTerminal();

    // 使用props中的值，如果props未提供则使用context中的值
    const contextTabs = terminalContext.state.tabs;
    const contextActiveTabKey = terminalContext.state.activeTabKey;
    const updateTab = terminalContext.updateTab;
    const contextSetActiveTab = terminalContext.setActiveTab;

    // 优先使用props中的值
    const effectiveTabs = tabs || contextTabs;
    const effectiveActiveTabKey = activeTabKey || contextActiveTabKey;
    const effectiveSetActiveTab = setActiveTab || contextSetActiveTab;

    // 处理终端就绪事件
    useEffect(() => {
        const handleTerminalReady = (event: CustomEvent) => {
            const { tabKey, connectionId, sessionId, protocol } = event.detail;
            console.log(`收到终端就绪事件: tabKey=${tabKey}, connectionId=${connectionId}, sessionId=${sessionId}, protocol=${protocol}`);

            // 更新标签状态为已连接
            updateTab(tabKey, { isConnected: true });

            // 如果标签不是当前活动标签，则激活它
            if (tabKey !== effectiveActiveTabKey) {
                effectiveSetActiveTab(tabKey);
            }
        };

        // 处理终端重连事件
        const handleTerminalReconnect = (event: CustomEvent) => {
            const { connectionId, sessionId } = event.detail;
            console.log(`收到终端重连事件: connectionId=${connectionId}, sessionId=${sessionId}`);

            // 找到匹配的标签
            const tab = effectiveTabs.find(t =>
                t.connectionId === connectionId &&
                t.sessionId === sessionId
            );

            if (tab && createWebSocketConnection) {
                console.log(`为标签 ${tab.key} 重新创建WebSocket连接`);
                // 确保sessionId不为undefined
                if (tab.sessionId) {
                    // 创建WebSocket连接时需要传递会话ID和标签Key
                    const ws = createWebSocketConnection(tab.sessionId, tab.key);

                    if (ws && tab.webSocketRef) {
                        tab.webSocketRef.current = ws;

                        // 更新标签状态
                        updateTab(tab.key, {
                            isConnected: false // 初始设置为未连接，等待连接建立
                        });

                        // 监听WebSocket打开事件
                        ws.addEventListener('open', () => {
                            console.log(`WebSocket连接已打开: tabKey=${tab.key}`);
                            updateTab(tab.key, { isConnected: true });

                            // 触发终端就绪事件
                            window.dispatchEvent(new CustomEvent('terminal-ready', {
                                detail: {
                                    tabKey: tab.key,
                                    connectionId: tab.connectionId,
                                    sessionId: tab.sessionId,
                                    protocol: tab.protocol || 'ssh'
                                }
                            }));
                        });

                        // 监听WebSocket关闭事件
                        ws.addEventListener('close', () => {
                            console.log(`WebSocket连接已关闭: tabKey=${tab.key}`);
                            updateTab(tab.key, { isConnected: false });
                        });

                        // 监听WebSocket错误事件
                        ws.addEventListener('error', (e) => {
                            console.error(`WebSocket连接错误: tabKey=${tab.key}`, e);
                            updateTab(tab.key, { isConnected: false });
                        });
                    }
                }
            }
        };

        // 处理终端刷新事件
        const handleTerminalRefresh = (event: CustomEvent) => {
            const { tabKey } = event.detail;
            console.log(`收到终端刷新事件: tabKey=${tabKey}`);

            // 找到要刷新的标签
            const tab = effectiveTabs.find(t => t.key === tabKey);
            if (!tab) {
                console.error(`未找到要刷新的标签: ${tabKey}`);
                return;
            }

            // 如果WebSocket已存在，先关闭
            if (tab.webSocketRef?.current) {
                try {
                    tab.webSocketRef.current.close();
                } catch (e) {
                    console.error(`关闭WebSocket时出错: ${e}`);
                }
                tab.webSocketRef.current = null;
            }

            // 标记为正在连接
            updateTab(tab.key, { isConnected: false });

            // 如果有会话ID，创建新的WebSocket连接
            if (tab.sessionId && createWebSocketConnection) {
                console.log(`为标签 ${tab.key} 创建新的WebSocket连接`);
                const ws = createWebSocketConnection(tab.sessionId, tab.key);

                if (ws && tab.webSocketRef) {
                    tab.webSocketRef.current = ws;

                    // 监听WebSocket打开事件
                    ws.addEventListener('open', () => {
                        console.log(`WebSocket连接已打开: tabKey=${tab.key}`);
                        updateTab(tab.key, { isConnected: true });

                        // 触发终端就绪事件
                        window.dispatchEvent(new CustomEvent('terminal-ready', {
                            detail: {
                                tabKey: tab.key,
                                connectionId: tab.connectionId,
                                sessionId: tab.sessionId,
                                protocol: tab.protocol || 'ssh'
                            }
                        }));
                    });
                }
            }
        };

        // 添加事件监听器
        window.addEventListener('terminal-ready', handleTerminalReady as EventListener);
        window.addEventListener('terminal-reconnect', handleTerminalReconnect as EventListener);
        window.addEventListener('terminal-tab-refresh', handleTerminalRefresh as EventListener);

        // 清理函数
        return () => {
            window.removeEventListener('terminal-ready', handleTerminalReady as EventListener);
            window.removeEventListener('terminal-reconnect', handleTerminalReconnect as EventListener);
            window.removeEventListener('terminal-tab-refresh', handleTerminalRefresh as EventListener);
        };
    }, [updateTab, effectiveTabs, effectiveActiveTabKey, effectiveSetActiveTab, createWebSocketConnection]);

    return (
        <div className="terminal-event-manager">
            {children}
        </div>
    );
};

export default TerminalEventManager; 
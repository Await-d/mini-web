/*
 * @Author: Await
 * @Date: 2025-05-21 15:32:12
 * @LastEditors: Await
 * @LastEditTime: 2025-06-04 20:50:43
 * @Description: 终端事件管理器组件
 */
import React, { useEffect } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalEventManagerProps } from '../Terminal.d';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import './TerminalEventManager.css'; // 引入CSS文件

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

    // 检查并连接活动标签页的WebSocket
    useEffect(() => {
        if (effectiveActiveTabKey && effectiveTabs && effectiveTabs.length > 0) {
            const activeTab = effectiveTabs.find(tab => tab.key === effectiveActiveTabKey);

            if (activeTab && createWebSocketConnection) {
                // 检查WebSocket是否需要建立连接
                const needConnection = !activeTab.webSocketRef?.current ||
                    (activeTab.webSocketRef.current.readyState !== WebSocket.OPEN &&
                        activeTab.webSocketRef.current.readyState !== WebSocket.CONNECTING);

                if (needConnection && activeTab.sessionId) {
                    console.log(`主动为活动标签 ${activeTab.key} 创建WebSocket连接`);

                    // 更新标签状态
                    updateTab(activeTab.key, {
                        isConnected: false,
                        status: 'connecting'
                    });

                    // 创建WebSocket连接
                    const ws = createWebSocketConnection(activeTab.sessionId, activeTab.key);

                    if (ws && activeTab.webSocketRef) {
                        activeTab.webSocketRef.current = ws;

                        // 监听WebSocket事件
                        ws.addEventListener('open', () => {
                            console.log(`WebSocket连接已打开: tabKey=${activeTab.key}`);
                            updateTab(activeTab.key, {
                                isConnected: true,
                                status: 'connected'
                            });

                            // 触发终端就绪事件
                            window.dispatchEvent(new CustomEvent('terminal-ready', {
                                detail: {
                                    tabKey: activeTab.key,
                                    connectionId: activeTab.connectionId,
                                    sessionId: activeTab.sessionId,
                                    protocol: activeTab.protocol || 'ssh'
                                }
                            }));
                        });

                        ws.addEventListener('close', (event) => {
                            console.log(`WebSocket连接已关闭: tabKey=${activeTab.key}`);
                            updateTab(activeTab.key, {
                                isConnected: false,
                                status: 'disconnected'
                            });

                            // 检查是否是手动关闭（用户点击重连按钮）
                            const isManualReconnect = sessionStorage.getItem(`manual-reconnect-${activeTab.key}`);
                            if (isManualReconnect) {
                                console.log(`检测到手动重连，跳过自动重连: ${activeTab.key}`);
                                sessionStorage.removeItem(`manual-reconnect-${activeTab.key}`);
                                return;
                            }
                        });

                        ws.addEventListener('error', (e) => {
                            console.error(`WebSocket连接错误: tabKey=${activeTab.key}`, e);
                            updateTab(activeTab.key, {
                                isConnected: false,
                                status: 'error',
                                error: '连接出错，请尝试刷新'
                            });
                        });
                    }
                }
            }
        }
    }, [effectiveActiveTabKey, effectiveTabs, createWebSocketConnection, updateTab]);

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

            if (!tab) {
                console.error(`未找到匹配的标签: connectionId=${connectionId}, sessionId=${sessionId}`);
                return;
            }

            if (tab && createWebSocketConnection) {
                console.log(`为标签 ${tab.key} 重新创建WebSocket连接`);

                // 首先关闭现有的WebSocket连接（如果有）
                if (tab.webSocketRef?.current) {
                    try {
                        tab.webSocketRef.current.close();
                    } catch (e) {
                        console.error(`关闭WebSocket时出错: ${e}`);
                    }
                    tab.webSocketRef.current = null;
                }

                // 标记为正在重连
                updateTab(tab.key, {
                    isConnected: false,
                    status: 'reconnecting'
                });

                // 确保sessionId不为undefined
                if (tab.sessionId) {
                    // 创建WebSocket连接时需要传递会话ID和标签Key
                    const ws = createWebSocketConnection(tab.sessionId, tab.key);

                    if (ws && tab.webSocketRef) {
                        tab.webSocketRef.current = ws;

                        // 监听WebSocket打开事件
                        ws.addEventListener('open', () => {
                            console.log(`WebSocket连接已打开: tabKey=${tab.key}`);
                            updateTab(tab.key, {
                                isConnected: true,
                                status: 'connected',
                                lastReconnectTime: new Date().toISOString()
                            });

                            // 记录重连成功信息
                            console.log(`标签 ${tab.key} 重连成功, 时间: ${new Date().toISOString()}`);

                            // 触发终端就绪事件
                            window.dispatchEvent(new CustomEvent('terminal-ready', {
                                detail: {
                                    tabKey: tab.key,
                                    connectionId: tab.connectionId,
                                    sessionId: tab.sessionId,
                                    protocol: tab.protocol || 'ssh',
                                    reconnected: true
                                }
                            }));
                        });

                        // 监听WebSocket关闭事件
                        ws.addEventListener('close', () => {
                            console.log(`WebSocket连接已关闭: tabKey=${tab.key}`);
                            updateTab(tab.key, {
                                isConnected: false,
                                status: 'disconnected'
                            });
                        });

                        // 监听WebSocket错误事件
                        ws.addEventListener('error', (e) => {
                            console.error(`WebSocket连接错误: tabKey=${tab.key}`, e);
                            updateTab(tab.key, {
                                isConnected: false,
                                status: 'error',
                                error: '连接出错，请尝试刷新'
                            });
                        });
                    } else {
                        console.error(`WebSocket创建失败: tabKey=${tab.key}`);
                        updateTab(tab.key, {
                            isConnected: false,
                            status: 'error',
                            error: 'WebSocket创建失败'
                        });
                    }
                } else {
                    console.error(`会话ID为空: tabKey=${tab.key}`);
                    updateTab(tab.key, {
                        isConnected: false,
                        status: 'error',
                        error: '会话ID无效'
                    });
                }
            } else if (!createWebSocketConnection) {
                console.error('createWebSocketConnection函数未定义');
                updateTab(tab.key, {
                    isConnected: false,
                    status: 'error',
                    error: '终端服务不可用'
                });
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

        // 处理标签激活事件
        const handleTabActivated = (event: CustomEvent) => {
            const { tabKey, connectionId, sessionId } = event.detail;
            console.log(`收到标签激活事件: tabKey=${tabKey}`);

            // 找到被激活的标签
            const tab = effectiveTabs.find(t => t.key === tabKey);
            if (!tab) {
                console.error(`未找到被激活的标签: ${tabKey}`);
                return;
            }

            // 如果WebSocket未连接或不是打开状态，创建新连接
            const wsRef = tab.webSocketRef?.current;
            const needConnection = !wsRef ||
                (wsRef.readyState !== WebSocket.OPEN &&
                    wsRef.readyState !== WebSocket.CONNECTING);

            if (needConnection && tab.sessionId) {
                // 尝试创建WebSocket连接
                if (createWebSocketConnection && tab.sessionId) {
                    try {
                        console.log(`主动为活动标签 ${tabKey} 创建WebSocket连接`);

                        // 更新标签状态为正在连接
                        updateTab(tabKey, {
                            isConnected: false,
                            status: 'connecting'
                        });

                        const ws = createWebSocketConnection(tab.sessionId, tabKey);
                        if (ws) {
                            // 如果tab有webSocketRef，将创建的WebSocket实例保存到引用中
                            if (tab.webSocketRef) {
                                tab.webSocketRef.current = ws;
                                console.log(`标签激活: 已创建并保存WebSocket连接到标签 ${tabKey}`);

                                // 监听WebSocket消息事件
                                ws.addEventListener('message', async (event) => {
                                    try {
                                        let data = event.data;

                                        // 如果数据是Blob类型，需要先转换为文本
                                        if (data instanceof Blob) {
                                            data = await data.text();
                                        }

                                        // 处理消息数据
                                        if (typeof data === 'string') {
                                            try {
                                                // 尝试解析为JSON
                                                const jsonData = JSON.parse(data);
                                                // 在这里处理JSON数据
                                            } catch (jsonError) {
                                                // 不是JSON格式，直接处理文本
                                                // 在这里处理文本数据
                                            }
                                        }
                                    } catch (error) {
                                        console.error(`处理WebSocket消息时出错:`, error);
                                    }
                                });
                            }
                        } else {
                            console.error(`WebSocket创建失败: tabKey=${tabKey}`);

                            // 标记为连接错误
                            updateTab(tabKey, {
                                isConnected: false,
                                status: 'error',
                                error: 'WebSocket连接创建失败'
                            });

                            // 尝试使用备用方法
                            window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
                                detail: {
                                    tabKey,
                                    connectionId: tab.connectionId,
                                    sessionId: tab.sessionId
                                }
                            }));
                        }
                    } catch (error: any) {
                        console.error(`WebSocket创建错误: tabKey=${tabKey}`, error);

                        // 标记为连接错误
                        updateTab(tabKey, {
                            isConnected: false,
                            status: 'error',
                            error: `连接错误: ${error.message || '未知错误'}`
                        });

                        // 尝试使用备用方法
                        window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
                            detail: {
                                tabKey,
                                connectionId: tab.connectionId,
                                sessionId: tab.sessionId
                            }
                        }));
                    }
                } else {
                    console.log(`无法创建WebSocket连接: createWebSocketConnection未定义或无效, tabKey=${tabKey}`);

                    // 触发terminal-tab-activated事件，让WebSocketManager尝试创建
                    window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
                        detail: {
                            tabKey,
                            connectionId: tab.connectionId,
                            sessionId: tab.sessionId
                        }
                    }));
                }
            } else {
                console.log(`标签 ${tabKey} 已有WebSocket连接或无会话ID，无需创建新连接`);
            }
        };

        // 添加事件监听器
        window.addEventListener('terminal-ready', handleTerminalReady as EventListener);
        window.addEventListener('terminal-reconnect', handleTerminalReconnect as EventListener);
        window.addEventListener('terminal-tab-refresh', handleTerminalRefresh as EventListener);
        window.addEventListener('terminal-tab-activated', handleTabActivated as EventListener);

        // 清理函数
        return () => {
            window.removeEventListener('terminal-ready', handleTerminalReady as EventListener);
            window.removeEventListener('terminal-reconnect', handleTerminalReconnect as EventListener);
            window.removeEventListener('terminal-tab-refresh', handleTerminalRefresh as EventListener);
            window.removeEventListener('terminal-tab-activated', handleTabActivated as EventListener);
        };
    }, [updateTab, effectiveTabs, effectiveActiveTabKey, effectiveSetActiveTab, createWebSocketConnection]);

    return (
        <div className="terminal-event-manager">
            {children}
        </div>
    );
};

export default TerminalEventManager; 
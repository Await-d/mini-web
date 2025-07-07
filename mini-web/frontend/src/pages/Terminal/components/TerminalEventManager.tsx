/*
 * @Author: Await
 * @Date: 2025-05-21 15:32:12
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 16:56:40
 * @Description: 终端事件管理器组件
 */
import React, { useEffect } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalEventManagerProps } from '../Terminal.d';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import './TerminalEventManager.css'; // 引入CSS文件
import webSocketService from '../services/WebSocketService';

/**
 * 终端事件管理器组件
 * 处理各种终端相关的自定义事件
 */
const TerminalEventManager: React.FC<TerminalEventManagerProps> = ({
    children,
    tabs = [],
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
        let globalStopped = false;

        // 监听全局重连停止事件
        const handleGlobalStop = () => {
            console.log('TerminalEventManager: 收到全局停止信号');
            globalStopped = true;
        };

        // **处理连接最终失败事件**
        const handleConnectionFailed = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { tabKey, reason } = customEvent.detail;
            console.log(`连接最终失败: ${tabKey}, 原因: ${reason}`);

            // 找到对应的标签并更新状态
            const tab = effectiveTabs.find(t => t.key === tabKey);
            if (tab) {
                updateTab(tabKey, {
                    isConnected: false,
                    status: 'error',
                    error: reason || '连接失败'
                });

                // 清理WebSocket引用
                if (tab.webSocketRef?.current) {
                    try {
                        tab.webSocketRef.current.close();
                    } catch (e) {
                        // 忽略关闭错误
                    }
                    tab.webSocketRef.current = null;
                }
            }
        };

        window.addEventListener('global-reconnect-stopped', handleGlobalStop);
        window.addEventListener('terminal-connection-failed', handleConnectionFailed);

        if (effectiveActiveTabKey && effectiveTabs && effectiveTabs.length > 0) {
            const activeTab = effectiveTabs.find(tab => tab.key === effectiveActiveTabKey);

            if (activeTab && createWebSocketConnection) {
                // 如果全局停止，静默退出
                if (globalStopped) {
                    return;
                }

                // 检查WebSocket是否需要建立连接
                const needConnection = !activeTab.webSocketRef?.current ||
                    (activeTab.webSocketRef.current.readyState !== WebSocket.OPEN &&
                        activeTab.webSocketRef.current.readyState !== WebSocket.CONNECTING);

                if (needConnection && activeTab.sessionId) {
                    // 检查全局停止标志
                    if (webSocketService.globalReconnectStopped) {
                        console.log(`全局重连已停止，跳过为活动标签创建连接: ${activeTab.key}`);
                        return;
                    }

                    // 检查重连配置
                    const reconnectConfig = webSocketService.getReconnectConfig();
                    if (!reconnectConfig.enabled) {
                        console.log(`自动重连已禁用，跳过为活动标签创建连接: ${activeTab.key}`);
                        updateTab(activeTab.key, {
                            isConnected: false,
                            status: 'disconnected',
                            error: '自动重连已禁用'
                        });
                        return;
                    }

                    // **严格检查重连次数限制**
                    const reconnectState = webSocketService.getReconnectState(activeTab.key);
                    if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                        console.log(`已达到最大重试次数(${reconnectConfig.maxRetries})，跳过为活动标签创建连接: ${activeTab.key}`);
                        updateTab(activeTab.key, {
                            isConnected: false,
                            status: 'disconnected',
                            error: `已达到最大重试次数(${reconnectConfig.maxRetries})`
                        });
                        return;
                    }

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

        // 清理函数
        return () => {
            window.removeEventListener('global-reconnect-stopped', handleGlobalStop);
            window.removeEventListener('terminal-connection-failed', handleConnectionFailed);
        };
    }, [effectiveActiveTabKey]); // 只依赖activeTabKey，避免无限渲染

    // 处理终端就绪事件
    useEffect(() => {
        const handleTerminalReady = (event: CustomEvent) => {
            const { tabKey, connectionId, sessionId, protocol } = event.detail;
            console.log(`收到终端就绪事件: tabKey=${tabKey}, connectionId=${connectionId}, sessionId=${sessionId}, protocol=${protocol}`);

            // 更新标签状态为已连接
            updateTab(tabKey, { isConnected: true });

            // 如果标签不是当前活动标签，则激活它
            if (tabKey !== activeTabKey) {
                setActiveTab(tabKey);
            }
        };

        // 处理终端重连事件
        const handleTerminalReconnect = (event: CustomEvent) => {
            const { connectionId, sessionId } = event.detail;
            console.log(`收到终端重连事件: connectionId=${connectionId}, sessionId=${sessionId}`);

            // 找到匹配的标签
            const tab = tabs.find(t =>
                t.connectionId === connectionId &&
                t.sessionId === sessionId
            );

            if (!tab) {
                console.error(`未找到匹配的标签: connectionId=${connectionId}, sessionId=${sessionId}`);
                return;
            }

            // **严格检查WebSocketService的重连配置和状态**
            const reconnectConfig = webSocketService.getReconnectConfig();
            if (!reconnectConfig.enabled || webSocketService.globalReconnectStopped) {
                console.log(`自动重连已禁用或全局停止，跳过重连: ${tab.key}`);
                updateTab(tab.key, {
                    isConnected: false,
                    status: 'disconnected',
                    error: '自动重连已禁用'
                });
                return;
            }

            // **检查重连次数限制 - 防止绕过WebSocketService的限制**
            const reconnectState = webSocketService.getReconnectState(tab.key);
            if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                console.warn(`已达到最大重试次数(${reconnectConfig.maxRetries})，阻止重连: ${tab.key}`);
                updateTab(tab.key, {
                    isConnected: false,
                    status: 'disconnected',
                    error: `连接失败：已达到最大重试次数(${reconnectConfig.maxRetries})`
                });
                return;
            }

            console.log(`为标签 ${tab.key} 使用WebSocketService重新连接`);

            // 使用WebSocketService的统一重连管理
            const ws = webSocketService.refreshConnection(tab, {
                onOpen: (ws) => {
                    console.log(`WebSocket重连成功: ${tab.key}`);
                    updateTab(tab.key, {
                        isConnected: true,
                        status: 'connected',
                        error: undefined,
                        lastReconnectTime: new Date().toISOString()
                    });

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
                },
                onClose: () => {
                    console.log(`WebSocket重连后断开: ${tab.key}`);
                    updateTab(tab.key, {
                        isConnected: false,
                        status: 'disconnected'
                    });
                },
                onError: (event) => {
                    console.error(`WebSocket重连失败: ${tab.key}`, event);
                    updateTab(tab.key, {
                        isConnected: false,
                        status: 'error',
                        error: 'WebSocket重连失败'
                    });
                }
            });

            if (ws && tab.webSocketRef) {
                tab.webSocketRef.current = ws;
            }
        };

        // 处理终端刷新事件
        const handleTerminalRefresh = (event: CustomEvent) => {
            const { tabKey } = event.detail;
            console.log(`收到终端刷新事件: tabKey=${tabKey}`);

            // 找到要刷新的标签
            const tab = tabs.find(t => t.key === tabKey);
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
            const tab = tabs.find(t => t.key === tabKey);
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
                // 检查重连配置 - 防止绕过重连限制
                const reconnectConfig = webSocketService.getReconnectConfig();
                if (!reconnectConfig.enabled) {
                    console.log(`自动重连已禁用，跳过标签激活连接创建: ${tabKey}`);
                    updateTab(tabKey, {
                        isConnected: false,
                        status: 'disconnected',
                        error: '自动重连已禁用'
                    });
                    return;
                }

                // 检查重连次数限制
                const reconnectState = webSocketService.getReconnectState(tabKey);
                if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                    console.log(`已达到最大重试次数(${reconnectConfig.maxRetries})，跳过标签激活连接创建: ${tabKey}`);
                    updateTab(tabKey, {
                        isConnected: false,
                        status: 'disconnected',
                        error: `已达到最大重试次数(${reconnectConfig.maxRetries})`
                    });
                    return;
                }

                try {
                    console.log(`主动为活动标签 ${tabKey} 创建WebSocket连接`);

                    // 更新标签状态为正在连接
                    updateTab(tabKey, {
                        isConnected: false,
                        status: 'connecting'
                    });

                    // 检查createWebSocketConnection是否可用
                    if (createWebSocketConnection) {
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

                            // 不再触发terminal-tab-activated事件，避免无限循环
                        }
                    }
                } catch (error: any) {
                    console.error(`WebSocket创建错误: tabKey=${tabKey}`, error);

                    // 标记为连接错误
                    updateTab(tabKey, {
                        isConnected: false,
                        status: 'error',
                        error: `连接错误: ${error.message || '未知错误'}`
                    });

                    // 不再触发terminal-tab-activated事件，避免无限循环
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
    }, []); // 空依赖项，避免无限渲染

    // 监听连接事件和重连限制
    useEffect(() => {
        // 监听WebSocket连接事件
        const handleWebSocketConnect = (event: CustomEvent) => {
            const { tabKey, sessionId } = event.detail;

            // 立即检查全局重连状态，避免绕过限制
            if (webSocketService.globalReconnectStopped) {
                console.warn(`TerminalEventManager: 全局重连已停止，阻止连接: ${tabKey}`);
                return;
            }

            // 检查重连配置和次数限制
            const reconnectConfig = webSocketService.getReconnectConfig();
            const reconnectState = webSocketService.getReconnectState(tabKey);

            if (!reconnectConfig.enabled) {
                console.warn(`TerminalEventManager: 重连已禁用，阻止连接: ${tabKey}`);
                return;
            }

            if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                console.warn(`TerminalEventManager: 已达到最大重试次数(${reconnectConfig.maxRetries})，阻止连接: ${tabKey}`);
                // 触发连接失败事件
                window.dispatchEvent(new CustomEvent('terminal-connection-failed', {
                    detail: {
                        tabKey,
                        reason: `已达到最大重试次数(${reconnectConfig.maxRetries})`,
                        maxRetries: reconnectConfig.maxRetries,
                        actualRetries: reconnectState.retryCount
                    }
                }));
                return;
            }

            console.log(`TerminalEventManager: 处理WebSocket连接请求: ${tabKey}`);

            if (createWebSocketConnection && sessionId) {
                // 在创建连接前进行最后一次检查
                if (webSocketService.globalReconnectStopped) {
                    console.warn(`TerminalEventManager: 连接创建时检测到全局停止: ${tabKey}`);
                    return;
                }

                try {
                    createWebSocketConnection(sessionId, tabKey);
                } catch (error) {
                    console.error(`TerminalEventManager: 创建WebSocket连接失败: ${tabKey}`, error);
                }
            }
        };

        // 监听重连请求事件
        const handleReconnectRequest = (event: CustomEvent) => {
            const { tabKey } = event.detail;

            // **重连请求的严格检查**
            if (webSocketService.globalReconnectStopped) {
                console.warn(`TerminalEventManager: 全局重连已停止，拒绝重连请求: ${tabKey}`);
                return;
            }

            const reconnectConfig = webSocketService.getReconnectConfig();
            const reconnectState = webSocketService.getReconnectState(tabKey);

            if (!reconnectConfig.enabled) {
                console.warn(`TerminalEventManager: 重连已禁用，拒绝重连请求: ${tabKey}`);
                return;
            }

            if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                console.error(`TerminalEventManager: 重连请求被拒绝，已达到最大重试次数: ${tabKey}`);

                // 触发连接失败事件
                window.dispatchEvent(new CustomEvent('terminal-connection-failed', {
                    detail: {
                        tabKey,
                        reason: `重连请求被拒绝，已达到最大重试次数(${reconnectConfig.maxRetries})`,
                        maxRetries: reconnectConfig.maxRetries,
                        actualRetries: reconnectState.retryCount
                    }
                }));
                return;
            }

            console.log(`TerminalEventManager: 处理重连请求: ${tabKey}`);

            const tab = effectiveTabs.find(t => t.key === tabKey);
            if (tab && tab.sessionId && createWebSocketConnection) {
                // 延迟重连，避免立即重连
                setTimeout(() => {
                    // 再次检查全局状态，防止在延迟期间状态发生变化
                    if (webSocketService.globalReconnectStopped) {
                        console.warn(`TerminalEventManager: 延迟重连时检测到全局停止: ${tabKey}`);
                        return;
                    }

                    try {
                        createWebSocketConnection(tab.sessionId!, tabKey);
                    } catch (error) {
                        console.error(`TerminalEventManager: 重连失败: ${tabKey}`, error);
                    }
                }, 1000); // 1秒延迟
            }
        };

        // 监听连接失败事件
        const handleConnectionFailed = (event: CustomEvent) => {
            const { tabKey, reason, maxRetries, actualRetries } = event.detail;
            console.log(`TerminalEventManager: 连接失败事件: ${tabKey}, 原因: ${reason}`);

            // 更新标签状态
            const tab = effectiveTabs.find(t => t.key === tabKey);
            if (tab && updateTab) {
                updateTab(tabKey, {
                    isConnected: false,
                    status: 'disconnected',
                    error: `连接失败: ${reason}`
                });
            }
        };

        // 监听全局重连停止事件
        const handleGlobalReconnectStopped = () => {
            console.log('TerminalEventManager: 收到全局重连停止信号');

            // 更新所有标签状态
            effectiveTabs.forEach(tab => {
                if (updateTab) {
                    updateTab(tab.key, {
                        isConnected: false,
                        status: 'disconnected',
                        error: '所有重连活动已停止'
                    });
                }
            });
        };

        // 添加事件监听器
        window.addEventListener('websocket-connect', handleWebSocketConnect as EventListener);
        window.addEventListener('reconnect-request', handleReconnectRequest as EventListener);
        window.addEventListener('terminal-connection-failed', handleConnectionFailed as EventListener);
        window.addEventListener('global-reconnect-stopped', handleGlobalReconnectStopped);

        // 清理函数
        return () => {
            window.removeEventListener('websocket-connect', handleWebSocketConnect as EventListener);
            window.removeEventListener('reconnect-request', handleReconnectRequest as EventListener);
            window.removeEventListener('terminal-connection-failed', handleConnectionFailed as EventListener);
            window.removeEventListener('global-reconnect-stopped', handleGlobalReconnectStopped);
        };
    }, [effectiveTabs, updateTab, createWebSocketConnection]);

    return (
        <div className="terminal-event-manager">
            {children}
        </div>
    );
};

export default TerminalEventManager; 
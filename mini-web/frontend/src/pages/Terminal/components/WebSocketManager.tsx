/*
 * @Author: Await
 * @Date: 2025-05-25 10:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 17:29:42
 * @Description: WebSocket管理器组件
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Drawer,
    Button,
    Tabs,
    Badge,
    Switch,
    Form,
    InputNumber,
    Divider,
    Card,
    Space,
    App
} from 'antd';
import { LinkOutlined, SettingOutlined, BarChartOutlined } from '@ant-design/icons';
import webSocketService from '../services/WebSocketService';
import WebSocketStatistics from './WebSocketStatistics';
import WebSocketConnectionDetails from './WebSocketConnectionDetails';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { WebSocketEventHandlers } from '../services/WebSocketService';

// 组件样式
const styles = {
    floatButton: {
        position: 'fixed' as const,
        right: '20px',
        bottom: '20px',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1677ff',
        color: '#fff',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        zIndex: 999,
        cursor: 'pointer',
        border: 'none'
    },
    drawer: {
        body: {
            padding: '0px',
        }
    },
    tabContent: {
        padding: '20px',
        height: 'calc(100vh - 55px)',
        overflowY: 'auto' as const
    }
};

// WebSocketManager属性接口
interface WebSocketManagerProps {
    tabs?: TerminalTab[];
    onCreateWebSocket?: (sessionId: string | number, tabKey: string) => WebSocket | null;
    onCloseWebSocket?: (tabKey: string) => void;
    createWebSocketConnection?: (sessionId: string | number, tabKey: string) => WebSocket | null;
}

/**
 * WebSocket管理器组件
 * 负责管理所有终端的WebSocket连接
 */
const WebSocketManager: React.FC<WebSocketManagerProps> = ({
    tabs = [],
    onCreateWebSocket,
    onCloseWebSocket,
    createWebSocketConnection
}) => {
    // 获取终端上下文
    const { updateTab } = useTerminal();

    // 获取Ant Design App API
    const { notification, message } = App.useApp();

    // WebSocket统计状态
    const [stats, setStats] = useState(webSocketService.getStats());

    // 组件状态
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [activeTab, setActiveTab] = useState('stats');
    const [statusBadge, setStatusBadge] = useState<'success' | 'warning' | 'error' | 'processing'>('processing');
    const connectionCheckerRef = useRef<number | null>(null);

    // 添加防重复通知状态
    const [hasShownDisconnectNotification, setHasShownDisconnectNotification] = useState(false);

    // 添加重连配置状态管理
    const [reconnectConfig, setReconnectConfig] = useState(webSocketService.getReconnectConfig());
    const [configForm] = Form.useForm();

    // 连接状态计算
    useEffect(() => {
        const computeStatus = () => {
            if (stats.activeConnections === 0) {
                return 'error';
            }

            if (stats.failedConnections > 0) {
                return 'warning';
            }

            return 'success';
        };

        const currentStatus = computeStatus();
        setStatusBadge(currentStatus as 'success' | 'warning' | 'error' | 'processing');

        // 防重复通知机制
        if (currentStatus === 'error' && stats.totalConnections > 0) {
            // 只有在之前没有显示过通知时才显示
            if (!hasShownDisconnectNotification) {
                notification.error({
                    message: 'WebSocket连接异常',
                    description: '所有WebSocket连接已断开，终端可能无法正常工作',
                    duration: 4
                });
                setHasShownDisconnectNotification(true);
                console.log('WebSocketManager: 已显示断开连接通知');
            }
        } else if (currentStatus === 'success' && hasShownDisconnectNotification) {
            // 当连接恢复时，重置通知状态
            setHasShownDisconnectNotification(false);
            console.log('WebSocketManager: 连接已恢复，重置通知状态');
        }
    }, [stats, hasShownDisconnectNotification]);

    // 更新统计数据
    useEffect(() => {
        const updateStats = () => {
            setStats(webSocketService.getStats());
        };

        // 定期更新统计
        const statsInterval = setInterval(updateStats, 1000);

        // 每30秒检查连接状态
        connectionCheckerRef.current = window.setInterval(() => {
            const activeConnections = webSocketService.getActiveConnections();

            // 记录当前连接状态
            console.log(`WebSocket连接状态检查: ${activeConnections.length}个活动连接`);

            // 更新统计
            updateStats();
        }, 30000);

        // 组件卸载时清理
        return () => {
            if (connectionCheckerRef.current) {
                clearInterval(connectionCheckerRef.current);
                connectionCheckerRef.current = null;
            }
            clearInterval(statsInterval);
        };
    }, []); // 移除所有依赖项，避免无限渲染

    // 初始化表单值
    useEffect(() => {
        const config = webSocketService.getReconnectConfig();
        setReconnectConfig(config);
        configForm.setFieldsValue({
            enabled: config.enabled,
            maxRetries: config.maxRetries,
            retryDelay: config.retryDelay / 1000, // 转换为秒
            heartbeatInterval: config.heartbeatInterval / 1000 // 转换为秒
        });
    }, [configForm]);

    // 处理重连配置变更
    const handleConfigChange = (changedFields: any, allFields: any) => {
        const newConfig = {
            enabled: allFields.enabled,
            maxRetries: allFields.maxRetries,
            retryDelay: (allFields.retryDelay || 3) * 1000, // 转换为毫秒
            heartbeatInterval: (allFields.heartbeatInterval || 30) * 1000 // 转换为毫秒
        };

        // 更新WebSocketService配置
        webSocketService.setReconnectConfig(newConfig);
        setReconnectConfig(newConfig);

        try {
            message.success('重连配置已更新');
        } catch (error) {
            console.warn('Message API error:', error);
        }
    };

    // 重置配置到默认值
    const resetConfigToDefault = () => {
        const defaultConfig = {
            enabled: true,
            maxRetries: 5,
            retryDelay: 3000,
            heartbeatInterval: 30000
        };

        webSocketService.setReconnectConfig(defaultConfig);
        setReconnectConfig(defaultConfig);

        // 重置通知状态
        setHasShownDisconnectNotification(false);

        configForm.setFieldsValue({
            enabled: true,
            maxRetries: 5,
            retryDelay: 3,
            heartbeatInterval: 30
        });

        try {
            message.success('配置已重置为默认值');
        } catch (error) {
            console.warn('Message API error:', error);
        }
    };

    // 创建WebSocket连接
    const handleCreateWebSocket = useCallback((tab: TerminalTab, handlers: WebSocketEventHandlers) => {
        // 检查重连配置 - 防止绕过重连限制
        const reconnectConfig = webSocketService.getReconnectConfig();
        if (!reconnectConfig.enabled) {
            console.warn(`自动重连已禁用，阻止创建新连接: ${tab.key}`);
            updateTab(tab.key, {
                isConnected: false,
                status: 'disconnected',
                error: '自动重连已禁用'
            });
            return null;
        }

        // 检查重连次数限制
        const reconnectState = webSocketService.getReconnectState(tab.key);
        if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
            console.warn(`已达到最大重试次数(${reconnectConfig.maxRetries})，阻止创建新连接: ${tab.key}`);
            updateTab(tab.key, {
                isConnected: false,
                status: 'disconnected',
                error: `已达到最大重试次数(${reconnectConfig.maxRetries})`
            });
            return null;
        }

        console.log(`WebSocketManager初始化: 为标签 ${tab.key} 创建WebSocket连接`);

        if (createWebSocketConnection && tab.sessionId) {
            return createWebSocketConnection(tab.sessionId, tab.key);
        } else if (onCreateWebSocket && tab.sessionId) {
            // 使用旧的API创建连接
            const ws = onCreateWebSocket(tab.sessionId, tab.key);

            // 如果有处理函数，添加事件处理器
            if (ws && handlers) {
                // 添加Open处理函数
                if (handlers.onOpen) {
                    const originalOnOpen = ws.onopen;
                    ws.onopen = (event) => {
                        // 先调用原始处理函数
                        if (originalOnOpen) {
                            originalOnOpen.call(ws, event);
                        }
                        // 再调用适配的处理函数
                        handlers.onOpen!(ws);
                    };
                }

                // 添加Message处理函数
                if (handlers.onMessage) {
                    const originalOnMessage = ws.onmessage;
                    ws.onmessage = (event) => {
                        // 先调用原始处理函数
                        if (originalOnMessage) {
                            originalOnMessage.call(ws, event);
                        }
                        // 再调用适配的处理函数
                        handlers.onMessage!(event);
                    };
                }

                // 添加Close处理函数
                if (handlers.onClose) {
                    const originalOnClose = ws.onclose;
                    ws.onclose = (event) => {
                        // 先调用原始处理函数
                        if (originalOnClose) {
                            originalOnClose.call(ws, event);
                        }
                        // 再调用适配的处理函数
                        handlers.onClose!();
                    };
                }

                // 添加Error处理函数
                if (handlers.onError) {
                    const originalOnError = ws.onerror;
                    ws.onerror = (event) => {
                        // 先调用原始处理函数
                        if (originalOnError) {
                            originalOnError.call(ws, event);
                        }
                        // 再调用适配的处理函数
                        handlers.onError!(event);
                    };
                }
            }

            return ws;
        }

        return webSocketService.connect(tab, handlers);
    }, [createWebSocketConnection, onCreateWebSocket]);

    // 组件初始化 - 检查当前活动标签
    useEffect(() => {
        // 立即检查全局停止状态，避免不必要的处理
        if (webSocketService.globalReconnectStopped) {
            console.log('WebSocketManager: 全局重连已停止，跳过初始化');
            return;
        }

        let globalStopped = false;

        // 监听全局重连停止事件
        const handleGlobalStop = () => {
            console.log('WebSocketManager: 收到全局停止信号');
            globalStopped = true;
            // 重置通知状态，避免遗留的通知状态
            setHasShownDisconnectNotification(false);
        };

        window.addEventListener('global-reconnect-stopped', handleGlobalStop);

        // 检查重连配置 - 如果重连被禁用，不进行初始化
        const reconnectConfig = webSocketService.getReconnectConfig();
        if (!reconnectConfig.enabled || globalStopped || webSocketService.globalReconnectStopped) {
            if (!globalStopped && !webSocketService.globalReconnectStopped) {
                console.log('WebSocketManager初始化: 重连已禁用，跳过初始化');
            }
            return () => {
                window.removeEventListener('global-reconnect-stopped', handleGlobalStop);
            };
        }

        // 强制检查所有标签的重连状态，防止无限重连
        if (tabs.length > 0) {
            for (const tab of tabs) {
                const reconnectState = webSocketService.getReconnectState(tab.key);
                if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                    console.warn(`WebSocketManager初始化: 标签 ${tab.key} 已达到最大重试次数(${reconnectConfig.maxRetries})，跳过处理`);
                    // 更新标签状态
                    updateTab(tab.key, {
                        isConnected: false,
                        status: 'disconnected',
                        error: `已达到最大重试次数(${reconnectConfig.maxRetries})`
                    });
                    continue; // 跳过这个标签
                }
            }
        }

        // 如果有活动标签，检查其WebSocket连接状态
        if (tabs.length > 0) {
            // 查找活动标签
            const activeTab = tabs.find(tab => tab.key === tabs[0].key);
            if (activeTab) {
                // 再次检查重连次数限制（双重保险）
                const reconnectState = webSocketService.getReconnectState(activeTab.key);
                if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                    console.log(`WebSocketManager初始化: 已达到最大重试次数(${reconnectConfig.maxRetries})，跳过初始化: ${activeTab.key}`);
                    updateTab(activeTab.key, {
                        isConnected: false,
                        status: 'disconnected',
                        error: `已达到最大重试次数(${reconnectConfig.maxRetries})`
                    });
                    return () => {
                        window.removeEventListener('global-reconnect-stopped', handleGlobalStop);
                    };
                }

                // 检查WebSocket连接状态
                const needConnection = !activeTab.webSocketRef?.current ||
                    (activeTab.webSocketRef.current.readyState !== WebSocket.OPEN &&
                        activeTab.webSocketRef.current.readyState !== WebSocket.CONNECTING);

                // 只有在需要连接且当前没有连接中的状态时才创建连接
                if (needConnection && activeTab.sessionId && !activeTab.isConnected && activeTab.status !== 'connecting') {
                    console.log(`WebSocketManager初始化: 为标签 ${activeTab.key} 创建WebSocket连接`);

                    // 先标记为连接中，防止重复创建
                    updateTab(activeTab.key, {
                        status: 'connecting'
                    });

                    // 延迟创建连接，确保DOM已准备好
                    setTimeout(() => {
                        // 再次检查重连配置（防止在延迟期间配置改变）
                        const currentConfig = webSocketService.getReconnectConfig();
                        if (!currentConfig.enabled) {
                            console.log('WebSocketManager初始化: 延迟检查发现重连已禁用，取消连接创建');
                            updateTab(activeTab.key, {
                                isConnected: false,
                                status: 'disconnected',
                                error: '重连已禁用'
                            });
                            return;
                        }

                        // 最后一次检查重连次数限制
                        const finalReconnectState = webSocketService.getReconnectState(activeTab.key);
                        if (finalReconnectState && finalReconnectState.retryCount >= currentConfig.maxRetries) {
                            console.log('WebSocketManager初始化: 延迟检查发现已达到最大重试次数，取消连接创建');
                            updateTab(activeTab.key, {
                                isConnected: false,
                                status: 'disconnected',
                                error: `已达到最大重试次数(${currentConfig.maxRetries})`
                            });
                            return;
                        }

                        // 创建自定义处理函数
                        const handlers: WebSocketEventHandlers = {
                            onOpen: (ws) => {
                                console.log(`WebSocketManager初始化: 标签 ${activeTab.key} 的WebSocket连接已打开`);
                                updateTab(activeTab.key, {
                                    isConnected: true,
                                    status: 'connected',
                                    error: undefined
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
                            },
                            onClose: () => {
                                console.log(`WebSocketManager初始化: 标签 ${activeTab.key} 的WebSocket连接已关闭`);
                                updateTab(activeTab.key, {
                                    isConnected: false,
                                    status: 'disconnected'
                                });
                            },
                            onError: (event) => {
                                console.error(`WebSocketManager初始化: 标签 ${activeTab.key} 的WebSocket连接错误`, event);
                                updateTab(activeTab.key, {
                                    isConnected: false,
                                    status: 'error',
                                    error: '连接错误',
                                    errorTime: new Date().toISOString()
                                });
                            }
                        };

                        // 创建WebSocket连接
                        handleCreateWebSocket(activeTab, handlers);
                    }, 500);
                }
            }
        }

        // 清理函数
        return () => {
            window.removeEventListener('global-reconnect-stopped', handleGlobalStop);
        };
    }, [tabs.length]); // 仅依赖tabs.length，移除handleCreateWebSocket避免循环

    // 监听标签页激活事件，确保WebSocket连接建立
    useEffect(() => {
        const handleTabActivated = (event: CustomEvent) => {
            // 立即检查全局停止状态
            if (webSocketService.globalReconnectStopped) {
                return;
            }

            const { tabKey, connectionId, sessionId } = event.detail;
            console.log(`WebSocketManager收到标签激活事件: tabKey=${tabKey}`);

            // 检查重连配置 - 防止无限重连循环
            const reconnectConfig = webSocketService.getReconnectConfig();
            if (!reconnectConfig.enabled) {
                console.log(`自动重连已禁用，跳过标签页激活处理: ${tabKey}`);
                return;
            }

            // 检查重连次数限制
            const reconnectState = webSocketService.getReconnectState(tabKey);
            if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                console.log(`已达到最大重试次数(${reconnectConfig.maxRetries})，跳过标签页激活处理: ${tabKey}`);
                return;
            }

            // 延迟执行，确保DOM和React状态都已就绪
            setTimeout(() => {
                // 找到要激活的标签
                const tab = tabs.find(t => t.key === tabKey);
                if (!tab) {
                    console.error(`未找到要激活的标签: ${tabKey}`);
                    return;
                }

                // 检查WebSocket连接状态
                const wsRef = tab.webSocketRef?.current;
                const needConnection = !wsRef ||
                    (wsRef.readyState !== WebSocket.OPEN &&
                        wsRef.readyState !== WebSocket.CONNECTING);

                // 添加更严格的检查条件，防止重复创建连接
                if (needConnection && tab.sessionId && !tab.isConnected && tab.status !== 'connecting') {
                    console.log(`WebSocketManager: 为标签 ${tabKey} 创建WebSocket连接`);

                    // 先更新状态为连接中，防止重复触发
                    updateTab(tab.key, {
                        status: 'connecting'
                    });

                    // 创建自定义处理函数
                    const handlers: WebSocketEventHandlers = {
                        onOpen: () => {
                            console.log(`WebSocket连接已打开: ${tabKey}`);
                            updateTab(tab.key, {
                                isConnected: true,
                                status: 'connected'
                            });
                        },
                        onClose: () => {
                            console.log(`WebSocket连接已关闭: ${tabKey}`);
                            updateTab(tab.key, {
                                isConnected: false,
                                status: 'disconnected'
                            });
                        },
                        onError: (error) => {
                            console.error(`WebSocket连接错误: ${tabKey}`, error);
                            updateTab(tab.key, {
                                isConnected: false,
                                status: 'error',
                                error: '连接发生错误',
                                errorTime: new Date().toISOString()
                            });
                        },
                        onMessage: (event) => {
                            // 消息处理已移至TerminalConnectionWrapper，这里只做日志记录
                            console.log(`📊 [WebSocketManager] ${tabKey} 收到消息，数据类型: ${typeof event.data}, 大小: ${event.data instanceof Blob ? event.data.size + ' bytes' : (typeof event.data === 'string' ? event.data.length + ' chars' : 'unknown')}`);

                            // 注意：实际的消息处理现在由TerminalConnectionWrapper的processMessage函数负责
                            // 这里不再处理消息内容，避免与二进制协议处理冲突
                        }
                    };

                    // 尝试创建WebSocket连接
                    // 首先使用传入的createWebSocketConnection函数
                    if (createWebSocketConnection && tab.sessionId) {
                        try {
                            const ws = createWebSocketConnection(tab.sessionId, tab.key);
                            if (ws) {
                                // 更新WebSocket引用
                                if (tab.webSocketRef) {
                                    tab.webSocketRef.current = ws;
                                }

                                // 更新标签状态
                                updateTab(tab.key, {
                                    status: 'connecting'
                                });

                                console.log(`WebSocket连接创建成功: ${tabKey}`);
                            } else {
                                console.error(`WebSocket创建失败: ${tabKey}`);
                                updateTab(tab.key, {
                                    status: 'error',
                                    error: 'WebSocket连接创建失败'
                                });
                            }
                        } catch (error) {
                            console.error(`创建WebSocket时出错: ${tabKey}`, error);
                            updateTab(tab.key, {
                                status: 'error',
                                error: `连接错误: ${error instanceof Error ? error.message : String(error)}`
                            });
                        }
                    } else {
                        console.error(`无法创建WebSocket连接: createWebSocketConnection未提供或sessionId不存在, tabKey=${tabKey}`);
                        updateTab(tab.key, {
                            status: 'error',
                            error: 'WebSocket连接配置错误'
                        });
                    }
                } else if (wsRef && wsRef.readyState === WebSocket.OPEN) {
                    console.log(`标签 ${tabKey} 已有活跃的WebSocket连接`);
                } else if (wsRef && wsRef.readyState === WebSocket.CONNECTING) {
                    console.log(`标签 ${tabKey} 的WebSocket连接正在建立中`);
                } else {
                    console.log(`标签 ${tabKey} 无需创建WebSocket连接或缺少会话ID`);
                }
            }, 100); // 短暂延迟确保DOM已就绪
        };

        // 添加事件监听器
        window.addEventListener('terminal-tab-activated', handleTabActivated as EventListener);

        // 监听重连请求事件
        const handleReconnectRequest = (event: CustomEvent) => {
            const { tabKey, tab, connectionId, sessionId } = event.detail;
            console.log(`WebSocketManager收到重连请求: tabKey=${tabKey}`);

            if (tab && tab.sessionId) {
                // 检查WebSocketService的重连配置
                const reconnectConfig = webSocketService.getReconnectConfig();
                if (!reconnectConfig.enabled) {
                    console.log(`自动重连已禁用，跳过重连请求: ${tabKey}`);
                    updateTab(tab.key, {
                        isConnected: false,
                        status: 'disconnected',
                        error: '自动重连已禁用'
                    });
                    return;
                }

                // 检查重连状态和限制
                const reconnectState = webSocketService.getReconnectState?.(tabKey);
                if (reconnectState && reconnectState.retryCount >= reconnectConfig.maxRetries) {
                    console.warn(`已达到最大重试次数(${reconnectConfig.maxRetries})，跳过重连: ${tabKey}`);
                    updateTab(tab.key, {
                        isConnected: false,
                        status: 'error',
                        error: `已达到最大重试次数(${reconnectConfig.maxRetries})`
                    });
                    return;
                }

                // 设置手动重连标志，防止自动重连干扰
                sessionStorage.setItem(`manual-reconnect-${tabKey}`, 'true');
                // 创建自定义处理函数
                const handlers: WebSocketEventHandlers = {
                    onOpen: (ws) => {
                        console.log(`重连成功: ${tabKey}`);
                        updateTab(tab.key, {
                            isConnected: true,
                            status: 'connected',
                            error: undefined
                        });

                        // 触发终端就绪事件
                        window.dispatchEvent(new CustomEvent('terminal-ready', {
                            detail: {
                                tabKey: tab.key,
                                connectionId: tab.connectionId,
                                sessionId: tab.sessionId,
                                protocol: tab.protocol || 'ssh'
                            }
                        }));
                    },
                    onClose: () => {
                        console.log(`重连后断开: ${tabKey}`);
                        updateTab(tab.key, {
                            isConnected: false,
                            status: 'disconnected'
                        });
                    },
                    onError: (event) => {
                        console.error(`重连失败: ${tabKey}`, event);
                        updateTab(tab.key, {
                            isConnected: false,
                            status: 'error',
                            error: '重连失败',
                            errorTime: new Date().toISOString()
                        });
                    }
                };

                // 使用WebSocketService进行重连
                const ws = webSocketService.refreshConnection(tab, handlers);
                if (ws && tab.webSocketRef) {
                    tab.webSocketRef.current = ws;
                }
            }
        };

        // 添加重连事件监听器
        window.addEventListener('terminal-reconnect-request', handleReconnectRequest as EventListener);

        // 组件卸载时移除事件监听器
        return () => {
            window.removeEventListener('terminal-tab-activated', handleTabActivated as EventListener);
            window.removeEventListener('terminal-reconnect-request', handleReconnectRequest as EventListener);
        };
    }, []); // 移除所有依赖项，使用空依赖数组

    // 显示管理器抽屉
    const showDrawer = () => {
        setDrawerVisible(true);
    };

    // 关闭管理器抽屉
    const closeDrawer = () => {
        setDrawerVisible(false);
    };

    return (
        <>
            {/* 悬浮按钮 */}
            <Button
                type="primary"
                shape="circle"
                icon={<>
                    <LinkOutlined />
                    <Badge status={statusBadge} style={{ position: 'absolute', top: '-3px', right: '-3px' }} />
                </>}
                style={styles.floatButton}
                onClick={showDrawer}
                className="websocket-manager-button"
            />

            {/* 管理器抽屉 */}
            <Drawer
                title={
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <LinkOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                        <span>WebSocket连接管理器</span>
                        <Badge
                            status={statusBadge}
                            style={{ marginLeft: '12px' }}
                        />
                    </div>
                }
                placement="right"
                width={400}
                onClose={closeDrawer}
                open={drawerVisible}
                styles={{
                    body: { padding: '16px' }
                }}
            >
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    size="small"
                    items={[
                        {
                            key: 'stats',
                            label: (
                                <span>
                                    <BarChartOutlined />
                                    统计
                                </span>
                            ),
                            children: (
                                <div style={{ marginTop: '8px' }}>
                                    <WebSocketStatistics />
                                </div>
                            )
                        },
                        {
                            key: 'connections',
                            label: (
                                <span>
                                    <LinkOutlined />
                                    连接
                                    <Badge count={stats.activeConnections} size="small" style={{ marginLeft: 6 }} />
                                </span>
                            ),
                            children: (
                                <div style={{ marginTop: '8px' }}>
                                    <WebSocketConnectionDetails tabs={tabs} />
                                </div>
                            )
                        },
                        {
                            key: 'settings',
                            label: (
                                <span>
                                    <SettingOutlined />
                                    设置
                                </span>
                            ),
                            children: (
                                <div style={{ marginTop: '8px' }}>
                                    <Card size="small" title="连接配置"
                                        extra={
                                            <Button size="small" onClick={resetConfigToDefault}>
                                                重置默认
                                            </Button>
                                        }>
                                        <Form
                                            form={configForm}
                                            layout="vertical"
                                            size="small"
                                            onValuesChange={handleConfigChange}
                                            initialValues={{
                                                enabled: reconnectConfig.enabled,
                                                maxRetries: reconnectConfig.maxRetries,
                                                retryDelay: reconnectConfig.retryDelay / 1000,
                                                heartbeatInterval: reconnectConfig.heartbeatInterval / 1000
                                            }}
                                        >
                                            <Form.Item
                                                name="enabled"
                                                label="自动重连"
                                                tooltip="连接断开时自动尝试重新连接"
                                                style={{ marginBottom: '12px' }}
                                                valuePropName="checked"
                                            >
                                                <Switch size="small" />
                                            </Form.Item>

                                            <Form.Item
                                                name="maxRetries"
                                                label="重连最大次数"
                                                style={{ marginBottom: '12px' }}
                                                rules={[
                                                    { required: true, message: '请输入重连最大次数' },
                                                    { type: 'number', min: 1, max: 10, message: '请输入1-10之间的数字' }
                                                ]}
                                            >
                                                <InputNumber
                                                    min={1}
                                                    max={10}
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                    addonAfter="次"
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                name="retryDelay"
                                                label="重连延迟"
                                                style={{ marginBottom: '12px' }}
                                                rules={[
                                                    { required: true, message: '请输入重连延迟' },
                                                    { type: 'number', min: 1, max: 30, message: '请输入1-30之间的数字' }
                                                ]}
                                            >
                                                <InputNumber
                                                    min={1}
                                                    max={30}
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                    addonAfter="秒"
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                name="heartbeatInterval"
                                                label="心跳间隔"
                                                style={{ marginBottom: '12px' }}
                                                rules={[
                                                    { required: true, message: '请输入心跳间隔' },
                                                    { type: 'number', min: 5, max: 120, message: '请输入5-120之间的数字' }
                                                ]}
                                            >
                                                <InputNumber
                                                    min={5}
                                                    max={120}
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                    addonAfter="秒"
                                                />
                                            </Form.Item>

                                            <Form.Item style={{ marginBottom: 0 }}>
                                                <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.4' }}>
                                                    <div>• 自动重连：连接意外断开时是否自动尝试重连</div>
                                                    <div>• 重连延迟：每次重连尝试的间隔时间（会递增）</div>
                                                    <div>• 心跳间隔：检测连接状态的频率</div>
                                                    <div>• 当前配置立即生效，影响所有新连接</div>
                                                </div>
                                            </Form.Item>

                                            <Form.Item>
                                                <Space>
                                                    <Button type="primary" onClick={() => configForm.submit()}>
                                                        应用配置
                                                    </Button>
                                                    <Button onClick={resetConfigToDefault}>
                                                        重置默认
                                                    </Button>
                                                </Space>
                                            </Form.Item>


                                        </Form>
                                    </Card>

                                    <Card size="small" title="通知设置" style={{ marginTop: '12px' }}>
                                        <div style={{ padding: '12px' }}>
                                            <div style={{ marginBottom: '8px' }}>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>连接异常通知</label>
                                                <Switch defaultChecked size="small" />
                                            </div>
                                            <div style={{ marginBottom: '8px' }}>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>连接成功通知</label>
                                                <Switch size="small" />
                                            </div>
                                        </div>
                                    </Card>


                                </div>
                            )
                        }
                    ]}
                />
            </Drawer>
        </>
    );
};

// 导出为React容器组件
export default WebSocketManager; 
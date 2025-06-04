/*
 * @Author: Await
 * @Date: 2025-05-25 10:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-04 20:51:32
 * @Description: WebSocket管理器组件
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Drawer, Button, Tabs, Badge, notification, Switch, Form, InputNumber, Divider, Card } from 'antd';
import { LinkOutlined, SettingOutlined, BarChartOutlined, WarningOutlined } from '@ant-design/icons';
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

    // WebSocket统计状态
    const [stats, setStats] = useState(webSocketService.getStats());

    // 组件状态
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [activeTab, setActiveTab] = useState('stats');
    const [statusBadge, setStatusBadge] = useState<'success' | 'warning' | 'error' | 'processing'>('processing');
    const connectionCheckerRef = useRef<number | null>(null);

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

        setStatusBadge(computeStatus() as 'success' | 'warning' | 'error' | 'processing');

        // 如果出现错误，显示通知
        if (computeStatus() === 'error' && stats.totalConnections > 0) {
            notification.error({
                message: 'WebSocket连接异常',
                description: '所有WebSocket连接已断开，终端可能无法正常工作',
                duration: 4
            });
        }
    }, [stats]);

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
    }, []);

    // 创建WebSocket连接
    const handleCreateWebSocket = useCallback((tab: TerminalTab, handlers: WebSocketEventHandlers) => {
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

    // 关闭WebSocket连接
    const handleCloseWebSocket = (tabKey: string) => {
        if (onCloseWebSocket) {
            onCloseWebSocket(tabKey);
        } else {
            webSocketService.closeConnection(tabKey);
        }
    };

    // 组件初始化 - 检查当前活动标签
    useEffect(() => {
        // 如果有活动标签，检查其WebSocket连接状态
        if (tabs.length > 0) {
            // 查找活动标签
            const activeTab = tabs.find(tab => tab.key === tabs[0].key);
            if (activeTab) {
                // 检查WebSocket连接状态
                const needConnection = !activeTab.webSocketRef?.current ||
                    (activeTab.webSocketRef.current.readyState !== WebSocket.OPEN &&
                        activeTab.webSocketRef.current.readyState !== WebSocket.CONNECTING);

                if (needConnection && activeTab.sessionId) {
                    console.log(`WebSocketManager初始化: 为标签 ${activeTab.key} 创建WebSocket连接`);

                    // 延迟创建连接，确保DOM已准备好
                    setTimeout(() => {
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

                        // 主动触发标签激活事件
                        window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
                            detail: {
                                tabKey: activeTab.key,
                                connectionId: activeTab.connectionId,
                                sessionId: activeTab.sessionId
                            }
                        }));
                    }, 500);
                }
            }
        }
    }, [tabs, handleCreateWebSocket, updateTab]);

    // 监听标签页激活事件，确保WebSocket连接建立
    useEffect(() => {
        const handleTabActivated = (event: CustomEvent) => {
            const { tabKey, connectionId, sessionId } = event.detail;
            console.log(`WebSocketManager收到标签激活事件: tabKey=${tabKey}`);

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

                if (needConnection && tab.sessionId) {
                    console.log(`WebSocketManager: 为标签 ${tabKey} 创建WebSocket连接`);

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
    }, [tabs, updateTab, createWebSocketConnection]);

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
                                    <Card size="small" title="连接配置">
                                        <Form layout="vertical" size="small">
                                            <Form.Item
                                                label="自动重连"
                                                tooltip="连接断开时自动尝试重新连接"
                                                style={{ marginBottom: '12px' }}
                                            >
                                                <Switch defaultChecked size="small" />
                                            </Form.Item>

                                            <Form.Item
                                                label="重连最大次数"
                                                style={{ marginBottom: '12px' }}
                                            >
                                                <InputNumber
                                                    min={1}
                                                    max={10}
                                                    defaultValue={5}
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                label="重连延迟(秒)"
                                                style={{ marginBottom: '12px' }}
                                            >
                                                <InputNumber
                                                    min={1}
                                                    max={30}
                                                    defaultValue={3}
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                label="心跳间隔(秒)"
                                                style={{ marginBottom: '12px' }}
                                            >
                                                <InputNumber
                                                    min={5}
                                                    max={60}
                                                    defaultValue={30}
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                />
                                            </Form.Item>
                                        </Form>
                                    </Card>

                                    <Card size="small" title="通知设置" style={{ marginTop: '12px' }}>
                                        <Form layout="vertical" size="small">
                                            <Form.Item
                                                label="连接异常通知"
                                                style={{ marginBottom: '8px' }}
                                            >
                                                <Switch defaultChecked size="small" />
                                            </Form.Item>

                                            <Form.Item
                                                label="连接成功通知"
                                                style={{ marginBottom: '8px' }}
                                            >
                                                <Switch size="small" />
                                            </Form.Item>
                                        </Form>
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
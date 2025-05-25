/*
 * @Author: Await
 * @Date: 2025-05-25 10:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-24 18:41:26
 * @Description: WebSocket管理器组件
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Drawer, Button, Tabs, Badge, notification, Switch, Form, InputNumber, Divider } from 'antd';
import { LinkOutlined, SettingOutlined, BarChartOutlined, WarningOutlined } from '@ant-design/icons';
import { useWebSocketManager } from '../hooks/useWebSocketManager';
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

    // WebSocket管理器Hook
    const {
        stats,
        connect,
        disconnect,
        disconnectAll,
        refresh,
        getActiveConnections
    } = useWebSocketManager();

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

    // 组件初始化 - 添加WebSocket连接检查定时器
    useEffect(() => {
        // 每30秒检查连接状态
        connectionCheckerRef.current = window.setInterval(() => {
            const activeConnections = getActiveConnections();

            // 记录当前连接状态
            console.log(`WebSocket连接状态检查: ${activeConnections.length}个活动连接`);

            // 如果有断开的连接需要重连，可以在这里处理
        }, 30000);

        // 组件卸载时清理
        return () => {
            if (connectionCheckerRef.current) {
                clearInterval(connectionCheckerRef.current);
                connectionCheckerRef.current = null;
            }
        };
    }, [getActiveConnections]);

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

        return connect(tab, handlers);
    }, [createWebSocketConnection, onCreateWebSocket, connect]);

    // 关闭WebSocket连接
    const handleCloseWebSocket = (tabKey: string) => {
        if (onCloseWebSocket) {
            onCloseWebSocket(tabKey);
        } else {
            disconnect(tabKey);
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
                            // 处理消息
                            try {
                                let data = event.data;

                                // 如果数据是Blob类型，需要先转换为文本
                                if (data instanceof Blob) {
                                    // 使用FileReader API读取Blob数据
                                    const reader = new FileReader();
                                    reader.onload = function () {
                                        const text = reader.result as string;
                                        try {
                                            // 尝试解析为JSON
                                            const jsonData = JSON.parse(text);
                                            console.log(`收到JSON数据: ${tabKey}`, jsonData);
                                            // 在这里处理JSON数据
                                        } catch (jsonError) {
                                            // 如果不是JSON，作为普通文本处理
                                            console.log(`收到文本数据: ${tabKey}`, text);
                                            // 在这里处理文本数据
                                        }
                                    };
                                    reader.onerror = function () {
                                        console.error(`读取Blob数据出错: ${tabKey}`);
                                    };
                                    reader.readAsText(data);
                                } else if (typeof data === 'string') {
                                    // 如果直接是字符串，尝试解析为JSON
                                    try {
                                        const jsonData = JSON.parse(data);
                                        console.log(`收到JSON数据: ${tabKey}`, jsonData);
                                        // 在这里处理JSON数据
                                    } catch (jsonError) {
                                        // 如果不是JSON，作为普通文本处理
                                        console.log(`收到文本数据: ${tabKey}`, data);
                                        // 在这里处理文本数据
                                    }
                                } else {
                                    // 其他类型数据
                                    console.log(`收到未知类型数据: ${tabKey}`, typeof data);
                                }
                            } catch (error) {
                                console.error(`处理WebSocket消息时出错: ${tabKey}`, error);
                            }
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

        // 组件卸载时移除事件监听器
        return () => {
            window.removeEventListener('terminal-tab-activated', handleTabActivated as EventListener);
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
                title="WebSocket连接管理器"
                placement="right"
                width={680}
                onClose={closeDrawer}
                open={drawerVisible}
            >
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            key: 'stats',
                            label: (
                                <span>
                                    <BarChartOutlined />
                                    连接统计
                                </span>
                            ),
                            children: (
                                <div style={styles.tabContent}>
                                    <WebSocketStatistics />
                                </div>
                            )
                        },
                        {
                            key: 'connections',
                            label: (
                                <span>
                                    <LinkOutlined />
                                    活动连接
                                    <Badge count={stats.activeConnections} style={{ marginLeft: 8 }} />
                                </span>
                            ),
                            children: (
                                <div style={styles.tabContent}>
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
                                <div style={styles.tabContent}>
                                    <h3>WebSocket设置</h3>
                                    <Divider />

                                    <Form layout="vertical">
                                        <Form.Item label="自动重连" tooltip="当WebSocket连接断开时，是否自动尝试重新连接">
                                            <Switch defaultChecked />
                                        </Form.Item>

                                        <Form.Item label="重连最大次数" tooltip="在放弃之前尝试重新连接的最大次数">
                                            <InputNumber min={1} max={10} defaultValue={5} />
                                        </Form.Item>

                                        <Form.Item label="重连延迟(秒)" tooltip="每次重连尝试之间的等待时间">
                                            <InputNumber min={1} max={30} defaultValue={3} />
                                        </Form.Item>

                                        <Form.Item label="心跳间隔(秒)" tooltip="保持WebSocket连接活跃的心跳包发送间隔">
                                            <InputNumber min={5} max={60} defaultValue={30} />
                                        </Form.Item>

                                        <Divider />

                                        <Form.Item label="连接异常通知" tooltip="当WebSocket连接异常时，是否显示通知">
                                            <Switch defaultChecked />
                                        </Form.Item>
                                    </Form>
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
/*
 * @Author: Await
 * @Date: 2025-05-25 10:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-25 10:30:00
 * @Description: WebSocket管理器组件
 */

import React, { useEffect, useRef, useState } from 'react';
import { Drawer, Button, Tabs, Badge, notification, Switch, Form, InputNumber, Divider } from 'antd';
import { LinkOutlined, SettingOutlined, BarChartOutlined, WarningOutlined } from '@ant-design/icons';
import { useWebSocketManager } from '../hooks/useWebSocketManager';
import WebSocketStatistics from './WebSocketStatistics';
import WebSocketConnectionDetails from './WebSocketConnectionDetails';
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
    onCreateWebSocket?: (tab: TerminalTab, handlers: WebSocketEventHandlers) => WebSocket | null;
    onCloseWebSocket?: (tabKey: string) => void;
}

/**
 * WebSocket管理器组件
 * 负责管理所有终端的WebSocket连接
 */
const WebSocketManager: React.FC<WebSocketManagerProps> = ({
    tabs = [],
    onCreateWebSocket,
    onCloseWebSocket
}) => {
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
    const handleCreateWebSocket = (tab: TerminalTab, handlers: WebSocketEventHandlers) => {
        if (onCreateWebSocket) {
            return onCreateWebSocket(tab, handlers);
        }
        return connect(tab, handlers);
    };

    // 关闭WebSocket连接
    const handleCloseWebSocket = (tabKey: string) => {
        if (onCloseWebSocket) {
            onCloseWebSocket(tabKey);
        } else {
            disconnect(tabKey);
        }
    };

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
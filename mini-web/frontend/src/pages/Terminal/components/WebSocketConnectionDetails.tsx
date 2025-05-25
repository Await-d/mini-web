/*
 * @Author: Await
 * @Date: 2025-05-25 11:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-25 20:09:41
 * @Description: WebSocket连接详情组件
 */

import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, Card, Descriptions, Badge, Typography, Tooltip, Progress } from 'antd';
import { LinkOutlined, CloseOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import webSocketService from '../services/WebSocketService';
import type { TerminalTab } from '../../../contexts/TerminalContext';

const { Text, Title } = Typography;

// 连接状态颜色映射
const statusColors = {
    CONNECTING: 'blue',
    OPEN: 'green',
    CLOSING: 'orange',
    CLOSED: 'red'
};

// WebSocket状态映射
const webSocketStateMap: Record<number, string> = {
    0: 'CONNECTING',
    1: 'OPEN',
    2: 'CLOSING',
    3: 'CLOSED'
};

// 组件属性接口
interface WebSocketConnectionDetailsProps {
    tabs?: TerminalTab[];
}

/**
 * WebSocket连接详情组件
 */
const WebSocketConnectionDetails: React.FC<WebSocketConnectionDetailsProps> = ({
    tabs = []
}) => {
    // 组件状态
    const [connections, setConnections] = useState<any[]>([]);
    const [selectedConnection, setSelectedConnection] = useState<any | null>(null);
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // 获取连接详情
    useEffect(() => {
        const activeConnections = webSocketService.getActiveConnections();

        // 将连接数据转换为表格数据
        const tableData = activeConnections.map(({ tabKey, ws }) => {
            // 查找对应的标签
            const tab = tabs.find(t => t.key === tabKey);

            return {
                key: tabKey,
                tabName: tab?.title || '未知标签',
                protocol: tab?.protocol || 'unknown',
                state: webSocketStateMap[ws.readyState] || 'UNKNOWN',
                connectionId: tab?.connectionId,
                sessionId: tab?.sessionId,
                wsInstance: ws
            };
        });

        setConnections(tableData);
    }, [tabs, refreshTrigger]);

    // 刷新连接列表
    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    // 查看连接详情
    const handleViewDetails = (record: any) => {
        setSelectedConnection(record);
        setDetailsVisible(true);
    };

    // 关闭连接
    const handleCloseConnection = (tabKey: string) => {
        Modal.confirm({
            title: '关闭连接',
            content: '确定要关闭此WebSocket连接吗？这可能会导致终端断开。',
            okText: '确定',
            cancelText: '取消',
            onOk: () => {
                webSocketService.closeConnection(tabKey);
                // 更新连接列表
                setTimeout(() => {
                    handleRefresh();
                }, 300);
            }
        });
    };

    // 重新连接
    const handleReconnect = (record: any) => {
        // 查找对应的标签
        const tab = tabs.find(t => t.key === record.key);

        if (tab) {
            Modal.confirm({
                title: '重新连接',
                content: '确定要重新连接此WebSocket吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => {
                    // 先关闭现有连接
                    webSocketService.closeConnection(record.key);

                    // 延迟稍长一些，确保连接完全关闭
                    setTimeout(() => {
                        // 触发重连事件，让外部组件处理重连逻辑
                        window.dispatchEvent(new CustomEvent('terminal-reconnect-request', {
                            detail: {
                                tabKey: record.key,
                                tab: tab,
                                connectionId: tab.connectionId,
                                sessionId: tab.sessionId
                            }
                        }));

                        // 延迟刷新列表，等待重连完成
                        setTimeout(() => {
                            handleRefresh();
                        }, 1000);
                    }, 500);
                }
            });
        }
    };

    // 表格列定义
    const columns = [
        {
            title: '标签',
            dataIndex: 'tabName',
            key: 'tabName',
            width: 200,
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: '协议',
            dataIndex: 'protocol',
            key: 'protocol',
            width: 100,
            render: (protocol: string) => (
                <Tag color={protocol === 'ssh' ? 'blue' : protocol === 'rdp' ? 'purple' : 'default'}>
                    {protocol.toUpperCase()}
                </Tag>
            )
        },
        {
            title: '状态',
            dataIndex: 'state',
            key: 'state',
            width: 120,
            render: (state: string) => (
                <Badge
                    status={
                        state === 'OPEN' ? 'success' :
                            state === 'CONNECTING' ? 'processing' :
                                state === 'CLOSING' ? 'warning' : 'error'
                    }
                    text={state}
                />
            )
        },
        {
            title: '会话ID',
            dataIndex: 'sessionId',
            key: 'sessionId',
            width: 120
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: any) => (
                <Space size="small">
                    <Button
                        size="small"
                        type="text"
                        icon={<InfoCircleOutlined />}
                        onClick={() => handleViewDetails(record)}
                    >
                        详情
                    </Button>
                    <Button
                        size="small"
                        type="text"
                        icon={<ReloadOutlined />}
                        onClick={() => handleReconnect(record)}
                    >
                        重连
                    </Button>
                    <Button
                        size="small"
                        type="text"
                        danger
                        icon={<CloseOutlined />}
                        onClick={() => handleCloseConnection(record.key)}
                    >
                        断开
                    </Button>
                </Space>
            )
        }
    ];

    return (
        <div className="websocket-connections-details">
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16
            }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Title level={5} style={{ margin: 0 }}>
                        活动连接
                    </Title>
                    <Badge
                        count={connections.length}
                        style={{ marginLeft: 8 }}
                        showZero
                        color="#1890ff"
                    />
                </div>
                <Button
                    icon={<ReloadOutlined />}
                    size="small"
                    onClick={handleRefresh}
                    type="text"
                >
                    刷新
                </Button>
            </div>

            {connections.length === 0 ? (
                <Card size="small">
                    <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: '#8c8c8c'
                    }}>
                        <LinkOutlined style={{ fontSize: '32px', marginBottom: '16px' }} />
                        <div>暂无活动连接</div>
                        <div style={{ fontSize: '12px', marginTop: '8px' }}>
                            点击左侧连接列表建立新的WebSocket连接
                        </div>
                    </div>
                </Card>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {connections.map((connection) => (
                        <Card
                            key={connection.key}
                            size="small"
                            style={{
                                border: '1px solid #f0f0f0',
                                borderRadius: '8px'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                                        <Text strong style={{ fontSize: '14px' }}>
                                            {connection.tabName}
                                        </Text>
                                        <Tag
                                            color={connection.protocol === 'ssh' ? 'blue' : connection.protocol === 'rdp' ? 'purple' : 'default'}
                                            style={{ marginLeft: '8px' }}
                                        >
                                            {connection.protocol.toUpperCase()}
                                        </Tag>
                                        <Badge
                                            status={
                                                connection.state === 'OPEN' ? 'success' :
                                                    connection.state === 'CONNECTING' ? 'processing' :
                                                        connection.state === 'CLOSING' ? 'warning' : 'error'
                                            }
                                            text={connection.state}
                                            style={{ marginLeft: '8px' }}
                                        />
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                                        会话ID: {connection.sessionId || '未知'}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <Tooltip title="查看详情">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<InfoCircleOutlined />}
                                            onClick={() => handleViewDetails(connection)}
                                        />
                                    </Tooltip>
                                    <Tooltip title="重新连接">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<ReloadOutlined />}
                                            onClick={() => handleReconnect(connection)}
                                        />
                                    </Tooltip>
                                    <Tooltip title="断开连接">
                                        <Button
                                            size="small"
                                            type="text"
                                            danger
                                            icon={<CloseOutlined />}
                                            onClick={() => handleCloseConnection(connection.key)}
                                        />
                                    </Tooltip>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* 连接详情对话框 */}
            <Modal
                title="WebSocket连接详情"
                open={detailsVisible}
                onCancel={() => setDetailsVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setDetailsVisible(false)}>关闭</Button>,
                    <Button
                        key="disconnect"
                        danger
                        onClick={() => {
                            setDetailsVisible(false);
                            if (selectedConnection) {
                                handleCloseConnection(selectedConnection.key);
                            }
                        }}
                    >
                        断开连接
                    </Button>
                ]}
                width={600}
            >
                {selectedConnection && (
                    <Card bordered={false}>
                        <Descriptions title="基本信息" bordered column={1}>
                            <Descriptions.Item label="标签名称">{selectedConnection.tabName}</Descriptions.Item>
                            <Descriptions.Item label="协议">
                                <Tag color={selectedConnection.protocol === 'ssh' ? 'blue' : selectedConnection.protocol === 'rdp' ? 'purple' : 'default'}>
                                    {selectedConnection.protocol.toUpperCase()}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="连接状态">
                                <Badge
                                    status={
                                        selectedConnection.state === 'OPEN' ? 'success' :
                                            selectedConnection.state === 'CONNECTING' ? 'processing' :
                                                selectedConnection.state === 'CLOSING' ? 'warning' : 'error'
                                    }
                                    text={selectedConnection.state}
                                />
                            </Descriptions.Item>
                            <Descriptions.Item label="连接ID">{selectedConnection.connectionId}</Descriptions.Item>
                            <Descriptions.Item label="会话ID">{selectedConnection.sessionId}</Descriptions.Item>
                        </Descriptions>
                    </Card>
                )}
            </Modal>
        </div>
    );
};

export default WebSocketConnectionDetails; 
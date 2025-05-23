/*
 * @Author: Await
 * @Date: 2025-05-25 11:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-25 11:00:00
 * @Description: WebSocket连接详情组件
 */

import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, Card, Descriptions, Badge, Typography, Tooltip, Progress } from 'antd';
import { LinkOutlined, CloseOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useWebSocketManager } from '../hooks/useWebSocketManager';
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
    // WebSocket管理器Hook
    const { getActiveConnections, refresh, disconnect } = useWebSocketManager();

    // 组件状态
    const [connections, setConnections] = useState<any[]>([]);
    const [selectedConnection, setSelectedConnection] = useState<any | null>(null);
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // 获取连接详情
    useEffect(() => {
        const activeConnections = getActiveConnections();

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
    }, [tabs, getActiveConnections, refreshTrigger]);

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
                disconnect(tabKey);
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
            // 先关闭现有连接
            disconnect(record.key);

            // 重新连接
            setTimeout(() => {
                refresh(tab);
                // 更新连接列表
                handleRefresh();
            }, 300);
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
            render: (_, record: any) => (
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
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title level={5}>活动WebSocket连接 ({connections.length})</Title>
                <Button
                    icon={<ReloadOutlined />}
                    size="small"
                    onClick={handleRefresh}
                >
                    刷新
                </Button>
            </div>

            <Table
                dataSource={connections}
                columns={columns}
                rowKey="key"
                pagination={false}
                size="small"
                bordered
            />

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
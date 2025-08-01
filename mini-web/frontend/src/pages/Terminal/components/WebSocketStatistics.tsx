/*
 * @Author: Await
 * @Date: 2025-05-25 10:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-04 20:41:49
 * @Description: WebSocket连接统计组件
 */

import React, { useState, useEffect } from 'react';
import { Card, Statistic, Row, Col, Button, Progress, Table, Badge, Typography, Divider, Tooltip, Space } from 'antd';
import { ReloadOutlined, LinkOutlined, DisconnectOutlined, WarningOutlined } from '@ant-design/icons';
import type { WebSocketStats } from '../services/WebSocketService';
import webSocketService from '../services/WebSocketService';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// 组件样式
const styles = {
    statisticsCard: {
        margin: '20px 0',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
    },
    titleRow: {
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    statisticItem: {
        padding: '0 12px'
    },
    actionsRow: {
        marginTop: '16px',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px'
    },
    timeInfo: {
        marginTop: '16px',
        fontSize: '12px',
        color: '#8c8c8c'
    }
};

/**
 * WebSocket统计组件
 */
const WebSocketStatistics: React.FC = () => {
    const [stats, setStats] = useState<WebSocketStats>(webSocketService.getStats());

    // 更新统计数据
    useEffect(() => {
        const updateStats = () => {
            setStats(webSocketService.getStats());
        };

        // 定期更新统计
        const interval = setInterval(updateStats, 1000);

        return () => clearInterval(interval);
    }, []);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // 格式化时间
    const formatTime = (isoString: string | null) => {
        if (!isoString) return '未知';
        return dayjs(isoString).format('YYYY-MM-DD HH:mm:ss');
    };

    // 计算传输数据大小格式化
    const formatDataSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    // 手动刷新统计数据
    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    // 重置统计数据
    const handleReset = () => {
        webSocketService.resetStats();
        setStats(webSocketService.getStats());
        setRefreshTrigger(prev => prev + 1);
    };

    // 协议分布数据
    const protocolData = Object.entries(stats.connectionsByProtocol).map(([protocol, count]) => ({
        protocol,
        count,
        percent: stats.totalConnections > 0 ? Math.round((count / stats.totalConnections) * 100) : 0
    }));

    // 协议分布表格列
    const protocolColumns = [
        {
            title: '协议',
            dataIndex: 'protocol',
            key: 'protocol',
            render: (protocol: string) => (
                <Text strong>{protocol.toUpperCase()}</Text>
            )
        },
        {
            title: '连接数',
            dataIndex: 'count',
            key: 'count'
        },
        {
            title: '占比',
            dataIndex: 'percent',
            key: 'percent',
            render: (percent: number) => (
                <Progress percent={percent} size="small" status="active" />
            )
        }
    ];

    // 计算连接成功率
    const successRate = stats.totalConnections > 0
        ? Math.round(((stats.totalConnections - stats.failedConnections) / stats.totalConnections) * 100)
        : 100;

    // 计算连接状态
    const getConnectionStatus = () => {
        if (stats.activeConnections === 0) return 'error';
        if (stats.failedConnections > 0) return 'warning';
        return 'success';
    };

    return (
        <div className="websocket-statistics">
            {/* 顶部工具栏 */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16
            }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Title level={5} style={{ margin: 0 }}>
                        连接统计
                    </Title>
                    <Badge
                        status={getConnectionStatus()}
                        style={{ marginLeft: 8 }}
                    />
                </div>
                <Space>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={handleRefresh}
                        size="small"
                        type="text"
                    >
                        刷新
                    </Button>
                </Space>
            </div>

            {/* 核心指标卡片 */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col span={12}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                        <Statistic
                            title="活跃连接"
                            value={stats.activeConnections}
                            prefix={<LinkOutlined style={{ color: '#52c41a' }} />}
                            valueStyle={{
                                color: stats.activeConnections > 0 ? '#52c41a' : '#bfbfbf',
                                fontSize: '20px',
                                fontWeight: 'bold'
                            }}
                        />
                    </Card>
                </Col>
                <Col span={12}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                        <Statistic
                            title="连接成功率"
                            value={successRate}
                            suffix="%"
                            valueStyle={{
                                color: successRate > 90 ? '#52c41a' : successRate > 70 ? '#faad14' : '#ff4d4f',
                                fontSize: '20px',
                                fontWeight: 'bold'
                            }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 统计详情 */}
            <Card size="small" title="连接详情" style={{ marginBottom: 16 }}>
                <Row gutter={[12, 8]}>
                    <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1890ff' }}>
                                {stats.totalConnections}
                            </div>
                            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>总连接数</div>
                        </div>
                    </Col>
                    <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: '18px',
                                fontWeight: 'bold',
                                color: stats.reconnections > 0 ? '#faad14' : '#bfbfbf'
                            }}>
                                {stats.reconnections}
                            </div>
                            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>重连次数</div>
                        </div>
                    </Col>
                    <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: '18px',
                                fontWeight: 'bold',
                                color: stats.failedConnections > 0 ? '#ff4d4f' : '#bfbfbf'
                            }}>
                                {stats.failedConnections}
                            </div>
                            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>连接失败</div>
                        </div>
                    </Col>
                </Row>
            </Card>

            {/* 数据传输 */}
            <Card size="small" title="数据传输" style={{ marginBottom: 16 }}>
                <Row gutter={[12, 8]}>
                    <Col span={12}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#52c41a' }}>
                                {formatDataSize(stats.totalDataSent)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>发送数据</div>
                        </div>
                    </Col>
                    <Col span={12}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1890ff' }}>
                                {formatDataSize(stats.totalDataReceived)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>接收数据</div>
                        </div>
                    </Col>
                </Row>

                {/* 当前活跃连接数据量 */}
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#722ed1' }}>
                        {formatDataSize(stats.totalDataSent + stats.totalDataReceived)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8c8c8c' }}>总数据量</div>
                </div>
            </Card>

            {/* 文件传输统计 */}
            <Card size="small" title="文件传输" style={{ marginBottom: 16 }}>
                <Row gutter={[12, 8]}>
                    <Col span={12}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#52c41a' }}>
                                {stats.fileTransferStats?.uploadCount || 0}
                            </div>
                            <div style={{ fontSize: '11px', color: '#8c8c8c' }}>上传文件</div>
                            <div style={{ fontSize: '11px', color: '#8c8c8c' }}>
                                {formatDataSize(stats.fileTransferStats?.totalUploadSize || 0)}
                            </div>
                        </div>
                    </Col>
                    <Col span={12}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1890ff' }}>
                                {stats.fileTransferStats?.downloadCount || 0}
                            </div>
                            <div style={{ fontSize: '11px', color: '#8c8c8c' }}>下载文件</div>
                            <div style={{ fontSize: '11px', color: '#8c8c8c' }}>
                                {formatDataSize(stats.fileTransferStats?.totalDownloadSize || 0)}
                            </div>
                        </div>
                    </Col>
                </Row>
            </Card>

            {/* 消息类型统计 */}
            <Card size="small" title="消息类型" style={{ marginBottom: 16 }}>
                <Row gutter={[8, 8]}>
                    <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1890ff' }}>
                                {stats.messageTypeStats?.terminalData || 0}
                            </div>
                            <div style={{ fontSize: '10px', color: '#8c8c8c' }}>终端数据</div>
                        </div>
                    </Col>
                    <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#52c41a' }}>
                                {stats.messageTypeStats?.fileTransfer || 0}
                            </div>
                            <div style={{ fontSize: '10px', color: '#8c8c8c' }}>文件传输</div>
                        </div>
                    </Col>
                    <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#faad14' }}>
                                {stats.messageTypeStats?.heartbeat || 0}
                            </div>
                            <div style={{ fontSize: '10px', color: '#8c8c8c' }}>心跳</div>
                        </div>
                    </Col>
                </Row>
                <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
                    <Col span={12}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#722ed1' }}>
                                {stats.messageTypeStats?.protocolNegotiation || 0}
                            </div>
                            <div style={{ fontSize: '10px', color: '#8c8c8c' }}>协议协商</div>
                        </div>
                    </Col>
                    <Col span={12}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ff4d4f' }}>
                                {stats.messageTypeStats?.specialCommand || 0}
                            </div>
                            <div style={{ fontSize: '10px', color: '#8c8c8c' }}>特殊命令</div>
                        </div>
                    </Col>
                </Row>
            </Card>

            {/* 协议分布 */}
            {protocolData.length > 0 && (
                <Card size="small" title="协议分布" style={{ marginBottom: 16 }}>
                    <div style={{ padding: '8px 0' }}>
                        {protocolData.map(({ protocol, count, percent }) => (
                            <div key={protocol} style={{ marginBottom: 8 }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 4
                                }}>
                                    <Text strong>{protocol.toUpperCase()}</Text>
                                    <Text>{count}个连接</Text>
                                </div>
                                <Progress
                                    percent={percent}
                                    size="small"
                                    status="active"
                                    strokeColor="#1890ff"
                                />
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* 当前连接详情 */}
            {stats.activeConnections > 0 && (
                <Card size="small" title="当前连接" style={{ marginBottom: 16 }}>
                    <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                        {Array.from(stats.connectionDataStats || new Map()).map(([tabKey, connectionStats]) => (
                            <div key={tabKey} style={{
                                padding: '8px',
                                border: '1px solid #f0f0f0',
                                borderRadius: '4px',
                                marginBottom: '8px',
                                fontSize: '11px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <Text strong style={{ fontSize: '11px' }}>
                                            {connectionStats.protocol?.toUpperCase() || 'UNKNOWN'}
                                        </Text>
                                        <span style={{ marginLeft: '8px', color: '#8c8c8c' }}>
                                            ID: {connectionStats.connectionId}
                                        </span>
                                    </div>
                                    <Badge
                                        status="processing"
                                        text="活跃"
                                        style={{ fontSize: '10px' }}
                                    />
                                </div>
                                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#52c41a' }}>
                                        ↑ {formatDataSize(connectionStats.dataSent)}
                                    </span>
                                    <span style={{ color: '#1890ff' }}>
                                        ↓ {formatDataSize(connectionStats.dataReceived)}
                                    </span>
                                    <span style={{ color: '#722ed1' }}>
                                        ∑ {formatDataSize(connectionStats.dataSent + connectionStats.dataReceived)}
                                    </span>
                                </div>
                                <div style={{ marginTop: '2px', color: '#8c8c8c', fontSize: '10px' }}>
                                    最后活动: {formatTime(connectionStats.lastActivity)}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* 时间信息 */}
            <Card size="small" title="连接记录">
                <div style={{ fontSize: '12px', color: '#8c8c8c', lineHeight: '1.6' }}>
                    <div>最近连接时间: {formatTime(stats.lastConnectionTime)}</div>
                    <div>最近断开时间: {formatTime(stats.lastDisconnectionTime)}</div>
                </div>

                {/* 操作按钮 */}
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                    <Button
                        onClick={handleReset}
                        icon={<ReloadOutlined />}
                        size="small"
                        type="text"
                        style={{ fontSize: '12px' }}
                    >
                        重置统计
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default WebSocketStatistics; 
/*
 * @Author: Await
 * @Date: 2025-05-25 10:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-23 20:16:31
 * @Description: WebSocket连接统计组件
 */

import React, { useState, useEffect } from 'react';
import { Card, Statistic, Row, Col, Button, Progress, Table, Badge, Typography, Divider, Tooltip } from 'antd';
import { ReloadOutlined, LinkOutlined, DisconnectOutlined, WarningOutlined } from '@ant-design/icons';
import type { WebSocketStats } from '../services/WebSocketService';
import { useWebSocketManager } from '../hooks/useWebSocketManager';
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
    const { stats, resetStats } = useWebSocketManager();
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
        resetStats();
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
        <Card
            title={
                <div style={styles.titleRow}>
                    <Title level={4}>
                        WebSocket连接统计
                        <Badge
                            status={getConnectionStatus()}
                            style={{ marginLeft: '12px' }}
                        />
                    </Title>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={handleRefresh}
                        size="small"
                    >
                        刷新
                    </Button>
                </div>
            }
            style={styles.statisticsCard}
        >
            {/* 主要统计指标 */}
            <Row gutter={16}>
                <Col span={6} style={styles.statisticItem}>
                    <Statistic
                        title="活跃连接"
                        value={stats.activeConnections}
                        prefix={<LinkOutlined />}
                        valueStyle={{ color: stats.activeConnections > 0 ? '#52c41a' : '#bfbfbf' }}
                    />
                </Col>
                <Col span={6} style={styles.statisticItem}>
                    <Statistic
                        title="总连接数"
                        value={stats.totalConnections}
                    />
                </Col>
                <Col span={6} style={styles.statisticItem}>
                    <Statistic
                        title="重连次数"
                        value={stats.reconnections}
                        valueStyle={{ color: stats.reconnections > 0 ? '#faad14' : '#bfbfbf' }}
                    />
                </Col>
                <Col span={6} style={styles.statisticItem}>
                    <Statistic
                        title="连接失败"
                        value={stats.failedConnections}
                        prefix={<DisconnectOutlined />}
                        valueStyle={{ color: stats.failedConnections > 0 ? '#ff4d4f' : '#bfbfbf' }}
                    />
                </Col>
            </Row>

            <Divider />

            {/* 数据传输统计 */}
            <Row gutter={16}>
                <Col span={8} style={styles.statisticItem}>
                    <Statistic
                        title="发送数据"
                        value={formatDataSize(stats.totalDataSent)}
                    />
                </Col>
                <Col span={8} style={styles.statisticItem}>
                    <Statistic
                        title="接收数据"
                        value={formatDataSize(stats.totalDataReceived)}
                    />
                </Col>
                <Col span={8} style={styles.statisticItem}>
                    <Tooltip title="成功建立连接的百分比">
                        <Statistic
                            title="连接成功率"
                            value={successRate}
                            suffix="%"
                            precision={0}
                            valueStyle={{ color: successRate > 90 ? '#52c41a' : successRate > 70 ? '#faad14' : '#ff4d4f' }}
                        />
                    </Tooltip>
                </Col>
            </Row>

            <Divider />

            {/* 协议分布 */}
            <Title level={5}>协议分布</Title>
            <Table
                dataSource={protocolData}
                columns={protocolColumns}
                pagination={false}
                size="small"
                rowKey="protocol"
            />

            {/* 时间信息 */}
            <div style={styles.timeInfo}>
                <div>最近连接时间: {formatTime(stats.lastConnectionTime)}</div>
                <div>最近断开时间: {formatTime(stats.lastDisconnectionTime)}</div>
            </div>

            {/* 操作按钮 */}
            <div style={styles.actionsRow}>
                <Button onClick={handleReset} icon={<ReloadOutlined />}>
                    重置统计
                </Button>
            </div>
        </Card>
    );
};

export default WebSocketStatistics; 
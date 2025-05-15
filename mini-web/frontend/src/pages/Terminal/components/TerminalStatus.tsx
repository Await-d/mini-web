import React from 'react';
import { Spin, Alert, Typography } from 'antd';
import { LoadingOutlined, InfoCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import '../Terminal.css';

// 终端连接状态类型
type ConnectStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface TerminalStatusProps {
    status: ConnectStatus;
    connectionName: string;
    errorMessage?: string;
    latency?: number | null;
}

/**
 * 终端状态组件
 * 显示连接状态、错误信息等
 */
const TerminalStatus: React.FC<TerminalStatusProps> = ({
    status,
    connectionName,
    errorMessage,
    latency
}) => {
    const { Text, Title } = Typography;

    // 根据状态返回对应的图标和文字
    const getStatusContent = () => {
        switch (status) {
            case 'idle':
                return {
                    icon: <InfoCircleOutlined style={{ fontSize: 24, color: '#1890ff' }} />,
                    title: '等待连接',
                    description: `准备连接到 ${connectionName}`,
                    type: 'info'
                };
            case 'connecting':
                return {
                    icon: <LoadingOutlined style={{ fontSize: 24, color: '#1890ff' }} />,
                    title: '正在连接',
                    description: `正在连接到 ${connectionName}`,
                    type: 'info'
                };
            case 'connected':
                return {
                    icon: <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />,
                    title: '已连接',
                    description: `成功连接到 ${connectionName}${latency ? ` (延迟: ${latency}ms)` : ''}`,
                    type: 'success'
                };
            case 'disconnected':
                return {
                    icon: <WarningOutlined style={{ fontSize: 24, color: '#faad14' }} />,
                    title: '已断开连接',
                    description: `与 ${connectionName} 的连接已断开`,
                    type: 'warning'
                };
            case 'error':
                return {
                    icon: <CloseCircleOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />,
                    title: '连接错误',
                    description: errorMessage || `无法连接到 ${connectionName}`,
                    type: 'error'
                };
            default:
                return {
                    icon: <InfoCircleOutlined style={{ fontSize: 24, color: '#1890ff' }} />,
                    title: '未知状态',
                    description: `连接 ${connectionName} 状态未知`,
                    type: 'info'
                };
        }
    };

    const statusContent = getStatusContent();

    return (
        <div className="terminal-status-container" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            backgroundColor: '#f0f2f5',
            padding: '20px'
        }}>
            <Alert
                icon={statusContent.icon}
                message={
                    <Title level={4} style={{ margin: 0 }}>
                        {statusContent.title}
                    </Title>
                }
                description={
                    <Text style={{ fontSize: 16 }}>
                        {statusContent.description}
                    </Text>
                }
                type={statusContent.type as any}
                showIcon
                style={{
                    width: '100%',
                    maxWidth: '500px',
                    padding: '20px',
                    borderRadius: '8px'
                }}
            />
        </div>
    );
};

export default TerminalStatus; 
import React from 'react';
import { Alert, Space, Typography, Button } from 'antd';
import { ReloadOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import '../Terminal.css';

const { Text } = Typography;

interface TerminalStatusProps {
    status: 'connected' | 'disconnected' | 'connecting' | 'error';
    connectionName?: string;
    errorMessage?: string;
    onReconnect?: () => void;
    latency?: number; // 毫秒
}

/**
 * 终端状态组件 - 显示加载中、错误等状态
 */
const TerminalStatus: React.FC<TerminalStatusProps> = ({
    status,
    connectionName = '',
    errorMessage = '',
    onReconnect,
    latency
}) => {
    // 渲染状态内容
    const renderStatusContent = () => {
        switch (status) {
            case 'connecting':
                return (
                    <div className="terminal-status-content">
                        <div className="terminal-status-spinner"></div>
                        <div className="terminal-status-text">
                            正在连接{connectionName ? ` ${connectionName}` : ''}...
                        </div>
                    </div>
                );
            case 'connected':
                return (
                    <div className="terminal-status-content">
                        <CheckCircleOutlined style={{ fontSize: '32px', color: '#52c41a' }} />
                        <Text style={{ color: '#fff', marginTop: '12px' }}>
                            已成功连接到 {connectionName}
                        </Text>
                    </div>
                );
            case 'disconnected':
                return (
                    <div className="terminal-status-content">
                        <Space direction="vertical" align="center">
                            <WarningOutlined style={{ fontSize: '32px', color: '#faad14' }} />
                            <Text style={{ color: '#fff' }}>
                                连接已断开
                            </Text>
                            <Button
                                type="primary"
                                icon={<ReloadOutlined />}
                                onClick={onReconnect}
                                style={{ marginTop: '12px' }}
                            >
                                重新连接
                            </Button>
                        </Space>
                    </div>
                );
            case 'error':
                return (
                    <div className="terminal-status-content">
                        <Space direction="vertical" align="center">
                            <WarningOutlined style={{ fontSize: '32px', color: '#ff4d4f' }} />
                            <Text style={{ color: '#fff' }}>
                                连接错误
                            </Text>
                            <Alert
                                message={errorMessage || "连接过程中发生错误，请稍后重试"}
                                type="error"
                                style={{ maxWidth: '400px', marginTop: '12px' }}
                            />
                            <Button
                                type="primary"
                                danger
                                icon={<ReloadOutlined />}
                                onClick={onReconnect}
                                style={{ marginTop: '12px' }}
                            >
                                重新连接
                            </Button>
                        </Space>
                    </div>
                );
            default:
                return null;
        }
    };

    // 根据状态获取显示文本
    const getStatusText = (): string => {
        switch (status) {
            case 'connected':
                return '已连接';
            case 'disconnected':
                return '未连接';
            case 'connecting':
                return '连接中...';
            case 'error':
                return '连接错误';
            default:
                return '状态未知';
        }
    };

    // 根据延迟时间判断网络质量
    const getLatencyText = (): string => {
        if (!latency) return '';

        if (latency < 100) {
            return `${latency}ms 优`;
        } else if (latency < 300) {
            return `${latency}ms 良`;
        } else {
            return `${latency}ms 差`;
        }
    };

    // 如果状态是连接中或错误，显示全屏覆盖层
    if (status === 'connecting' || status === 'error') {
        return (
            <div className="terminal-status-overlay">
                {renderStatusContent()}
            </div>
        );
    }

    // 否则显示状态指示器
    return (
        <div className="terminal-status-indicator">
            <span className={`status-dot ${status}`}></span>
            <span>{connectionName ? `${connectionName} ` : ''}{getStatusText()}</span>
            {latency && <span className="terminal-latency">{getLatencyText()}</span>}
        </div>
    );
};

export default TerminalStatus; 
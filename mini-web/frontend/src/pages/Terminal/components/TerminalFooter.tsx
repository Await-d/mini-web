/*
 * @Author: Await
 * @Date: 2025-05-08 18:19:21
 * @LastEditors: Await
 * @LastEditTime: 2025-05-08 20:58:23
 * @Description: 请填写简介
 */
import React from 'react';
import { Space, Badge, Typography, Button, Tooltip } from 'antd';
import type { Connection } from '../../../services/api';
import type { WindowSize } from '../utils/terminalConfig';
import styles from '../styles.module.css';
import { CopyOutlined, DownloadOutlined, CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface TerminalFooterProps {
  isConnected: boolean;
  terminalSize: WindowSize;
  networkLatency: number | null;
  terminalMode: string;
  activeConnection: Connection | null;
  onCopyContent?: (activeTab?: any) => void;
  onDownloadLog?: (activeTab?: any) => void;
  onCloseSession?: (activeTab?: any) => void;
  children?: React.ReactNode;
}

const TerminalFooter: React.FC<TerminalFooterProps> = ({
  isConnected,
  terminalSize,
  networkLatency,
  terminalMode,
  activeConnection,
  onCopyContent,
  onDownloadLog,
  onCloseSession,
  children
}) => {
  // 网络延迟状态颜色
  const getLatencyStatus = () => {
    if (networkLatency === null || networkLatency < 0) return 'default';
    if (networkLatency < 100) return 'success';
    if (networkLatency < 300) return 'warning';
    return 'error';
  };

  // 连接状态
  const getConnectionStatus = () => {
    return isConnected ? 'success' : 'error';
  };

  // 终端模式显示
  const getModeDisplay = () => {
    if (terminalMode === 'normal') return null;
    return <Text type="secondary">{terminalMode.toUpperCase()}</Text>;
  };

  return (
    <div className={styles.terminalFooter}>
      <div className={styles.terminalStatus}>
        <Space size={8} style={{ flexWrap: 'nowrap' }}>
          <Badge
            status={getConnectionStatus()}
            text={isConnected ? '已连接' : '未连接'}
          />
          {isConnected && terminalSize && (
            <Text type="secondary">{terminalSize.cols}x{terminalSize.rows}</Text>
          )}
          {isConnected && networkLatency !== null && (
            <Badge
              status={getLatencyStatus()}
              text={`延迟: ${networkLatency < 0 ? '未知' : `${networkLatency}ms`}`}
            />
          )}
          {getModeDisplay()}
          {activeConnection && (
            <Text type="secondary">{activeConnection.protocol.toUpperCase()}</Text>
          )}
        </Space>
      </div>
      <div className={styles.terminalActions} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Tooltip title="复制内容">
          <Button
            icon={<CopyOutlined />}
            size="small"
            type="text"
            onClick={() => onCopyContent?.(null)}
          />
        </Tooltip>
        <Tooltip title="下载日志">
          <Button
            icon={<DownloadOutlined />}
            size="small"
            type="text"
            onClick={() => onDownloadLog?.(null)}
          />
        </Tooltip>
        <Tooltip title="关闭会话">
          <Button
            icon={<CloseOutlined />}
            size="small"
            type="text"
            danger
            onClick={() => onCloseSession?.(null)}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default TerminalFooter;
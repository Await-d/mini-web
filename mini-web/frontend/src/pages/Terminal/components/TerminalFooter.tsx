import React from 'react';
import { Space, Badge, Typography } from 'antd';
import type { Connection } from '../../../services/api';
import type { WindowSize } from '../utils/terminalConfig';
import styles from '../styles.module.css';

const { Text } = Typography;

interface TerminalFooterProps {
  isConnected: boolean;
  terminalSize: WindowSize;
  networkLatency: number | null;
  terminalMode: string;
  activeConnection: Connection | null;
  children?: React.ReactNode;
}

const TerminalFooter: React.FC<TerminalFooterProps> = ({
  isConnected,
  terminalSize,
  networkLatency,
  terminalMode,
  activeConnection,
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
        {children}
      </div>
    </div>
  );
};

export default TerminalFooter;
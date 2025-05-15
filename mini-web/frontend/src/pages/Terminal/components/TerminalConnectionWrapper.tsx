import React, { useEffect } from 'react';
import { useTerminalConnection } from '../hooks/useTerminalConnection';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import styles from '../styles.module.css';

/**
 * 连接子组件所需的Props类型
 */
export interface ConnectionChildProps {
  hasConnection: boolean;
  tabsCount: number;
  activeTabKey: string;
  isConnected: boolean;
  tabs: TerminalTab[];
  connection: any;
  // 允许传递任何额外属性
  [key: string]: any;
}

/**
 * 终端连接包装器组件属性
 */
export interface TerminalConnectorProps {
  connectionParams?: {
    connectionId: number;
    sessionId?: number;
  };
  children: (props: ConnectionChildProps) => React.ReactNode;
}

/**
 * 终端连接包装器组件
 * 负责维护终端连接的状态，并将其传递给子组件
 */
const TerminalConnectionWrapper: React.FC<TerminalConnectorProps> = ({
  connectionParams,
  children
}) => {
  // 获取终端连接属性
  const connectionProps = useTerminalConnection();

  // 使用connectionParams进行处理(如果需要)
  useEffect(() => {
    // 当连接参数变化时的逻辑
    if (connectionParams) {
      console.log('【连接参数更新】', connectionParams);
    }
  }, [connectionParams]);

  // 记录终端状态更新
  useEffect(() => {
    if (connectionProps.connection) {
      console.log(`【终端连接】检测到连接更新: ID=${connectionProps.connection.id}, Name=${connectionProps.connection.name}`);
    }
  }, [connectionProps]);

  // 构建传递给子组件的完整props
  const childProps: ConnectionChildProps = {
    hasConnection: !!connectionProps.connection,
    tabsCount: connectionProps.tabs?.length || 0,
    activeTabKey: connectionProps.activeTabKey || 'no-tabs',
    isConnected: connectionProps.isConnected || false,
    tabs: connectionProps.tabs || terminalStateRef.current?.tabs || [],
    connection: connectionProps.connection,
    fullscreen: connectionProps.fullscreen,
    terminalSize: connectionProps.terminalSize,
    networkLatency: connectionProps.networkLatency,
    terminalMode: connectionProps.terminalMode,
    sidebarCollapsed: connectionProps.sidebarCollapsed,
    toggleFullscreen: connectionProps.toggleFullscreen,
    sendDataToServer: connectionProps.sendDataToServer
  };

  // 在日志中输出传递的属性
  console.log('【终端连接包装器】传递给子组件的属性:', {
    hasConnection: !!connectionProps.connection,
    tabsCount: (connectionProps.tabs || []).length,
    activeTabKey: connectionProps.activeTabKey,
    isConnected: connectionProps.isConnected,
    hasWebSocketRef: !!connectionProps.tabs?.find(t => t.key === connectionProps.activeTabKey)?.webSocketRef?.current
  });

  return (
    <div className={styles.terminalMainContainer} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: '1 1 auto', position: 'relative' }}>
      {children(childProps)}
    </div>
  );
};

export default TerminalConnectionWrapper;
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
  children: (props: ConnectionChildProps) => React.ReactNode;
}

/**
 * 终端连接包装器组件
 * 负责维护终端连接的状态，并将其传递给子组件
 */
const TerminalConnector: React.FC<TerminalConnectorProps> = ({
  children
}) => {
  // 获取终端连接属性
  const connectionProps = useTerminalConnection();
  const { tabs = [] } = connectionProps;

  // 记录终端状态更新
  useEffect(() => {
    if (connectionProps.connection) {
      console.log(`【终端连接】检测到连接更新: ID=${connectionProps.connection.id}, Name=${connectionProps.connection.name}`);
    }
  }, [connectionProps]);

  // 构建传递给子组件的完整props，先复制连接属性，再添加辅助字段
  const childProps: ConnectionChildProps = {
    // 先包含所有原始属性，确保WebSocket引用等被正确传递
    ...connectionProps,
    // 然后添加辅助属性(只有在原始属性不存在时才提供默认值)
    hasConnection: !!connectionProps.connection,
    tabsCount: connectionProps.tabs?.length || 0,
    activeTabKey: connectionProps.activeTabKey || 'no-tabs',
    isConnected: connectionProps.isConnected || false,
    // 不再覆盖tabs属性，保持原始引用
    // tabs: connectionProps.tabs || terminalStateRef.current?.tabs || [],
    // 同样不覆盖connection
    // connection: connectionProps.connection,
    // 确保其他必要属性存在
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
    <div className={styles.terminalMainContainer}>
      {children(childProps)}
    </div>
  );
};

export default TerminalConnector;
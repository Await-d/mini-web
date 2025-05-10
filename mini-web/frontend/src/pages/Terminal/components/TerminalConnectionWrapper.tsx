import React, { useEffect, useRef } from 'react';
import { useTerminalConnection } from '../hooks/useTerminalConnection';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalConnectionWrapperProps, ConnectionChildProps } from '../Terminal.d';

/**
 * 终端连接包装器组件
 * 负责将终端连接状态传递给子组件
 */
const TerminalConnector = ({
  children,
  connectionParams
}: TerminalConnectionWrapperProps) => {
  // 获取所有终端连接属性
  const connectionProps = useTerminalConnection();
  const propsRef = useRef(connectionProps);

  // 更新引用以避免使用过时的值
  useEffect(() => {
    propsRef.current = connectionProps;
  }, [connectionProps]);

  // 构建传递给子组件的完整props
  const childProps: ConnectionChildProps = {
    // 基础状态
    hasConnection: !!connectionProps.connection,
    tabsCount: connectionProps.tabs?.length || 0,
    activeTabKey: connectionProps.activeTabKey || 'no-tabs',
    isConnected: connectionProps.isConnected || false,

    // 重要：确保完整传递tabs数组
    tabs: connectionProps.tabs || terminalStateRef.current?.tabs || [],

    // 传递所有其他属性
    connection: connectionProps.connection,
    fullscreen: connectionProps.fullscreen,
    terminalSize: connectionProps.terminalSize,
    networkLatency: connectionProps.networkLatency,
    terminalMode: connectionProps.terminalMode,
    sidebarCollapsed: connectionProps.sidebarCollapsed,
    toggleFullscreen: connectionProps.toggleFullscreen,
    sendDataToServer: connectionProps.sendDataToServer,
    clearRetryTimers: connectionProps.clearRetryTimers,

    // 添加可能需要的属性
    createConnectionHelp: connectionProps.createConnectionHelp,
    createRetryInterface: connectionProps.createRetryInterface
  };

  // 使用函数调用方式渲染子组件，传递完整props
  return <>{children(childProps)}</>;
};

// 导出时使用TerminalConnectionWrapper作为名称，与文件名保持一致
export default TerminalConnector;
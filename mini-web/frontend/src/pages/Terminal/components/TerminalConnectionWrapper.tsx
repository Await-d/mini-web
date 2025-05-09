import React from 'react';
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

  // 构建传递给子组件的完整props
  const childProps: ConnectionChildProps = {
    // 基础状态
    hasConnection: !!connectionProps.connection,
    tabsCount: connectionProps.tabs?.length || 0,
    activeTabKey: connectionProps.activeTabKey || 'no-tabs',
    isConnected: connectionProps.isConnected || false,

    // 重要：确保完整传递tabs数组
    tabs: connectionProps.tabs || (terminalStateRef.current?.tabs || []),

    // 传递所有其他属性
    connection: connectionProps.connection,
    fullscreen: connectionProps.fullscreen,
    terminalSize: connectionProps.terminalSize,
    networkLatency: connectionProps.networkLatency,
    terminalMode: connectionProps.terminalMode,
    sidebarCollapsed: connectionProps.sidebarCollapsed,
    toggleFullscreen: connectionProps.toggleFullscreen,
    sendDataToServer: connectionProps.sendDataToServer,
    clearRetryTimers: connectionProps.clearRetryTimers
  };

  console.log('【TerminalConnector】准备渲染子组件，传递属性:', {
    hasConnection: childProps.hasConnection,
    tabsCount: childProps.tabsCount,
    activeTabKey: childProps.activeTabKey,
    isConnected: childProps.isConnected,
    tabsLength: childProps.tabs.length
  });

  // 使用函数调用方式渲染子组件，传递完整props
  return <>{children(childProps)}</>;
};

export default TerminalConnector;
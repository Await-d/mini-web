import React, { useEffect } from 'react';
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

  // 每当Tab发生变化时，记录到控制台
  useEffect(() => {
    console.log('【TerminalConnector】Tab状态已更新:', {
      tabsCount: connectionProps.tabs?.length || 0,
      activeTabKey: connectionProps.activeTabKey || 'no-tabs',
      refTabsCount: terminalStateRef.current?.tabs?.length || 0
    });
  }, [connectionProps.tabs, connectionProps.activeTabKey]);

  // 构建传递给子组件的完整props
  const childProps: ConnectionChildProps = {
    // 基础状态
    hasConnection: !!connectionProps.connection,
    tabsCount: connectionProps.tabs?.length || 0,
    activeTabKey: connectionProps.activeTabKey || 'no-tabs',
    isConnected: connectionProps.isConnected || false,

    // 重要：确保完整传递tabs数组
    // 1. 首先使用connectionProps中的tabs
    // 2. 然后使用terminalStateRef作为备选
    // 3. 最后，保证至少有空数组
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
    clearRetryTimers: connectionProps.clearRetryTimers,

    // 添加可能需要的属性
    createConnectionHelp: connectionProps.createConnectionHelp,
    createRetryInterface: connectionProps.createRetryInterface
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

// 导出时使用TerminalConnectionWrapper作为名称，与文件名保持一致
export default TerminalConnector;
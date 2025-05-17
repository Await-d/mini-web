/*
 * @Author: Await
 * @Date: 2025-05-09 18:05:28
 * @LastEditors: Await
 * @LastEditTime: 2025-05-17 21:10:30
 * @Description: 终端连接包装器组件
 */
import React, { useEffect, useCallback } from 'react';
import { useTerminalConnection } from '../hooks/useTerminalConnection';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { message } from 'antd';
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
  fullscreen?: boolean;
  terminalSize?: { cols: number; rows: number };
  networkLatency?: number | null;
  terminalMode?: string;
  sidebarCollapsed?: boolean;
  toggleFullscreen?: () => void;
  sendDataToServer?: (data: string) => void;
  refreshTab?: (tabKey: string) => void;
  duplicateTab?: (tabKey: string) => void;
  // 允许传递任何额外属性
  [key: string]: any;
}

/**
 * 终端连接包装器组件属性
 */
export interface TerminalConnectionWrapperProps {
  children: (props: ConnectionChildProps) => React.ReactNode;
}

/**
 * 终端连接包装器组件
 * 负责维护终端连接的状态，并将其传递给子组件
 */
const TerminalConnectionWrapperComponent = ({ children }: TerminalConnectionWrapperProps) => {
  // 获取连接相关属性
  const connectionProps = useTerminalConnection();

  // 确保终端状态引用更新
  useEffect(() => {
    if (terminalStateRef.current) {
      terminalStateRef.current.tabs = connectionProps.tabs || [];
      terminalStateRef.current.activeTabKey = connectionProps.activeTabKey || '';
    }
  }, [connectionProps.tabs, connectionProps.activeTabKey]);

  // 处理标签刷新事件
  const handleTabRefresh = useCallback((event: CustomEvent) => {
    const tabKey = event.detail?.tabKey;
    if (!tabKey) return;

    // 尝试找到对应标签
    const tab = connectionProps.tabs?.find(tab => tab.key === tabKey);
    if (!tab) {
      message.error(`无法找到标签: ${tabKey}`);
      return;
    }

    message.info(`正在刷新连接: ${tab.title}`);

    // 如果已有处理函数则使用
    if (connectionProps.refreshTab) {
      connectionProps.refreshTab(tabKey);
    } else {
      // 备用方案: 关闭连接后重新创建
      try {
        // 关闭旧连接，如果有的话
        if (tab.webSocketRef?.current) {
          if (connectionProps.closeWebSocketConnection) {
            connectionProps.closeWebSocketConnection(tab);
          } else {
            tab.webSocketRef.current.close();
          }
        }

        // 重新创建连接
        setTimeout(() => {
          if (connectionProps.createWebSocketConnection) {
            connectionProps.createWebSocketConnection(tab);
          } else {
            message.warning('无法重新创建连接，刷新功能尚未完全实现');
          }
        }, 500);
      } catch (error) {
        message.error(`刷新连接失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
  }, [connectionProps.tabs, connectionProps.refreshTab, connectionProps.closeWebSocketConnection, connectionProps.createWebSocketConnection]);

  // 添加标签刷新事件监听
  useEffect(() => {
    window.addEventListener('terminal-tab-refresh', handleTabRefresh as EventListener);
    return () => {
      window.removeEventListener('terminal-tab-refresh', handleTabRefresh as EventListener);
    };
  }, [handleTabRefresh]);

  // 传递给子组件的属性
  const childProps: ConnectionChildProps = {
    hasConnection: !!connectionProps.connection,
    tabsCount: connectionProps.tabs?.length || 0,
    activeTabKey: connectionProps.activeTabKey || 'no-tabs',
    isConnected: connectionProps.isConnected || false,
    // 完整传递所有属性
    tabs: connectionProps.tabs || terminalStateRef.current?.tabs || [],
    connection: connectionProps.connection,
    fullscreen: connectionProps.fullscreen,
    terminalSize: connectionProps.terminalSize,
    networkLatency: connectionProps.networkLatency,
    terminalMode: connectionProps.terminalMode,
    sidebarCollapsed: connectionProps.sidebarCollapsed,
    toggleFullscreen: connectionProps.toggleFullscreen,
    sendDataToServer: connectionProps.sendDataToServer,
    refreshTab: connectionProps.refreshTab,
    duplicateTab: connectionProps.duplicateTab,
    // 添加可能存在的连接管理相关属性
    closeWebSocketConnection: connectionProps.closeWebSocketConnection,
    createWebSocketConnection: connectionProps.createWebSocketConnection
  };

  return (
    <div className={styles.terminalConnectionWrapper}>
      {children(childProps)}
    </div>
  );
}

// 导出组件
export default TerminalConnectionWrapperComponent;
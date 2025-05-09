import React, { useEffect, useState, useRef } from 'react';
import { useTerminalConnection } from '../hooks/useTerminalConnection';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { TerminalConnectionWrapperProps } from '../Terminal.d';

// 定义连接属性类型
interface ConnectionProps {
  connection: any;
  tabs: TerminalTab[];
  activeTabKey: string;
  isConnected: boolean;
  fullscreen: boolean;
  terminalSize: any;
  networkLatency: number | null; // 允许null
  terminalMode: string;
  sidebarCollapsed: boolean;
  toggleFullscreen: () => void;
  sendDataToServer: (data: string) => void;
  [key: string]: any; // 其他属性
}

// 定义子组件传递函数的参数类型
interface ConnectionChildProps {
  hasConnection: boolean;
  tabsCount: number;
  activeTabKey: string;
  isConnected: boolean;
  tabs: TerminalTab[]; // 必需项，不再是可选
  connection?: any;
  fullscreen?: boolean;
  terminalSize?: any;
  networkLatency?: number | null; // 允许null
  terminalMode?: string;
  sidebarCollapsed?: boolean;
  toggleFullscreen?: () => void;
  sendDataToServer?: (data: string) => void;
  clearRetryTimers?: () => void;
  [key: string]: any; // 其他可能的属性
}

/**
 * 终端连接包装器组件
 * 用于解决在组件体外调用hook的问题，同时传递连接状态给子组件
 */
const TerminalConnectionWrapper: React.FC<TerminalConnectionWrapperProps> = ({
  children,
  connectionParams
}) => {
  // 跟踪已处理的连接ID
  const processedConnectionIds = useRef<Map<number, number>>(new Map());

  // 内部状态，用于防止重复处理
  const [isProcessing, setIsProcessing] = useState(false);

  // 在组件内部调用hook，完全符合React规则
  const connectionProps = useTerminalConnection();

  // 组件卸载时清除所有重试定时器
  useEffect(() => {
    return () => {
      // 组件卸载时清除重试
      if (connectionProps && connectionProps.clearRetryTimers) {
        console.log('【连接包装器】组件卸载，清除所有重试定时器');
        connectionProps.clearRetryTimers();
      }
    };
  }, [connectionProps]);

  // 使用状态引用增强连接属性
  useEffect(() => {
    if (connectionProps && connectionParams && connectionParams.connectionId) {
      // 如果当前连接ID没有被处理过并且不在处理中，则处理它
      const connectionId = connectionParams.connectionId;
      const currentTimestamp = Date.now();

      // 获取上次处理此连接的时间戳
      const lastProcessedTime = processedConnectionIds.current.get(connectionId) || 0;
      const timeSinceLastProcess = currentTimestamp - lastProcessedTime;

      // 如果从未处理过，或者距离上次处理已经超过2秒，则进行处理
      if (lastProcessedTime === 0 || timeSinceLastProcess > 2000) {
        console.log(`【连接包装器】处理${lastProcessedTime === 0 ? '新' : '重复'}连接: ${connectionId}, 距离上次处理: ${timeSinceLastProcess}ms`);

        setIsProcessing(true); // 标记为正在处理

        // 记录此连接ID的处理时间戳
        processedConnectionIds.current.set(connectionId, currentTimestamp);

        // 连接处理完成后释放状态锁
        setTimeout(() => {
          setIsProcessing(false);
        }, 500);

        // 为允许频繁切换同一连接，设置定时清理
        setTimeout(() => {
          if (processedConnectionIds.current.has(connectionId)) {
            // 只清理不是当前活动连接的记录
            if (connectionParams.connectionId !== connectionId) {
              processedConnectionIds.current.delete(connectionId);
              console.log(`【连接包装器】清理连接处理记录: ${connectionId}`);
            }
          }
        }, 5000); // 5秒后允许再次处理
      } else {
        console.log(`【连接包装器】跳过处理，连接 ${connectionId} 最近处理过 (${timeSinceLastProcess}ms前)`);
      }

      // 连接属性准备就绪时的调试输出
      const refTabsCount = terminalStateRef.current?.tabs?.length || 0;
      console.log('【连接包装器】连接属性准备就绪，传递给主组件', {
        hasConnection: !!connectionProps.connection,
        tabsCount: connectionProps.tabs?.length || 0,
        contextTabsCount: connectionProps.tabs?.length || 0,
        refTabsCount: refTabsCount,
        activeTabKey: connectionProps.activeTabKey,
        isConnected: connectionProps.isConnected,
        allProperties: Object.keys(connectionProps)
      });
    } else {
      console.log('【连接包装器】连接属性尚未就绪或无连接参数');
    }
  }, [connectionProps, connectionParams, isProcessing]);

  // 如果连接属性未就绪，返回加载状态
  if (!connectionProps) {
    return <div style={{ display: 'none' }}>Loading...</div>;
  }

  // 从全局状态引用获取最新标签数组和活动标签键，确保使用最新状态
  const currentTabs = terminalStateRef.current?.tabs || [];
  const currentActiveKey = terminalStateRef.current?.activeTabKey || connectionProps.activeTabKey || 'no-tabs';

  // 获取当前活动标签
  const activeTab = currentTabs.find(tab => tab.key === currentActiveKey);

  // 确定连接状态，优先使用活动标签的状态
  const isActiveTabConnected = activeTab ? activeTab.isConnected : false;
  const connectionStatus = isActiveTabConnected || connectionProps.isConnected || false;

  // 重要: 使用引用状态中的完整标签列表，确保所有标签都被传递
  const allTabs = terminalStateRef.current?.tabs || [];
  console.log(`【连接包装器】当前标签总数: ${allTabs.length}，活动标签: ${currentActiveKey}`);

  // 构建给子组件的属性，确保所有必需的属性都被传递
  const childProps: ConnectionChildProps = {
    hasConnection: !!connectionProps.connection,
    tabsCount: allTabs.length || 0,
    activeTabKey: currentActiveKey,
    isConnected: connectionStatus,
    // 确保传递完整的标签数组
    tabs: allTabs,
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

  // 调试输出，使用安全的引用访问
  const refTabs = terminalStateRef.current ? terminalStateRef.current.tabs.length : 0;
  console.log(`【连接包装器】连接属性准备就绪，传递给主组件 {hasConnection: ${childProps.hasConnection}, tabsCount: ${childProps.tabsCount}, contextTabsCount: ${connectionProps.tabs?.length || 0}, refTabsCount: ${refTabs}, activeTabKey: ${childProps.activeTabKey}}`);

  // 检查传递的标签数组
  console.log(`【连接包装器】实际传递给子组件的标签数量: ${childProps.tabs.length}`);

  // 调用children函数，传递连接属性
  return <>{children(childProps)}</>;
};

export default TerminalConnectionWrapper;
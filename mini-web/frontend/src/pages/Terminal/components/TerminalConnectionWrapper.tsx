import React, { useEffect } from 'react';
import { useTerminalConnection } from '../hooks/useTerminalConnection';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';

// 定义连接属性类型
interface ConnectionProps {
  connection: any;
  tabs: TerminalTab[];
  activeTabKey: string;
  isConnected: boolean;
  fullscreen: boolean;
  terminalSize: any;
  networkLatency: number;
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
  [key: string]: any; // 其他可能的属性
}

interface TerminalConnectionWrapperProps {
  children: (props: ConnectionChildProps) => React.ReactNode;
  connectionParams?: {
    connectionId?: number;
    sessionId?: number;
  };
}

/**
 * 终端连接包装器组件
 * 用于解决在组件体外调用hook的问题，同时传递连接状态给子组件
 */
const TerminalConnectionWrapper: React.FC<TerminalConnectionWrapperProps> = ({
  children,
  connectionParams
}) => {
  // 在组件内部调用hook，完全符合React规则
  const connectionProps = useTerminalConnection();

  // 使用状态引用增强连接属性
  useEffect(() => {
    if (connectionProps) {
      // 连接属性准备就绪时的调试输出
      console.log('【连接包装器】连接属性准备就绪，传递给主组件', {
        hasConnection: !!connectionProps.connection,
        tabsCount: connectionProps.tabs?.length || 0,
        contextTabsCount: connectionProps.tabs?.length || 0,
        refTabsCount: (terminalStateRef.current?.tabs?.length || 0),
        activeTabKey: connectionProps.activeTabKey,
        isConnected: connectionProps.isConnected,
        allProperties: Object.keys(connectionProps)
      });
    } else {
      console.log('【连接包装器】连接属性尚未就绪');
    }
  }, [connectionProps]);

  // 如果连接属性未就绪，返回加载状态
  if (!connectionProps) {
    return <div style={{ display: 'none' }}>Loading...</div>;
  }

  // 准备传递给子组件的属性
  const childProps: ConnectionChildProps = {
    hasConnection: !!connectionProps.connection,
    tabsCount: connectionProps.tabs?.length || 0,
    activeTabKey: connectionProps.activeTabKey || 'no-tabs',
    isConnected: connectionProps.isConnected || false
  };

  // 调用children函数，传递连接属性
  return <>{children(childProps)}</>;
};

export default TerminalConnectionWrapper;
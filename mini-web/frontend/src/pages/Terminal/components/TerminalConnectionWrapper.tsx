import React, { useEffect } from 'react';
import { useTerminalConnection } from '../hooks/useTerminalConnection';

interface TerminalConnectionWrapperProps {
  onConnectionReady: (connectionProps: any) => void;
}

/**
 * 终端连接包装器组件
 * 用于解决在组件体外调用hook的问题
 */
const TerminalConnectionWrapper: React.FC<TerminalConnectionWrapperProps> = ({ 
  onConnectionReady 
}) => {
  // 在组件内部调用hook，完全符合React规则
  const connectionProps = useTerminalConnection();
  
  // 当连接属性可用时通知父组件
  useEffect(() => {
    if (connectionProps) {
      console.log('【连接包装器】连接属性准备就绪，传递给主组件', {
        hasConnection: !!connectionProps.connection,
        tabsCount: connectionProps.tabs?.length || 0,
        activeTabKey: connectionProps.activeTabKey,
        isConnected: connectionProps.isConnected,
        allProperties: Object.keys(connectionProps)
      });
      onConnectionReady(connectionProps);
    } else {
      console.log('【连接包装器】连接属性尚未就绪');
    }
  }, [connectionProps, onConnectionReady]);
  
  // 这个组件不需要实际渲染任何内容
  return null;
};

export default TerminalConnectionWrapper;
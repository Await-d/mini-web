import React, { useEffect } from 'react';
import { useTerminalConnection } from '../hooks/useTerminalConnection';
import { terminalStateRef } from '../../../contexts/TerminalContext';

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
      // 使用状态引用增强连接属性
      const enhancedProps = {
        ...connectionProps,
        // 如果引用中有更多标签，使用引用中的状态
        tabs: terminalStateRef.current.tabs.length > (connectionProps.tabs?.length || 0) 
          ? terminalStateRef.current.tabs 
          : connectionProps.tabs,
        // 如果引用中有有效的activeTabKey而连接属性中没有，使用引用中的
        activeTabKey: connectionProps.activeTabKey === 'no-tabs' && terminalStateRef.current.activeTabKey !== 'no-tabs'
          ? terminalStateRef.current.activeTabKey
          : connectionProps.activeTabKey
      };
      
      console.log('【连接包装器】连接属性准备就绪，传递给主组件', {
        hasConnection: !!enhancedProps.connection,
        tabsCount: enhancedProps.tabs?.length || 0,
        contextTabsCount: connectionProps.tabs?.length || 0,
        refTabsCount: terminalStateRef.current.tabs.length,
        activeTabKey: enhancedProps.activeTabKey,
        isConnected: enhancedProps.isConnected,
        allProperties: Object.keys(enhancedProps)
      });
      
      onConnectionReady(enhancedProps);
    } else {
      console.log('【连接包装器】连接属性尚未就绪');
    }
  }, [connectionProps, onConnectionReady]);
  
  // 这个组件不需要实际渲染任何内容
  return null;
};

export default TerminalConnectionWrapper;
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
      onConnectionReady(connectionProps);
    }
  }, [connectionProps, onConnectionReady]);
  
  // 这个组件不需要实际渲染任何内容
  return null;
};

export default TerminalConnectionWrapper;
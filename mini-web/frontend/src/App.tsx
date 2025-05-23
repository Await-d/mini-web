import { useRoutes } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { TerminalProvider } from './contexts/TerminalContext';
import { routes } from './routes';
import { message } from 'antd';

// 初始化WebSocket服务
import './pages/Terminal/services/WebSocketService';

/**
 * 应用根组件，包含认证提供者、终端提供者和路由
 */
const App = () => {
  const element = useRoutes(routes);

  // 添加全局WebSocket错误处理
  useEffect(() => {
    // 监听WebSocket连接错误事件
    const handleWebSocketError = (event: CustomEvent) => {
      const { error, tabKey } = event.detail || {};
      if (error) {
        console.error(`WebSocket连接错误 [${tabKey}]: ${error}`);
        message.error(`终端连接错误: ${error}`);
      }
    };

    // 添加事件监听器
    window.addEventListener('websocket-error', handleWebSocketError as EventListener);

    // 清理事件监听器
    return () => {
      window.removeEventListener('websocket-error', handleWebSocketError as EventListener);
    };
  }, []);

  return (
    <AuthProvider>
      <TerminalProvider>
        {element}
      </TerminalProvider>
    </AuthProvider>
  );
};

export default App;
import { useRoutes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { TerminalProvider } from './contexts/TerminalContext';
import { routes } from './routes';

/**
 * 应用根组件，包含认证提供者、终端提供者和路由
 */
const App = () => {
  const element = useRoutes(routes);
  
  return (
    <AuthProvider>
      <TerminalProvider>
        {element}
      </TerminalProvider>
    </AuthProvider>
  );
};

export default App;
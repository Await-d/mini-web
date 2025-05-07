import { RouterProvider } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { router } from './router';
import { themeConfig } from './theme';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={themeConfig}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
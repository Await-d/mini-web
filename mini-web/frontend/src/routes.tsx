import { Navigate, RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import OperationLayout from './layouts/OperationLayout';
import NotFound from './pages/NotFound';
import { RequireAuth } from './contexts/AuthContext';

// 懒加载页面组件
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Login = lazy(() => import('./pages/Login'));
const Settings = lazy(() => import('./pages/Settings'));
const Connections = lazy(() => import('./pages/Connections'));
const Sessions = lazy(() => import('./pages/Sessions'));
const Terminal = lazy(() => import('./pages/Terminal'));

// 加载指示器
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 100 }}>
    <Spin size="large" tip="页面加载中...">
      <div style={{ padding: 50, textAlign: 'center' }}>
        <div>&nbsp;</div>
      </div>
    </Spin>
  </div>
);

// 路由配置
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
    errorElement: <NotFound />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      {
        path: 'dashboard',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Dashboard />
          </Suspense>
        ),
      },
      {
        path: 'users',
        element: (
          <Suspense fallback={<PageLoader />}>
            <UserManagement />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Settings />
          </Suspense>
        ),
      },
      {
        path: 'connections',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Connections />
          </Suspense>
        ),
      },
      {
        path: 'sessions',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Sessions />
          </Suspense>
        ),
      },
      
      {
        path: '*',
        element: <NotFound />,
      }
    ],
  },
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      {
        path: 'login',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Login />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <OperationLayout />
      </RequireAuth>
    ),
    children: [
      {
        path: 'terminal',
        element: (
          <Suspense fallback={<PageLoader />}>
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              background: '#f7f7f7' 
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
                  从左侧设备树选择一个连接开始操作
                </div>
                <div style={{ color: '#666' }}>
                  或点击左上角"新建连接"按钮添加新的连接
                </div>
              </div>
            </div>
          </Suspense>
        ),
      },
      {
        path: 'terminal/:connectionId',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Terminal />
          </Suspense>
        ),
      },
    ],
  },
];
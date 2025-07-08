import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import RootLayout from './layouts/RootLayout';
import OperationLayout from './layouts/OperationLayout';
import NotFound from './pages/NotFound';
import { RequireAuth } from './contexts/AuthContext';

// 懒加载页面组件
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const UserDetail = lazy(() => import('./pages/UserManagement/UserDetail'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
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
export const router = createBrowserRouter(
  [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFound />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      // 操作模式路由 - 使用OperationLayout
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
                <Terminal />
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
            path: 'users/:id',
            element: (
              <Suspense fallback={<PageLoader />}>
                <UserDetail />
              </Suspense>
            ),
          },
          {
            path: 'profile',
            element: (
              <Suspense fallback={<PageLoader />}>
                <UserProfile />
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
          // 以下路由为正常模式下的终端页面，已废弃，保留用于兼容
          {
            path: 'terminal-old',
            element: (
              <Suspense fallback={<PageLoader />}>
                <Terminal />
              </Suspense>
            ),
          },
          {
            path: 'terminal-old/:connectionId',
            element: (
              <Suspense fallback={<PageLoader />}>
                <Terminal />
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
    ],
  },
],
{
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
});
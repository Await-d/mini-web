/*
 * @Author: Await
 * @Date: 2025-05-08 18:19:21
 * @LastEditors: Await
 * @LastEditTime: 2025-06-01 19:06:45
 * @Description: 请填写简介
 */
// React 19 兼容性补丁 - 必须在所有其他导入之前
import '@ant-design/v5-patch-for-react-19';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App } from 'antd';
import zhCN from 'antd/lib/locale/zh_CN';
import { router } from './router';
import { TerminalProvider } from './contexts/TerminalContext';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!, {
  onUncaughtError: (error, errorInfo) => {
    console.error('未捕获的渲染错误:', error, errorInfo);
  },
  onCaughtError: (error, errorInfo) => {
    console.error('被错误边界捕获的错误:', error, errorInfo);
  },
  onRecoverableError: (error, errorInfo) => {
    console.warn('可恢复的错误:', error, errorInfo);
  }
});

root.render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
        },
      }}
    >
      <App>
        <TerminalProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </TerminalProvider>
      </App>
    </ConfigProvider>
  </React.StrictMode>
);
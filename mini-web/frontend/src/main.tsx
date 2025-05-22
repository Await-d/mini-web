/*
 * @Author: Await
 * @Date: 2025-05-08 18:19:21
 * @LastEditors: Await
 * @LastEditTime: 2025-05-18 09:14:12
 * @Description: 请填写简介
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider } from 'antd';
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
      warning={{ compatibleReact19: true }}
    >
      <TerminalProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </TerminalProvider>
    </ConfigProvider>
  </React.StrictMode>
);
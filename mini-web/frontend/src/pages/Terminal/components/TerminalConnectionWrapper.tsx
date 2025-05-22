/*
 * @Author: Await
 * @Date: 2025-05-09 18:05:28
 * @LastEditors: Await
 * @LastEditTime: 2025-05-22 19:37:54
 * @Description: 终端连接包装器组件
 */
import React, { useEffect, useState, useRef } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { TerminalConnectionWrapperProps, ConnectionChildProps, Connection } from '../Terminal.d';
import { connectionAPI, sessionAPI } from '../../../services/api';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';

/**
 * 终端连接包装器组件
 * 
 * 负责连接管理和状态维护，将所有连接状态和操作传递给子组件
 */
const TerminalConnectionWrapper: React.FC<TerminalConnectionWrapperProps> = ({
  children,
  connectionParams
}) => {
  const navigate = useNavigate();
  const { state, addTab, updateTab, closeTab, setActiveTab, createWebSocketConnection } = useTerminal();
  const { tabs, activeTabKey } = state;
  const [connection, setConnection] = useState<Connection | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [terminalSize, setTerminalSize] = useState({ cols: 80, rows: 24 });
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [terminalMode, setTerminalMode] = useState('normal');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 连接状态跟踪
  const connectionState = useRef({
    connecting: false,
    connected: false,
    connectionId: null as number | null,
    sessionId: null as number | null,
    fetchingConnection: false
  });

  // 从connectionParams中获取连接ID和会话ID
  const connectionId = connectionParams?.connectionId;
  const sessionId = connectionParams?.sessionId;

  // 处理全屏切换
  const toggleFullscreen = () => {
    setFullscreen(prev => !prev);
  };

  // 获取连接信息
  const fetchConnection = async (connId: number) => {
    // 避免重复获取
    if (connectionState.current.fetchingConnection) {
      return;
    }

    // 标记为正在获取
    connectionState.current.fetchingConnection = true;

    try {
      const response = await connectionAPI.getConnection(connId);
      if (response.data.code === 200) {
        const connData = response.data.data;
        setConnection(connData);
        return connData;
      } else {
        message.error(response.data.message || '获取连接信息失败');
        return null;
      }
    } catch (error) {
      console.error('获取连接信息出错:', error);
      message.error('获取连接信息出错');
      return null;
    } finally {
      // 标记为已完成获取
      connectionState.current.fetchingConnection = false;
    }
  };

  // 创建WebSocket连接
  const createWsConnection = (tab: TerminalTab): WebSocket | null => {
    if (!tab.sessionId) {
      console.error('无法创建WebSocket连接: 缺少sessionId');
      message.error('终端连接失败：会话ID不存在');
      return null;
    }

    // 调用上下文中的createWebSocketConnection方法
    if (createWebSocketConnection) {
      try {
        // 转换为需要的参数格式
        const ws = createWebSocketConnection(tab.sessionId, tab.key);

        if (!ws) {
          console.error(`WebSocket连接创建失败: sessionId=${tab.sessionId}, tabKey=${tab.key}`);
          message.error('终端连接创建失败，请重试');
          return null;
        }

        // 添加错误处理
        ws.addEventListener('error', (e) => {
          console.error('WebSocket连接错误:', e);
          message.error('终端连接出错，请刷新页面重试');
          updateTab(tab.key, { isConnected: false });
        });

        return ws;
      } catch (error) {
        console.error('创建WebSocket连接失败:', error);
        message.error('终端连接创建失败，请重试');
        return null;
      }
    } else {
      console.error('createWebSocketConnection函数未定义');
      message.error('终端服务不可用，请稍后重试');
      return null;
    }
  };

  // 向服务器发送数据
  const sendDataToServer = (data: string): boolean => {
    const activeTab = tabs.find(tab => tab.key === activeTabKey);
    if (!activeTab || !activeTab.webSocketRef || !activeTab.webSocketRef.current) {
      console.error('无法发送数据: WebSocket未连接或标签不存在');
      return false;
    }

    try {
      activeTab.webSocketRef.current.send(data);
      return true;
    } catch (error) {
      console.error('发送数据失败:', error);
      return false;
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 清除定时器
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // 准备传递给子组件的props
  const connectionProps: ConnectionChildProps = {
    // 基本连接状态
    hasConnection: !!connection,
    tabsCount: tabs.length,
    activeTabKey,
    isConnected,

    // 核心数据
    tabs,
    connection,

    // UI状态
    fullscreen,
    terminalSize,
    networkLatency,
    terminalMode,
    sidebarCollapsed,

    // 功能方法
    toggleFullscreen,
    sendDataToServer,
    createWebSocketConnection: createWsConnection
  };

  // 渲染子组件
  return children(connectionProps);
};

export default TerminalConnectionWrapper;
import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { connectionAPI, sessionAPI } from '../../../services/api';
import type { Connection } from '../../../services/api';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { WindowSize } from '../utils/terminalConfig';

// 导入拆分出的子Hook
import { useTerminalInitialization } from './useTerminalInitialization';
import { useWebSocketManager } from './useWebSocketManager';
import { useTerminalData } from './useTerminalData';
import { useTerminalUI } from './useTerminalUI';

/**
 * 终端连接的主Hook，整合各子Hook的功能
 */
export const useTerminalConnection = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const navigate = useNavigate();

  // 使用终端上下文
  const { state, addTab, closeTab, setActiveTab, updateTab } = useTerminal();
  const { tabs, activeTabKey } = state;

  // 使用拆分的终端初始化Hook
  const {
    initTerminal,
    attachTerminalFocusHandlers,
    resizeTerminal
  } = useTerminalInitialization();

  // 使用拆分的WebSocket管理Hook
  const {
    isConnected,
    setIsConnected,
    reconnectCountRef,
    connectionAttemptRef,
    createWebSocketConnection,
    createSimpleConnection,
    createConnectionHelp,
    createRetryInterface,
    sendData,
    registerGlobalHelpers
  } = useWebSocketManager();

  // 使用拆分的终端数据Hook
  const {
    terminalMode,
    setTerminalMode,
    networkLatency,
    setNetworkLatency,
    setupModeDetection,
    setupLatencyMeasurement,
    createTerminalTools
  } = useTerminalData();

  // 使用拆分的终端UI Hook
  const {
    fullscreen,
    setFullscreen,
    sidebarCollapsed, 
    setSidebarCollapsed,
    toggleFullscreen
  } = useTerminalUI();

  const [connection, setConnection] = useState<Connection | null>(null);
  const [terminalSize, setTerminalSize] = useState<WindowSize>({ cols: 80, rows: 24 });
  
  // 缓存已处理的连接参数，避免重复处理同一个URL参数
  const processedRef = useRef(false);

  // 保存间隔定时器引用以便清理
  const intervalsRef = useRef<{ [key: string]: number }>({});

  // 发送数据到服务器
  const sendDataToServer = useCallback((data: string) => {
    const activeTab = tabs.find(tab => tab.key === activeTabKey);
    if (!activeTab) return;
    
    // 发送数据
    sendData(activeTab, data);
  }, [activeTabKey, tabs, sendData]);

  // 清理URL中的查询参数，但保留连接ID，以便刷新页面后能恢复会话
  const cleanURL = useCallback(() => {
    console.log("清理URL参数...");
    // 获取当前路径名
    const currentPath = window.location.pathname;

    // 检查当前活动的标签页
    const activeTab = tabs.find(tab => tab.key === activeTabKey);

    // 保存会话信息到localStorage，确保刷新页面时可以恢复
    if (activeTab) {
      localStorage.setItem('current_terminal_session', JSON.stringify({
        connectionId: activeTab.connectionId,
        sessionId: activeTab.sessionId,
        tabKey: activeTab.key,
        connectionProtocol: activeTab.connection?.protocol,
        connectionName: activeTab.connection?.name,
        isConnected: activeTab.isConnected
      }));
    }

    // 使用replace模式导航，不会新增历史记录
    navigate(currentPath, { replace: true });
  }, [activeTabKey, navigate, tabs]);

  // 加载连接信息并创建标签
  useEffect(() => {
    const fetchConnectionAndCreateTab = async () => {
      if (!connectionId) return;

      try {
        const response = await connectionAPI.getConnection(Number(connectionId));
        if (response.data && response.data.code === 200) {
          const conn = response.data.data;
          setConnection(conn);

          // 如果URL中包含会话ID，使用它；否则创建新会话
          let session = null;
          if (sessionParam) {
            session = { id: Number(sessionParam) };
          } else {
            const sessResponse = await sessionAPI.createSession(conn.id);
            if (sessResponse.data && sessResponse.data.code === 200) {
              session = sessResponse.data.data;
            } else {
              message.error('创建会话失败');
              return;
            }
          }

          if (session) {
            // 检查是否已存在相同的标签
            const existingTab = tabs.find(
              tab => tab.connectionId === conn.id && tab.sessionId === session?.id
            );

            if (!existingTab) {
              // 使用上下文管理器添加标签
              addTab(conn.id, session.id, conn);
            } else {
              // 如果已存在，只激活该标签
              setActiveTab(existingTab.key);
            }
          }
        } else {
          message.error('获取连接信息失败');
          navigate('/connections');
        }
      } catch (error) {
        console.error('获取连接信息失败:', error);
        message.error('获取连接信息失败，请稍后再试');
        navigate('/connections');
      }
    };

    // 如果有连接ID和会话ID，并且尚未处理，则创建新标签
    if (connectionId && sessionParam && !processedRef.current) {
      console.log(`检测到连接参数: 连接ID=${connectionId}, 会话ID=${sessionParam}`);

      // 标记为已处理，避免在组件重新渲染时重复处理相同参数
      processedRef.current = true;

      // 保存当前会话信息到localStorage，用于页面刷新时恢复
      localStorage.setItem('current_terminal_session', JSON.stringify({
        connectionId: Number(connectionId),
        sessionId: Number(sessionParam)
      }));

      // 添加检查以防止重复请求
      const existingTab = tabs.find(
        tab => tab.connectionId === Number(connectionId) && tab.sessionId === Number(sessionParam)
      );

      if (!existingTab) {
        console.log("未找到匹配的标签页，创建新标签...");
        // 创建新标签页
        fetchConnectionAndCreateTab().then(() => {
          // 成功创建后清理URL中的查询参数，但保留连接ID
          cleanURL();
        });
      } else {
        console.log(`找到匹配的标签页: ${existingTab.key}，激活此标签`);
        // 如果已存在，只激活该标签并清理URL
        setActiveTab(existingTab.key);
        cleanURL();
      }
    }
  }, [connectionId, sessionParam, navigate, addTab, setActiveTab, tabs, cleanURL]);

  // 当没有标签时的特殊处理
  useEffect(() => {
    // 检查是否有存储在localStorage中的会话信息
    const savedSession = localStorage.getItem('current_terminal_session');

    // 如果URL中没有connectionId但有保存的会话信息，则恢复会话
    if (tabs.length === 0 && !connectionId && savedSession) {
      try {
        const sessionInfo = JSON.parse(savedSession);
        if (sessionInfo.connectionId && sessionInfo.sessionId) {
          console.log('从本地存储恢复会话:', sessionInfo);
          // 导航到保存的会话
          navigate(`/terminal/${sessionInfo.connectionId}?session=${sessionInfo.sessionId}`);
          return;
        }
      } catch (e) {
        console.error('解析保存的会话信息失败:', e);
        localStorage.removeItem('current_terminal_session');
      }
    }
  }, [tabs.length, navigate, connectionId]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (tabs.length === 0) return;

      // 获取当前活动标签页
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      if (!activeTab || !activeTab.fitAddonRef?.current || !activeTab.xtermRef?.current) return;

      setTimeout(() => {
        try {
          activeTab.fitAddonRef.current!.fit();

          // 获取新的终端尺寸
          const newCols = activeTab.xtermRef.current!.cols;
          const newRows = activeTab.xtermRef.current!.rows;

          // 只有在尺寸变化时才更新状态和发送消息
          if (newCols !== terminalSize.cols || newRows !== terminalSize.rows) {
            setTerminalSize({ cols: newCols, rows: newRows });

            // 发送调整大小的消息到服务器
            if (activeTab.webSocketRef?.current &&
              activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
              const resizeMessage = {
                type: 'resize',
                cols: newCols,
                rows: newRows
              };
              activeTab.webSocketRef.current.send(JSON.stringify(resizeMessage));
            }
          }
        } catch (e) {
          console.error('调整终端大小失败:', e);
        }
      }, 0);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTabKey, tabs, terminalSize]);

  // 添加全局样式表来强制隐藏xterm-link-layer
  useEffect(() => {
    // 创建一个样式表强制隐藏xterm-link-layer
    const style = document.createElement('style');
    style.innerHTML = `
      .xterm-link-layer {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // 标签切换时初始化终端并连接WebSocket
  useEffect(() => {
    console.log(`检测到活动标签页变化，尝试执行初始化和连接: ${activeTabKey}`);
    
    const activeTab = tabs.find(tab => tab.key === activeTabKey);
    if (!activeTab || !activeTab.terminalRef?.current) {
      console.log(`跳过初始化: activeTab ${activeTab ? '存在' : '不存在'}, terminalRef ${activeTab?.terminalRef?.current ? '存在' : '不存在'}`);
      return;
    }
    
    // 重置连接尝试状态
    connectionAttemptRef.current = false;

    // 终端已初始化，调整大小确保正确显示
    if (activeTab.xtermRef?.current && activeTab.fitAddonRef?.current) {
      console.log(`标签页 ${activeTabKey} 终端已初始化，调整大小`);

      // 立即调整一次
      try {
        if (activeTab.fitAddonRef.current) {
          console.log('立即尝试调整终端大小');
          activeTab.fitAddonRef.current.fit();
        }
      } catch (e) {
        console.error(`立即调整终端大小错误:`, e);
      }

      // 延迟多次调整以确保DOM已更新
      [100, 300, 500, 1000].forEach(delay => {
        setTimeout(() => {
          try {
            if (activeTab.fitAddonRef?.current) {
              console.log(`${delay}ms后尝试调整终端大小`);
              activeTab.fitAddonRef.current.fit();
              
              // 发送一个回车确保有内容显示
              if (delay === 1000 && activeTab.webSocketRef?.current && 
                  activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
                console.log('发送回车以确保终端内容可见');
                activeTab.webSocketRef.current.send('\r');
              }
            }
          } catch (e) {
            console.error(`${delay}ms后调整终端大小错误:`, e);
          }
        }, delay);
      });

      // 更新状态
      setIsConnected(activeTab.isConnected || false);
      if (activeTab.networkLatency !== undefined && activeTab.networkLatency !== null) {
        setNetworkLatency(activeTab.networkLatency);
      }
      if (activeTab.terminalMode) {
        setTerminalMode(activeTab.terminalMode);
      }

      return;
    }

    // 改进的终端数据处理函数
    const handleTerminalData = (data: string) => {
      if (!data) {
        console.warn('终端输入数据为空');
        return;
      }
      
      console.log('终端输入数据:', data.length > 10 ? data.substring(0, 10) + '...' : data);
      sendDataToServer(data);
    };
    
    // 初始化终端实例
    console.log('初始化终端实例...');
    const initialized = initTerminal(activeTab, handleTerminalData);
    
    if (!initialized) {
      console.error('终端初始化失败，无法继续');
      return;
    }
    
    // 添加终端焦点事件
    const cleanup = attachTerminalFocusHandlers(activeTab);
    
    // 创建终端工具按钮
    createTerminalTools(activeTab);
    
    // 设置定期检测终端模式
    const modeCleanup = setupModeDetection(activeTab);
    
    // 设置定期测量网络延迟
    const latencyCleanup = setupLatencyMeasurement(activeTab);

    // 注册全局辅助函数
    registerGlobalHelpers(activeTab);
    
    // 尝试建立WebSocket连接
    const onConnectionHelp = () => createConnectionHelp(activeTab, () => {
      createWebSocketConnection(activeTab, 
        () => createConnectionHelp(activeTab, () => createWebSocketConnection(activeTab, onConnectionHelp, onRetryInterface)),
        onRetryInterface
      );
    });
    
    const onRetryInterface = () => createRetryInterface(activeTab, 
      () => createWebSocketConnection(activeTab, onConnectionHelp, onRetryInterface),
      () => createConnectionHelp(activeTab, () => createWebSocketConnection(activeTab, onConnectionHelp, onRetryInterface))
    );
    
    // 立即尝试连接
    console.log('尝试建立WebSocket连接...');
    createWebSocketConnection(activeTab, onConnectionHelp, onRetryInterface);
    
    // 清理函数
    return () => {
      if (cleanup) cleanup();
      if (modeCleanup) modeCleanup();
      if (latencyCleanup) latencyCleanup();
    };
  }, [
    activeTabKey, 
    tabs, 
    initTerminal, 
    attachTerminalFocusHandlers, 
    createWebSocketConnection, 
    createConnectionHelp, 
    createRetryInterface, 
    registerGlobalHelpers,
    setupModeDetection,
    setupLatencyMeasurement,
    createTerminalTools,
    sendDataToServer
  ]);

  // 切换全屏
  const handleToggleFullscreen = useCallback(() => {
    // 调用子Hook中的toggleFullscreen来切换全屏状态
    toggleFullscreen();
    
    // 调整终端大小
    setTimeout(() => {
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      if (!activeTab) return;
      
      // 调整终端大小
      resizeTerminal(activeTab);
    }, 100);
  }, [activeTabKey, tabs, toggleFullscreen, resizeTerminal]);

  // 监听终端大小变化
  useEffect(() => {
    const handleResizeTerminal = () => {
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      if (!activeTab || !activeTab.fitAddonRef?.current || !activeTab.xtermRef?.current) return;

      try {
        activeTab.fitAddonRef.current.fit();

        // 获取新尺寸
        const newSize = {
          cols: activeTab.xtermRef.current.cols,
          rows: activeTab.xtermRef.current.rows
        };

        // 发送尺寸调整消息到服务器
        if (activeTab.isConnected &&
          activeTab.webSocketRef?.current &&
          activeTab.webSocketRef.current.readyState === WebSocket.OPEN &&
          (newSize.cols !== terminalSize.cols || newSize.rows !== terminalSize.rows)) {
          const resizeMessage = {
            type: 'resize',
            cols: newSize.cols,
            rows: newSize.rows
          };
          activeTab.webSocketRef.current.send(JSON.stringify(resizeMessage));

          // 更新状态
          setTerminalSize(newSize);
        }
      } catch (e) {
        console.error('调整终端大小失败', e);
      }
    };

    // 添加窗口大小变化事件监听
    window.addEventListener('resize', handleResizeTerminal);

    // 添加全屏变化监听
    document.addEventListener('fullscreenchange', handleResizeTerminal);
    document.addEventListener('webkitfullscreenchange', handleResizeTerminal);
    document.addEventListener('mozfullscreenchange', handleResizeTerminal);
    document.addEventListener('MSFullscreenChange', handleResizeTerminal);

    return () => {
      window.removeEventListener('resize', handleResizeTerminal);
      document.removeEventListener('fullscreenchange', handleResizeTerminal);
      document.removeEventListener('webkitfullscreenchange', handleResizeTerminal);
      document.removeEventListener('mozfullscreenchange', handleResizeTerminal);
      document.removeEventListener('MSFullscreenChange', handleResizeTerminal);
    };
  }, [activeTabKey, tabs, terminalSize]);

  return {
    connection,
    tabs,
    activeTabKey,
    fullscreen,
    isConnected,
    terminalSize,
    networkLatency,
    terminalMode,
    sidebarCollapsed,
    cleanURL,
    toggleFullscreen: handleToggleFullscreen,
    sendDataToServer,
    setNetworkLatency,
    setTerminalMode,
    setSidebarCollapsed,
    setIsConnected,
    // 导出额外的有用函数
    createConnectionHelp,
    createRetryInterface
  };
};
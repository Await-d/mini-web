import React, { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useWebSocketManager } from '../../../hooks/useWebSocketManager';
import { useParams, useSearchParams } from 'react-router-dom';
import { message } from 'antd';
import TerminalToolbar from './TerminalToolbar';
import TerminalStatus from './TerminalStatus';
import TerminalContextMenu from './TerminalContextMenu';
import RdpTerminal from '../../../components/RdpTerminal';
import { getTabProtocol, isGraphicalProtocol, getDefaultPort } from '../utils/protocolHandler';
import '../Terminal.css';

// 终端连接状态类型
type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * 终端连接组件 - 显示并管理已连接的终端
 */
function ConnectedTerminal() {
  const { state, updateTab } = useTerminal();
  const { tabs, activeTabKey } = state;
  const [fontSize, setFontSize] = useState(14);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [latency, setLatency] = useState<number | null>(null);

  // 获取URL参数
  const { connectionId } = useParams<{ connectionId: string }>();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  const activeTab = tabs.find(tab => tab.key === activeTabKey);
  const containerRef = useRef<HTMLDivElement>(null);
  const { createWebSocketConnection } = useWebSocketManager();

  // 处理WebSocket连接建立
  useEffect(() => {
    if (activeTab?.webSocketRef?.current) {
      const socket = activeTab.webSocketRef.current;

      // 连接建立事件
      const handleOpen = () => {
        setConnectionStatus('connected');
        setErrorMessage('');
        updateTab(activeTab.key, { isConnected: true });
      };

      // 连接关闭事件
      const handleClose = () => {
        setConnectionStatus('disconnected');
        updateTab(activeTab.key, { isConnected: false });
      };

      // 连接错误事件
      const handleError = () => {
        setConnectionStatus('error');
        setErrorMessage('WebSocket连接错误');
        updateTab(activeTab.key, { isConnected: false });
      };

      // 添加事件监听
      socket.addEventListener('open', handleOpen);
      socket.addEventListener('close', handleClose);
      socket.addEventListener('error', handleError);

      // 清理函数
      return () => {
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('close', handleClose);
        socket.removeEventListener('error', handleError);
      };
    }
  }, [activeTab, updateTab]);

  // 处理来自服务器的消息
  useEffect(() => {
    if (!activeTab?.webSocketRef?.current) return;

    const handleMessage = (event: MessageEvent) => {
      // 如果是ping消息，发送pong响应
      if (typeof event.data === 'string' && event.data.includes('PING')) {
        try {
          activeTab.webSocketRef?.current?.send('PONG:' + Date.now());
        } catch (e) {
          console.error('发送PONG响应失败:', e);
        }
      }
    };

    activeTab.webSocketRef.current.addEventListener('message', handleMessage);

    return () => {
      activeTab.webSocketRef.current?.removeEventListener('message', handleMessage);
    };
  }, [activeTab]);

  // 初始化终端连接
  useEffect(() => {
    // 如果活动标签处于未连接状态，尝试建立连接
    if (activeTab && !activeTab.isConnected && connectionId) {
      const connId = parseInt(connectionId, 10);
      const sessionId = sessionParam ? parseInt(sessionParam, 10) : undefined;

      setConnectionStatus('connecting');

      // 创建WebSocket连接
      if (activeTab.webSocketRef && !activeTab.webSocketRef.current) {
        createWebSocketConnection(connId, sessionId || 0, activeTab.key);
      }
    }
  }, [activeTab, connectionId, sessionParam, createWebSocketConnection]);

  // 处理复制命令
  const handleCopy = () => {
    if (activeTab?.xtermRef?.current) {
      const terminal = activeTab.xtermRef.current;
      const selection = terminal.getSelection();

      if (selection) {
        navigator.clipboard.writeText(selection)
          .then(() => message.success('已复制到剪贴板'))
          .catch(err => message.error('复制失败: ' + err));
      } else {
        message.info('没有选中的文本');
      }
    }
  };

  // 处理清屏命令
  const handleClear = () => {
    if (activeTab?.xtermRef?.current) {
      activeTab.xtermRef.current.clear();
    }
  };

  // 处理全屏命令
  const handleFullscreen = () => {
    const terminalContainer = document.querySelector('.terminal-page-container');
    if (!terminalContainer) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
        message.error('无法退出全屏: ' + err);
      });
    } else {
      terminalContainer.requestFullscreen().catch(err => {
        message.error('无法进入全屏: ' + err);
      });
    }
  };

  // 处理字体大小变化
  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    if (activeTab?.xtermRef?.current) {
      try {
        // 设置字体大小
        activeTab.xtermRef.current.options.fontSize = size;
        // 调整终端大小以适应新的字体大小
        if (activeTab?.fitAddonRef?.current) {
          activeTab.fitAddonRef.current.fit();
        }
      } catch (e) {
        console.error('设置字体大小失败:', e);
      }
    }
  };

  // 获取连接名称
  const getConnectionName = () => {
    if (!activeTab?.connection) return '未知连接';

    // 从连接对象中获取名称
    if (activeTab.connection.name) {
      return activeTab.connection.name;
    }

    // 如果没有名称但有主机，使用主机作为名称
    if (activeTab.connection.host) {
      const protocol = activeTab.connection.protocol || 'ssh';
      const port = activeTab.connection.port || getDefaultPort(protocol);
      const username = activeTab.connection.username ? `${activeTab.connection.username}@` : '';

      return `${protocol}://${username}${activeTab.connection.host}:${port}`;
    }

    // 如果都没有，使用ID作为名称
    return `连接 ${activeTab.connectionId || 'unknown'}`;
  };

  // 渲染终端界面
  return (
    <div className="terminal-connected-container" ref={containerRef}>
      <TerminalToolbar
        title={getConnectionName()}
        onCopy={handleCopy}
        onClear={handleClear}
        onFullscreen={handleFullscreen}
        onFontSizeChange={handleFontSizeChange}
        connected={connectionStatus === 'connected'}
        connectionStatus={connectionStatus}
        networkLatency={latency}
      />

      <div className="terminal-content-area">
        {activeTab && (
          <div
            className="terminal-container"
            style={{ display: connectionStatus === 'connected' ? 'block' : 'none' }}
          >
            {activeTab && (() => {
              const tabProtocol = getTabProtocol(activeTab) || 'ssh';
              const isRdp = tabProtocol === 'rdp';

              if (isRdp) {
                return (
                  <div className="rdp-terminal-wrapper">
                    <RdpTerminal
                      webSocketRef={activeTab.webSocketRef}
                      connectionId={Number(activeTab.connectionId)}
                      sessionId={(activeTab.sessionId || 'defaultSession').toString()}
                      onResize={(width, height) => {
                        if (activeTab.webSocketRef.current) {
                          const resizeMsg = JSON.stringify({
                            type: 'resize',
                            width,
                            height
                          });
                          activeTab.webSocketRef.current.send(resizeMsg);
                        }
                      }}
                      onInput={(data) => {
                        if (activeTab.webSocketRef.current) {
                          activeTab.webSocketRef.current.send(data);
                        }
                      }}
                    />
                  </div>
                );
              } else if (!isGraphicalProtocol(tabProtocol)) {
                return (
                  <div
                    ref={activeTab.terminalRef}
                    className="xterm-container"
                  />
                );
              }

              return (
                <div className="unsupported-protocol">
                  <p>不支持的协议类型: {tabProtocol}</p>
                </div>
              );
            })()}
          </div>
        )}

        {connectionStatus !== 'connected' && (
          <TerminalStatus
            status={connectionStatus}
            connectionName={getConnectionName()}
            errorMessage={errorMessage}
            latency={latency}
          />
        )}
      </div>

      <TerminalContextMenu targetRef={containerRef} onCopy={handleCopy} onClear={handleClear} />
    </div>
  );
}

export default ConnectedTerminal;

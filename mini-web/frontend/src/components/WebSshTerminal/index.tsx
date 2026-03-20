import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Space, Tooltip, Spin, Typography } from 'antd';
import {
  ReloadOutlined,
  CopyOutlined,
  DeleteOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined
} from '@ant-design/icons';
import useXtermTerminal from '../../hooks/useXtermTerminal';
import useTerminalResize from '../../hooks/useTerminalResize';
import useTerminalSocketBridge from '../../hooks/useTerminalSocketBridge';
import useTerminalFullscreen from '../../hooks/useTerminalFullscreen';
import type { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
import styles from './styles.module.css';

const { Text } = Typography;

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSshTerminalProps {
  connectionId: number;
  sessionId: string | number;
  webSocketRef: React.RefObject<WebSocket | null>;
  visible?: boolean;
  onReconnectRequest?: (connectionId: number, sessionId: string | number) => void;
  toolbarExtras?: React.ReactNode;
}

const getSelectionText = (terminal: Terminal | null): string | null => {
  if (!terminal) return null;
  const selection = terminal.getSelection();
  return selection && selection.length > 0 ? selection : null;
};

const WebSshTerminal: React.FC<WebSshTerminalProps> = ({
  connectionId,
  sessionId,
  webSocketRef,
  visible = true,
  onReconnectRequest,
  toolbarExtras
}) => {
  const { message } = App.useApp();
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);

  const terminalOptions = useMemo(
    () => ({
      theme: {
        background: 'var(--terminal-bg, #0b0c10)',
        foreground: 'var(--terminal-fg, #c5c6c7)',
        cursor: 'var(--terminal-cursor, #66fcf1)',
        selectionBackground: 'var(--terminal-selection, #45a29e55)'
      },
      fontSize: 14
    }),
    []
  );

  const {
    containerRef,
    terminalRef,
    fitAddonRef,
    fit,
    focus,
    clear
  } = useXtermTerminal({ options: terminalOptions });

  useTerminalResize({ containerRef, fitAddonRef });
  const { toggle: toggleFullscreen, isFullscreen } = useTerminalFullscreen({ containerRef });

  const handleJsonMessage = useCallback(
    (payload: Record<string, unknown>) => {
      const type = typeof payload.type === 'string' ? payload.type : undefined;
      const textPayload = typeof payload.payload === 'string' ? payload.payload : undefined;

      switch (type) {
        case 'output':
        case 'terminal-output':
          if (textPayload) {
            terminalRef.current?.write(textPayload);
          }
          break;
        case 'clear':
          clear();
          break;
        case 'error':
          if (textPayload) {
            setError(textPayload);
            message.error(textPayload);
          }
          break;
        case 'notice':
          if (textPayload) {
            message.info(textPayload);
          }
          break;
        case 'heartbeat':
          break;
        default:
          if (textPayload) {
            terminalRef.current?.write(textPayload);
          }
      }
    },
    [clear, message, terminalRef]
  );

  const handleRefresh = useCallback(() => {
    const ws = webSocketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      message.warning('终端连接未建立');
      return;
    }

    ws.send(
      JSON.stringify({
        type: 'refresh',
        protocol: 'ssh',
        timestamp: Date.now()
      })
    );
    message.success('已发送刷新请求');
  }, [message, webSocketRef]);

  const handleCopy = useCallback(async () => {
    const text = getSelectionText(terminalRef.current);
    if (!text) {
      message.warning('请先选择需要复制的内容');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch (err) {
      console.error('复制失败:', err);
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      message.success('已复制到剪贴板');
    }
  }, [message, terminalRef]);

  useTerminalSocketBridge({
    terminalRef,
    webSocketRef,
    onOpen: () => {
      setStatus('connected');
      setError(null);
      focus();
      fit();
    },
    onClose: () => {
      setStatus('disconnected');
    },
    onError: () => {
      setStatus('error');
      setError('终端连接出错');
    },
    onJsonMessage: handleJsonMessage
  });

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        fit();
        focus();
      }, 60);
    }
  }, [fit, focus, visible]);

  const renderStatus = () => {
    if (status === 'connected') {
      return null;
    }

    return (
      <div className={styles.statusOverlay}>
        {status === 'connecting' && (
          <div className={styles.statusBox}>
            <Spin size="large" />
            <Text className={styles.statusText}>正在建立 SSH 连接...</Text>
          </div>
        )}
        {status === 'disconnected' && (
          <div className={styles.statusBox}>
            <Text className={styles.statusText}>连接已断开</Text>
            {onReconnectRequest && (
              <Button
                type="primary"
                onClick={() => onReconnectRequest(connectionId, sessionId)}
              >
                重新连接
              </Button>
            )}
          </div>
        )}
        {status === 'error' && (
          <div className={styles.statusBox}>
            <Text className={styles.statusText}>{error || '终端连接异常'}</Text>
            {onReconnectRequest && (
              <Button
                type="primary"
                onClick={() => onReconnectRequest(connectionId, sessionId)}
              >
                重试
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <Space size="small">
          <Tooltip title="刷新终端">
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} size="small" />
          </Tooltip>
          <Tooltip title="复制选中内容">
            <Button icon={<CopyOutlined />} onClick={handleCopy} size="small" />
          </Tooltip>
          <Tooltip title="清屏">
            <Button icon={<DeleteOutlined />} onClick={clear} size="small" />
          </Tooltip>
          <Tooltip title={isFullscreen ? '退出全屏' : '全屏显示'}>
            <Button
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
              size="small"
            />
          </Tooltip>
          {toolbarExtras}
        </Space>
      </div>
      <div ref={containerRef} className={styles.terminalContainer} />
      {renderStatus()}
    </div>
  );
};

export default WebSshTerminal;


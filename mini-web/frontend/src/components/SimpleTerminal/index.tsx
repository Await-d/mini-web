/*
 * @Author: Await
 * @Date: 2025-05-21 20:45:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-23 20:33:42
 * @Description: 简易终端组件，不使用xterm.js，只处理WebSocket数据
 */
import React, { useEffect, useRef, useState } from 'react';
import { Input, Alert, Spin } from 'antd';
import './styles.css';

interface SimpleTerminalProps {
    connectionId: number;
    sessionId: string | number;
    webSocketRef: React.RefObject<WebSocket | null>;
    visible?: boolean;
    onReconnectRequest?: (connectionId: number, sessionId: string | number) => void;
}

const SimpleTerminal: React.FC<SimpleTerminalProps> = ({
    connectionId,
    sessionId,
    webSocketRef,
    visible,
    onReconnectRequest
}) => {
    const [output, setOutput] = useState<string[]>([]);
    const [input, setInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const outputRef = useRef<HTMLDivElement>(null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);

    // 处理WebSocket消息，只关注数据处理，不处理连接
    useEffect(() => {
        // 检查WebSocket引用是否存在
        if (!webSocketRef || !webSocketRef.current) {
            setConnectionStatus('error');
            setError('终端连接未初始化');
            return;
        }

        const ws = webSocketRef.current;

        // 根据WebSocket状态设置连接状态
        switch (ws.readyState) {
            case WebSocket.CONNECTING:
                setConnectionStatus('connecting');
                setLoading(true);
                setError(null);
                break;
            case WebSocket.OPEN:
                setConnectionStatus('connected');
                setLoading(false);
                setError(null);
                break;
            case WebSocket.CLOSING:
            case WebSocket.CLOSED:
                setConnectionStatus('disconnected');
                setError('终端连接已关闭');
                break;
        }

        // 添加事件监听器
        const handleOpen = () => {
            console.log('WebSocket已连接');
            setConnectionStatus('connected');
            setLoading(false);
            setError(null);
        };

        const handleClose = () => {
            console.log('WebSocket已关闭');
            setConnectionStatus('disconnected');
            setError('终端连接已关闭');
        };

        const handleError = (e: Event) => {
            console.error('WebSocket错误:', e);
            setConnectionStatus('error');
            setError('终端连接出错');
        };

        // 定义消息处理函数
        const handleMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'data' && data.data) {
                    setOutput(prev => [...prev, data.data]);
                    // 滚动到底部
                    if (outputRef.current) {
                        outputRef.current.scrollTop = outputRef.current.scrollHeight;
                    }
                } else if (data.type === 'error') {
                    setError(`服务器错误: ${data.message || '未知错误'}`);
                } else if (data.type === 'connected') {
                    setOutput(prev => [...prev, '连接成功，终端已就绪']);
                    setConnectionStatus('connected');
                    setLoading(false);
                } else if (data.type === 'heartbeat_response') {
                    // 心跳响应，可以用来更新连接状态或计算网络延迟
                    console.log('收到心跳响应');
                }
            } catch (e) {
                console.error('处理WebSocket消息时出错:', e);
            }
        };

        // 添加事件监听器
        ws.addEventListener('open', handleOpen);
        ws.addEventListener('message', handleMessage);
        ws.addEventListener('close', handleClose);
        ws.addEventListener('error', handleError);

        // 清理函数
        return () => {
            if (ws) {
                ws.removeEventListener('open', handleOpen);
                ws.removeEventListener('message', handleMessage);
                ws.removeEventListener('close', handleClose);
                ws.removeEventListener('error', handleError);
            }
        };
    }, [webSocketRef]);

    // 处理命令输入
    const handleSendCommand = () => {
        if (!input.trim()) return;

        // 检查WebSocket引用是否存在
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            setError('终端连接已断开，无法发送命令');
            return;
        }

        try {
            const command = {
                type: 'command',
                data: input
            };

            webSocketRef.current.send(JSON.stringify(command));
            setOutput(prev => [...prev, `$ ${input}`]);
            setInput('');

            // 滚动到底部
            if (outputRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
            }
        } catch (e) {
            console.error('发送命令时出错:', e);
            setError('发送命令失败，请检查连接状态');
        }
    };

    // 断开连接提示文本
    const getConnectionStatusText = () => {
        switch (connectionStatus) {
            case 'connecting':
                return '正在连接终端...';
            case 'connected':
                return '终端已连接';
            case 'disconnected':
                return '终端连接已断开';
            case 'error':
                return '终端连接出错';
            default:
                return '终端状态未知';
        }
    };

    // 处理重连请求
    const handleReconnectRequest = () => {
        if (onReconnectRequest) {
            onReconnectRequest(connectionId, sessionId);
        }
    };

    return (
        <div
            className="simple-terminal-container"
            ref={terminalContainerRef}
            style={{ display: visible ? 'flex' : 'none' }}
        >
            {error && (
                <div className="simple-terminal-error">
                    <div className="simple-terminal-error-title">连接错误</div>
                    <div className="simple-terminal-error-description">{error}</div>
                    <button
                        className="simple-terminal-reconnect-button"
                        onClick={handleReconnectRequest}
                    >
                        重新连接
                    </button>
                </div>
            )}

            {loading && !error && (
                <div className="simple-terminal-loading">
                    <Spin tip={getConnectionStatusText()} size="large">
                        <div className="spin-content-placeholder" />
                    </Spin>
                </div>
            )}

            <div className="simple-terminal-output" ref={outputRef}>
                {output.length === 0 && !loading && (
                    <div className="simple-terminal-welcome">
                        <div>终端已准备就绪</div>
                        <div>连接ID: {connectionId}, 会话ID: {sessionId}</div>
                    </div>
                )}
                {output.map((line, index) => (
                    <div key={index} className="simple-terminal-line">
                        {line}
                    </div>
                ))}
            </div>

            <div className="simple-terminal-input-container">
                <Input
                    variant="borderless"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPressEnter={handleSendCommand}
                    placeholder="输入命令..."
                    disabled={!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN}
                    className="simple-terminal-input"
                />
            </div>
        </div>
    );
};

export default SimpleTerminal; 
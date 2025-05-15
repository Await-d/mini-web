import { useCallback } from 'react';
import type { RefObject } from 'react';

// Tab类型定义
interface Connection {
    id: string;
    protocol: string;
    type?: string;
    settings: {
        host?: string;
        port?: number;
        username?: string;
        password?: string;
        [key: string]: any;
    };
}

interface Tab {
    key: string;
    title: string;
    connection?: Connection;
    status?: string;
    isConnected?: boolean;
    sessionId?: number;
    xtermRef: RefObject<any>;
    fitAddonRef: RefObject<any>;
    searchAddonRef: RefObject<any>;
    messageQueueRef: RefObject<any[]>;
    webSocketRef: RefObject<WebSocket>;
}

export const useWebSocketManager = () => {
    // 创建WebSocket连接
    const createWebSocketConnection = useCallback((
        tab: Tab,
        onConnectionFailed?: () => void,
        onRetryNeeded?: () => void,
        onConnect?: () => void
    ) => {
        if (!tab || !tab.connection) {
            console.error('未提供有效的连接信息');
            return;
        }

        try {
            // 创建WebSocket
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;

            // 获取认证令牌
            const token = localStorage.getItem('token');

            // 修改WebSocket URL以匹配后端路由格式 /ws/{protocol}/{sessionId}
            // 确保使用正确的协议和会话ID
            const wsProtocol = tab.connection.protocol || 'ssh'; // 默认使用ssh
            const sessionId = tab.sessionId || 0;

            // 添加token参数到URL以解决认证问题
            const wsUrl = `${protocol}//${host}/ws/${wsProtocol}/${sessionId}?token=${token}`;

            console.log(`【WebSocket】准备创建连接，协议类型: ${wsProtocol}, 是否RDP: ${wsProtocol === 'rdp'}`);
            console.log(`【WebSocket】RDP连接URL: ${wsUrl}`);

            // 关闭现有连接
            if (tab.webSocketRef?.current) {
                tab.webSocketRef.current.close();
            }

            // 创建新连接
            const ws = new WebSocket(wsUrl);
            tab.webSocketRef.current = ws;

            // 打开连接
            ws.onopen = () => {
                console.log('【WebSocket】连接已打开');

                // 发送连接信息
                const connectionMessage = {
                    type: 'connect',
                    connectionId: tab.connection?.id,
                    connectionType: tab.connection?.type,
                    settings: tab.connection?.settings
                };

                ws.send(JSON.stringify(connectionMessage));

                // 通知连接成功
                if (onConnect) {
                    onConnect();
                }
            };

            // 接收消息
            ws.onmessage = (event) => {
                try {
                    console.log('【WebSocket】收到数据:', typeof event.data,
                        typeof event.data === 'string' ?
                            (event.data.length > 100 ?
                                event.data.substring(0, 100) + '...' :
                                event.data) :
                            '非文本数据');

                    // 特别处理RDP协议消息
                    if (typeof event.data === 'string' && wsProtocol === 'rdp') {
                        if (event.data.startsWith('RDP_')) {
                            console.log('【WebSocket】收到RDP特殊消息:',
                                event.data.substring(0, Math.min(50, event.data.length)) +
                                (event.data.length > 50 ? '...' : ''));

                            // 处理RDP_SCREENSHOT消息
                            if (event.data.startsWith('RDP_SCREENSHOT:')) {
                                console.log('【WebSocket】收到RDP截图消息，长度:', event.data.length);
                                const parts = event.data.split(':');
                                if (parts.length >= 4) {
                                    console.log('【WebSocket】RDP截图有效，分段数:', parts.length);
                                }
                            }

                            // 这里只记录消息，不需要处理，RdpTerminal组件会处理这些消息
                            return;
                        }
                    }

                    // 处理标准JSON消息
                    if (typeof event.data === 'string' && event.data.startsWith('{')) {
                        const data = JSON.parse(event.data);

                        if (data.type === 'connected') {
                            console.log('【WebSocket】与服务器建立连接');

                            // 更新状态
                            if (tab.xtermRef?.current) {
                                tab.xtermRef.current.writeln('\r\n\x1b[32m已成功连接到服务器！\x1b[0m');
                            }

                            // 通知连接成功
                            if (onConnect) {
                                onConnect();
                            }
                        }
                        else if (data.type === 'data') {
                            // 处理终端数据
                            if (tab.xtermRef?.current && data.content) {
                                tab.xtermRef.current.write(data.content);
                            }
                        }
                        else if (data.type === 'error') {
                            console.error(`【WebSocket】错误: ${data.message}`);

                            if (tab.xtermRef?.current) {
                                tab.xtermRef.current.writeln(`\r\n\x1b[31m错误: ${data.message}\x1b[0m`);
                            }

                            // 调用错误回调
                            if (onConnectionFailed) {
                                onConnectionFailed();
                            }
                        }
                    } else {
                        // 处理非JSON格式消息
                        console.log('【WebSocket】收到非JSON格式消息');

                        // 尝试直接写入数据
                        if (tab.xtermRef?.current && typeof event.data === 'string') {
                            tab.xtermRef.current.write(event.data);
                        }
                    }
                } catch (error) {
                    console.error('【WebSocket】处理消息错误:', error);

                    // 尝试直接写入数据
                    if (tab.xtermRef?.current && typeof event.data === 'string') {
                        tab.xtermRef.current.write(event.data);
                    }
                }
            };

            // 处理错误
            ws.onerror = (error) => {
                console.error('【WebSocket】RDP WebSocket连接错误:', error);

                if (tab.xtermRef?.current) {
                    tab.xtermRef.current.writeln('\r\n\x1b[31m连接错误，请稍后重试\x1b[0m');
                }

                // 调用错误回调
                if (onConnectionFailed) {
                    onConnectionFailed();
                }
            };

            // 处理关闭
            ws.onclose = () => {
                console.log('【WebSocket】RDP WebSocket连接关闭');

                if (tab.xtermRef?.current) {
                    tab.xtermRef.current.writeln('\r\n\x1b[33m连接已关闭，按R键重新连接\x1b[0m');
                }

                // 调用重试回调
                if (onRetryNeeded) {
                    onRetryNeeded();
                }
            };

            return ws;
        } catch (error) {
            console.error('【WebSocket】创建连接失败:', error);

            if (tab.xtermRef?.current) {
                tab.xtermRef.current.writeln('\r\n\x1b[31m创建连接失败，请检查网络连接\x1b[0m');
            }

            // 调用错误回调
            if (onConnectionFailed) {
                onConnectionFailed();
            }

            return null;
        }
    }, []);

    // 发送数据到WebSocket
    const sendData = useCallback((tab: Tab, data: string) => {
        if (!tab.webSocketRef?.current || tab.webSocketRef.current.readyState !== WebSocket.OPEN) {
            console.error('【WebSocket】无法发送数据: WebSocket未连接');
            return;
        }

        try {
            // 构造数据消息
            const message = {
                type: 'data',
                content: data
            };

            // 发送数据
            tab.webSocketRef.current.send(JSON.stringify(message));
        } catch (error) {
            console.error('【WebSocket】发送数据失败:', error);
        }
    }, []);

    return {
        createWebSocketConnection,
        sendData
    };
};

export default useWebSocketManager;
export type { Connection, Tab }; 
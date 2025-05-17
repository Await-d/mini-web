/*
 * @Author: Await
 * @Date: 2025-05-15 20:08:18
 * @LastEditors: Await
 * @LastEditTime: 2025-05-17 17:07:29
 * @Description: RDP远程桌面终端组件
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, message, Space, Spin, Tooltip, Typography } from 'antd';
import {
    FullscreenOutlined,
    FullscreenExitOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import styles from './styles.module.css';

const { Text } = Typography;

// RDP终端组件接口
export interface RdpTerminalProps {
    webSocketRef: React.RefObject<WebSocket | null>;
    connectionId: number;
    sessionId: string | number;
    onResize?: (width: number, height: number) => void;
    onInput?: (data: string) => void;
    isConnecting?: boolean;
}

/**
 * RDP终端组件
 * 处理RDP远程桌面连接的显示和控制
 */
const RdpTerminal: React.FC<RdpTerminalProps> = ({
    webSocketRef,
    connectionId,
    sessionId,
    onResize,
    onInput,
    isConnecting: externalConnectingState
}) => {
    // 状态管理
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isConnecting, setIsConnecting] = useState(externalConnectingState !== undefined ? externalConnectingState : true);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 引用
    const containerRef = useRef<HTMLDivElement>(null);
    const displayRef = useRef<HTMLDivElement>(null);

    // 统一处理WebSocket消息
    const handleWebSocketMessage = useCallback((event: MessageEvent) => {
        if (typeof event.data === 'string') {
            // 处理RDP屏幕截图数据
            if (event.data.startsWith('RDP_SCREENSHOT:')) {
                try {
                    const parts = event.data.split(':');
                    if (parts.length >= 4) {
                        const base64Image = parts.slice(3).join(':');

                        if (base64Image && base64Image.length > 100 && displayRef.current) {
                            const testImg = new Image();
                            testImg.onload = () => {
                                if (displayRef.current) {
                                    displayRef.current.style.backgroundImage = `url(data:image/png;base64,${base64Image})`;
                                    displayRef.current.style.backgroundSize = 'contain';
                                    displayRef.current.style.backgroundPosition = 'center';
                                    displayRef.current.style.backgroundRepeat = 'no-repeat';

                                    setIsConnected(true);
                                    setIsConnecting(false);
                                    setError(null);
                                }
                            };
                            testImg.src = `data:image/png;base64,${base64Image}`;
                        }
                    }
                } catch (error) {
                    // 忽略图像解析错误
                }
            }
            // 处理错误消息
            else if (event.data.startsWith('ERROR:')) {
                setError(event.data.substring(6));
                setIsConnecting(false);
            }
            // 处理状态消息
            else if (event.data.startsWith('STATUS:')) {
                const status = event.data.substring(7);
                if (status === 'CONNECTED') {
                    setIsConnected(true);
                    setIsConnecting(false);
                    setError(null);
                } else if (status === 'DISCONNECTED') {
                    setIsConnected(false);
                    setIsConnecting(false);
                    setError('连接已断开');
                }
            }
        }
    }, []);

    // 请求刷新屏幕
    const requestRefresh = useCallback(() => {
        const ws = webSocketRef?.current;

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立，无法请求刷新');
            return;
        }

        try {
            ws.send(JSON.stringify({
                type: 'refresh',
                timestamp: Date.now()
            }));
            message.success('已请求刷新屏幕');
        } catch (error) {
            message.error('发送刷新请求失败');
        }
    }, [webSocketRef]);

    // 切换全屏显示
    const toggleFullscreen = useCallback(() => {
        setIsFullscreen(!isFullscreen);

        if (containerRef.current) {
            const newWidth = isFullscreen ? 1280 : window.innerWidth;
            const newHeight = isFullscreen ? 720 : window.innerHeight;

            if (onResize) {
                onResize(newWidth, newHeight);
            }
        }
    }, [isFullscreen, onResize]);

    // 控制面板交互
    const handleMouseEnter = useCallback(() => setShowControls(true), []);
    const handleMouseLeave = useCallback(() => setShowControls(false), []);

    // 更新外部传入的连接状态
    useEffect(() => {
        if (externalConnectingState !== undefined) {
            setIsConnecting(externalConnectingState);
        }
    }, [externalConnectingState]);

    // 设置提供的WebSocket引用的消息处理
    useEffect(() => {
        const ws = webSocketRef?.current;
        if (!ws) return;

        // 添加消息事件监听器
        ws.addEventListener('message', handleWebSocketMessage);

        // 根据WebSocket状态设置连接状态
        if (ws.readyState === WebSocket.OPEN) {
            setIsConnected(true);
            setIsConnecting(false);
            setError(null);
        } else if (ws.readyState === WebSocket.CONNECTING) {
            setIsConnecting(true);
        } else {
            setIsConnected(false);
            setIsConnecting(false);
            setError('WebSocket连接未就绪');
        }

        // 清理函数
        return () => {
            ws.removeEventListener('message', handleWebSocketMessage);
        };
    }, [webSocketRef, handleWebSocketMessage]);

    // 渲染组件
    return (
        <div
            className={`${styles.rdpTerminal} ${isFullscreen ? styles.fullscreenContainer : ''}`}
            ref={containerRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* RDP显示区域 */}
            <div
                ref={displayRef}
                className={styles.rdpDisplayArea}
            >
                {/* 连接状态显示 */}
                {isConnecting && (
                    <div className={styles.rdpStatusOverlay}>
                        <Spin size="large" />
                        <Text style={{ color: '#fff', marginTop: 16 }}>正在连接到RDP服务器...</Text>
                    </div>
                )}

                {/* 错误状态显示 */}
                {error && (
                    <div className={styles.rdpErrorOverlay}>
                        <Text type="danger" style={{ fontSize: 16 }}>{error}</Text>
                        <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={requestRefresh}
                            style={{ marginTop: 16 }}
                        >
                            重新连接
                        </Button>
                    </div>
                )}
            </div>

            {/* 控制面板 */}
            {showControls && (
                <div className={styles.terminalControls}>
                    <Space>
                        <Tooltip title="刷新">
                            <Button
                                icon={<ReloadOutlined />}
                                size="small"
                                onClick={requestRefresh}
                            />
                        </Tooltip>

                        <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
                            <Button
                                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                size="small"
                                onClick={toggleFullscreen}
                            />
                        </Tooltip>
                    </Space>
                </div>
            )}
        </div>
    );
};

export default RdpTerminal;
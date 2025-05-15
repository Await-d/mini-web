/*
 * @Author: Await
 * @Date: 2025-05-15 20:08:18
 * @LastEditors: Await
 * @LastEditTime: 2025-05-15 21:46:37
 * @Description: 请填写简介
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, message, Space, Spin, Tooltip, Typography } from 'antd';
import {
    FullscreenOutlined,
    FullscreenExitOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import styles from './styles.module.css';
import './rdp.css';

const { Text } = Typography;

// RDP终端组件接口
export interface RdpTerminalProps {
    webSocketRef: React.RefObject<WebSocket | null>;
    connectionId: number;
    sessionId: string;
    onResize?: (width: number, height: number) => void;
    onInput?: (data: string) => void;
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
    onInput
}) => {
    // 状态管理
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 引用
    const containerRef = useRef<HTMLDivElement>(null);
    const displayRef = useRef<HTMLDivElement>(null);

    // 请求刷新屏幕
    const requestRefresh = useCallback(() => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立，无法请求刷新');
            return;
        }

        try {
            webSocketRef.current.send(JSON.stringify({
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

    // WebSocket未连接时显示错误
    if (!webSocketRef.current) {
        return (
            <div className="rdp-terminal-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div className="rdp-error-message" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <Text type="danger">无法初始化RDP终端: WebSocket引用不可用</Text>
                </div>
            </div>
        );
    }

    // 处理WebSocket消息事件
    useEffect(() => {
        if (!webSocketRef?.current) return;

        // 处理RDP屏幕截图数据
        const handleMessage = (event: MessageEvent) => {
            if (typeof event.data === 'string' && event.data.startsWith('RDP_SCREENSHOT:')) {
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
        };

        // 添加消息事件监听器
        webSocketRef.current.addEventListener('message', handleMessage);

        // 清理函数
        return () => {
            if (webSocketRef.current) {
                webSocketRef.current.removeEventListener('message', handleMessage);
            }
        };
    }, [webSocketRef, displayRef]);

    // 监听WebSocket连接状态
    useEffect(() => {
        if (!webSocketRef?.current) return;

        const wsInstance = webSocketRef.current;

        // 连接事件处理
        const handleOpen = () => {
            setIsConnected(true);
            setIsConnecting(false);
            setError(null);

            // 设置初始大小
            if (onResize) {
                onResize(1280, 720);
            }
        };

        const handleClose = () => {
            setIsConnected(false);
            setIsConnecting(false);
            setError('WebSocket连接已关闭');
        };

        const handleError = () => {
            setIsConnected(false);
            setIsConnecting(false);
            setError('WebSocket连接出错');
        };

        // 根据当前连接状态设置
        if (wsInstance.readyState === WebSocket.OPEN) {
            handleOpen();
        } else {
            wsInstance.addEventListener('open', handleOpen);
        }

        wsInstance.addEventListener('close', handleClose);
        wsInstance.addEventListener('error', handleError);

        // 清理函数
        return () => {
            if (wsInstance) {
                wsInstance.removeEventListener('open', handleOpen);
                wsInstance.removeEventListener('close', handleClose);
                wsInstance.removeEventListener('error', handleError);
            }
        };
    }, [webSocketRef, onResize]);

    // 渲染组件
    return (
        <div
            className="rdp-terminal-container"
            ref={containerRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* RDP显示区域 */}
            <div
                ref={displayRef}
                className="rdp-display-area"
            >
                {/* 连接状态显示 */}
                {isConnecting && (
                    <div className="rdp-status-overlay">
                        <Spin size="large" />
                        <Text style={{ color: '#fff', marginTop: 16 }}>正在连接到RDP服务器...</Text>
                    </div>
                )}

                {/* 错误状态显示 */}
                {error && (
                    <div className="rdp-error-overlay">
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
                <div className="rdp-controls">
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
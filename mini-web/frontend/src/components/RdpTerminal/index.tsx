/*
 * @Author: Await
 * @Date: 2025-05-23 10:30:15
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 16:39:13
 * @Description: RDP终端组件 - 优化版本
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Alert, Spin, Button, Space, Typography, Tooltip, message, Progress } from 'antd';
import {
    ReloadOutlined,
    FullscreenOutlined,
    FullscreenExitOutlined,
    SettingOutlined,
    InfoCircleOutlined,
    DisconnectOutlined
} from '@ant-design/icons';
import './styles.css';
import type { TerminalTab } from '../../contexts/TerminalContext';
import webSocketService from '../../pages/Terminal/services/WebSocketService';

const { Text } = Typography;

export interface RdpTerminalProps {
    connectionId: number;
    sessionId: string | number;
    webSocketRef: React.RefObject<WebSocket | null>;
    onResize?: (width: number, height: number) => void;
    visible?: boolean;
}

interface ConnectionStatus {
    connected: boolean;
    connecting: boolean;
    error: string | null;
    lastUpdate: number;
    latency: number;
}

const RdpTerminal: React.FC<RdpTerminalProps> = ({
    connectionId,
    sessionId,
    webSocketRef,
    onResize,
    visible = true
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<ConnectionStatus>({
        connected: false,
        connecting: true,
        error: null,
        lastUpdate: Date.now(),
        latency: 0
    });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentSize, setCurrentSize] = useState({ width: 1024, height: 768 });

    // 性能监控
    const [frameRate, setFrameRate] = useState(0);
    const [lastFrameTime, setLastFrameTime] = useState(Date.now());
    const [frameCount, setFrameCount] = useState(0);

    // 手动重连功能（不再自动重连，由WebSocketService统一管理）
    const manualReconnect = useCallback(() => {
        if (!connectionId || !sessionId) {
            message.error('缺少连接信息，无法重连');
            return;
        }

        // 检查WebSocketService的重连配置
        const reconnectConfig = webSocketService.getReconnectConfig();
        if (!reconnectConfig.enabled) {
            message.warning('自动重连已禁用，请在WebSocket设置中启用');
            return;
        }

        setLoading(true);
        setError(null);
        setStatus(prev => ({ ...prev, connecting: true, error: null }));

        message.info('正在尝试手动重连...');

        // 使用WebSocketService的重连功能
        if (webSocketRef?.current) {
            // 创建虚拟标签对象用于重连
            const virtualTab: TerminalTab = {
                key: `rdp-${connectionId}-${sessionId}`,
                title: 'RDP连接',
                connectionId: typeof connectionId === 'string' ? parseInt(connectionId) : connectionId,
                sessionId: typeof sessionId === 'string' ? parseInt(sessionId) : sessionId,
                protocol: 'rdp',
                webSocketRef: webSocketRef,
                terminalRef: useRef<HTMLDivElement>(null),
                messageQueueRef: useRef<Array<{ type: string; data: string | number[]; timestamp: number }> | null>(null),
                isConnected: false,
                status: 'connecting'
            };

            // 使用WebSocketService刷新连接
            const newWs = webSocketService.refreshConnection(virtualTab);
            if (newWs) {
                webSocketRef.current = newWs;
                message.success('重连请求已发送');
            } else {
                message.error('重连失败，请稍后再试');
                setLoading(false);
                setStatus(prev => ({ ...prev, connecting: false, error: '重连失败' }));
            }
        }
    }, [connectionId, sessionId, webSocketRef]);

    // 发送初始化消息
    const sendInitMessage = useCallback(() => {
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            console.error('RdpTerminal: WebSocket未连接，无法发送初始化消息');
            return;
        }

        const initMessage = {
            type: 'init',
            protocol: 'rdp',
            connectionId: connectionId,
            sessionId: sessionId,
            width: currentSize.width,
            height: currentSize.height,
            timestamp: Date.now()
        };

        try {
            webSocketRef.current.send(JSON.stringify(initMessage));
            console.log('RdpTerminal: 已发送RDP初始化消息:', initMessage);
        } catch (e) {
            console.error('RdpTerminal: 发送RDP初始化消息失败:', e);
            setError('无法初始化RDP连接');
        }
    }, [connectionId, sessionId, webSocketRef]);

    // 刷新屏幕
    const refreshScreen = useCallback(() => {
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.warning('WebSocket未连接');
            return;
        }

        const refreshMessage = {
            type: 'refresh',
            protocol: 'rdp',
            timestamp: Date.now()
        };

        try {
            webSocketRef.current.send(JSON.stringify(refreshMessage));
            message.success('已发送刷新请求');
        } catch (e) {
            console.error('发送刷新请求失败:', e);
            message.error('刷新请求失败');
        }
    }, [webSocketRef]);

    // 全屏切换
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    // 监听全屏变化
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    // 计算帧率
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const timeDiff = now - lastFrameTime;
            if (timeDiff >= 1000) {
                setFrameRate(Math.round((frameCount * 1000) / timeDiff));
                setFrameCount(0);
                setLastFrameTime(now);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [frameCount, lastFrameTime]);

    // 初始化RDP画布
    useEffect(() => {
        // 添加更严格的条件检查，避免无限渲染
        if (!visible) {
            console.log('RdpTerminal: 组件不可见，跳过初始化');
            return;
        }

        // 检查WebSocket引用 - 使用更温和的方式处理
        if (!webSocketRef || !webSocketRef.current) {
            console.warn('RdpTerminal: WebSocket引用为空，等待连接建立...');
            setError('RDP连接正在建立中，请稍候...');
            setLoading(true);

            // 设置一个检查计时器，避免无限等待
            const checkTimer = setTimeout(() => {
                if (!webSocketRef?.current) {
                    console.error('RdpTerminal: WebSocket连接超时');
                    setError('RDP连接超时，请重新尝试');
                    setLoading(false);
                }
            }, 10000); // 10秒超时

            return () => {
                clearTimeout(checkTimer);
            };
        }

        const ws = webSocketRef.current;
        const canvas = canvasRef.current;

        if (!canvas) {
            console.error('RdpTerminal: Canvas引用为空');
            setError('画布初始化失败');
            return;
        }

        // 检查WebSocket连接状态
        if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
            console.warn('RdpTerminal: WebSocket连接状态异常', ws.readyState);
            setError('WebSocket连接状态异常，请重新连接');
            return;
        }

        console.log('RdpTerminal: 开始初始化RDP画布');

        // 设置初始尺寸
        canvas.width = currentSize.width;
        canvas.height = currentSize.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('RdpTerminal: 无法获取Canvas 2D上下文');
            setError('浏览器不支持Canvas 2D');
            return;
        }

        // 显示加载状态
        setLoading(true);
        setStatus(prev => ({ ...prev, connected: false, connecting: true }));

        // 在useEffect内部定义sendInitMessage，获取当前状态
        const sendInitMessageLocal = () => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.error('RdpTerminal: WebSocket未连接，无法发送初始化消息');
                return;
            }

            const initMessage = {
                type: 'init',
                protocol: 'rdp',
                connectionId: connectionId,
                sessionId: sessionId,
                width: canvas.width,
                height: canvas.height,
                timestamp: Date.now()
            };

            try {
                ws.send(JSON.stringify(initMessage));
                console.log('RdpTerminal: 已发送RDP初始化消息:', initMessage);
            } catch (e) {
                console.error('RdpTerminal: 发送RDP初始化消息失败:', e);
                setError('无法初始化RDP连接');
            }
        };

        // 处理图像数据
        const handleImageData = (imageData: string) => {
            try {
                const img = new Image();
                img.onload = () => {
                    // 检查canvas是否仍然有效
                    if (!canvas || !ctx) {
                        console.warn('RdpTerminal: Canvas已失效，跳过图像绘制');
                        return;
                    }

                    // 清空画布
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // 绘制图像
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    // 更新状态
                    setStatus(prev => ({
                        ...prev,
                        lastUpdate: Date.now(),
                        connected: true,
                        connecting: false
                    }));

                    setFrameCount(prev => prev + 1);
                    setLoading(false);
                    setError(null);
                };

                img.onerror = () => {
                    console.error('RdpTerminal: 图像加载失败');
                    setError('图像数据损坏');
                };

                img.src = 'data:image/png;base64,' + imageData;
            } catch (e) {
                console.error('RdpTerminal: 处理图像数据失败:', e);
                setError('图像处理失败');
            }
        };

        // WebSocket事件处理器
        const handleOpen = () => {
            console.log('RdpTerminal: WebSocket连接已建立');
            sendInitMessageLocal();
        };

        const handleClose = () => {
            console.log('RdpTerminal: WebSocket连接已关闭');
            setStatus(prev => ({ ...prev, connected: false, connecting: false }));

            if (status.connected) {
                setError('RDP连接已断开');
                // 手动重连
                manualReconnect();
            }
        };

        const handleError = (e: Event) => {
            console.error('RdpTerminal: WebSocket错误:', e);
            setError('RDP连接出错，请尝试重新连接');
            setStatus(prev => ({ ...prev, connected: false, connecting: false, error: '连接错误' }));
        };

        // 处理WebSocket消息
        const handleMessage = (event: MessageEvent) => {
            const startTime = Date.now();

            try {
                if (event.data instanceof Blob) {
                    // 处理二进制数据（图像帧）
                    event.data.arrayBuffer().then(buffer => {
                        const uint8Array = new Uint8Array(buffer);
                        const base64String = btoa(String.fromCharCode(...uint8Array));
                        handleImageData(base64String);

                        const latency = Date.now() - startTime;
                        setStatus(prev => ({ ...prev, latency }));
                    }).catch(error => {
                        console.error('RdpTerminal: 处理二进制数据失败:', error);
                        setError('数据处理失败');
                    });
                } else if (typeof event.data === 'string') {
                    // 处理文本消息
                    const message = event.data;

                    if (message.startsWith('RDP_SCREENSHOT:')) {
                        // 解析截图数据: RDP_SCREENSHOT:width:height:base64data
                        const parts = message.split(':');
                        if (parts.length >= 4) {
                            const width = parseInt(parts[1]);
                            const height = parseInt(parts[2]);
                            const base64Data = parts.slice(3).join(':');

                            // 更新画布尺寸（如果需要）
                            if (width && height && canvas && (canvas.width !== width || canvas.height !== height)) {
                                canvas.width = width;
                                canvas.height = height;
                                setCurrentSize({ width, height });

                                if (onResize) {
                                    onResize(width, height);
                                }
                            }

                            handleImageData(base64Data);
                        }
                    } else if (message.startsWith('RDP_CONNECTED')) {
                        console.log('RdpTerminal: RDP连接已建立');
                        setLoading(false);
                        setStatus(prev => ({ ...prev, connected: true, connecting: false, error: null }));
                        setError(null);
                    } else if (message.startsWith('RDP_ERROR:')) {
                        const errorMsg = message.substring(10);
                        console.error('RdpTerminal: RDP错误:', errorMsg);
                        setError(errorMsg);
                        setLoading(false);
                        setStatus(prev => ({ ...prev, connected: false, connecting: false, error: errorMsg }));
                    } else if (message.startsWith('RDP_NOTICE:')) {
                        const notice = message.substring(11);
                        console.log('RdpTerminal: RDP通知:', notice);
                    } else {
                        try {
                            // 尝试解析JSON消息
                            const data = JSON.parse(message);

                            if (data.type === 'RDP_CONNECTED' || data.type === 'connected') {
                                console.log('RdpTerminal: RDP连接已建立');
                                setLoading(false);
                                setStatus(prev => ({ ...prev, connected: true, connecting: false, error: null }));
                                setError(null);
                            } else if (data.type === 'RDP_ERROR' || data.type === 'error') {
                                const errorMessage = data.data || data.message || 'RDP连接出错';
                                console.error('RdpTerminal: RDP错误:', errorMessage);
                                setError(errorMessage);
                                setLoading(false);
                                setStatus(prev => ({ ...prev, connected: false, connecting: false, error: errorMessage }));
                            } else if (data.type === 'RDP_DESKTOP_INIT') {
                                // 处理桌面初始化
                                console.log('RdpTerminal: RDP桌面初始化:', data.data);
                                if (data.data && data.data.width && data.data.height && canvas) {
                                    canvas.width = data.data.width;
                                    canvas.height = data.data.height;
                                    setCurrentSize({ width: data.data.width, height: data.data.height });

                                    if (onResize) {
                                        onResize(data.data.width, data.data.height);
                                    }
                                }
                                setLoading(false);
                                setStatus(prev => ({ ...prev, connected: true, connecting: false, error: null }));
                            } else if (data.type === 'RDP_BITMAP') {
                                // 处理位图数据
                                if (data.data && data.data.data) {
                                    console.log('RdpTerminal: 收到RDP位图数据');
                                    handleImageData(data.data.data);
                                }
                            } else if (data.type === 'RDP_NOTICE') {
                                // 处理通知消息
                                console.log('RdpTerminal: RDP通知:', data.data);
                            } else if (data.type === 'resize') {
                                // 处理调整大小事件
                                if (data.width && data.height && canvas) {
                                    canvas.width = data.width;
                                    canvas.height = data.height;
                                    setCurrentSize({ width: data.width, height: data.height });

                                    if (onResize) {
                                        onResize(data.width, data.height);
                                    }
                                }
                            } else {
                                console.log('RdpTerminal: 收到未知RDP消息类型:', data.type, data);
                            }
                        } catch (jsonError) {
                            // 如果JSON解析失败，则作为普通文本处理
                            console.log('RdpTerminal: 收到文本数据:', message);
                        }
                    }

                    const latency = Date.now() - startTime;
                    setStatus(prev => ({ ...prev, latency }));
                } else {
                    console.log('RdpTerminal: 收到未知类型数据:', typeof event.data);
                }
            } catch (e) {
                console.error('RdpTerminal: 处理WebSocket消息时出错:', e);
                setError('处理RDP数据时出错');
            }
        };

        // 添加事件监听器
        ws.addEventListener('open', handleOpen);
        ws.addEventListener('message', handleMessage);
        ws.addEventListener('close', handleClose);
        ws.addEventListener('error', handleError);

        // 如果WebSocket已经打开，立即发送初始化消息
        if (ws.readyState === WebSocket.OPEN) {
            handleOpen();
        }

        // 清理函数
        return () => {
            if (ws) {
                ws.removeEventListener('open', handleOpen);
                ws.removeEventListener('message', handleMessage);
                ws.removeEventListener('close', handleClose);
                ws.removeEventListener('error', handleError);
            }
        };
    }, [connectionId, sessionId, visible]);

    // 处理鼠标事件
    const handleMouseEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN || !status.connected) {
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        // 计算相对坐标
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);

        // 发送鼠标事件
        const mouseEvent = {
            type: 'mouse',
            eventType: e.type,
            x: Math.max(0, Math.min(x, canvas.width - 1)),
            y: Math.max(0, Math.min(y, canvas.height - 1)),
            button: e.button,
            buttons: e.buttons,
            timestamp: Date.now()
        };

        try {
            webSocketRef.current.send(JSON.stringify(mouseEvent));
        } catch (e) {
            console.error('发送鼠标事件失败:', e);
        }
    }, [webSocketRef, status.connected]);

    // 处理键盘事件
    const handleKeyEvent = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN || !status.connected) {
            return;
        }

        // 阻止默认行为，防止浏览器处理某些按键
        e.preventDefault();

        // 发送键盘事件
        const keyEvent = {
            type: 'keyboard',
            eventType: e.type,
            key: e.key,
            code: e.code,
            keyCode: e.keyCode,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            timestamp: Date.now()
        };

        try {
            webSocketRef.current.send(JSON.stringify(keyEvent));
        } catch (e) {
            console.error('发送键盘事件失败:', e);
        }
    }, [webSocketRef, status.connected]);

    // 状态指示器
    const getStatusColor = () => {
        if (status.connecting) return '#faad14';
        if (status.connected) return '#52c41a';
        return '#ff4d4f';
    };

    const getStatusText = () => {
        if (status.connecting) return '连接中...';
        if (status.connected) return '已连接';
        return '已断开';
    };

    return (
        <div
            ref={containerRef}
            className={`rdp-terminal-container ${isFullscreen ? 'rdp-fullscreen' : ''}`}
            style={{ display: visible ? 'flex' : 'none' }}
        >
            {/* 顶部状态栏 */}
            <div className="rdp-status-bar">
                <Space size="small">
                    <div className="rdp-status-indicator">
                        <div
                            className="rdp-status-dot"
                            style={{ backgroundColor: getStatusColor() }}
                        />
                        <Text style={{ color: '#fff' }}>{getStatusText()}</Text>
                    </div>

                    {status.connected && (
                        <>
                            <Text style={{ color: '#bfbfbf', fontSize: '12px' }}>
                                延迟: {status.latency}ms
                            </Text>
                            <Text style={{ color: '#bfbfbf', fontSize: '12px' }}>
                                帧率: {frameRate}fps
                            </Text>
                            <Text style={{ color: '#bfbfbf', fontSize: '12px' }}>
                                尺寸: {currentSize.width}×{currentSize.height}
                            </Text>
                        </>
                    )}
                </Space>

                <Space>
                    <Tooltip title="刷新屏幕">
                        <Button
                            type="text"
                            icon={<ReloadOutlined />}
                            onClick={refreshScreen}
                            disabled={!status.connected}
                            size="small"
                            style={{ color: '#fff' }}
                        />
                    </Tooltip>

                    <Tooltip title={isFullscreen ? "退出全屏" : "全屏显示"}>
                        <Button
                            type="text"
                            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                            onClick={toggleFullscreen}
                            size="small"
                            style={{ color: '#fff' }}
                        />
                    </Tooltip>
                </Space>
            </div>

            {/* 错误提示 */}
            {error && (
                <Alert
                    message="RDP连接错误"
                    description={
                        <div>
                            <div>{error}</div>
                        </div>
                    }
                    type="error"
                    showIcon
                    closable
                    onClose={() => setError(null)}
                    style={{ margin: '10px', zIndex: 20 }}
                />
            )}

            {/* 加载状态 */}
            {loading && (
                <div className="rdp-loading-container">
                    <Spin tip="正在连接RDP服务器..." size="large">
                        <div className="rdp-spin-content" />
                    </Spin>
                </div>
            )}

            {/* RDP画布 */}
            <canvas
                ref={canvasRef}
                className="rdp-canvas"
                tabIndex={0}
                onMouseDown={handleMouseEvent}
                onMouseUp={handleMouseEvent}
                onMouseMove={handleMouseEvent}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={handleKeyEvent}
                onKeyUp={handleKeyEvent}
                style={{
                    opacity: loading ? 0.3 : 1,
                    transition: 'opacity 0.3s ease'
                }}
            />
        </div>
    );
};

export default RdpTerminal;
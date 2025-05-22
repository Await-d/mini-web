/*
 * @Author: Await
 * @Date: 2025-05-23 10:30:15
 * @LastEditors: Await
 * @LastEditTime: 2025-05-23 11:55:15
 * @Description: RDP终端组件
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import './styles.css';

export interface RdpTerminalProps {
    connectionId: number;
    sessionId: string | number;
    webSocketRef: React.RefObject<WebSocket | null>;
    onResize?: (width: number, height: number) => void;
    visible?: boolean;
}

const RdpTerminal: React.FC<RdpTerminalProps> = ({
    connectionId,
    sessionId,
    webSocketRef,
    onResize,
    visible = true
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);

    // 初始化RDP画布
    useEffect(() => {
        // 如果组件不可见，跳过初始化
        if (!visible) return;

        // 检查WebSocket是否存在
        if (!webSocketRef || !webSocketRef.current) {
            console.error('WebSocket引用为空');
            setError('RDP连接未初始化，请稍后再试');
            return;
        }

        const ws = webSocketRef.current;
        const canvas = canvasRef.current;

        if (!canvas) {
            console.error('Canvas引用为空');
            return;
        }

        // 设置初始尺寸
        canvas.width = 1024;
        canvas.height = 768;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('无法获取Canvas 2D上下文');
            setError('浏览器不支持Canvas 2D');
            return;
        }

        // 显示加载状态
        setLoading(true);
        setConnected(false);

        // 处理图像数据
        const handleImageData = (data: ArrayBuffer) => {
            const view = new Uint8ClampedArray(data);
            const imageData = new ImageData(view, canvas.width, canvas.height);
            ctx.putImageData(imageData, 0, 0);
        };

        // WebSocket事件处理器
        const handleOpen = () => {
            console.log('RDP WebSocket连接已建立');

            // 发送初始化消息
            const initMessage = {
                type: 'init',
                protocol: 'rdp',
                connectionId: connectionId,
                sessionId: sessionId,
                width: canvas.width,
                height: canvas.height
            };

            try {
                ws.send(JSON.stringify(initMessage));
            } catch (e) {
                console.error('发送RDP初始化消息失败:', e);
                setError('无法初始化RDP连接');
            }
        };

        const handleClose = () => {
            console.log('RDP WebSocket连接已关闭');
            if (connected) {
                setError('RDP连接已断开，请刷新页面重试');
            }
            setConnected(false);
        };

        const handleError = (e: Event) => {
            console.error('RDP WebSocket错误:', e);
            setError('RDP连接出错，请尝试重新连接');
        };

        // 处理WebSocket消息
        const handleMessage = (event: MessageEvent) => {
            try {
                if (event.data instanceof Blob) {
                    // 处理二进制数据（图像帧）
                    event.data.arrayBuffer().then(buffer => {
                        handleImageData(buffer);
                        // 收到第一帧数据后取消加载状态
                        setLoading(false);
                        setConnected(true);
                    });
                } else {
                    // 处理JSON控制消息
                    const data = JSON.parse(event.data);

                    if (data.type === 'connected') {
                        console.log('RDP连接已建立');
                        setLoading(false);
                        setConnected(true);
                        setError(null);
                    } else if (data.type === 'error') {
                        console.error('RDP错误:', data.message);
                        setError(data.message || 'RDP连接出错');
                        setLoading(false);
                    } else if (data.type === 'resize') {
                        // 处理调整大小事件
                        if (data.width && data.height && canvas) {
                            canvas.width = data.width;
                            canvas.height = data.height;

                            // 调用回调通知尺寸变化
                            if (onResize) {
                                onResize(data.width, data.height);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('处理WebSocket消息时出错:', e);
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
    }, [connectionId, sessionId, webSocketRef, onResize, visible]);

    // 处理鼠标事件
    const handleMouseEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN || !connected) {
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        // 计算相对坐标
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 发送鼠标事件
        const mouseEvent = {
            type: 'mouse',
            eventType: e.type,
            x: Math.round(x),
            y: Math.round(y),
            button: e.button
        };

        try {
            webSocketRef.current.send(JSON.stringify(mouseEvent));
        } catch (e) {
            console.error('发送鼠标事件失败:', e);
        }
    };

    // 处理键盘事件
    const handleKeyEvent = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN || !connected) {
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
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey
        };

        try {
            webSocketRef.current.send(JSON.stringify(keyEvent));
        } catch (e) {
            console.error('发送键盘事件失败:', e);
        }
    };

    return (
        <div className="rdp-terminal-container" style={{ display: visible ? 'flex' : 'none' }}>
            {error && (
                <Alert
                    message="RDP连接错误"
                    description={error}
                    type="error"
                    showIcon
                    closable
                    style={{ marginBottom: 10 }}
                />
            )}

            {loading && (
                <div className="rdp-loading-container">
                    <Spin tip="正在连接RDP服务器..." size="large">
                        <div className="rdp-spin-content" />
                    </Spin>
                </div>
            )}

            <canvas
                ref={canvasRef}
                className="rdp-canvas"
                tabIndex={0}
                onMouseDown={handleMouseEvent}
                onMouseUp={handleMouseEvent}
                onMouseMove={handleMouseEvent}
                onKeyDown={handleKeyEvent}
                onKeyUp={handleKeyEvent}
            />
        </div>
    );
};

export default RdpTerminal;
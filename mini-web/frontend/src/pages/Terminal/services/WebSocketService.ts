/*
 * @Author: Await
 * @Date: 2025-05-18 16:40:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-19 21:01:12
 * @Description: WebSocket统一管理服务
 */
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import { writeColorText, writeWelcomeBanner } from '../utils/terminalUtils';
import { API_BASE_URL } from '../../../services/api';

// WebSocket基础URL - 使用API_BASE_URL中的主机地址
const WS_BASE_URL = (() => {
    // 从API_BASE_URL中提取主机地址
    const apiUrl = new URL(API_BASE_URL);
    // 替换协议（http -> ws, https -> wss）
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 返回WebSocket基础URL，使用/ws路径
    return `${protocol}//${apiUrl.host}/ws`;
})();

// 协议处理器接口
export interface ProtocolHandler {
    handleMessage: (tab: TerminalTab, event: MessageEvent) => void;
    handleOpen?: (tab: TerminalTab) => void;
    handleClose?: (tab: TerminalTab) => void;
    handleError?: (tab: TerminalTab, error: Event) => void;
}

// WebSocket连接信息接口
interface WebSocketConnection {
    ws: WebSocket;
    tabKey: string;
    connectionId: number;
    sessionId: number;
    protocol: string;
    lastActivityTime: number;
    reconnectAttempts: number;
    reconnectTimer?: NodeJS.Timeout;
}

/**
 * WebSocket管理服务 - 单例模式
 * 集中管理所有WebSocket连接，防止重复连接
 */
class WebSocketServiceClass {
    private connections: Map<string, WebSocketConnection> = new Map();
    private protocolHandlers: Map<string, ProtocolHandler> = new Map();
    private connectingTabs: Set<string> = new Set();
    private static MAX_RECONNECT_ATTEMPTS = 5;
    private static RECONNECT_DELAY = 3000; // 基础重连延迟(ms)

    constructor() {
        // 注册窗口关闭事件处理器，确保关闭所有连接
        window.addEventListener('beforeunload', () => {
            this.closeAllConnections();
        });
    }

    /**
     * 注册协议特定的消息处理器
     * @param protocol 协议类型，如'ssh'、'rdp'等
     * @param handler 处理器实现
     */
    registerProtocolHandler(protocol: string, handler: ProtocolHandler): void {
        this.protocolHandlers.set(protocol.toLowerCase(), handler);
        console.log(`【WebSocket】注册协议处理器: ${protocol}`);
    }

    /**
     * 获取协议处理器
     * @param protocol 协议类型
     * @returns 对应的处理器或默认处理器
     */
    private getProtocolHandler(protocol: string): ProtocolHandler {
        const handler = this.protocolHandlers.get(protocol.toLowerCase());
        if (handler) {
            return handler;
        }

        // 默认处理器 - 简单地将消息写入终端
        return {
            handleMessage: (tab: TerminalTab, event: MessageEvent) => {
                if (tab.xtermRef?.current && typeof event.data === 'string') {
                    tab.xtermRef.current.write(event.data);
                }
            }
        };
    }

    /**
     * 创建WebSocket连接
     * @param tab 终端标签对象
     * @returns 创建的WebSocket对象或null
     */
    connect(tab: TerminalTab): WebSocket | null {
        // 参数验证
        if (!tab || !tab.key || !tab.connectionId || !tab.sessionId) {
            console.error('【WebSocket】连接失败: 缺少必要参数', tab);
            this.writeToTerminal(tab, 'red', '错误: 缺少必要的连接参数\r\n');
            return null;
        }

        // 检查是否已存在连接
        const existingConn = this.connections.get(tab.key);
        if (existingConn && existingConn.ws.readyState === WebSocket.OPEN) {
            console.log(`【WebSocket】标签 ${tab.key} 已有活跃连接，复用现有连接`);
            return existingConn.ws;
        }

        // 检查是否正在连接
        if (this.connectingTabs.has(tab.key)) {
            console.log(`【WebSocket】标签 ${tab.key} 正在连接中，跳过重复连接`);
            return null;
        }

        // 标记为正在连接
        this.connectingTabs.add(tab.key);

        // 获取协议类型
        const protocol = (tab.protocol || 'ssh').toLowerCase();

        try {
            // 构造WebSocket URL
            const token = localStorage.getItem('token') || '';
            const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
            // 使用正确的路径格式: /ws/{protocol}/{sessionId} 匹配后端路由
            const wsUrl = `${WS_BASE_URL}/${tab.protocol || 'ssh'}/${tab.sessionId}${tokenParam}`;

            console.log(`【WebSocket】创建连接: ${wsUrl}, 协议: ${protocol}, 标签: ${tab.key}`);

            // 创建WebSocket连接
            const ws = new WebSocket(wsUrl);

            // 获取对应协议的处理器
            const handler = this.getProtocolHandler(protocol);

            // 设置WebSocket引用
            if (!tab.webSocketRef) {
                tab.webSocketRef = { current: null };
            }
            tab.webSocketRef.current = ws;

            // 创建连接对象
            const connection: WebSocketConnection = {
                ws,
                tabKey: tab.key,
                connectionId: tab.connectionId,
                sessionId: tab.sessionId,
                protocol,
                lastActivityTime: Date.now(),
                reconnectAttempts: 0
            };

            // 存储连接
            this.connections.set(tab.key, connection);

            // 设置WebSocket事件处理器
            ws.onopen = () => {
                console.log(`【WebSocket】连接建立成功: ${tab.key}`);

                // 更新状态
                this.connectingTabs.delete(tab.key);
                connection.reconnectAttempts = 0;

                // 更新标签状态
                tab.isConnected = true;
                tab.status = 'connected';
                tab.lastActivityTime = Date.now();

                // 清除重连定时器
                if (connection.reconnectTimer) {
                    clearTimeout(connection.reconnectTimer);
                    connection.reconnectTimer = undefined;
                }

                // 获取连接名称
                const connectionName = tab.title || `${protocol.toUpperCase()} 连接`;

                // 清除终端内容，然后使用writeWelcomeBanner显示欢迎信息
                if (tab.xtermRef?.current) {
                    // 先清除终端内容
                    tab.xtermRef.current.clear();
                    // 刷新终端显示
                    tab.xtermRef.current.refresh(0, tab.xtermRef.current.rows - 1);
                }

                // 调用协议处理器的open回调
                handler.handleOpen?.(tab);
            };

            ws.onmessage = (event) => {
                try {
                    const tabKey = tab.key;
                    console.log(`【WebSocket】收到消息: ${tabKey}, 数据类型: ${typeof event.data}`);

                    // 记录数据大小和类型
                    if (typeof event.data === 'string') {
                        console.log(`【WebSocket】收到字符串消息: 长度=${event.data.length}, 前20字符=${event.data.substring(0, 20).replace(/\n/g, '\\n').replace(/\r/g, '\\r')}`);
                    } else if (event.data instanceof ArrayBuffer) {
                        console.log(`【WebSocket】收到二进制消息: 长度=${event.data.byteLength} 字节`);
                    } else if (event.data instanceof Blob) {
                        console.log(`【WebSocket】收到Blob消息: 大小=${event.data.size} 字节, 类型=${event.data.type}`);
                    }

                    // 更新最后活动时间
                    tab.lastActivityTime = Date.now();

                    // 查找xterm实例
                    const xterm = tab.xtermRef?.current;
                    // 如果终端还没有初始化，可以将消息加入队列等待处理
                    if (!xterm) {
                        console.warn(`【WebSocket】终端尚未初始化，无法显示消息: ${tabKey}`);

                        // 创建或获取消息队列
                        if (!tab.messageQueueRef) {
                            tab.messageQueueRef = { current: [] };
                            console.log(`【WebSocket】为标签 ${tabKey} 创建新消息队列`);
                        } else if (!tab.messageQueueRef.current) {
                            tab.messageQueueRef.current = [];
                            console.log(`【WebSocket】为标签 ${tabKey} 重置消息队列`);
                        }

                        // 将消息加入队列
                        if (tab.messageQueueRef.current) {
                            if (typeof event.data === 'string') {
                                tab.messageQueueRef.current.push(event.data);
                                console.log(`【WebSocket】消息已加入队列，当前队列长度: ${tab.messageQueueRef.current.length}`);
                            } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
                                // 标记二进制数据
                                tab.messageQueueRef.current.push('[二进制数据]');
                                console.log(`【WebSocket】二进制数据已标记并加入队列`);
                            } else {
                                console.warn(`【WebSocket】无法将未知类型消息加入队列`);
                            }
                        } else {
                            console.warn(`【WebSocket】消息队列仍不存在，无法保存消息`);
                        }
                        return;
                    }

                    // 处理不同类型的消息
                    if (typeof event.data === 'string') {
                        try {
                            // 尝试解析为JSON
                            const jsonData = JSON.parse(event.data);
                            console.log(`【WebSocket】解析为JSON消息:`, jsonData);

                            // 处理不同类型的JSON消息
                            if (jsonData.type === 'resize') {
                                console.log(`【WebSocket】收到调整大小消息: cols=${jsonData.cols}, rows=${jsonData.rows}`);
                            } else if (jsonData.type === 'error') {
                                console.error(`【WebSocket】收到错误消息:`, jsonData.message);
                                xterm.writeln(`\r\n\x1b[31m错误: ${jsonData.message}\x1b[0m\r\n`);
                            } else if (jsonData.type === 'data') {
                                // 包含终端数据的JSON
                                console.log(`【WebSocket】收到数据消息: ${jsonData.data.length} 字符`);
                                xterm.write(jsonData.data);
                            } else {
                                // 未知类型的JSON，直接写入原始消息
                                console.log(`【WebSocket】未知类型的JSON消息，直接写入原始数据`);
                                xterm.write(event.data);
                            }
                        } catch (e) {
                            // 不是JSON，直接写入终端
                            console.log(`【WebSocket】非JSON消息，直接写入终端: ${event.data.length} 字符`);
                            if (event.data.length === 0) {
                                console.warn('【WebSocket】接收到空消息，跳过写入');
                            } else {
                                xterm.write(event.data);
                            }
                        }
                    } else if (event.data instanceof ArrayBuffer) {
                        // 二进制数据，转换为Uint8Array然后写入
                        const uint8Array = new Uint8Array(event.data);
                        console.log(`【WebSocket】写入二进制数据: ${uint8Array.length} 字节`);
                        xterm.write(uint8Array);
                    } else if (event.data instanceof Blob) {
                        // Blob数据，读取后写入
                        console.log(`【WebSocket】收到Blob数据，正在读取...`);
                        const reader = new FileReader();
                        reader.onload = () => {
                            if (reader.result instanceof ArrayBuffer) {
                                const uint8Array = new Uint8Array(reader.result);
                                console.log(`【WebSocket】写入Blob数据: ${uint8Array.length} 字节`);
                                try {
                                    // 写入数据
                                    xterm.write(uint8Array);
                                    // 如果是大块数据，可能包含多行内容，尝试滚动以显示最新内容
                                    if (uint8Array.length > 50) {
                                        setTimeout(() => {
                                            try {
                                                if (xterm.buffer && xterm.buffer.active) {
                                                    // 尝试滚动到最新内容
                                                    const currentY = xterm.buffer.active.baseY + xterm.buffer.active.cursorY;
                                                    xterm.scrollToLine(currentY);
                                                }
                                            } catch (scrollError) {
                                                console.warn('终端滚动失败:', scrollError);
                                            }
                                        }, 20);
                                    }
                                } catch (writeError) {
                                    console.error('写入Blob数据失败:', writeError);
                                }
                            } else if (typeof reader.result === 'string') {
                                console.log(`【WebSocket】写入Blob字符串数据: ${reader.result.length} 字符`);
                                try {
                                    // 写入数据
                                    xterm.write(reader.result);
                                } catch (writeError) {
                                    console.error('写入Blob字符串数据失败:', writeError);
                                }
                            }
                        };
                        reader.readAsArrayBuffer(event.data);
                    }

                    // 调用自定义回调
                    if (window._webSocketCallbacks && window._webSocketCallbacks.has(tab.key)) {
                        const callbacks = window._webSocketCallbacks.get(tab.key);
                        if (callbacks?.onMessage) {
                            callbacks.onMessage(event);
                        }
                    }
                } catch (error) {
                    console.error(`【WebSocket】处理消息时出错:`, error);
                }
            };

            ws.onclose = () => {
                console.log(`【WebSocket】连接已关闭: ${tab.key}`);

                // 从连接集合中移除
                const conn = this.connections.get(tab.key);
                if (conn && conn.ws === ws) {
                    if (conn.reconnectAttempts < WebSocketServiceClass.MAX_RECONNECT_ATTEMPTS) {
                        // 增加重连计数并计算延迟
                        conn.reconnectAttempts++;
                        const delay = WebSocketServiceClass.RECONNECT_DELAY * Math.pow(1.5, conn.reconnectAttempts - 1);

                        // 写入重连消息
                        this.writeToTerminal(tab, 'yellow', `连接已断开，将在${Math.round(delay / 1000)}秒后尝试重连...\r\n`);

                        // 设置重连定时器
                        conn.reconnectTimer = setTimeout(() => {
                            // 检查标签是否仍然存在
                            if (terminalStateRef.current?.tabs.find(t => t.key === tab.key)) {
                                this.connect(tab);
                            } else {
                                // 标签不存在，移除连接
                                this.connections.delete(tab.key);
                            }
                        }, delay);
                    } else {
                        // 超过最大重连次数，移除连接
                        this.writeToTerminal(tab, 'red', '连接已断开，超过最大重连次数，请手动刷新\r\n');
                        this.connections.delete(tab.key);
                    }
                }

                // 更新标签状态
                tab.isConnected = false;
                tab.status = 'disconnected';
                if (tab.webSocketRef?.current === ws) {
                    tab.webSocketRef.current = null;
                }

                // 从连接中集合移除
                this.connectingTabs.delete(tab.key);

                // 调用协议处理器的close回调
                handler.handleClose?.(tab);
            };

            ws.onerror = (error) => {
                console.error(`【WebSocket】连接错误: ${tab.key}`, error);

                // 写入错误消息
                this.writeToTerminal(tab, 'red', '连接发生错误\r\n');

                // 调用协议处理器的error回调
                handler.handleError?.(tab, error);
            };

            return ws;
        } catch (error) {
            console.error('【WebSocket】创建连接失败:', error);

            // 清理状态
            this.connectingTabs.delete(tab.key);

            // 写入错误消息
            this.writeToTerminal(tab, 'red', `创建WebSocket连接失败: ${error}\r\n`);

            return null;
        }
    }

    /**
     * 关闭WebSocket连接
     * @param tabKey 标签键
     */
    closeConnection(tabKey: string): void {
        const connection = this.connections.get(tabKey);
        if (!connection) return;

        console.log(`【WebSocket】关闭连接: ${tabKey}`);

        // 清除重连定时器
        if (connection.reconnectTimer) {
            clearTimeout(connection.reconnectTimer);
            connection.reconnectTimer = undefined;
        }

        // 关闭WebSocket
        try {
            if (connection.ws.readyState === WebSocket.OPEN ||
                connection.ws.readyState === WebSocket.CONNECTING) {
                // 如果WebSocket打开，尝试发送终止消息
                if (connection.ws.readyState === WebSocket.OPEN) {
                    try {
                        connection.ws.send(JSON.stringify({
                            type: 'terminate',
                            sessionId: connection.sessionId
                        }));
                    } catch (e) {
                        // 忽略发送终止消息的错误
                        console.warn(`发送终止消息失败:`, e);
                    }
                }

                // 清除所有回调函数
                connection.ws.onopen = null;
                connection.ws.onclose = null;
                connection.ws.onerror = null;
                connection.ws.onmessage = null;

                // 关闭WebSocket
                connection.ws.close();

                console.log(`WebSocket已强制关闭: ${tabKey}`);
            }
        } catch (e) {
            console.error(`【WebSocket】关闭连接错误:`, e);
        }

        // 移除连接
        this.connections.delete(tabKey);
        this.connectingTabs.delete(tabKey);
    }

    /**
     * 关闭所有WebSocket连接
     */
    closeAllConnections(): void {
        console.log(`【WebSocket】关闭所有连接: ${this.connections.size}个连接`);

        // 关闭每个连接
        for (const [tabKey, connection] of this.connections) {
            if (connection.reconnectTimer) {
                clearTimeout(connection.reconnectTimer);
            }

            try {
                if (connection.ws.readyState === WebSocket.OPEN ||
                    connection.ws.readyState === WebSocket.CONNECTING) {
                    // 如果WebSocket打开，尝试发送终止消息
                    if (connection.ws.readyState === WebSocket.OPEN) {
                        try {
                            connection.ws.send(JSON.stringify({
                                type: 'terminate',
                                sessionId: connection.sessionId
                            }));
                        } catch (e) {
                            // 忽略发送终止消息的错误
                        }
                    }

                    // 清除所有回调函数，防止触发不必要的事件
                    connection.ws.onopen = null;
                    connection.ws.onclose = null;
                    connection.ws.onerror = null;
                    connection.ws.onmessage = null;

                    // 关闭WebSocket
                    connection.ws.close();
                }
            } catch (e) {
                // 忽略关闭错误
                console.warn(`关闭WebSocket连接失败: ${tabKey}`, e);
            }
        }

        // 清空连接集合
        this.connections.clear();
        this.connectingTabs.clear();
    }

    /**
     * 发送数据到WebSocket
     * @param tab 标签对象
     * @param data 要发送的数据
     * @returns 是否发送成功
     */
    sendData(tab: TerminalTab, data: string | ArrayBuffer | Blob): boolean {
        // 获取连接
        const connection = this.connections.get(tab.key);

        // 如果连接不存在或未打开，尝试重新连接
        if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
            if (!this.connectingTabs.has(tab.key)) {
                this.connect(tab);
            }
            return false;
        }

        try {
            // 发送数据
            connection.ws.send(data);

            // 更新活动时间
            connection.lastActivityTime = Date.now();
            tab.lastActivityTime = connection.lastActivityTime;

            return true;
        } catch (error) {
            console.error(`【WebSocket】发送数据失败: ${tab.key}`, error);
            this.writeToTerminal(tab, 'red', `发送数据失败: ${error}\r\n`);
            return false;
        }
    }

    /**
     * 刷新WebSocket连接
     * @param tab 标签对象
     */
    refreshConnection(tab: TerminalTab): void {
        console.log(`【WebSocket】刷新连接: ${tab.key}`);

        // 关闭现有连接
        this.closeConnection(tab.key);

        // 延迟重新连接，确保先前的连接已完全关闭
        setTimeout(() => {
            this.connect(tab);
        }, 500);
    }

    /**
     * 获取连接状态
     * @param tabKey 标签键
     * @returns 连接状态和最后活动时间
     */
    getConnectionStatus(tabKey: string): { isConnected: boolean; lastActivityTime: number } {
        const connection = this.connections.get(tabKey);
        if (!connection) {
            return { isConnected: false, lastActivityTime: 0 };
        }

        return {
            isConnected: connection.ws.readyState === WebSocket.OPEN,
            lastActivityTime: connection.lastActivityTime
        };
    }

    /**
     * 向终端写入彩色文本
     * @param tab 标签对象
     * @param color 颜色
     * @param text 文本
     * @param style 文本样式
     */
    private writeToTerminal(tab: TerminalTab, color: string, text: string, style?: string): void {
        if (tab.xtermRef?.current) {
            writeColorText(tab.xtermRef.current, text, color, style);
        }
    }
}

// 导出单例实例
export const WebSocketService = new WebSocketServiceClass();

// 将实例添加到window对象中以便于全局访问
if (typeof window !== 'undefined') {
    window.WebSocketService = WebSocketService;
}

// 默认导出，方便导入
export default WebSocketService; 
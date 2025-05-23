/*
 * @Author: Await
 * @Date: 2025-05-20 14:11:23
 * @LastEditors: Await
 * @LastEditTime: 2025-05-25 18:23:15
 * @Description: WebSocket服务，管理WebSocket连接和状态
 */
import { TerminalTab } from '../../../contexts/TerminalContext';
import { getWebSocketUrl } from '../utils/networkUtils';
import { getWebSocketProtocol } from '../utils/protocolUtils';

// WebSocket连接状态
export enum WebSocketStatus {
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    ERROR = 'error'
}

// WebSocket连接信息
export interface WebSocketInfo {
    url: string;
    status: WebSocketStatus;
    instance: WebSocket | null;
    connectionTime: number;
    lastMessageTime: number;
    messageCount: number;
    errorCount: number;
    reconnectCount: number;
    latency: number | null;
    tabKey?: string;
    sessionId?: number | string;
    protocol?: string;
}

// WebSocket连接管理服务
class WebSocketService {
    // 单例实例
    private static instance: WebSocketService;

    // 活跃连接管理
    private connections: Map<string, WebSocketInfo> = new Map();

    // 连接统计
    private stats = {
        totalConnections: 0,
        activeConnections: 0,
        failedConnections: 0,
        messagesReceived: 0,
        messagesSent: 0,
        reconnectAttempts: 0,
        errors: 0
    };

    // 心跳检测间隔(毫秒)
    private heartbeatInterval = 30000;

    // 心跳检测定时器
    private heartbeatTimer: NodeJS.Timeout | null = null;

    // 事件监听器
    private eventListeners: Map<string, Set<Function>> = new Map();

    // 构造函数 - 私有，通过getInstance获取实例
    private constructor() {
        this.startHeartbeat();
    }

    // 获取单例实例
    public static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    /**
     * 创建WebSocket连接
     * @param url WebSocket服务器URL
     * @param options 连接选项
     * @returns 创建的WebSocket实例
     */
    public createConnection(url: string, options: {
        tabKey?: string,
        sessionId?: number | string,
        protocol?: string,
        onOpen?: (event: Event) => void,
        onMessage?: (event: MessageEvent) => void,
        onClose?: (event: CloseEvent) => void,
        onError?: (event: Event) => void
    } = {}): WebSocket {
        // 创建WebSocket实例
        const ws = new WebSocket(url);

        // 生成唯一标识
        const connectionId = options.tabKey || `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 初始化连接信息
        const connectionInfo: WebSocketInfo = {
            url,
            status: WebSocketStatus.CONNECTING,
            instance: ws,
            connectionTime: Date.now(),
            lastMessageTime: 0,
            messageCount: 0,
            errorCount: 0,
            reconnectCount: 0,
            latency: null,
            tabKey: options.tabKey,
            sessionId: options.sessionId,
            protocol: options.protocol
        };

        // 保存连接信息
        this.connections.set(connectionId, connectionInfo);

        // 更新统计
        this.stats.totalConnections++;
        this.stats.activeConnections++;

        // 监听连接打开事件
        ws.addEventListener('open', (event) => {
            connectionInfo.status = WebSocketStatus.CONNECTED;
            this.triggerEvent('connection-open', { connectionId, event });

            if (options.onOpen) {
                options.onOpen(event);
            }
        });

        // 监听消息事件
        ws.addEventListener('message', (event) => {
            connectionInfo.lastMessageTime = Date.now();
            connectionInfo.messageCount++;
            this.stats.messagesReceived++;

            this.triggerEvent('message-received', { connectionId, event });

            if (options.onMessage) {
                options.onMessage(event);
            }
        });

        // 监听关闭事件
        ws.addEventListener('close', (event) => {
            connectionInfo.status = WebSocketStatus.DISCONNECTED;
            this.stats.activeConnections--;

            this.triggerEvent('connection-close', { connectionId, event });

            // 从连接管理中移除
            this.connections.delete(connectionId);

            if (options.onClose) {
                options.onClose(event);
            }
        });

        // 监听错误事件
        ws.addEventListener('error', (event) => {
            connectionInfo.status = WebSocketStatus.ERROR;
            connectionInfo.errorCount++;
            this.stats.errors++;

            this.triggerEvent('connection-error', { connectionId, event });

            if (options.onError) {
                options.onError(event);
            }
        });

        return ws;
    }

    /**
     * 通过终端标签创建WebSocket连接
     * @param tab 终端标签对象
     * @returns 创建的WebSocket实例或null
     */
    public connect(tab: TerminalTab): WebSocket | null {
        if (!tab || !tab.sessionId) {
            console.error('无法创建WebSocket连接: 缺少必要参数');
            return null;
        }

        try {
            // 获取连接URL
            const protocol = tab.protocol || 'ssh';
            const wsProtocol = getWebSocketProtocol();
            const url = getWebSocketUrl({
                sessionId: tab.sessionId,
                protocol,
                wsProtocol
            });

            if (!url) {
                console.error('无法创建WebSocket URL');
                return null;
            }

            // 创建WebSocket连接
            return this.createConnection(url, {
                tabKey: tab.key,
                sessionId: tab.sessionId,
                protocol,
                onOpen: () => {
                    console.log(`WebSocket连接已打开: ${tab.key}`);
                    // 触发自定义事件
                    window.dispatchEvent(new CustomEvent('websocket-connected', {
                        detail: { tabKey: tab.key, sessionId: tab.sessionId }
                    }));
                },
                onClose: (event) => {
                    console.log(`WebSocket连接已关闭: ${tab.key}`, event);
                    // 触发自定义事件
                    window.dispatchEvent(new CustomEvent('websocket-closed', {
                        detail: { tabKey: tab.key, sessionId: tab.sessionId, event }
                    }));
                },
                onError: (event) => {
                    console.error(`WebSocket连接错误: ${tab.key}`, event);
                    // 触发自定义事件
                    window.dispatchEvent(new CustomEvent('websocket-error', {
                        detail: { tabKey: tab.key, sessionId: tab.sessionId, event }
                    }));
                }
            });
        } catch (error) {
            console.error('创建WebSocket连接失败:', error);
            return null;
        }
    }

    /**
     * 断开WebSocket连接
     * @param connectionId 连接ID
     */
    public disconnect(connectionId: string): void {
        const connection = this.connections.get(connectionId);
        if (connection && connection.instance) {
            connection.instance.close();
            this.connections.delete(connectionId);
            this.stats.activeConnections--;
        }
    }

    /**
     * 断开所有WebSocket连接
     */
    public disconnectAll(): void {
        for (const [id, connection] of this.connections.entries()) {
            if (connection.instance) {
                connection.instance.close();
            }
            this.connections.delete(id);
        }
        this.stats.activeConnections = 0;
    }

    /**
     * 发送消息
     * @param connectionId 连接ID
     * @param data 待发送数据
     * @returns 是否发送成功
     */
    public sendMessage(connectionId: string, data: string | ArrayBuffer): boolean {
        const connection = this.connections.get(connectionId);
        if (connection && connection.instance && connection.status === WebSocketStatus.CONNECTED) {
            connection.instance.send(data);
            this.stats.messagesSent++;
            return true;
        }
        return false;
    }

    /**
     * 获取连接信息
     * @param connectionId 连接ID
     * @returns 连接信息
     */
    public getConnection(connectionId: string): WebSocketInfo | undefined {
        return this.connections.get(connectionId);
    }

    /**
     * 获取所有连接信息
     * @returns 所有连接信息
     */
    public getAllConnections(): Map<string, WebSocketInfo> {
        return this.connections;
    }

    /**
     * 获取连接统计
     * @returns 连接统计
     */
    public getStats(): typeof this.stats {
        return { ...this.stats };
    }

    /**
     * 根据标签键查找连接
     * @param tabKey 标签键
     * @returns 连接信息
     */
    public findConnectionByTabKey(tabKey: string): [string, WebSocketInfo] | undefined {
        for (const [id, connection] of this.connections.entries()) {
            if (connection.tabKey === tabKey) {
                return [id, connection];
            }
        }
        return undefined;
    }

    /**
     * 根据会话ID查找连接
     * @param sessionId 会话ID
     * @returns 连接信息
     */
    public findConnectionBySessionId(sessionId: number | string): [string, WebSocketInfo] | undefined {
        for (const [id, connection] of this.connections.entries()) {
            if (connection.sessionId === sessionId) {
                return [id, connection];
            }
        }
        return undefined;
    }

    /**
     * 心跳检测，定期检查连接状态
     */
    private startHeartbeat(): void {
        // 清除已有定时器
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        // 创建新定时器
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();

            // 检查所有连接
            for (const [id, connection] of this.connections.entries()) {
                // 检查连接状态
                if (connection.status === WebSocketStatus.CONNECTED) {
                    // 计算消息接收间隔
                    const timeSinceLastMessage = now - connection.lastMessageTime;

                    // 如果长时间无消息，发送ping消息检测连接
                    if (connection.lastMessageTime > 0 && timeSinceLastMessage > this.heartbeatInterval) {
                        try {
                            // 发送ping消息
                            if (connection.instance && connection.instance.readyState === WebSocket.OPEN) {
                                // 发送心跳数据(可以是自定义格式)
                                connection.instance.send(JSON.stringify({ type: 'ping', time: now }));
                            }
                        } catch (error) {
                            console.error(`发送心跳消息失败: ${id}`, error);
                        }
                    }
                }
            }
        }, this.heartbeatInterval);
    }

    /**
     * 添加事件监听器
     * @param event 事件名
     * @param callback 回调函数
     */
    public addEventListener(event: string, callback: Function): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event)?.add(callback);
    }

    /**
     * 移除事件监听器
     * @param event 事件名
     * @param callback 回调函数
     */
    public removeEventListener(event: string, callback: Function): void {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event)?.delete(callback);
        }
    }

    /**
     * 触发事件
     * @param event 事件名
     * @param data 事件数据
     */
    private triggerEvent(event: string, data: any): void {
        if (this.eventListeners.has(event)) {
            for (const callback of this.eventListeners.get(event) || []) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`执行事件监听器出错: ${event}`, error);
                }
            }
        }
    }
}

// 导出单例实例
export default WebSocketService.getInstance(); 
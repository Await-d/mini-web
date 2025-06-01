/*
 * @Author: Await
 * @Date: 2025-05-25 09:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-25 20:10:51
 * @Description: WebSocket服务，管理终端WebSocket连接
 */

import type { TerminalTab } from '../../../contexts/TerminalContext';
import { API_BASE_URL } from '../../../services/api';

// WebSocket连接统计接口
export interface WebSocketStats {
    totalConnections: number;
    activeConnections: number;
    connectionsByProtocol: Record<string, number>;
    failedConnections: number;
    reconnections: number;
    totalDataSent: number;
    totalDataReceived: number;
    lastConnectionTime: string | null;
    lastDisconnectionTime: string | null;
}

// WebSocket事件处理器接口
export interface WebSocketEventHandlers {
    onOpen?: (ws: WebSocket) => void;
    onMessage?: (event: MessageEvent) => void;
    onClose?: () => void;
    onError?: (event: Event) => void;
}

/**
 * WebSocket服务类
 * 管理所有终端的WebSocket连接
 */
export class WebSocketService {
    // 存储所有连接的Map
    private connections: Map<string, WebSocket> = new Map();
    // 存储连接处理函数的Map
    private handlers: Map<string, WebSocketEventHandlers> = new Map();
    // 连接统计数据
    private stats: WebSocketStats = {
        totalConnections: 0,
        activeConnections: 0,
        connectionsByProtocol: {},
        failedConnections: 0,
        reconnections: 0,
        totalDataSent: 0,
        totalDataReceived: 0,
        lastConnectionTime: null,
        lastDisconnectionTime: null
    };

    // 心跳检测间隔(毫秒)
    private heartbeatInterval: number = 30000;
    // 心跳检测定时器
    private heartbeatTimers: Map<string, number> = new Map();

    /**
     * 创建并管理WebSocket连接
     * @param tab 终端标签对象
     * @param handlers 可选的事件处理函数
     * @returns WebSocket实例或null(如果创建失败)
     */
    connect(tab: TerminalTab, handlers?: WebSocketEventHandlers): WebSocket | null {
        if (!tab || !tab.key || !tab.sessionId) {
            console.error('无法创建WebSocket连接: 标签缺少必要信息', tab);
            return null;
        }

        // 检查是否已有连接并且连接状态为OPEN
        const existingWs = this.connections.get(tab.key);
        if (existingWs && existingWs.readyState === WebSocket.OPEN) {
            console.log(`复用现有WebSocket连接: ${tab.key}`);
            return existingWs;
        }

        // 如果有旧连接但状态不是OPEN，关闭它
        if (existingWs) {
            this.closeWebSocket(existingWs);
            this.connections.delete(tab.key);
            this.clearHeartbeat(tab.key);
        }

        try {
            // 获取认证token
            const token = localStorage.getItem('token');
            if (!token) {
                console.error('无法创建WebSocket连接: 缺少认证token');
                this.stats.failedConnections++;
                return null;
            }

            // 获取连接的协议类型 - 有效值为: ssh, rdp, vnc, telnet
            let connProtocol = 'ssh'; // 默认使用ssh

            // 如果标签页存在且有连接信息，则获取实际协议类型
            if (tab?.connection?.protocol) {
                // 确保协议类型是有效的
                const protocol = tab.connection.protocol.toLowerCase();
                if (['ssh', 'rdp', 'vnc', 'telnet'].includes(protocol)) {
                    connProtocol = protocol;
                }
            }

            // 从API_BASE_URL中提取主机和端口信息
            const apiUrl = new URL(API_BASE_URL);
            const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = apiUrl.host; // 包含端口号

            // 构建WebSocket URL，不包含/api路径
            const wsUrl = `${wsProtocol}//${host}/ws/${connProtocol}/${tab.sessionId}?token=${encodeURIComponent(token)}`;

            console.log(`创建WebSocket连接: ${wsUrl}`);
            const ws = new WebSocket(wsUrl);

            // 存储连接
            this.connections.set(tab.key, ws);

            // 保存处理函数
            if (handlers) {
                this.handlers.set(tab.key, handlers);
            }

            // 更新统计信息
            this.stats.totalConnections++;
            this.stats.activeConnections++;
            this.stats.lastConnectionTime = new Date().toISOString();

            // 更新协议统计
            const tabProtocol = tab.protocol || 'unknown';
            this.stats.connectionsByProtocol[tabProtocol] = (this.stats.connectionsByProtocol[tabProtocol] || 0) + 1;

            // 设置WebSocket事件处理器
            this.setupWebSocketHandlers(ws, tab);

            // 设置心跳检测
            this.setupHeartbeat(tab.key, ws);

            // 将WebSocket引用保存到标签对象中
            if (tab.webSocketRef) {
                tab.webSocketRef.current = ws;
            }

            return ws;
        } catch (error) {
            console.error(`创建WebSocket连接失败: ${tab.key}`, error);
            this.stats.failedConnections++;
            return null;
        }
    }

    /**
     * 设置WebSocket事件处理
     * @param ws WebSocket实例
     * @param tab 终端标签
     */
    private setupWebSocketHandlers(ws: WebSocket, tab: TerminalTab): void {
        const tabHandlers = this.handlers.get(tab.key);

        // 打开事件处理
        ws.onopen = (event) => {
            console.log(`WebSocket连接已打开: ${tab.key}`);

            // 只有图形协议(RDP、VNC)才需要发送初始化消息
            if (tab.protocol === 'rdp' || tab.protocol === 'vnc') {
                this.sendInitMessage(ws, tab);
            }

            // 调用自定义处理函数
            if (tabHandlers?.onOpen) {
                tabHandlers.onOpen(ws);
            }

            // 触发终端连接事件
            window.dispatchEvent(new CustomEvent('terminal-ws-connected', {
                detail: { tabKey: tab.key, sessionId: tab.sessionId, connectionId: tab.connectionId }
            }));
        };

        // 消息事件处理
        ws.onmessage = (event) => {
            // 更新统计信息
            this.stats.totalDataReceived += event.data.length || 0;

            // 调用自定义处理函数
            if (tabHandlers?.onMessage) {
                tabHandlers.onMessage(event);
            }
        };

        // 关闭事件处理
        ws.onclose = (event) => {
            console.log(`WebSocket连接已关闭: ${tab.key}`);

            // 更新统计信息 - 只有在连接映射中存在时才减少计数
            if (this.connections.has(tab.key)) {
                this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
                this.stats.lastDisconnectionTime = new Date().toISOString();
            }

            // 清除心跳检测
            this.clearHeartbeat(tab.key);

            // 调用自定义处理函数
            if (tabHandlers?.onClose) {
                tabHandlers.onClose();
            }

            // 从连接映射中移除
            this.connections.delete(tab.key);

            // 触发终端断开事件
            window.dispatchEvent(new CustomEvent('terminal-ws-disconnected', {
                detail: { tabKey: tab.key, code: event.code, reason: event.reason }
            }));
        };

        // 错误事件处理
        ws.onerror = (event) => {
            console.error(`WebSocket连接错误: ${tab.key}`, event);

            // 调用自定义处理函数
            if (tabHandlers?.onError) {
                tabHandlers.onError(event);
            }

            // 触发终端错误事件
            window.dispatchEvent(new CustomEvent('terminal-ws-error', {
                detail: { tabKey: tab.key, error: 'WebSocket连接错误' }
            }));
        };
    }

    /**
     * 发送初始化消息
     * 只有图形协议(RDP、VNC)需要发送init消息来初始化图形界面和请求截图
     * 对于文本协议(SSH、Telnet)，这个消息是无用的
     * @param ws WebSocket实例
     * @param tab 终端标签
     */
    private sendInitMessage(ws: WebSocket, tab: TerminalTab): void {
        try {
            const initData = {
                type: 'init',
                connectionId: tab.connectionId,
                sessionId: tab.sessionId,
                protocol: tab.protocol || 'ssh'
            };
            ws.send(JSON.stringify(initData));

            // 更新统计信息
            this.stats.totalDataSent += JSON.stringify(initData).length;
        } catch (error) {
            console.error('发送初始化数据失败:', error);
        }
    }

    /**
     * 设置WebSocket心跳检测
     * @param tabKey 标签键
     * @param ws WebSocket实例
     */
    private setupHeartbeat(tabKey: string, ws: WebSocket): void {
        // 清除可能存在的旧定时器
        this.clearHeartbeat(tabKey);

        // 创建新的心跳定时器
        const timerId = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    // 发送心跳消息
                    ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
                    this.stats.totalDataSent += 50; // 估计心跳包大小
                } catch (error) {
                    console.warn(`发送心跳包失败: ${tabKey}`, error);
                    this.clearHeartbeat(tabKey);
                }
            } else {
                // 连接已关闭，清除心跳
                this.clearHeartbeat(tabKey);
            }
        }, this.heartbeatInterval);

        // 存储定时器ID
        this.heartbeatTimers.set(tabKey, timerId);
    }

    /**
     * 清除心跳检测定时器
     * @param tabKey 标签键
     */
    private clearHeartbeat(tabKey: string): void {
        const timerId = this.heartbeatTimers.get(tabKey);
        if (timerId) {
            clearInterval(timerId);
            this.heartbeatTimers.delete(tabKey);
        }
    }

    /**
     * 安全关闭WebSocket
     * @param ws WebSocket实例
     */
    private closeWebSocket(ws: WebSocket): void {
        try {
            // 根据WebSocket当前状态处理关闭
            if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
                ws.close();
            }

            // 移除所有事件处理器
            ws.onopen = null;
            ws.onmessage = null;
            ws.onclose = null;
            ws.onerror = null;
        } catch (error) {
            console.warn('关闭WebSocket时出错:', error);
        }
    }

    /**
     * 关闭指定标签的WebSocket连接
     * @param tabKey 标签键
     * @param preserveHandlers 是否保留处理函数(用于重连)
     */
    closeConnection(tabKey: string, preserveHandlers: boolean = false): void {
        const ws = this.connections.get(tabKey);
        if (ws) {
            console.log(`关闭WebSocket连接: ${tabKey}`);

            // 更新统计信息 - 如果连接是活跃的，减少活跃连接数
            if (ws.readyState === WebSocket.OPEN) {
                this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
                this.stats.lastDisconnectionTime = new Date().toISOString();
            }

            // 安全关闭WebSocket
            this.closeWebSocket(ws);

            // 从连接映射中移除
            this.connections.delete(tabKey);

            // 清除心跳检测
            this.clearHeartbeat(tabKey);

            // 根据参数决定是否移除处理函数
            if (!preserveHandlers) {
                this.handlers.delete(tabKey);
            }
        }
    }

    /**
     * 关闭所有WebSocket连接
     */
    closeAllConnections(): void {
        console.log(`关闭所有WebSocket连接: ${this.connections.size}个`);

        // 遍历所有连接并关闭
        this.connections.forEach((ws, tabKey) => {
            this.closeConnection(tabKey);
        });

        // 清空连接映射
        this.connections.clear();
        this.handlers.clear();

        // 清除所有心跳检测
        this.heartbeatTimers.forEach((timerId) => {
            clearInterval(timerId);
        });
        this.heartbeatTimers.clear();
    }

    /**
     * 刷新指定标签的WebSocket连接
     * @param tab 终端标签
     * @param handlers 可选的事件处理函数
     * @returns 新的WebSocket实例或null(如果创建失败)
     */
    refreshConnection(tab: TerminalTab, handlers?: WebSocketEventHandlers): WebSocket | null {
        if (!tab || !tab.key) {
            console.error('无法刷新WebSocket连接: 标签缺少必要信息');
            return null;
        }

        console.log(`刷新WebSocket连接: ${tab.key}`);

        // 保存现有的处理函数
        const existingHandlers = this.handlers.get(tab.key);
        const finalHandlers = handlers || existingHandlers;

        // 先关闭现有连接，但保留处理函数
        this.closeConnection(tab.key, true);

        // 更新统计信息
        this.stats.reconnections++;

        // 创建新连接，使用保存的处理函数
        return this.connect(tab, finalHandlers);
    }

    /**
     * 发送数据到WebSocket连接
     * @param tab 终端标签
     * @param data 要发送的数据
     * @returns 是否发送成功
     */
    sendData(tab: TerminalTab, data: string | ArrayBuffer | Blob): boolean {
        if (!tab || !tab.key) {
            console.error('无法发送数据: 标签缺少必要信息');
            return false;
        }

        const ws = this.connections.get(tab.key);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`无法发送数据: WebSocket连接不可用 (${tab.key})`);
            return false;
        }

        try {
            ws.send(data);

            // 更新统计信息
            let dataSize = 0;
            if (typeof data === 'string') {
                dataSize = data.length;
            } else if (data instanceof ArrayBuffer) {
                dataSize = data.byteLength;
            } else if (data instanceof Blob) {
                dataSize = data.size;
            }

            this.stats.totalDataSent += dataSize;
            return true;
        } catch (error) {
            console.error(`发送数据失败: ${tab.key}`, error);
            return false;
        }
    }

    /**
     * 获取WebSocket连接统计数据
     * @returns WebSocket统计数据
     */
    getStats(): WebSocketStats {
        return { ...this.stats };
    }

    /**
     * 重置WebSocket连接统计数据
     */
    resetStats(): void {
        this.stats = {
            totalConnections: 0,
            activeConnections: this.stats.activeConnections, // 保留当前活动连接数
            connectionsByProtocol: {},
            failedConnections: 0,
            reconnections: 0,
            totalDataSent: 0,
            totalDataReceived: 0,
            lastConnectionTime: this.stats.lastConnectionTime,
            lastDisconnectionTime: this.stats.lastDisconnectionTime
        };
    }

    /**
     * 获取所有活动的WebSocket连接
     * @returns 活动连接数组
     */
    getActiveConnections(): { tabKey: string, ws: WebSocket }[] {
        const activeConnections: { tabKey: string, ws: WebSocket }[] = [];

        this.connections.forEach((ws, tabKey) => {
            if (ws.readyState === WebSocket.OPEN) {
                activeConnections.push({ tabKey, ws });
            }
        });

        return activeConnections;
    }

    /**
     * 清理不活动的连接
     */
    cleanupInactiveConnections(): void {
        const now = Date.now();
        const inactiveTimeout = 10 * 60 * 1000; // 10分钟无活动视为不活动

        this.connections.forEach((ws, tabKey) => {
            const lastActivity = (ws as any).lastActivity || 0;
            if (now - lastActivity > inactiveTimeout) {
                console.log(`关闭不活动连接: ${tabKey}`);
                this.closeConnection(tabKey);
            }
        });
    }
}

// 创建单例实例
const webSocketService = new WebSocketService();

// 导出单例实例
export default webSocketService;

// 初始化代码
console.log('WebSocketService已初始化');

// 定期统计和清理WebSocket连接
const CLEANUP_INTERVAL = 60000; // 每分钟清理一次
setInterval(() => {
    webSocketService.cleanupInactiveConnections();

    // 如果需要，可以记录当前统计信息
    const stats = webSocketService.getStats();
    console.debug('WebSocket统计:', stats);
}, CLEANUP_INTERVAL);

// 全局错误事件分发
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && typeof event.reason.message === 'string' &&
        event.reason.message.includes('WebSocket')) {
        // 分发WebSocket错误事件
        window.dispatchEvent(new CustomEvent('websocket-error', {
            detail: {
                error: event.reason.message,
                timestamp: new Date().toISOString()
            }
        }));
    }
}); 
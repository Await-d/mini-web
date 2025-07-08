/*
 * @Author: Await
 * @Date: 2025-05-23 20:08:17
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 17:26:06
 * @Description: 请填写简介
 */
/*
 * @Author: Await
 * @Date: 2025-05-25 09:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 17:24:48
 * @Description: WebSocket服务，管理终端WebSocket连接
 */

import type { TerminalTab } from '../../../contexts/TerminalContext';
import { API_BASE_URL } from '../../../services/api';
import binaryJsonProtocol, {
    BinaryJsonProtocol,
    PROTOCOL_CONSTANTS
} from './BinaryJsonProtocol';
import type { ProtocolMessage } from './BinaryJsonProtocol';

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
    // 新增：文件传输统计
    fileTransferStats: {
        uploadCount: number;
        downloadCount: number;
        totalUploadSize: number;
        totalDownloadSize: number;
    };
    // 新增：按连接的数据统计
    connectionDataStats: Map<string, {
        connectionId: string;
        protocol: string;
        dataSent: number;
        dataReceived: number;
        startTime: string;
        lastActivity: string;
    }>;
    // 新增：消息类型统计
    messageTypeStats: {
        terminalData: number;
        fileTransfer: number;
        heartbeat: number;
        protocolNegotiation: number;
        specialCommand: number;
        other: number;
    };
}

// WebSocket事件处理器接口
export interface WebSocketEventHandlers {
    onOpen?: (ws: WebSocket) => void;
    onMessage?: (event: MessageEvent) => void;
    onClose?: () => void;
    onError?: (event: Event) => void;
    onSpecialCommand?: (specialData: any) => void;
}

// 在WebSocketService类的开头添加重连配置接口和重连状态管理
export interface ReconnectConfig {
    enabled: boolean;          // 是否启用自动重连
    maxRetries: number;        // 最大重试次数
    retryDelay: number;        // 重连延迟(毫秒)
    heartbeatInterval: number; // 心跳间隔(毫秒)
}

interface ReconnectState {
    retryCount: number;        // 当前重试次数
    lastRetryTime: number;     // 最后重试时间
    enabled: boolean;          // 是否允许重连
    timeoutId?: NodeJS.Timeout; // 重连计时器ID
}

/**
 * WebSocket服务类
 * 管理所有终端的WebSocket连接，支持二进制+JSON协议
 */
export class WebSocketService {
    // 存储所有连接的Map
    private connections: Map<string, WebSocket> = new Map();
    // 存储连接处理函数的Map
    private handlers: Map<string, WebSocketEventHandlers> = new Map();
    // 协议支持状态
    private protocolSupport: Map<string, boolean> = new Map();
    // 连接状态跟踪（防止重复连接）
    private connectionStates: Map<string, 'connecting' | 'connected' | 'disconnecting' | 'disconnected'> = new Map();
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
        lastDisconnectionTime: null,
        fileTransferStats: {
            uploadCount: 0,
            downloadCount: 0,
            totalUploadSize: 0,
            totalDownloadSize: 0
        },
        connectionDataStats: new Map(),
        messageTypeStats: {
            terminalData: 0,
            fileTransfer: 0,
            heartbeat: 0,
            protocolNegotiation: 0,
            specialCommand: 0,
            other: 0
        }
    };

    // 重连配置
    private reconnectConfig: ReconnectConfig = {
        enabled: true,
        maxRetries: 5,
        retryDelay: 3000,
        heartbeatInterval: 30000
    };
    private reconnectStates: Map<string, ReconnectState> = new Map();
    private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

    // 全局重连停止标志
    public globalReconnectStopped: boolean = false;

    // 心跳检测间隔(毫秒) - 调整为5秒，便于快速显示延迟信息
    private heartbeatInterval: number = 5000;
    // 心跳检测定时器
    private heartbeatTimers: Map<string, number> = new Map();
    // 心跳发送时间戳用于计算延迟
    private heartbeatTimestamps: Map<string, number> = new Map();
    // 网络延迟数据
    private networkLatencies: Map<string, number> = new Map();

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

        // 检查连接状态，防止重复连接
        const currentState = this.connectionStates.get(tab.key);
        if (currentState === 'connecting') {
            console.log(`连接正在建立中，跳过重复请求: ${tab.key}`);
            return this.connections.get(tab.key) || null;
        }

        // 检查是否已有连接并且连接状态为OPEN
        const existingWs = this.connections.get(tab.key);
        if (existingWs && existingWs.readyState === WebSocket.OPEN) {
            console.log(`复用现有WebSocket连接: ${tab.key}`);
            this.connectionStates.set(tab.key, 'connected');
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

            // Debug: 打印标签页信息
            console.log('🔍 WebSocket调试信息:');
            console.log('标签页对象:', tab);
            console.log('标签页连接信息:', tab?.connection);
            console.log('标签页协议:', tab?.connection?.protocol);
            console.log('标签页protocol属性:', tab?.protocol);

            // 多种方式尝试获取协议信息
            let detectedProtocol = null;

            // 方式1: 从tab.connection.protocol获取
            if (tab?.connection?.protocol) {
                detectedProtocol = tab.connection.protocol.toLowerCase();
                console.log('🔍 从tab.connection.protocol检测到协议:', detectedProtocol);
            }

            // 方式2: 从tab.protocol获取
            else if (tab?.protocol) {
                detectedProtocol = tab.protocol.toLowerCase();
                console.log('🔍 从tab.protocol检测到协议:', detectedProtocol);
            }

            // 方式3: 从连接ID获取（如果其他方式失败，重新查询连接信息）
            else if (tab?.connectionId) {
                console.log('🔍 协议信息缺失，尝试从连接ID重新获取:', tab.connectionId);
                try {
                    // 这里可以调用API重新获取连接信息
                    // 但为了避免异步问题，先使用默认值
                    console.warn('⚠️ 需要重新获取连接信息，当前使用默认SSH协议');
                } catch (error) {
                    console.error('❌ 重新获取连接信息失败:', error);
                }
            }

            // 方式4: 从tab的graphical属性推断（RDP/VNC都是图形化的）
            else if (tab?.isGraphical && tab?.connection?.port) {
                console.log('🔍 检测到图形化终端，可能是RDP或VNC');
                const port = tab.connection.port;
                // 如果端口是3389，可能是RDP
                if (port === 3389 || port === 3390) {
                    detectedProtocol = 'rdp';
                    console.log('🔍 根据端口3389/3390推断为RDP协议');
                } else if (port === 5900 || (port >= 5901 && port <= 5999)) {
                    detectedProtocol = 'vnc';
                    console.log('🔍 根据端口5900-5999推断为VNC协议');
                }
            }

            // 验证检测到的协议是否有效
            if (detectedProtocol && ['ssh', 'rdp', 'vnc', 'telnet'].includes(detectedProtocol)) {
                connProtocol = detectedProtocol;
                console.log('✅ 使用检测到的协议:', connProtocol);
            } else {
                if (detectedProtocol) {
                    console.warn('❌ 检测到无效的协议类型:', detectedProtocol);
                }
                console.warn('❌ 未找到有效协议信息，使用默认SSH协议');
            }

            console.log('🚀 最终使用的协议:', connProtocol);

            // 额外的验证：如果协议和端口不匹配，发出警告
            if (tab?.connection?.port) {
                const port = tab.connection.port;
                if (connProtocol === 'ssh' && ![22, 2222].includes(port)) {
                    console.warn('⚠️ SSH协议但端口不是22/2222，当前端口:', port);
                } else if (connProtocol === 'rdp' && ![3389, 3390].includes(port)) {
                    console.warn('⚠️ RDP协议但端口不是3389/3390，当前端口:', port);
                } else if (connProtocol === 'vnc' && !(port >= 5900 && port <= 5999)) {
                    console.warn('⚠️ VNC协议但端口不在5900-5999范围，当前端口:', port);
                } else if (connProtocol === 'telnet' && port !== 23) {
                    console.warn('⚠️ Telnet协议但端口不是23，当前端口:', port);
                }
            }

            // 从API_BASE_URL中提取主机和端口信息
            const apiUrl = new URL(API_BASE_URL);
            const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = apiUrl.host; // 包含端口号

            // 构建WebSocket URL，不包含/api路径
            const wsUrl = `${wsProtocol}//${host}/ws/${connProtocol}/${tab.sessionId}?token=${encodeURIComponent(token)}`;

            console.log(`创建WebSocket连接: ${wsUrl}`);

            // 设置连接状态为connecting
            this.connectionStates.set(tab.key, 'connecting');

            const ws = new WebSocket(wsUrl);

            // 设置初始活动时间
            (ws as any).lastActivity = Date.now();

            // 存储连接
            this.connections.set(tab.key, ws);

            // 保存处理函数
            if (handlers) {
                this.handlers.set(tab.key, handlers);
            }

            // 默认启用二进制协议支持
            this.protocolSupport.set(tab.key, true);

            // 更新统计信息
            this.stats.totalConnections++;
            this.stats.activeConnections++;
            this.stats.lastConnectionTime = new Date().toISOString();

            // 更新协议统计
            const tabProtocol = tab.protocol || 'unknown';
            this.stats.connectionsByProtocol[tabProtocol] = (this.stats.connectionsByProtocol[tabProtocol] || 0) + 1;

            // 初始化连接数据统计
            this.stats.connectionDataStats.set(tab.key, {
                connectionId: tab.connectionId?.toString() || 'unknown',
                protocol: tabProtocol,
                dataSent: 0,
                dataReceived: 0,
                startTime: new Date().toISOString(),
                lastActivity: new Date().toISOString()
            });

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
        ws.onopen = async (event) => {
            console.log(`WebSocket连接已打开: ${tab.key}`);

            // 更新连接状态为已连接
            this.connectionStates.set(tab.key, 'connected');

            // 发起协议协商
            setTimeout(async () => {
                await this.initiateProtocolNegotiation(tab);
            }, 100); // 延迟100ms以确保连接稳定

            // 只有图形协议(RDP、VNC)才需要发送初始化消息
            if (tab.protocol === 'rdp' || tab.protocol === 'vnc') {
                await this.sendInitMessage(ws, tab);
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
        ws.onmessage = async (event) => {
            // 立即检查是否为心跳消息，在任何其他处理之前标记

            // 对于Blob类型，检查其大小是否为16字节（心跳包的典型大小）
            if (event.data instanceof Blob && event.data.size === 16) {
                // 立即标记为心跳消息
                Object.defineProperty(event, '__isHeartbeatMessage', {
                    value: true,
                    writable: false,
                    enumerable: false
                });
            }
            // 对于ArrayBuffer，进行详细检查
            else if (event.data instanceof ArrayBuffer && event.data.byteLength >= 8) {
                const view = new DataView(event.data);
                const magicNumber = view.getUint32(0, false);
                const messageType = view.getUint8(4);


                if (magicNumber === PROTOCOL_CONSTANTS.MAGIC_NUMBER &&
                    messageType === PROTOCOL_CONSTANTS.MESSAGE_TYPES.HEARTBEAT) {

                    // 立即标记为心跳消息
                    Object.defineProperty(event, '__isHeartbeatMessage', {
                        value: true,
                        writable: false,
                        enumerable: false
                    });
                }
            }

            // 更新连接活动时间
            (ws as any).lastActivity = Date.now();

            // 更新统计信息
            const dataSize = event.data.length || event.data.byteLength || event.data.size || 0;
            this.stats.totalDataReceived += dataSize;

            // 更新连接特定的数据统计
            const connectionStat = this.stats.connectionDataStats.get(tab.key);
            if (connectionStat) {
                connectionStat.dataReceived += dataSize;
                connectionStat.lastActivity = new Date().toISOString();
            }

            // 检查是否为二进制协议消息
            let processedEvent = event;

            // 处理二进制数据（ArrayBuffer或Blob）
            if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
                let arrayBufferData: ArrayBuffer;

                // 如果是Blob，先转换为ArrayBuffer
                if (event.data instanceof Blob) {
                    arrayBufferData = await event.data.arrayBuffer();
                } else {
                    arrayBufferData = event.data;
                }

                // 改进的协议判断：首先进行严格的完整性检查，避免误判文本消息
                // 只有通过所有验证的消息才被认为是有效的二进制协议消息
                const hasBasicProtocolStructure = binaryJsonProtocol.isProtocolMessage(arrayBufferData);
                const hasMinimumSize = arrayBufferData.byteLength >= PROTOCOL_CONSTANTS.HEADER_SIZE;
                const isCompleteAndValid = this.isCompleteProtocolMessage(arrayBufferData);

                // console.log(`🔍 [${tab.key}] 协议判断详情:`, {
                //     hasBasicProtocolStructure,
                //     hasMinimumSize,
                //     isCompleteAndValid,
                //     dataSize: arrayBufferData.byteLength,
                //     preview: Array.from(new Uint8Array(arrayBufferData.slice(0, 8))).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')
                // });

                const isValidProtocolMessage = hasBasicProtocolStructure && hasMinimumSize && isCompleteAndValid;

                if (isValidProtocolMessage) {
                    try {
                        const protocolMessage = await binaryJsonProtocol.decodeMessage(arrayBufferData);

                        // console.log(`🔍 [${tab.key}] 二进制协议消息解析:`, {
                        //     messageType: protocolMessage.header.messageType,
                        //     hasJsonData: !!protocolMessage.jsonData,
                        //     hasBinaryData: !!protocolMessage.binaryData,
                        //     jsonDataType: protocolMessage.jsonData?.type,
                        //     binaryDataSize: protocolMessage.binaryData?.byteLength || 0
                        // });

                        // 处理心跳消息
                        if (protocolMessage.header.messageType === PROTOCOL_CONSTANTS.MESSAGE_TYPES.HEARTBEAT) {
                            // 统计心跳消息
                            this.stats.messageTypeStats.heartbeat++;

                            // 计算心跳延迟
                            const sendTimestamp = this.heartbeatTimestamps.get(tab.key);
                            if (sendTimestamp) {
                                const currentTime = Date.now();
                                const latency = currentTime - sendTimestamp;
                                this.networkLatencies.set(tab.key, latency);
                                // 触发延迟更新事件
                                window.dispatchEvent(new CustomEvent('network-latency-update', {
                                    detail: { tabKey: tab.key, latency: latency }
                                }));
                            }
                            return; // 心跳消息不传递给处理函数
                        }

                        // 处理协议协商
                        if (protocolMessage.header.messageType === PROTOCOL_CONSTANTS.MESSAGE_TYPES.PROTOCOL_NEGOTIATION) {
                            // 统计协议协商消息
                            this.stats.messageTypeStats.protocolNegotiation++;
                            this.handleProtocolNegotiation(tab.key, protocolMessage.jsonData);
                            return;
                        }

                        // 根据消息类型提取实际数据
                        let actualData = protocolMessage.jsonData;

                        // 如果是包含终端输出的消息，提取实际的终端数据
                        if (protocolMessage.jsonData &&
                            (protocolMessage.jsonData.type === 'terminal_data' || protocolMessage.jsonData.type === 'terminal-output') &&
                            protocolMessage.binaryData) {
                            // 统计终端数据消息
                            this.stats.messageTypeStats.terminalData++;
                            // 将二进制数据转换为字符串（终端输出）
                            const decoder = new TextDecoder();
                            actualData = decoder.decode(protocolMessage.binaryData);
                            // console.log(`💾 [${tab.key}] 从二进制协议提取终端数据: ${actualData.length} 字符, 内容预览: "${actualData.substring(0, 50)}${actualData.length > 50 ? '...' : ''}"`);
                        } else if (protocolMessage.jsonData && protocolMessage.jsonData.type === 'special_command') {
                            // 统计特殊命令消息
                            this.stats.messageTypeStats.specialCommand++;
                            // 特殊命令消息，保持JSON格式
                            actualData = protocolMessage.jsonData;
                            // console.log(`🔥 [${tab.key}] 特殊命令消息:`, actualData);
                        } else if (protocolMessage.jsonData && (protocolMessage.jsonData.type === 'file_upload' || protocolMessage.jsonData.type === 'file_download')) {
                            // 统计文件传输消息
                            this.stats.messageTypeStats.fileTransfer++;
                            if (protocolMessage.jsonData.type === 'file_upload') {
                                this.stats.fileTransferStats.uploadCount++;
                                this.stats.fileTransferStats.totalUploadSize += protocolMessage.binaryData?.byteLength || 0;
                            } else {
                                this.stats.fileTransferStats.downloadCount++;
                                this.stats.fileTransferStats.totalDownloadSize += protocolMessage.binaryData?.byteLength || 0;
                            }
                            // 文件传输消息，保持JSON格式
                            actualData = protocolMessage.jsonData;
                            // console.log(`📁 [${tab.key}] 文件传输消息:`, actualData);
                        } else if (protocolMessage.binaryData && !protocolMessage.jsonData) {
                            // 纯二进制数据，转换为字符串
                            const decoder = new TextDecoder();
                            actualData = decoder.decode(protocolMessage.binaryData);
                            // console.log(`📄 [${tab.key}] 纯二进制数据转换为文本: ${actualData.length} 字符, 内容预览: "${actualData.substring(0, 50)}${actualData.length > 50 ? '...' : ''}"`);
                        } else if (protocolMessage.binaryData && protocolMessage.jsonData) {
                            // 有二进制数据的混合消息，优先使用二进制数据
                            const decoder = new TextDecoder();
                            actualData = decoder.decode(protocolMessage.binaryData);
                            // console.log(`📄 [${tab.key}] 从混合消息提取二进制数据: ${actualData.length} 字符, 内容预览: "${actualData.substring(0, 50)}${actualData.length > 50 ? '...' : ''}"`);
                        } else {
                            // 统计其他类型的消息
                            this.stats.messageTypeStats.other++;
                            console.log(`📋 [${tab.key}] 使用JSON数据:`, actualData);
                        }

                        // 创建增强的事件对象
                        processedEvent = {
                            ...event,
                            data: actualData,
                            protocolMessage: protocolMessage,
                            isBinaryProtocol: true
                        } as MessageEvent & { protocolMessage: ProtocolMessage; isBinaryProtocol: boolean };

                    } catch (error) {
                        console.warn(`解析二进制协议消息失败: ${tab.key}`, error);
                        // 如果解析失败，尝试转换为文本
                        try {
                            const decoder = new TextDecoder();
                            const textData = decoder.decode(arrayBufferData);
                            processedEvent = {
                                ...event,
                                data: textData,
                                isRawBinary: true
                            } as MessageEvent & { isRawBinary: boolean };
                            console.log(`📄 [${tab.key}] 作为原始二进制数据处理: ${textData.length} 字符`);
                        } catch (decodeError) {
                            console.warn(`解码二进制数据失败: ${tab.key}`, decodeError);
                            // 保持原始数据
                        }
                    }
                } else {
                    // 不是二进制协议消息，尝试转换为文本
                    try {
                        const decoder = new TextDecoder();
                        const textData = decoder.decode(arrayBufferData);
                        processedEvent = {
                            ...event,
                            data: textData,
                            isRawBinary: true
                        } as MessageEvent & { isRawBinary: boolean };
                        console.log(`📄 [${tab.key}] 作为原始文本数据处理: ${textData.length} 字符`);
                    } catch (decodeError) {
                        console.warn(`解码二进制数据失败: ${tab.key}`, decodeError);
                        // 保持原始数据
                    }
                }
            } else if (typeof event.data === 'string') {
                // 检查是否为旧格式JSON消息
                if (binaryJsonProtocol.isLegacyJsonMessage(event.data)) {
                    try {
                        const jsonData = JSON.parse(event.data);
                        processedEvent = {
                            ...event,
                            data: jsonData,
                            isLegacyJson: true
                        } as MessageEvent & { isLegacyJson: boolean };
                    } catch (error) {
                        console.warn(`解析JSON消息失败: ${tab.key}`, error);
                    }
                }
            }

            // 调用自定义处理函数
            if (tabHandlers?.onMessage) {
                tabHandlers.onMessage(processedEvent);
            }
        };

        // 关闭事件处理
        ws.onclose = (event) => {
            console.log(`WebSocket连接已关闭: ${tab.key}, 代码: ${event.code}, 原因: ${event.reason}`);

            // 更新连接状态为断开
            this.connectionStates.set(tab.key, 'disconnected');

            // 更新统计信息
            if (this.stats.activeConnections > 0) {
                this.stats.activeConnections--;
            }
            this.stats.lastDisconnectionTime = new Date().toISOString();

            // 清除心跳检测
            this.clearHeartbeat(tab.key);

            // 调用自定义处理函数
            if (tabHandlers?.onClose) {
                tabHandlers.onClose();
            }

            // 检查是否需要自动重连
            // 只有在连接意外断开时才自动重连(code 1006 或 1011)
            const shouldReconnect = (event.code === 1006 || event.code === 1011 || event.code === 1000) &&
                this.reconnectConfig.enabled;

            if (shouldReconnect) {
                // 检查重连次数限制
                const reconnectState = this.reconnectStates.get(tab.key);
                if (reconnectState && reconnectState.retryCount >= this.reconnectConfig.maxRetries) {
                    console.warn(`已达到最大重试次数(${this.reconnectConfig.maxRetries})，停止自动重连: ${tab.key}`);

                    // 触发重连失败事件
                    window.dispatchEvent(new CustomEvent('terminal-reconnect-failed', {
                        detail: {
                            tabKey: tab.key,
                            reason: `已达到最大重试次数(${this.reconnectConfig.maxRetries})`,
                            finalRetryCount: reconnectState.retryCount
                        }
                    }));
                    return;
                }

                console.log(`连接意外断开，尝试自动重连: ${tab.key}`);

                // 触发自动重连
                setTimeout(() => {
                    this.attemptReconnect(tab, tabHandlers);
                }, 1000); // 给1秒缓冲时间
            } else {
                console.log(`不触发自动重连: ${tab.key}, 代码: ${event.code}, 自动重连: ${this.reconnectConfig.enabled}`);
            }

            // 触发终端断开事件
            window.dispatchEvent(new CustomEvent('terminal-ws-disconnected', {
                detail: { tabKey: tab.key, code: event.code, reason: event.reason }
            }));
        };

        // 错误事件处理
        ws.onerror = (event) => {
            console.error(`WebSocket连接错误: ${tab.key}`, event);

            // 如果连接失败，重置状态为disconnected
            this.connectionStates.set(tab.key, 'disconnected');

            // 调用自定义处理函数
            if (tabHandlers?.onError) {
                tabHandlers.onError(event);
            }

            // 在错误发生后也可能需要重连
            if (this.reconnectConfig.enabled) {
                // 检查重连次数限制
                const reconnectState = this.reconnectStates.get(tab.key);
                if (reconnectState && reconnectState.retryCount >= this.reconnectConfig.maxRetries) {
                    console.warn(`WebSocket错误：已达到最大重试次数(${this.reconnectConfig.maxRetries})，停止自动重连: ${tab.key}`);

                    // 触发重连失败事件
                    window.dispatchEvent(new CustomEvent('terminal-reconnect-failed', {
                        detail: {
                            tabKey: tab.key,
                            reason: `WebSocket错误且已达到最大重试次数(${this.reconnectConfig.maxRetries})`,
                            finalRetryCount: reconnectState.retryCount
                        }
                    }));
                    return;
                }

                console.log(`WebSocket错误，尝试自动重连: ${tab.key}`);

                // 延迟重连，给错误处理一些时间
                setTimeout(() => {
                    this.attemptReconnect(tab, tabHandlers);
                }, 2000);
            }

            // 触发终端错误事件
            window.dispatchEvent(new CustomEvent('terminal-ws-error', {
                detail: { tabKey: tab.key, error: 'WebSocket连接错误' }
            }));
        };

        // 添加ping处理器，防止原生ping/pong与二进制协议心跳冲突
        if ('onping' in ws) {
            (ws as any).onping = (event: any) => {
                console.debug(`收到WebSocket ping: ${tab.key}`);
                // 自动回复pong
                if (ws.readyState === WebSocket.OPEN) {
                    try {
                        // 发送pong响应
                        (ws as any).pong(event.data || new ArrayBuffer(0));
                        console.debug(`回复WebSocket pong: ${tab.key}`);
                    } catch (error) {
                        console.warn(`回复pong失败: ${tab.key}`, error);
                    }
                }
            };
        }

        // 添加pong处理器
        if ('onpong' in ws) {
            (ws as any).onpong = (event: any) => {
                console.debug(`收到WebSocket pong: ${tab.key}`);
                // 更新活动状态
            };
        }
    }

    /**
     * 发送初始化消息
     * 只有图形协议(RDP、VNC)需要发送init消息来初始化图形界面和请求截图
     * 对于文本协议(SSH、Telnet)，这个消息是无用的
     * @param ws WebSocket实例
     * @param tab 终端标签
     */
    private async sendInitMessage(ws: WebSocket, tab: TerminalTab): Promise<void> {
        try {
            const initData = {
                type: 'init',
                connectionId: tab.connectionId,
                sessionId: tab.sessionId,
                protocol: tab.protocol || 'ssh'
            };

            // 使用二进制协议发送初始化消息
            const encodedData = await binaryJsonProtocol.encodeMessage(initData);
            ws.send(encodedData);

            // 更新统计信息
            this.stats.totalDataSent += encodedData.byteLength;

            console.log(`通过二进制协议发送初始化数据: ${tab.key}`);
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
        const timerId = window.setInterval(async () => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    // 记录心跳发送时间戳
                    const timestamp = Date.now();
                    this.heartbeatTimestamps.set(tabKey, timestamp);

                    // 使用二进制协议发送心跳消息
                    const heartbeatData = await binaryJsonProtocol.createHeartbeatMessage();
                    ws.send(heartbeatData);

                    // 更新连接活动时间
                    (ws as any).lastActivity = Date.now();

                    this.stats.totalDataSent += heartbeatData.byteLength;
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
        // 清理延迟相关数据
        this.heartbeatTimestamps.delete(tabKey);
        this.networkLatencies.delete(tabKey);
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

            // 设置状态为正在断开
            this.connectionStates.set(tabKey, 'disconnecting');

            // 更新统计信息 - 如果连接是活跃的，减少活跃连接数
            if (ws.readyState === WebSocket.OPEN) {
                this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
                this.stats.lastDisconnectionTime = new Date().toISOString();
            }

            // 安全关闭WebSocket
            this.closeWebSocket(ws);

            // 从连接映射中移除
            this.connections.delete(tabKey);

            // 清理连接状态
            this.connectionStates.delete(tabKey);

            // 清除心跳检测
            this.clearHeartbeat(tabKey);

            // 清理连接数据统计
            this.stats.connectionDataStats.delete(tabKey);

            // 清理协议支持记录
            this.protocolSupport.delete(tabKey);

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
     * 刷新WebSocket连接
     * @param tab 终端标签
     * @param handlers 可选的事件处理器
     * @returns WebSocket实例或null
     */
    refreshConnection(tab: TerminalTab, handlers?: WebSocketEventHandlers): WebSocket | null {
        if (!tab || !tab.key) {
            console.error('无法刷新连接: 标签缺少必要信息');
            return null;
        }

        if (this.globalReconnectStopped) {
            console.warn(`全局重连已停止，阻止刷新连接: ${tab.key}`);
            return null;
        }

        if (!this.reconnectConfig.enabled) {
            console.warn(`自动重连已禁用，阻止刷新连接: ${tab.key}`);
            return null;
        }

        // **严格检查重连次数限制 - 防止无限重连**
        const reconnectState = this.reconnectStates.get(tab.key);
        if (reconnectState && reconnectState.retryCount >= this.reconnectConfig.maxRetries) {
            console.warn(`已达到最大重试次数(${this.reconnectConfig.maxRetries})，阻止刷新连接: ${tab.key}`);
            // 强制禁用重连并清理状态
            reconnectState.enabled = false;
            if (reconnectState.timeoutId) {
                clearTimeout(reconnectState.timeoutId);
                reconnectState.timeoutId = undefined;
            }
            this.reconnectStates.delete(tab.key);

            // 触发最终失败事件
            window.dispatchEvent(new CustomEvent('terminal-connection-failed', {
                detail: {
                    tabKey: tab.key,
                    reason: `已达到最大重试次数(${this.reconnectConfig.maxRetries})`
                }
            }));
            return null;
        }

        // 检查重连是否被禁用
        if (reconnectState && !reconnectState.enabled) {
            console.warn(`该连接的重连已被禁用: ${tab.key}`);
            return null;
        }

        // 检查是否正在连接，防止重复操作
        const currentState = this.connectionStates.get(tab.key);
        if (currentState === 'connecting') {
            console.log(`连接正在建立中，跳过重连请求: ${tab.key}`);
            return this.connections.get(tab.key) || null;
        }

        console.log(`刷新WebSocket连接: ${tab.key}`);

        // 保存现有的处理函数
        const existingHandlers = this.handlers.get(tab.key);
        const finalHandlers = handlers || existingHandlers;

        // 先关闭现有连接，但保留处理函数
        this.closeConnection(tab.key, true);

        // 等待短暂时间确保连接完全关闭
        setTimeout(() => {
            // 再次检查是否应该继续重连
            if (this.globalReconnectStopped) {
                console.warn(`全局重连已停止，取消延迟重连: ${tab.key}`);
                return;
            }

            // 再次检查重连次数
            const currentReconnectState = this.reconnectStates.get(tab.key);
            if (currentReconnectState && currentReconnectState.retryCount >= this.reconnectConfig.maxRetries) {
                console.warn(`延迟检查：已达到最大重试次数，取消重连: ${tab.key}`);
                return;
            }

            // 更新统计信息
            this.stats.reconnections++;

            // 创建新连接，使用保存的处理函数
            this.connect(tab, finalHandlers);
        }, 100);

        return null;
    }

    /**
     * 发送数据到WebSocket连接（支持二进制协议）
     * @param tab 终端标签
     * @param data 要发送的数据
     * @param useBinaryProtocol 是否使用二进制协议
     * @returns 是否发送成功
     */
    async sendData(tab: TerminalTab, data: string | ArrayBuffer | Blob, useBinaryProtocol: boolean = true): Promise<boolean> {
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
            let finalData: string | ArrayBuffer | Blob;
            let dataSize = 0;

            // 检查是否使用二进制协议且服务端支持
            // 默认强制启用二进制协议，除非明确设置为false
            const supportsBinaryProtocol = this.protocolSupport.get(tab.key) !== false;

            // 强制启用二进制协议进行测试
            console.log(`发送数据 - 二进制协议: ${useBinaryProtocol}, 支持: ${supportsBinaryProtocol}, 标签: ${tab.key}`);

            if (useBinaryProtocol && supportsBinaryProtocol) {
                console.log(`使用二进制协议发送数据: ${tab.key}, 类型: ${typeof data}`);
                // 使用新的二进制协议
                if (typeof data === 'string') {
                    // 字符串数据作为JSON发送
                    try {
                        const jsonData = JSON.parse(data);
                        finalData = await binaryJsonProtocol.encodeMessage(jsonData);
                    } catch {
                        // 如果不是JSON，当作命令字符串处理
                        const commandData = { type: 'command', content: data };
                        finalData = await binaryJsonProtocol.encodeMessage(commandData);
                    }
                } else if (data instanceof ArrayBuffer) {
                    // 二进制数据
                    finalData = await binaryJsonProtocol.encodeMessage(undefined, data);
                } else if (data instanceof Blob) {
                    // Blob转ArrayBuffer
                    const arrayBuffer = await data.arrayBuffer();
                    finalData = await binaryJsonProtocol.encodeMessage(undefined, arrayBuffer);
                } else {
                    finalData = data;
                }

                dataSize = finalData instanceof ArrayBuffer ? finalData.byteLength :
                    (finalData as Blob).size || (finalData as string).length;
            } else {
                // 使用传统方式发送
                console.log(`使用传统方式发送数据: ${tab.key}, 类型: ${typeof data}`);
                finalData = data;
                if (typeof data === 'string') {
                    dataSize = data.length;
                } else if (data instanceof ArrayBuffer) {
                    dataSize = data.byteLength;
                } else if (data instanceof Blob) {
                    dataSize = data.size;
                }
            }

            ws.send(finalData);

            // 更新连接活动时间
            (ws as any).lastActivity = Date.now();

            // 更新统计信息
            this.stats.totalDataSent += dataSize;

            // 更新连接特定的数据统计
            const connectionStat = this.stats.connectionDataStats.get(tab.key);
            if (connectionStat) {
                connectionStat.dataSent += dataSize;
                connectionStat.lastActivity = new Date().toISOString();
            }
            return true;
        } catch (error) {
            console.error(`发送数据失败: ${tab.key}`, error);
            return false;
        }
    }

    /**
     * 发送JSON数据（使用二进制协议）
     * @param tab 终端标签
     * @param jsonData JSON数据对象
     * @returns 是否发送成功
     */
    async sendJsonData(tab: TerminalTab, jsonData: any): Promise<boolean> {
        if (!tab || !tab.key) {
            console.error('无法发送JSON数据: 标签缺少必要信息');
            return false;
        }

        const ws = this.connections.get(tab.key);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`无法发送JSON数据: WebSocket连接不可用 (${tab.key})`);
            return false;
        }

        try {
            const binaryData = await binaryJsonProtocol.encodeMessage(jsonData);
            ws.send(binaryData);

            // 更新连接活动时间
            (ws as any).lastActivity = Date.now();

            this.stats.totalDataSent += binaryData.byteLength;

            // 更新连接特定的数据统计
            const connectionStat = this.stats.connectionDataStats.get(tab.key);
            if (connectionStat) {
                connectionStat.dataSent += binaryData.byteLength;
                connectionStat.lastActivity = new Date().toISOString();
            }
            return true;
        } catch (error) {
            console.error(`发送JSON数据失败: ${tab.key}`, error);
            return false;
        }
    }

    /**
     * 发送二进制数据（使用二进制协议）
     * @param tab 终端标签
     * @param binaryData 二进制数据
     * @param metadata 可选的元数据
     * @returns 是否发送成功
     */
    async sendBinaryData(tab: TerminalTab, binaryData: ArrayBuffer, metadata?: any): Promise<boolean> {
        if (!tab || !tab.key) {
            console.error('无法发送二进制数据: 标签缺少必要信息');
            return false;
        }

        const ws = this.connections.get(tab.key);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`无法发送二进制数据: WebSocket连接不可用 (${tab.key})`);
            return false;
        }

        try {
            const encodedData = await binaryJsonProtocol.encodeMessage(metadata, binaryData);
            ws.send(encodedData);

            // 更新连接活动时间
            (ws as any).lastActivity = Date.now();

            this.stats.totalDataSent += encodedData.byteLength;

            // 更新连接特定的数据统计
            const connectionStat = this.stats.connectionDataStats.get(tab.key);
            if (connectionStat) {
                connectionStat.dataSent += encodedData.byteLength;
                connectionStat.lastActivity = new Date().toISOString();
            }
            return true;
        } catch (error) {
            console.error(`发送二进制数据失败: ${tab.key}`, error);
            return false;
        }
    }

    /**
     * 处理协议协商
     * @param tabKey 标签键
     * @param negotiationData 协商数据
     */
    private handleProtocolNegotiation(tabKey: string, negotiationData: any): void {

        if (negotiationData && typeof negotiationData === 'object') {
            // 记录服务端支持的协议
            this.protocolSupport.set(tabKey, true);
        } else {
            // 服务端不支持或协商失败
            this.protocolSupport.set(tabKey, false);
        }
    }

    /**
     * 检查是否为完整的协议消息
     * 避免将恰好以魔数开头的文本消息误判为二进制协议消息
     * @param data 消息数据
     * @returns 是否为完整的协议消息
     */
    private isCompleteProtocolMessage(data: ArrayBuffer): boolean {
        if (data.byteLength < PROTOCOL_CONSTANTS.HEADER_SIZE) {
            return false;
        }

        try {
            // 解析消息头
            const view = new DataView(data, 0, PROTOCOL_CONSTANTS.HEADER_SIZE);
            const header = {
                magicNumber: view.getUint32(0, false),
                messageType: view.getUint8(4),
                compressionFlag: view.getUint8(5),
                jsonLength: view.getUint32(6, false),
                binaryLength: view.getUint32(10, false),
                reserved: view.getUint16(14, false)
            };

            // 验证魔数
            if (header.magicNumber !== PROTOCOL_CONSTANTS.MAGIC_NUMBER) {
                return false;
            }

            // 验证消息类型
            const validTypes = [
                PROTOCOL_CONSTANTS.MESSAGE_TYPES.JSON_ONLY,
                PROTOCOL_CONSTANTS.MESSAGE_TYPES.BINARY_ONLY,
                PROTOCOL_CONSTANTS.MESSAGE_TYPES.MIXED,
                PROTOCOL_CONSTANTS.MESSAGE_TYPES.HEARTBEAT,
                PROTOCOL_CONSTANTS.MESSAGE_TYPES.PROTOCOL_NEGOTIATION
            ] as const;
            if (!validTypes.includes(header.messageType as any)) {
                return false;
            }

            // 验证消息长度
            const expectedLength = PROTOCOL_CONSTANTS.HEADER_SIZE + header.jsonLength + header.binaryLength;
            if (data.byteLength !== expectedLength) {
                return false;
            }

            // 验证数据完整性
            if (header.jsonLength > 0) {
                const jsonStart = PROTOCOL_CONSTANTS.HEADER_SIZE;
                const jsonEnd = jsonStart + header.jsonLength;
                const jsonBuffer = data.slice(jsonStart, jsonEnd);

                try {
                    const decoder = new TextDecoder();
                    const jsonString = decoder.decode(jsonBuffer);
                    JSON.parse(jsonString); // 尝试解析JSON
                } catch (e) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 发起协议协商
     * @param tab 终端标签
     * @returns 是否成功发起协商
     */
    async initiateProtocolNegotiation(tab: TerminalTab): Promise<boolean> {
        if (!tab || !tab.key) {
            console.error('无法发起协议协商: 标签缺少必要信息');
            return false;
        }

        const ws = this.connections.get(tab.key);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`无法发起协议协商: WebSocket连接不可用 (${tab.key})`);
            return false;
        }

        try {
            const negotiationMessage = binaryJsonProtocol.createNegotiationMessage();
            const encodedMessage = await binaryJsonProtocol.encodeMessage(negotiationMessage);

            // 设置消息类型为协议协商
            const view = new DataView(encodedMessage);
            view.setUint8(4, PROTOCOL_CONSTANTS.MESSAGE_TYPES.PROTOCOL_NEGOTIATION);

            ws.send(encodedMessage);

            // 更新连接活动时间
            (ws as any).lastActivity = Date.now();

            console.log(`发起协议协商: ${tab.key}`);
            return true;
        } catch (error) {
            console.error(`发起协议协商失败: ${tab.key}`, error);
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
            lastDisconnectionTime: this.stats.lastDisconnectionTime,
            fileTransferStats: {
                uploadCount: 0,
                downloadCount: 0,
                totalUploadSize: 0,
                totalDownloadSize: 0
            },
            connectionDataStats: new Map(),
            messageTypeStats: {
                terminalData: 0,
                fileTransfer: 0,
                heartbeat: 0,
                protocolNegotiation: 0,
                specialCommand: 0,
                other: 0
            }
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

    /**
     * 获取指定标签的网络延迟
     * @param tabKey 标签键
     * @returns 网络延迟（毫秒）或null
     */
    getNetworkLatency(tabKey: string): number | null {
        return this.networkLatencies.get(tabKey) || null;
    }

    /**
     * 获取所有标签的网络延迟
     * @returns 所有标签的延迟映射
     */
    getAllNetworkLatencies(): Map<string, number> {
        return new Map(this.networkLatencies);
    }

    /**
     * 获取特定连接的数据统计
     * @param tabKey 标签键
     * @returns 连接数据统计
     */
    getConnectionStats(tabKey: string) {
        return this.stats.connectionDataStats.get(tabKey);
    }

    /**
     * 获取所有连接的数据统计
     * @returns 所有连接的数据统计
     */
    getAllConnectionStats() {
        return Array.from(this.stats.connectionDataStats.entries()).map(([tabKey, stats]) => ({
            tabKey,
            ...stats
        }));
    }

    /**
     * 获取当前活跃连接的总数据量
     * @returns 总数据量统计
     */
    getActiveConnectionsTotalData() {
        let totalSent = 0;
        let totalReceived = 0;

        for (const stats of this.stats.connectionDataStats.values()) {
            totalSent += stats.dataSent;
            totalReceived += stats.dataReceived;
        }

        return {
            totalSent,
            totalReceived,
            totalData: totalSent + totalReceived
        };
    }

    /**
     * 获取文件传输统计
     * @returns 文件传输统计
     */
    getFileTransferStats() {
        return this.stats.fileTransferStats;
    }

    /**
     * 获取消息类型统计
     * @returns 消息类型统计
     */
    getMessageTypeStats() {
        return this.stats.messageTypeStats;
    }

    /**
     * 手动添加文件传输统计（用于外部文件传输组件）
     * @param type 传输类型
     * @param size 文件大小
     */
    addFileTransferStats(type: 'upload' | 'download', size: number): void {
        if (type === 'upload') {
            this.stats.fileTransferStats.uploadCount++;
            this.stats.fileTransferStats.totalUploadSize += size;
        } else {
            this.stats.fileTransferStats.downloadCount++;
            this.stats.fileTransferStats.totalDownloadSize += size;
        }
    }

    /**
     * 获取连接状态
     * @param tabKey 标签键
     * @returns 连接状态
     */
    getConnectionState(tabKey: string): 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | undefined {
        return this.connectionStates.get(tabKey);
    }

    /**
     * 设置连接状态
     * @param tabKey 标签键
     * @param state 连接状态
     */
    setConnectionState(tabKey: string, state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected'): void {
        this.connectionStates.set(tabKey, state);
    }

    /**
     * 设置重连配置
     * @param config 重连配置
     */
    setReconnectConfig(config: Partial<ReconnectConfig>): void {
        this.reconnectConfig = { ...this.reconnectConfig, ...config };
        console.log('更新重连配置:', this.reconnectConfig);

        // 更新心跳间隔
        if (config.heartbeatInterval) {
            this.heartbeatInterval = config.heartbeatInterval;
        }
    }

    /**
     * 获取重连配置
     * @returns 当前重连配置
     */
    getReconnectConfig(): ReconnectConfig {
        return { ...this.reconnectConfig };
    }

    /**
     * 获取指定连接的重连状态
     * @param tabKey 标签键
     * @returns 重连状态，如果不存在则返回undefined
     */
    getReconnectState(tabKey: string): ReconnectState | undefined {
        return this.reconnectStates.get(tabKey);
    }

    /**
     * 重置重连状态
     * @param tabKey 标签键
     */
    resetReconnectState(tabKey: string): void {
        this.reconnectStates.delete(tabKey);
        const timer = this.reconnectTimers.get(tabKey);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(tabKey);
        }
    }

    /**
     * 尝试重新连接
     * @param tab 标签页对象
     * @param handlers 事件处理器
     * @returns 是否启动重连
     */
    private attemptReconnect(tab: TerminalTab, handlers?: WebSocketEventHandlers): boolean {
        console.log('=== 尝试重连调试信息 ===');
        console.log('Tab Key:', tab.key);
        console.log('重连配置:', JSON.stringify(this.reconnectConfig, null, 2));
        console.log('全局重连停止标志:', this.globalReconnectStopped);

        // **立即检查全局停止标志 - 最高优先级**
        if (this.globalReconnectStopped) {
            console.warn(`❌ 全局重连已停止，阻止重连: ${tab.key}`);
            this.forceStopReconnect(tab.key);
            return false;
        }

        // **检查重连配置 - 第二优先级**
        if (!this.reconnectConfig.enabled) {
            console.warn(`❌ 重连已禁用，阻止重连: ${tab.key}`);
            this.forceStopReconnect(tab.key);
            return false;
        }

        // 获取或创建重连状态
        let reconnectState = this.reconnectStates.get(tab.key);
        if (!reconnectState) {
            reconnectState = {
                retryCount: 0,
                lastRetryTime: 0,
                enabled: true
            };
            this.reconnectStates.set(tab.key, reconnectState);
        }

        console.log('当前重连状态:', JSON.stringify(reconnectState, null, 2));

        // **严格检查重连次数限制 - 第三优先级**
        if (reconnectState.retryCount >= this.reconnectConfig.maxRetries) {
            console.error(`❌ 已达到最大重试次数(${this.reconnectConfig.maxRetries})，当前次数: ${reconnectState.retryCount}，强制停止: ${tab.key}`);
            this.forceStopReconnect(tab.key);

            // 触发连接失败事件
            window.dispatchEvent(new CustomEvent('terminal-connection-failed', {
                detail: {
                    tabKey: tab.key,
                    reason: `已达到最大重试次数(${this.reconnectConfig.maxRetries})`,
                    maxRetries: this.reconnectConfig.maxRetries,
                    actualRetries: reconnectState.retryCount
                }
            }));

            return false;
        }

        // **额外检查：如果这次重连后会超过限制，也要停止**
        if (reconnectState.retryCount + 1 > this.reconnectConfig.maxRetries) {
            console.error(`❌ 下次重连将超过最大重试次数(${this.reconnectConfig.maxRetries})，当前次数: ${reconnectState.retryCount}，强制停止: ${tab.key}`);
            this.forceStopReconnect(tab.key);

            // 触发连接失败事件
            window.dispatchEvent(new CustomEvent('terminal-connection-failed', {
                detail: {
                    tabKey: tab.key,
                    reason: `即将超过最大重试次数(${this.reconnectConfig.maxRetries})`,
                    maxRetries: this.reconnectConfig.maxRetries,
                    actualRetries: reconnectState.retryCount
                }
            }));

            return false;
        }

        // **检查重连状态是否被禁用**
        if (!reconnectState.enabled) {
            console.warn(`❌ 重连状态被禁用: ${tab.key}`);
            return false;
        }

        // 检查是否已经有重连计时器在运行
        if (reconnectState.timeoutId) {
            console.warn(`⚠️ 重连计时器已存在，跳过重复重连: ${tab.key}`);
            return false;
        }

        // 计算延迟时间
        // 使用配置的基础延迟 + 适度递增（避免过度递增）
        const baseDelay = this.reconnectConfig.retryDelay;
        const incrementFactor = Math.min(reconnectState.retryCount * 0.5, 2); // 最多翻倍
        const delay = Math.min(
            baseDelay + (baseDelay * incrementFactor),
            Math.max(baseDelay * 3, 30000) // 最大延迟为基础延迟的3倍或30秒，取较大值
        );

        console.log(`🔄 第${reconnectState.retryCount + 1}次重连尝试，延迟${delay}ms: ${tab.key}`);

        // 使用递增延迟重试
        const timeoutId = setTimeout(() => {
            // **重连执行前的最终检查**
            const currentReconnectState = this.reconnectStates.get(tab.key);

            // 清除timeoutId
            if (currentReconnectState && currentReconnectState.timeoutId) {
                currentReconnectState.timeoutId = undefined;
            }

            // **再次检查全局停止标志**
            if (this.globalReconnectStopped || !this.reconnectConfig.enabled) {
                console.warn(`❌ 重连执行时检测到停止信号: ${tab.key}`);
                this.forceStopReconnect(tab.key);
                return;
            }

            // **再次检查重试次数限制 - 在增加次数之前检查**
            if (currentReconnectState && currentReconnectState.retryCount >= this.reconnectConfig.maxRetries) {
                console.error(`❌ 重连执行时检测到超出最大重试次数: ${tab.key}`);
                this.forceStopReconnect(tab.key);

                // 触发连接失败事件
                window.dispatchEvent(new CustomEvent('terminal-connection-failed', {
                    detail: {
                        tabKey: tab.key,
                        reason: `执行重连时发现已达到最大重试次数(${this.reconnectConfig.maxRetries})`,
                        maxRetries: this.reconnectConfig.maxRetries,
                        actualRetries: currentReconnectState.retryCount
                    }
                }));
                return;
            }

            // **检查即将进行的重连是否会超过限制**
            if (currentReconnectState && currentReconnectState.retryCount + 1 > this.reconnectConfig.maxRetries) {
                console.error(`❌ 即将进行的重连会超过最大重试次数(${this.reconnectConfig.maxRetries})，当前次数: ${currentReconnectState.retryCount}，停止重连: ${tab.key}`);
                this.forceStopReconnect(tab.key);

                // 触发连接失败事件
                window.dispatchEvent(new CustomEvent('terminal-connection-failed', {
                    detail: {
                        tabKey: tab.key,
                        reason: `重连次数即将超过最大限制(${this.reconnectConfig.maxRetries})`,
                        maxRetries: this.reconnectConfig.maxRetries,
                        actualRetries: currentReconnectState.retryCount
                    }
                }));
                return;
            }

            console.log(`⚡ 开始第${currentReconnectState ? currentReconnectState.retryCount + 1 : 1}次重连: ${tab.key}`);

            // 更新重试状态 - 现在安全更新
            if (currentReconnectState) {
                currentReconnectState.retryCount++;
                currentReconnectState.lastRetryTime = Date.now();

                // **立即检查更新后的次数**
                if (currentReconnectState.retryCount >= this.reconnectConfig.maxRetries) {
                    console.error(`❌ 更新重连次数后发现已达到最大值，立即停止: ${tab.key}`);
                    this.forceStopReconnect(tab.key);
                    return;
                }
            }

            // 执行重连
            this.refreshConnection(tab, handlers);
        }, delay);

        // 保存计时器ID
        reconnectState.timeoutId = timeoutId;
        return true;
    }

    /**
     * 强制停止指定连接的重连活动
     * @param tabKey 标签键
     */
    private forceStopReconnect(tabKey: string): void {
        console.log(`🛑 强制停止重连: ${tabKey}`);

        const reconnectState = this.reconnectStates.get(tabKey);
        if (reconnectState) {
            // 清除重连计时器
            if (reconnectState.timeoutId) {
                clearTimeout(reconnectState.timeoutId);
                reconnectState.timeoutId = undefined;
            }

            // 禁用重连
            reconnectState.enabled = false;
        }

        // 从状态映射中移除
        this.reconnectStates.delete(tabKey);

        // 清除其他计时器
        const timerId = this.reconnectTimers.get(tabKey);
        if (timerId) {
            clearTimeout(timerId);
            this.reconnectTimers.delete(tabKey);
        }

        // 清除心跳计时器
        this.clearHeartbeat(tabKey);

        // 清理连接相关数据
        this.stats.connectionDataStats.delete(tabKey);
        this.protocolSupport.delete(tabKey);

        console.log(`✅ 已强制停止重连: ${tabKey}`);
    }

    /**
     * 禁用指定连接的自动重连
     * @param tabKey 标签键
     */
    disableAutoReconnect(tabKey: string): void {
        const reconnectState = this.reconnectStates.get(tabKey);
        if (reconnectState) {
            reconnectState.enabled = false;
        } else {
            this.reconnectStates.set(tabKey, {
                retryCount: 0,
                lastRetryTime: 0,
                enabled: false
            });
        }
        console.log(`禁用自动重连: ${tabKey}`);
    }

    /**
     * 启用指定连接的自动重连
     * @param tabKey 标签键
     */
    enableAutoReconnect(tabKey: string): void {
        const reconnectState = this.reconnectStates.get(tabKey);
        if (reconnectState) {
            reconnectState.enabled = true;
        } else {
            this.reconnectStates.set(tabKey, {
                retryCount: 0,
                lastRetryTime: 0,
                enabled: true
            });
        }
        console.log(`启用自动重连: ${tabKey}`);
    }

    /**
     * 调试方法：强制停止所有重连活动
     */
    debugStopAllReconnects(): void {
        console.log('🚨 紧急停止所有重连活动');
        this.globalReconnectStopped = true;
        this.reconnectConfig.enabled = false;

        // 清除所有重连计时器
        for (const [tabKey, reconnectState] of this.reconnectStates.entries()) {
            if (reconnectState.timeoutId) {
                clearTimeout(reconnectState.timeoutId);
                console.log(`清除重连计时器: ${tabKey}`);
            }
        }

        // 清除所有重连状态
        this.reconnectStates.clear();
        this.reconnectTimers.clear();

        // 清除所有心跳计时器
        for (const [tabKey, timerId] of this.heartbeatTimers.entries()) {
            if (timerId) {
                clearInterval(timerId);
                console.log(`清除心跳计时器: ${tabKey}`);
            }
        }
        this.heartbeatTimers.clear();

        // 关闭所有活动连接
        for (const [tabKey, ws] of this.connections.entries()) {
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                console.log(`强制关闭连接: ${tabKey}`);
                try {
                    ws.close(1000, '管理员强制停止');
                } catch (e) {
                    console.warn(`关闭连接时出错: ${tabKey}`, e);
                }
            }
        }

        // 清除所有连接引用
        this.connections.clear();
        this.handlers.clear();
        this.connectionStates.clear();

        // 触发全局事件，通知所有组件停止重连检查
        window.dispatchEvent(new CustomEvent('global-reconnect-stopped', {
            detail: { stopped: true }
        }));

        console.log('✅ 所有重连活动已停止');
    }

    /**
     * 立即清理所有连接和状态 - 紧急情况使用
     */
    emergencyCleanup(): void {
        console.log('🚨 执行紧急清理');

        // 停止所有重连
        this.debugStopAllReconnects();

        // 重置所有统计信息
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            connectionsByProtocol: {},
            failedConnections: 0,
            reconnections: 0,
            totalDataSent: 0,
            totalDataReceived: 0,
            lastConnectionTime: null,
            lastDisconnectionTime: null,
            fileTransferStats: {
                uploadCount: 0,
                downloadCount: 0,
                totalUploadSize: 0,
                totalDownloadSize: 0,
            },
            connectionDataStats: new Map(),
            messageTypeStats: {
                terminalData: 0,
                fileTransfer: 0,
                heartbeat: 0,
                protocolNegotiation: 0,
                specialCommand: 0,
                other: 0,
            },
        };

        // 清理所有网络延迟记录
        this.networkLatencies.clear();
        this.heartbeatTimestamps.clear();
        this.protocolSupport.clear();

        console.log('✅ 紧急清理完成');
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
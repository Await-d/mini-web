/*
 * @Author: Await
 * @Date: 2025-05-09 17:49:44
 * @LastEditors: Await
 * @LastEditTime: 2025-05-11 08:17:12
 * @Description: 请填写简介
 */
import {useState, useRef, useCallback} from 'react';
import type {TerminalTab} from '../../../contexts/TerminalContext';
import {handleWebSocketMessage, getWebSocketStateText} from '../utils/websocket';
import {terminalStateRef} from '../../../contexts/TerminalContext';
import {writeColorText} from '../utils/terminalUtils';

// 扩展TerminalTab接口以支持lastActivityTime和isGraphical属性
declare module '../../../contexts/TerminalContext' {
    interface TerminalTab {
        lastActivityTime?: number;
        isGraphical?: boolean;
    }
}

/**
 * 管理WebSocket连接的生命周期的Hook
 */
export interface WebSocketManagerOptions {
    // ... 保留现有选项 ...
}

// 创建连接帮助界面
export const createConnectionHelp = (activeTab: TerminalTab, onRetry: () => void) => {
    if (!activeTab.xtermRef?.current) return;
    const term = activeTab.xtermRef.current;

    writeColorText(term, '\r\n\n=== 连接问题排查指南 ===\r\n\n', 'yellow');
    writeColorText(term, '1. 确保后端服务已启动\r\n', 'white');
    writeColorText(term, '2. 检查WebSocket端点是否正确配置\r\n', 'white');
    writeColorText(term, '3. 检查防火墙或代理设置\r\n', 'white');
    writeColorText(term, '4. 确认连接ID和会话ID有效\r\n', 'white');
    writeColorText(term, '\r\n按Enter键尝试重新连接...', 'green');

    const handleKey = (data: string) => {
        if (data === '\r' || data === '\n') {
            // 移除事件监听
            term.onData(handleKey);
            // 尝试重连
            onRetry();
        }
    };

    // 添加键盘事件监听
    term.onData(handleKey);
};

// 创建重试界面
export const createRetryInterface = (
    activeTab: TerminalTab,
    onRetry: () => void,
    onHelp: () => void
) => {
    if (!activeTab.xtermRef?.current) return;
    const term = activeTab.xtermRef.current;

    writeColorText(term, '\r\n\n连接失败，请选择操作:\r\n\n', 'red');
    writeColorText(term, '按 R 键: 重试连接\r\n', 'white');
    writeColorText(term, '按 H 键: 显示帮助\r\n', 'white');

    const handleKey = (data: string) => {
        if (data.toLowerCase() === 'r') {
            // 移除事件监听
            term.onData(handleKey);
            // 重试连接
            onRetry();
        } else if (data.toLowerCase() === 'h') {
            // 移除事件监听
            term.onData(handleKey);
            // 显示帮助
            onHelp();
        }
    };

    // 添加键盘事件监听
    term.onData(handleKey);
};

// WebSocket管理器Hook
export const useWebSocketManager = () => {
    const [isConnected, setIsConnected] = useState(false);
    const reconnectCountRef = useRef(0);
    const connectionAttemptRef = useRef(false);
    // 保存心跳定时器的引用
    const heartbeatTimerRef = useRef<number | null>(null);

    /**
     * 开始心跳检测，定期发送ping消息保持连接活跃
     */
    const startHeartbeat = useCallback((
        ws: WebSocket,
        activeTab: TerminalTab,
        interval: number = 30000 // 默认30秒发送一次心跳
    ) => {
        // 清除已有的心跳定时器
        if (heartbeatTimerRef.current !== null) {
            clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
        }

        // 开始新的心跳检测
        const timer = window.setInterval(() => {
            try {
                if (ws.readyState === WebSocket.OPEN) {
                    // 发送ping消息
                    const pingMessage = JSON.stringify({type: 'ping', timestamp: Date.now()});
                    ws.send(pingMessage);

                    // 更新最后活动时间
                    if (activeTab.lastActivityTime) {
                        activeTab.lastActivityTime = Date.now();
                    } else {
                        activeTab.lastActivityTime = Date.now();
                    }
                } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                    // 连接已关闭，停止心跳
                    clearInterval(timer);
                    heartbeatTimerRef.current = null;
                }
            } catch (e) {
                console.error('发送心跳消息失败:', e);
                // 发送失败也停止心跳
                clearInterval(timer);
                heartbeatTimerRef.current = null;
            }
        }, interval);

        // 保存定时器引用
        heartbeatTimerRef.current = timer as unknown as number;

        // 返回清理函数
        return () => {
            if (heartbeatTimerRef.current !== null) {
                clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
            }
        };
    }, []);

    /**
     * 创建WebSocket连接
     * 支持两种调用方式：
     * 1. createWebSocketConnection(activeTab, onConnectionHelp, onRetryInterface)
     * 2. createWebSocketConnection(connectionId, sessionId, tabKey)
     */
    const createWebSocketConnection = useCallback((
        activeTabOrConnectionId: TerminalTab | number,
        onConnectionHelpOrSessionId: (() => void) | number | undefined,
        onRetryInterfaceOrTabKey?: (() => void) | string
    ) => {
        // 判断参数类型并处理
        let activeTab: TerminalTab | undefined;
        let connectionId: number | undefined;
        let sessionId: number | undefined;
        let tabKey: string | undefined;

        // 全局连接防抖处理
        const preventDuplicateConnections = (connId: number, sessId: number | undefined, key?: string): boolean => {
            // 创建一个全局唯一的键，用于跟踪当前正在创建的连接
            const wsLockKey = `creating-ws-${connId}-${sessId || 'nosession'}-${Date.now()}`;
            const wsInProgressKey = `ws-in-progress-${connId}-${sessId || 'nosession'}`;

            // 检查是否已经有正在进行的连接创建
            if ((window as any)[wsInProgressKey]) {
                console.log(`【WebSocket】检测到正在进行中的WebSocket连接: ${wsInProgressKey}，跳过重复创建`);
                return false;
            }

            // 设置标记，表示当前正在创建连接
            (window as any)[wsInProgressKey] = true;
            (window as any)[wsLockKey] = true;

            // 设置自动清除计时器，确保连接创建过程不会无限阻塞
            setTimeout(() => {
                delete (window as any)[wsInProgressKey];
                delete (window as any)[wsLockKey];
            }, 5000);

            return true;
        };

        if (typeof activeTabOrConnectionId === 'number') {
            // 使用的是参数形式2：connectionId, sessionId, tabKey
            connectionId = activeTabOrConnectionId;
            sessionId = typeof onConnectionHelpOrSessionId === 'number' ? onConnectionHelpOrSessionId : undefined;
            tabKey = typeof onRetryInterfaceOrTabKey === 'string' ? onRetryInterfaceOrTabKey : undefined;

            // 防止重复创建连接
            if (!preventDuplicateConnections(connectionId, sessionId, tabKey)) {
                return;
            }

            // 从terminalStateRef中查找匹配的tab
            // 使用类型断言，确保tabs数组中的元素被识别为TerminalTab类型
            const tabs = terminalStateRef.current?.tabs as TerminalTab[] || [];
            activeTab = tabs.find(t =>
                t.connectionId === connectionId &&
                t.sessionId === sessionId &&
                (tabKey ? t.key === tabKey : true)
            );

            if (!activeTab) {
                console.error(`【WebSocket调试】找不到匹配的标签，无法创建连接: connectionId=${connectionId}, sessionId=${sessionId}`);
                // 释放连接锁
                const wsInProgressKey = `ws-in-progress-${connectionId}-${sessionId || 'nosession'}`;
                delete (window as any)[wsInProgressKey];
                return;
            }

            // 深入检查WebSocket状态
            if (activeTab.webSocketRef?.current) {
                const ws = activeTab.webSocketRef.current;
                // 只有在WebSocket确实打开的情况下才跳过创建
                if (ws.readyState === WebSocket.OPEN) {
                    console.log(`【WebSocket】标签 ${activeTab.key} 已有活动连接，不重复创建`);
                    // 释放连接锁
                    const wsInProgressKey = `ws-in-progress-${connectionId}-${sessionId || 'nosession'}`;
                    delete (window as any)[wsInProgressKey];
                    return;
                } else if (ws.readyState === WebSocket.CONNECTING) {
                    console.log(`【WebSocket】标签 ${activeTab.key} 正在连接中，不重复创建`);
                    // 释放连接锁
                    const wsInProgressKey = `ws-in-progress-${connectionId}-${sessionId || 'nosession'}`;
                    delete (window as any)[wsInProgressKey];
                    return;
                }
                // 对于CLOSING或CLOSED状态，允许重新创建连接
            }
        } else {
            // 使用的是参数形式1：activeTab, onConnectionHelp, onRetryInterface
            activeTab = activeTabOrConnectionId;

            connectionId = activeTab.connectionId;
            sessionId = activeTab.sessionId;
            tabKey = activeTab.key;

            // 防止重复创建连接
            if (connectionId && sessionId) {
                if (!preventDuplicateConnections(connectionId, sessionId, tabKey)) {
                    return;
                }

                // 深入检查WebSocket状态
                if (activeTab.webSocketRef?.current) {
                    const ws = activeTab.webSocketRef.current;
                    // 只有在WebSocket确实打开的情况下才跳过创建
                    if (ws.readyState === WebSocket.OPEN) {
                        console.log(`【WebSocket】标签 ${activeTab.key} 已有活动连接，不重复创建`);
                        // 释放连接锁
                        const wsInProgressKey = `ws-in-progress-${connectionId}-${sessionId || 'nosession'}`;
                        delete (window as any)[wsInProgressKey];
                        return;
                    } else if (ws.readyState === WebSocket.CONNECTING) {
                        console.log(`【WebSocket】标签 ${activeTab.key} 正在连接中，不重复创建`);
                        // 释放连接锁
                        const wsInProgressKey = `ws-in-progress-${connectionId}-${sessionId || 'nosession'}`;
                        delete (window as any)[wsInProgressKey];
                        return;
                    }
                    // 对于CLOSING或CLOSED状态，允许重新创建连接
                }
            }
        }

        // 确保activeTab存在
        if (!activeTab) {
            console.error('【WebSocket】无效的活动标签，无法创建WebSocket连接');
            return;
        }

        if (!activeTab.terminalRef?.current || !activeTab.xtermRef?.current) {
            console.error('【WebSocket调试】创建WebSocket连接失败：终端尚未初始化');

            // 检查是否手动关闭过标签页
            const manuallyClosedTabs = localStorage.getItem('manually_closed_tabs') === 'true';
            if (manuallyClosedTabs) {
                console.log('【WebSocket】检测到标签页是手动关闭的，不创建WebSocket连接');
                return false;
            }

            // 添加重试机制，如果终端尚未初始化，等待一段时间后重试
            if (activeTab.key) {
                console.log(`【WebSocket】等待终端初始化，将在300ms后重试连接...`);
                setTimeout(() => {
                    // 重新检查终端是否已初始化和手动关闭标记
                    const stillManuallyClosedTabs = localStorage.getItem('manually_closed_tabs') === 'true';
                    if (stillManuallyClosedTabs) {
                        console.log('【WebSocket】检测到标签页是手动关闭的，取消重试连接');
                        return;
                    }

                    if (activeTab.terminalRef?.current && activeTab.xtermRef?.current) {
                        console.log('【WebSocket】终端已初始化，重新尝试创建连接');
                        if (typeof connectionId === 'number') {
                            createWebSocketConnection(activeTab, connectionId as number, undefined);
                        } else {
                            createSimpleConnection(activeTab, activeTab.sessionId);
                        }
                    } else {
                        console.error('【WebSocket】终端初始化超时，请手动刷新页面');
                    }
                }, 300);
            }
            return false;
        }

        // 创建真正的WebSocket连接
        return createSimpleConnection(activeTab, sessionId);
    }, [startHeartbeat]);

    /**
     * 简化版连接函数，用于重连
     */
    const createSimpleConnection = useCallback((
        activeTab: TerminalTab,
        sessId?: number
    ) => {
        if (!activeTab || !activeTab.xtermRef?.current) {
            console.error('创建简易连接失败：缺少必要参数');
            return null;
        }

        // 检查是否手动关闭过标签页
        const manuallyClosedTabs = localStorage.getItem('manually_closed_tabs') === 'true';
        if (manuallyClosedTabs) {
            console.log('【WebSocket】检测到标签页是手动关闭的，不创建简易WebSocket连接');
            return null;
        }

        const term = activeTab.xtermRef.current;
        const sessionId = sessId || activeTab.sessionId;

        if (!sessionId) {
            console.error('创建简易连接失败：无会话ID');
            term?.writeln('\r\n\x1b[31m创建简易连接失败：无会话ID\x1b[0m');
            return null;
        }

        try {
            // 构建WebSocket URL
            let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const token = localStorage.getItem('token') || '';

            // 获取后端配置
            const savedSettings = localStorage.getItem('terminal_settings');
            let backendUrl = window.location.hostname;
            let backendPort = 8080;

            if (savedSettings) {
                try {
                    const settings = JSON.parse(savedSettings);
                    backendUrl = settings.backendUrl || backendUrl;
                    backendPort = settings.backendPort || backendPort;
                } catch (e) {
                    console.error('读取终端设置失败:', e);
                }
            }

            const protocol = activeTab.connection?.protocol || 'ssh';
            let wsUrl = `${wsProtocol}//${backendUrl}:${backendPort}/ws/${protocol}/${sessionId}`;
            wsUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;

            console.log('创建简易WebSocket连接:', wsUrl);

            // 创建WebSocket
            const ws = new WebSocket(wsUrl);
            console.log('简易WebSocket实例创建成功，等待连接...');

            // 更新全局引用，便于调试和恢复
            if (typeof window !== 'undefined') {
                (window as any).lastWebSocket = ws;
                (window as any).lastWebSocketTime = new Date().toISOString();
                (window as any).lastActiveTab = activeTab;
            }

            // 连接事件处理
            ws.onopen = () => {
                // 显示欢迎标语
                term.writeln('\r\n\x1b[38;5;39m╔════════════════════════════════════════════════════════╗\x1b[0m');
                term.writeln('\x1b[38;5;39m║                                                        ║\x1b[0m');
                term.writeln('\x1b[38;5;39m║  \x1b[1;97m✨ 欢迎使用 Mini Web 远程终端连接系统 ✨\x1b[0;38;5;39m                ║\x1b[0m');
                term.writeln('\x1b[38;5;39m║  \x1b[92m🔒 安全 · 🚀 高效 · 💻 便捷的多协议远程连接平台\x1b[0;38;5;39m          ║\x1b[0m');
                term.writeln('\x1b[38;5;39m║  \x1b[95m⚡ 连接成功！开始畅享极速远程操作体验\x1b[0;38;5;39m                  ║\x1b[0m');
                term.writeln('\x1b[38;5;39m║                                                        ║\x1b[0m');
                term.writeln('\x1b[38;5;39m╚════════════════════════════════════════════════════════╝\x1b[0m');

                // 更新连接状态
                activeTab.webSocketRef.current = ws;
                activeTab.isConnected = true;
                setIsConnected(true);

                // 释放连接锁，允许其他操作
                if (activeTab.connectionId && activeTab.sessionId) {
                    const wsInProgressKey = `ws-in-progress-${activeTab.connectionId}-${activeTab.sessionId || 'nosession'}`;
                    delete (window as any)[wsInProgressKey];
                }

                // 启动心跳检测 - 使用更短的间隔确保连接活跃
                startHeartbeat(ws, activeTab, 15000);

                // 发送认证消息
                try {
                    if (!activeTab.connection) return;

                    const authMessage = JSON.stringify({
                        type: 'auth',
                        token: token,
                        connectionInfo: {
                            protocol: protocol,
                            host: activeTab.connection.host,
                            port: activeTab.connection.port,
                            username: activeTab.connection.username,
                            sessionId: sessionId
                        }
                    });

                    ws.send(authMessage);
                    term.writeln('\r\n\x1b[32m发送认证信息成功\x1b[0m');

                    // 发送初始命令
                    setTimeout(() => {
                        try {
                            ws.send('\r\n');
                        } catch (e) {
                            console.error('发送初始命令失败:', e);
                        }
                    }, 500);
                } catch (e) {
                    console.error('发送认证消息失败:', e);
                    term.writeln('\r\n\x1b[31m发送认证信息失败\x1b[0m');
                }

                // 设置WebSocket事件处理
                ws.onmessage = (event) => {
                    // 收到消息时更新最后活动时间
                    activeTab.lastActivityTime = Date.now();
                    handleWebSocketMessage(event, term);
                };
            };

            // 错误和关闭处理
            // 用于标记是否是编程方式关闭连接的标志
            let isProgrammaticClose = false;

            // 保存原始的close方法
            const originalClose = ws.close;

            // 重写WebSocket的close方法，添加标记
            ws.close = function (code?: number, reason?: string) {
                console.log('WebSocket主动关闭，设置编程方式关闭标志');
                isProgrammaticClose = true;
                return originalClose.call(this, code, reason);
            };

            ws.onclose = (event) => {
                activeTab.isConnected = false;
                setIsConnected(false);
                term.writeln('\r\n\x1b[31m简易WebSocket连接已关闭\x1b[0m');

                // 停止心跳检测
                if (heartbeatTimerRef.current !== null) {
                    clearInterval(heartbeatTimerRef.current);
                    heartbeatTimerRef.current = null;
                }

                // 如果是编程方式关闭，禁止重连
                if (isProgrammaticClose) {
                    console.log('WebSocket由程序主动关闭，不进行重连');
                    reconnectCountRef.current = 0;
                    connectionAttemptRef.current = false;
                    return;
                }

                // 检查标签是否已被手动关闭
                const manuallyClosedTabs = localStorage.getItem('manually_closed_tabs') === 'true';

                // 检查标签是否仍存在于状态中
                const tabStillExists = terminalStateRef.current && terminalStateRef.current.tabs?.some(t =>
                    t.key === activeTab.key &&
                    t.connectionId === activeTab.connectionId &&
                    t.sessionId === activeTab.sessionId
                ) || false;

                // 检查标签是否是当前活动标签
                const isActiveTabCurrent = terminalStateRef.current && terminalStateRef.current.activeTabKey === activeTab.key;

                // 用于确定是否需要重连的标志 - 增加了必须是当前活动标签的条件
                const shouldReconnect = !manuallyClosedTabs && tabStillExists &&
                    isActiveTabCurrent && connectionAttemptRef.current !== true;

                // 设置正在尝试连接的标志以防止重复连接
                connectionAttemptRef.current = true;

                // 记录标签状态
                console.log('WebSocket连接关闭，标签状态:', {
                    tabKey: activeTab.key,
                    manuallyClosedTabs,
                    tabStillExists,
                    isActiveTabCurrent,
                    shouldReconnect,
                    reconnectCount: reconnectCountRef.current,
                    closeCode: event.code,
                    closeReason: event.reason
                });

                // 添加重试逻辑，仅在标签没有被手动关闭并且仍然存在时重试
                if (shouldReconnect && reconnectCountRef.current < 3) {  // 减少重试次数
                    reconnectCountRef.current++;
                    term.writeln(`\r\n\x1b[33m尝试重新连接 (${reconnectCountRef.current}/3)...\x1b[0m`);

                    setTimeout(() => {
                        // 再次检查标签是否仍存在
                        const stillExistsBeforeRetry = terminalStateRef.current && terminalStateRef.current.tabs?.some(t =>
                            t.key === activeTab.key &&
                            t.connectionId === activeTab.connectionId &&
                            t.sessionId === activeTab.sessionId
                        ) || false;

                        // 再次检查标签是否已被手动关闭
                        const stillManuallyClosedTabs = localStorage.getItem('manually_closed_tabs') === 'true';

                        // 检查标签是否仍是当前活动标签
                        const isStillActiveTab = terminalStateRef.current && terminalStateRef.current.activeTabKey === activeTab.key;

                        if (stillExistsBeforeRetry && !stillManuallyClosedTabs && isStillActiveTab) {
                            // 重置连接尝试标志
                            connectionAttemptRef.current = false;
                            // 再次尝试连接
                            createSimpleConnection(activeTab, activeTab.sessionId);
                        } else {
                            console.log('标签已被关闭、不再活动或移除，取消重连', {
                                tabKey: activeTab.key,
                                stillExistsBeforeRetry,
                                stillManuallyClosedTabs,
                                isStillActiveTab
                            });
                            // 重置重连计数和连接尝试标志
                            reconnectCountRef.current = 0;
                            connectionAttemptRef.current = false;
                        }
                    }, 3000);  // 固定3秒后重试，避免过快重连
                } else {
                    if (!tabStillExists || manuallyClosedTabs) {
                        console.log('标签已关闭或不存在，不再尝试重连');
                    } else if (reconnectCountRef.current >= 3) {
                        term.writeln('\r\n\x1b[31m达到最大重试次数，请手动重新连接\x1b[0m');
                    }

                    // 重置重连计数和连接尝试标志
                    reconnectCountRef.current = 0;
                    connectionAttemptRef.current = false;
                }
            };

            ws.onerror = (error) => {
                console.error('简易WebSocket连接错误:', error);
                term.writeln('\r\n\x1b[31m简易WebSocket连接错误\x1b[0m');
            };

            return ws;
        } catch (e) {
            console.error('创建简易WebSocket连接失败:', e);
            term.writeln(`\r\n\x1b[31m创建简易WebSocket连接失败: ${e}\x1b[0m`);
            return null;
        }
    }, [startHeartbeat]);

    /**
     * 发送数据到服务器
     */
    const sendData = useCallback((
        activeTab: TerminalTab,
        data: string
    ) => {
        console.log('🚀 sendData被调用，准备发送数据:', {
            数据: data.length > 20 ? data.substring(0, 20) + '...' : data,
            数据长度: data.length,
            字符码: Array.from(data.substring(0, 5)).map(c => c.charCodeAt(0))
        });

        if (!activeTab || !activeTab.xtermRef?.current) {
            console.error('❌ 发送数据失败：终端实例不存在');
            return false;
        }

        const term = activeTab.xtermRef.current;

        if (!data) {
            console.warn('⚠️ 尝试发送空数据');
            return false;
        }

        // WebSocket状态检查
        if (!activeTab.webSocketRef?.current) {
            console.error('❌ 无法发送数据：WebSocket引用不存在');
            term.writeln('\r\n\x1b[31m无法发送数据：WebSocket未连接\x1b[0m');

            // 触发WebSocket错误事件，便于UI层捕获并提示用户
            window.dispatchEvent(new CustomEvent('websocket-error', {
                detail: {
                    tabKey: activeTab.key,
                    error: 'WebSocket引用不存在',
                    connectionId: activeTab.connectionId,
                    sessionId: activeTab.sessionId
                }
            }));

            return false;
        }

        // 显示WebSocket当前状态
        console.log('🔍 WebSocket当前状态:', {
            状态码: activeTab.webSocketRef.current.readyState,
            状态: getWebSocketStateText(activeTab.webSocketRef.current.readyState),
            连接ID: activeTab.connectionId,
            会话ID: activeTab.sessionId
        });

        if (activeTab.webSocketRef.current.readyState !== WebSocket.OPEN) {
            console.error(`❌ 无法发送数据：WebSocket未处于开启状态 (当前状态: ${activeTab.webSocketRef.current.readyState})`);
            term.writeln('\r\n\x1b[31m无法发送数据：WebSocket未处于开启状态\x1b[0m');
            term.writeln(`\r\n\x1b[33m当前状态: ${getWebSocketStateText(activeTab.webSocketRef.current.readyState)}\x1b[0m`);

            // 尝试保存sendDataToServer方法
            if (!activeTab.sendDataToServer) {
                console.log('🚀 保存sendDataToServer方法到标签对象，以便后续使用');
                activeTab.sendDataToServer = (newData: string): boolean => {
                    return !!sendData(activeTab, newData);
                };
            }

            return false;
        }

        try {
            // 修正回车键处理
            let processedData = data;

            // 对于回车键，确保发送\r\n
            if (data === '\r' || data === '\n') {
                processedData = '\r\n';
                console.log('🚀 检测到回车键，已修正为:\\r\\n');
            }
            // 对于其他字符串，如果以\r结尾但不是\r\n，则添加\n
            else if (data.endsWith('\r') && !data.endsWith('\r\n')) {
                processedData = data + '\n';
                console.log('🚀 检测到\\r结尾，已补充\\n');
            }

            // 记录活动时间
            activeTab.lastActivityTime = Date.now();

            // 查看WebSocket是否仍然连接
            if (activeTab.webSocketRef?.current?.readyState !== WebSocket.OPEN) {
                console.error('❌ WebSocket已断开，无法发送数据');
                return false;
            }

            // 确保存在连接信息
            if (!activeTab.connection) {
                console.warn('⚠️ 无法确定连接协议，默认使用SSH协议');

                // 打印发送数据详情
                console.log('🚀 准备直接发送数据 (无协议信息):', {
                    原始数据: data,
                    处理后数据: processedData,
                    处理后数据长度: processedData.length
                });

                // 发送数据
                activeTab.webSocketRef.current.send(processedData);
                console.log('✅ 数据已直接发送到WebSocket');

                // 如果需要本地回显数据，在这里添加
                if (activeTab.xtermRef?.current && !data.includes('\r') && !data.includes('\n')) {
                    activeTab.xtermRef.current.write(data);
                }

                // 确保保存sendDataToServer方法到标签对象
                if (!activeTab.sendDataToServer) {
                    activeTab.sendDataToServer = (newData: string): boolean => {
                        return !!sendData(activeTab, newData);
                    };
                }

                return true;
            }

            // 检查是否需要包装为JSON格式
            if (activeTab.connection.protocol === 'ssh' || activeTab.connection.protocol === 'telnet') {
                // SSH/Telnet协议直接发送数据
                console.log(`🚀 准备发送数据到${activeTab.connection.protocol}连接:`, {
                    原始数据: data,
                    处理后数据: processedData
                });

                activeTab.webSocketRef.current.send(processedData);
                console.log('✅ 数据已发送到SSH/Telnet连接');
            } else {
                // 其他协议尝试包装为JSON格式
                console.log('🚀 准备以JSON格式包装数据');

                const jsonData = JSON.stringify({
                    type: 'data',
                    data: processedData
                });

                console.log('🚀 包装后的JSON数据:', jsonData);
                activeTab.webSocketRef.current.send(jsonData);
                console.log('✅ JSON格式数据已发送');

                // 备份机制：如果JSON格式发送后没有响应，尝试直接发送
                setTimeout(() => {
                    if (activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
                        console.log('🚀 备份：准备直接发送数据');
                        activeTab.webSocketRef.current.send(processedData);
                        console.log('✅ 备份：数据已直接发送');
                    } else {
                        console.error('❌ 备份发送失败：WebSocket已关闭');
                    }
                }, 100);
            }

            // 为特定类型的数据，如命令输入，额外发送一次回车
            if (data.includes('\r') || data.includes('\n')) {
                setTimeout(() => {
                    if (activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
                        console.log('🚀 发送额外的回车增强响应性');
                        activeTab.webSocketRef.current.send('\r\n');
                        console.log('✅ 额外回车已发送');
                    }
                }, 300);
            }

            // 确保保存sendDataToServer方法到标签对象
            if (!activeTab.sendDataToServer) {
                activeTab.sendDataToServer = (newData: string): boolean => {
                    return !!sendData(activeTab, newData);
                };
            }

            console.log('✅ 数据发送成功');
            return true;
        } catch (error) {
            console.error('❌ 发送数据失败:', error);
            term.writeln(`\r\n\x1b[31m发送数据失败: ${error}\x1b[0m`);
            return false;
        }
    }, []);

    /**
     * 注册全局辅助函数，便于调试
     */
    const registerGlobalHelpers = useCallback((activeTab: TerminalTab) => {
        if (typeof window === 'undefined') return;

        // 导出当前活动标签页
        (window as any).currentActiveTab = activeTab;

        // 添加手动连接函数
        (window as any).manualConnect = () => {
            if (!activeTab || !activeTab.xtermRef?.current) {
                console.error('手动连接失败：缺少必要参数');
                return null;
            }

            const term = activeTab.xtermRef.current;
            term.writeln('\r\n\x1b[33m手动触发连接...\x1b[0m');

            // 创建连接
            return createSimpleConnection(activeTab);
        };

        // 导出快速连接函数
        (window as any).quickConnect = (sessionId: number) => {
            console.log('快速连接函数被调用，会话ID:', sessionId);

            if (!activeTab || !activeTab.xtermRef?.current) {
                console.error('快速连接失败：缺少必要参数');
                return null;
            }

            return createSimpleConnection(activeTab, sessionId);
        };

        // 导出createSimpleConnection函数到window对象，便于在导航后直接使用
        (window as any).createSimpleConnectionGlobal = (tab: TerminalTab) => {
            console.log('全局创建简易连接函数被调用:', {
                tabKey: tab.key,
                sessionId: tab.sessionId,
                hasXterm: !!tab.xtermRef?.current
            });

            if (!tab.xtermRef?.current) {
                console.error('创建简易连接失败：缺少xterm引用');
                return null;
            }

            return createSimpleConnection(tab);
        };

        // 添加全局重连函数
        (window as any).globalReconnect = function (tabKey?: string) {
            console.log('【连接流程】执行全局重连函数:', {tabKey});

            // 如果提供了标签Key，找到对应标签
            if (tabKey && terminalStateRef.current) {
                // 使用类型断言，确保tabs数组中的元素被识别为TerminalTab类型
                const tabs = terminalStateRef.current.tabs as TerminalTab[] || [];
                const tab = tabs.find(t => t.key === tabKey);
                if (tab) {
                    console.log('【连接流程】找到指定标签，尝试重连');
                    return createSimpleConnection(tab);
                }
            }

            // 否则尝试找到活动标签
            if (terminalStateRef.current && terminalStateRef.current.activeTabKey) {
                // 使用类型断言，确保tabs数组中的元素被识别为TerminalTab类型
                const tabs = terminalStateRef.current.tabs as TerminalTab[] || [];
                const activeTab = tabs.find(
                    t => t.key === terminalStateRef.current?.activeTabKey
                );

                if (activeTab) {
                    console.log('【连接流程】找到活动标签，尝试重连');
                    return createSimpleConnection(activeTab);
                }
            }

            // 如果没有找到标签，尝试从localStorage恢复
            console.log('【连接流程】没有找到标签，尝试从localStorage恢复');
            return quickReconnect();
        };

        // 添加连接恢复函数，用于处理URL清理或导航后的连接恢复
        (window as any).reconnectAfterNavigation = () => {
            const needsReconnect = (window as any).needsReconnect;
            const preservedTabKey = (window as any).preservedTabKey;

            console.log('【连接流程】检查是否需要恢复连接:', {needsReconnect, preservedTabKey});

            if (needsReconnect && preservedTabKey) {
                console.log('【连接流程】尝试恢复导航后的连接:', {
                    preservedTabKey,
                    tabCount: terminalStateRef.current?.tabs?.length || 0
                });

                // 类型断言确保tabs是TerminalTab[]类型
                const tabs = terminalStateRef.current?.tabs as TerminalTab[] || [];

                // 查找保存的标签
                const tab = tabs.find(t => t.key === preservedTabKey);

                if (tab) {
                    console.log('【连接流程】找到保存的标签，尝试恢复连接', {
                        tabKey: tab.key,
                        hasXtermRef: !!tab.xtermRef?.current,
                        sessionId: tab.sessionId
                    });

                    // 清除恢复标记，避免重复恢复
                    (window as any).needsReconnect = false;

                    // 等待一下确保DOM已更新
                    setTimeout(() => {
                        if (tab.xtermRef?.current) {
                            console.log('【连接流程】DOM准备就绪，执行连接恢复');
                            return createSimpleConnection(tab);
                        } else {
                            console.log('【连接流程】标签页DOM未就绪，再次尝试');
                            // 再次尝试，延长等待时间
                            setTimeout(() => {
                                if (tab.xtermRef?.current) {
                                    console.log('【连接流程】第二次尝试DOM已就绪，执行连接');
                                    return createSimpleConnection(tab);
                                } else {
                                    console.log('【连接流程】DOM仍未就绪，尝试使用保存的会话信息');

                                    // 尝试从localStorage恢复会话信息
                                    const savedSession = localStorage.getItem('terminal_last_session');
                                    if (savedSession && terminalStateRef.current && terminalStateRef.current.tabs && terminalStateRef.current.tabs.length > 0) {
                                        try {
                                            const sessionInfo = JSON.parse(savedSession);
                                            if (sessionInfo.sessionId && sessionInfo.connectionId) {
                                                console.log('【连接流程】使用已保存的会话信息恢复连接', sessionInfo);
                                                // 如果标签有xterm但没有创建连接，尝试使用会话ID创建连接
                                                if (tab.xtermRef?.current) {
                                                    return createSimpleConnection(tab, sessionInfo.sessionId);
                                                }
                                            }
                                        } catch (e) {
                                            console.error('解析保存的会话信息失败:', e);
                                        }
                                    }
                                }
                            }, 500);
                        }
                    }, 300);
                } else {
                    console.log('【连接流程】未找到对应标签页，尝试使用最后一个活动标签');
                    // 尝试使用上一个保存的标签信息
                    const lastTab = (window as any).lastActiveTab as TerminalTab | undefined;
                    if (lastTab && lastTab.xtermRef?.current) {
                        console.log('【连接流程】使用最后保存的标签信息尝试恢复', {
                            tabKey: lastTab.key,
                            sessionId: lastTab.sessionId
                        });
                        return createSimpleConnection(lastTab);
                    } else {
                        console.log('【连接流程】没有可用的标签页，尝试从localStorage恢复会话');
                        // 尝试从localStorage恢复会话信息
                        const savedSession = localStorage.getItem('terminal_last_session');
                        if (savedSession && terminalStateRef.current && terminalStateRef.current.tabs && terminalStateRef.current.tabs.length > 0) {
                            try {
                                const sessionInfo = JSON.parse(savedSession);
                                // 使用类型断言确保安全访问
                                const firstTab = (terminalStateRef.current.tabs as TerminalTab[])[0];
                                if (sessionInfo.sessionId && firstTab.xtermRef?.current) {
                                    console.log('【连接流程】使用第一个标签和保存的会话ID尝试恢复', {
                                        tabKey: firstTab.key,
                                        sessionId: sessionInfo.sessionId
                                    });
                                    return createSimpleConnection(firstTab, sessionInfo.sessionId);
                                }
                            } catch (e) {
                                console.error('尝试从localStorage恢复失败:', e);
                            }
                        }
                    }
                }
            } else {
                // 即使没有明确的重连标记，也检查是否可以从localStorage恢复
                const savedSession = localStorage.getItem('terminal_last_session');
                if (savedSession && terminalStateRef.current && terminalStateRef.current.tabs && terminalStateRef.current.tabs.length > 0) {
                    try {
                        const sessionInfo = JSON.parse(savedSession);
                        console.log('【连接流程】检测到保存的会话信息，尝试恢复:', sessionInfo);

                        // 安全地获取tabs数组
                        const tabs = terminalStateRef.current.tabs as TerminalTab[] || [];

                        // 找到第一个有效的标签页
                        const availableTab = tabs.find(t => t.xtermRef?.current);

                        if (availableTab && sessionInfo.sessionId) {
                            console.log('【连接流程】找到可用标签页，尝试使用保存的会话ID连接', {
                                tabKey: availableTab.key,
                                sessionId: sessionInfo.sessionId
                            });
                            return createSimpleConnection(availableTab, sessionInfo.sessionId);
                        }
                    } catch (e) {
                        console.error('解析保存的会话信息失败:', e);
                    }
                } else {
                    console.log('【连接流程】无需恢复连接或缺少必要参数', {needsReconnect, preservedTabKey});
                }
            }

            return null;
        };
    }, [createSimpleConnection]);

    // 快速重连函数
    const quickReconnect = useCallback((savedSessionId?: number) => {
        console.log('【连接流程】执行快速重连操作');

        try {
            // 从本地存储中获取会话信息
            const savedSessionInfo = localStorage.getItem('terminal_last_session');
            if (savedSessionInfo) {
                const sessionInfo = JSON.parse(savedSessionInfo);
                console.log('【连接流程】找到保存的会话信息:', sessionInfo);

                // 使用会话ID参数或从会话信息中获取
                const sessionId = savedSessionId || sessionInfo.sessionId;
                if (!sessionId) {
                    console.warn('【连接流程】未提供会话ID且会话信息中无ID，无法重连');
                    return false;
                }

                // 检查全局重连函数
                if (typeof window !== 'undefined') {
                    // 优先使用新添加的全局重连函数
                    if ((window as any).reconnectTerminal) {
                        console.log('【连接流程】使用全局重连函数reconnectTerminal');
                        (window as any).reconnectTerminal();
                        return true;
                    }

                    // 尝试使用旧的重连函数（兼容性）
                    if ((window as any).attemptGlobalRecovery) {
                        console.log('【连接流程】使用全局恢复函数attemptGlobalRecovery');
                        (window as any).attemptGlobalRecovery();
                        return true;
                    }
                }

                console.warn('【连接流程】重连函数未定义，尝试创建新连接');

                // 如果无法重连，可以尝试创建新连接
                if (sessionInfo.connectionId) {
                    console.log('【连接流程】尝试使用保存的连接ID创建新连接:', sessionInfo.connectionId);
                    // 可以在这里添加代码创建新连接
                    return true;
                }
            } else {
                console.warn('【连接流程】未找到保存的会话信息，无法重连');
            }
        } catch (error) {
            console.error('【连接流程】重连操作失败:', error);
        }

        return false;
    }, []);

    return {
        isConnected,
        setIsConnected,
        reconnectCountRef,
        connectionAttemptRef,
        startHeartbeat,  // 导出心跳函数
        createWebSocketConnection,
        createSimpleConnection,
        createConnectionHelp,
        createRetryInterface,
        sendData,
        registerGlobalHelpers,
        quickReconnect
    };
};

/**
 * 全局快速重连函数，用于在URL清理后立即恢复连接
 * 这个函数会被导出到window对象，便于在任何地方调用
 */
export const quickReconnect = () => {
    if (typeof window === 'undefined') return;

    console.log('【连接流程】执行快速重连操作');

    // 1. 尝试从localStorage获取最后的会话信息
    const savedSession = localStorage.getItem('terminal_last_session');
    if (!savedSession) {
        console.log('【连接流程】无法重连：没有找到保存的会话信息');
        return;
    }

    try {
        const sessionInfo = JSON.parse(savedSession);
        console.log('【连接流程】找到保存的会话信息:', sessionInfo);

        if (!sessionInfo.sessionId || !sessionInfo.tabKey) {
            console.log('【连接流程】会话信息不完整，无法重连');
            return;
        }

        // 2. 设置重连标记和保存的标签key
        (window as any).needsReconnect = true;
        (window as any).preservedTabKey = sessionInfo.tabKey;

        // 3. 直接调用重连函数
        if (typeof (window as any).reconnectAfterNavigation === 'function') {
            console.log('【连接流程】调用重连函数');
            (window as any).reconnectAfterNavigation();
        } else {
            console.log('【连接流程】重连函数未定义，无法执行');
        }
    } catch (e) {
        console.error('【连接流程】解析会话信息失败:', e);
    }
};

// 导出到window对象便于全局调用
if (typeof window !== 'undefined') {
    (window as any).quickReconnect = quickReconnect;

    // 添加一个辅助函数，用于确保在标签关闭后WebSocket不会重连
    (window as any).markTabsAsClosed = () => {
        // 设置手动关闭标记
        localStorage.setItem('manually_closed_tabs', 'true');
        console.log('【WebSocket】标记所有标签为已手动关闭');
    };
}

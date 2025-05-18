import React, { useEffect } from 'react';
import type { FC, PropsWithChildren } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';

interface TerminalEventManagerProps {
    tabs: TerminalTab[];
    activeTabKey: string;
    setActiveTab: (key: string) => void;
    createWebSocketConnection?: (connectionId: number, sessionId: number, tabKey: string) => void;
    initTerminal?: (tab: TerminalTab, dataHandler: (data: string) => void) => boolean;
}

/**
 * 终端事件管理组件
 * 负责监听和处理所有与终端相关的事件
 * 这是一个无UI的组件，专注于事件逻辑处理
 */
const TerminalEventManager: FC<PropsWithChildren<TerminalEventManagerProps>> = ({
    children,
    tabs,
    activeTabKey,
    setActiveTab,
    createWebSocketConnection,
    initTerminal
}) => {
    // 处理标签激活事件
    useEffect(() => {
        const handleTabActivated = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { tabKey, isNewTab } = customEvent.detail;
            if (tabKey && tabKey !== activeTabKey) {
                setActiveTab(tabKey);
            }
        };

        window.addEventListener('terminal-tab-activated', handleTabActivated);
        return () => {
            window.removeEventListener('terminal-tab-activated', handleTabActivated);
        };
    }, [activeTabKey, setActiveTab]);

    // 监听WebSocket连接需求事件
    useEffect(() => {
        const handleConnectionNeeded = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { tabKey, connectionId, sessionId } = customEvent.detail;

            console.log(`收到WebSocket连接请求: tabKey=${tabKey}, connectionId=${connectionId}, sessionId=${sessionId}`);

            if (!tabKey || !connectionId || !sessionId) {
                console.error('WebSocket连接请求缺少必要参数');
                return;
            }

            // 确保createWebSocketConnection函数可用
            if (typeof createWebSocketConnection === 'function') {
                // 尝试创建WebSocket连接
                console.log(`尝试创建WebSocket连接: connectionId=${connectionId}, sessionId=${sessionId}, tabKey=${tabKey}`);
                createWebSocketConnection(connectionId, sessionId, tabKey);
            } else {
                console.error('createWebSocketConnection函数未定义，无法创建WebSocket连接');
            }
        };

        window.addEventListener('terminal-connection-needed', handleConnectionNeeded);
        return () => {
            window.removeEventListener('terminal-connection-needed', handleConnectionNeeded);
        };
    }, [createWebSocketConnection]);

    // 监听终端初始化重试事件
    useEffect(() => {
        const handleInitRetry = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { tabKey } = customEvent.detail;

            if (!tabKey) return;

            // 查找对应标签
            const tab = tabs.find(t => t.key === tabKey);
            if (!tab) {
                console.error(`初始化重试：找不到标签 ${tabKey}`);
                return;
            }

            // 检查WebSocket连接状态
            if (tab.webSocketRef?.current &&
                (tab.webSocketRef.current.readyState === WebSocket.OPEN ||
                    tab.webSocketRef.current.readyState === WebSocket.CONNECTING)) {

                console.log(`WebSocket连接状态正常，尝试初始化终端: ${tabKey}`);

                // 创建数据处理器函数
                const dataHandler = (data: string) => {
                    if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                        try {
                            console.log(`正在发送数据到WebSocket: ${data.length > 20 ? data.substring(0, 20) + '...' : data}`);
                            tab.webSocketRef.current.send(data);
                            return true;
                        } catch (error) {
                            console.error('发送数据到WebSocket失败:', error);
                            return false;
                        }
                    } else {
                        console.warn('WebSocket未连接，无法发送数据');
                        return false;
                    }
                };

                // 初始化终端
                if (initTerminal) {
                    const success = initTerminal(tab, dataHandler);
                    console.log(`终端重试初始化结果: ${success ? '成功' : '失败'}`);
                }
            } else {
                console.warn(`WebSocket连接未就绪，再次尝试建立连接: ${tabKey}`);
                // 确保连接ID和会话ID可用
                if (tab.connectionId && tab.sessionId && typeof createWebSocketConnection === 'function') {
                    createWebSocketConnection(tab.connectionId, tab.sessionId, tab.key);

                    // 再次延迟重试初始化
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('terminal-init-retry', {
                            detail: { tabKey }
                        }));
                    }, 1500);
                }
            }
        };

        window.addEventListener('terminal-init-retry', handleInitRetry);
        return () => {
            window.removeEventListener('terminal-init-retry', handleInitRetry);
        };
    }, [tabs, initTerminal, createWebSocketConnection]);

    // 监听终端准备就绪事件
    useEffect(() => {
        const handleTerminalReady = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { tabKey, connectionId, sessionId, protocol } = customEvent.detail;
            console.log(`终端准备就绪事件触发: tabKey=${tabKey}, connectionId=${connectionId}, sessionId=${sessionId}, protocol=${protocol}`);

            // 查找对应的标签
            const tab = tabs.find(t => t.key === tabKey);
            if (!tab) {
                console.error(`找不到标签: ${tabKey}`);
                return;
            }

            // 确保tab对象有必要的属性
            if (!tab.connectionId && connectionId) {
                tab.connectionId = typeof connectionId === 'string' ? parseInt(connectionId, 10) : connectionId;
            }
            if (!tab.sessionId && sessionId) {
                tab.sessionId = typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId;
            }
            if (!tab.protocol && protocol) {
                tab.protocol = protocol;
            }

            // 检查是否已有活跃的WebSocket连接
            if (tab.webSocketRef?.current &&
                (tab.webSocketRef.current.readyState === WebSocket.CONNECTING ||
                    tab.webSocketRef.current.readyState === WebSocket.OPEN)) {
                console.log(`标签 ${tabKey} 已有活跃WebSocket连接，跳过WebSocket创建，直接初始化终端`);

                // 直接初始化终端
                if (initTerminal) {
                    // 创建数据处理器函数
                    const dataHandler = (data: string) => {
                        if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                            try {
                                console.log(`正在发送数据到WebSocket: ${data.length > 20 ? data.substring(0, 20) + '...' : data}`);
                                tab.webSocketRef.current.send(data);
                                return true;
                            } catch (error) {
                                console.error('发送数据到WebSocket失败:', error);
                                return false;
                            }
                        } else {
                            console.warn('WebSocket未连接，无法发送数据');
                            return false;
                        }
                    };

                    // 初始化终端
                    const terminalInitialized = initTerminal(tab, dataHandler);
                    console.log(`终端初始化完成: ${terminalInitialized}`);

                    if (tab.xtermRef?.current) {
                        // 添加欢迎消息
                        tab.xtermRef.current.writeln('\r\n\x1b[32mSSH连接已建立成功!\x1b[0m');
                        tab.xtermRef.current.writeln('\r\n输入命令开始操作...\r\n');
                    }
                }
                return;
            }

            // 首先创建WebSocket连接，确保连接成功后再初始化终端
            const connId = tab.connectionId || (connectionId ? (typeof connectionId === 'string' ? parseInt(connectionId, 10) : connectionId) : 0);
            const sessId = tab.sessionId || (sessionId ? (typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId) : 0);

            if (connId && sessId && typeof createWebSocketConnection === 'function') {
                console.log(`开始创建WebSocket连接: connId=${connId}, sessId=${sessId}, tabKey=${tabKey}`);

                createWebSocketConnection(connId, sessId, tabKey);

                // 检查WebSocket连接状态
                setTimeout(() => {
                    // 确认WebSocket连接建立后再初始化终端
                    if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                        console.log(`WebSocket连接已建立, 现在初始化终端实例: ${tabKey}`);

                        // 创建数据处理器函数
                        const dataHandler = (data: string) => {
                            if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                                try {
                                    console.log(`正在发送数据到WebSocket: ${data.length > 20 ? data.substring(0, 20) + '...' : data}`);
                                    tab.webSocketRef.current.send(data);
                                    return true;
                                } catch (error) {
                                    console.error('发送数据到WebSocket失败:', error);
                                    return false;
                                }
                            } else {
                                console.warn('WebSocket未连接，无法发送数据');
                                return false;
                            }
                        };

                        // 初始化终端
                        if (initTerminal) {
                            const terminalInitialized = initTerminal(tab, dataHandler);
                            console.log(`终端初始化完成: ${terminalInitialized}`);

                            if (tab.xtermRef?.current) {
                                // 添加欢迎消息
                                tab.xtermRef.current.writeln('\r\n\x1b[32mSSH连接已建立成功!\x1b[0m');
                                tab.xtermRef.current.writeln('\r\n输入命令开始操作...\r\n');
                            }
                        } else {
                            console.error('初始化终端函数不存在');
                        }
                    } else {
                        console.error(`WebSocket连接未建立: ${tab.webSocketRef?.current?.readyState}`);
                        // 尝试重新连接
                        createWebSocketConnection(connId, sessId, tabKey);

                        // 延迟重试终端初始化
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('terminal-init-retry', {
                                detail: { tabKey }
                            }));
                        }, 1500);
                    }
                }, 1000); // 给WebSocket足够的时间建立连接
            } else {
                console.error('无法创建WebSocket连接: connId=', connId, 'sessId=', sessId, 'createWebSocketConnection=', !!createWebSocketConnection);
            }
        };

        window.addEventListener('terminal-ready', handleTerminalReady);
        return () => {
            window.removeEventListener('terminal-ready', handleTerminalReady);
        };
    }, [tabs, createWebSocketConnection, initTerminal]);

    // 标签关闭事件处理
    useEffect(() => {
        const handleTabClose = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { tabKey } = customEvent.detail;
            // 这里不直接处理关闭逻辑，而是触发一个标准DOM事件
            // 这样可以让主组件决定如何处理关闭操作
            const closeEvent = new CustomEvent('terminal-tab-close-request', {
                detail: { tabKey }
            });
            window.dispatchEvent(closeEvent);
        };

        window.addEventListener('terminal-tab-close', handleTabClose);
        return () => {
            window.removeEventListener('terminal-tab-close', handleTabClose);
        };
    }, []);

    // 返回子组件
    return <>{children}</>;
};

export default TerminalEventManager;

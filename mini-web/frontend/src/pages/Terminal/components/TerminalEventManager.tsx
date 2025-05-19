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
            const { tabKey, connectionId, sessionId, protocol, terminalInstance, containerElement } = customEvent.detail;

            console.log(`终端准备就绪事件触发: tabKey=${tabKey}, connectionId=${connectionId}, sessionId=${sessionId}, protocol=${protocol}`);

            // 处理从initTerminal.ts直接触发的事件，可能包含terminalInstance和containerElement
            if (!tabKey && terminalInstance && containerElement && containerElement.id) {
                console.log('从initTerminal.ts接收到的终端就绪事件，尝试从容器ID提取信息');

                // 从容器ID提取信息
                const idMatch = containerElement.id.match(/terminal-element-conn-(\d+)-session-(\d+)/);
                if (idMatch && idMatch.length >= 3) {
                    const extractedConnId = parseInt(idMatch[1], 10);
                    const extractedSessId = parseInt(idMatch[2], 10);
                    const extractedTabKey = `conn-${extractedConnId}-${extractedSessId}-${Date.now()}`;

                    console.log(`从容器ID提取的信息: connId=${extractedConnId}, sessId=${extractedSessId}, tabKey=${extractedTabKey}`);

                    // 查找匹配的标签
                    const matchedTab = tabs.find(t =>
                        (t.connectionId === extractedConnId && t.sessionId === extractedSessId) ||
                        (t.key && t.key.startsWith(`conn-${extractedConnId}-${extractedSessId}`))
                    );

                    if (matchedTab) {
                        console.log(`找到匹配的标签: ${matchedTab.key}`);
                        // 继续使用匹配的标签处理事件
                        handleTerminalReadyWithTab(matchedTab, extractedConnId, extractedSessId, 'ssh', terminalInstance);
                        return;
                    } else {
                        console.error(`无法找到匹配的标签，connectionId=${extractedConnId}, sessionId=${extractedSessId}`);
                    }
                } else {
                    console.error(`无法从容器ID提取连接信息: ${containerElement.id}`);
                }
                return;
            }

            // 查找对应的标签
            let tab = tabs.find(t => t.key === tabKey);

            // 如果找不到完全匹配的标签，尝试通过connectionId和sessionId查找
            if (!tab && connectionId && sessionId) {
                console.log(`未找到完全匹配的标签 ${tabKey}，尝试通过connectionId和sessionId查找`);

                // 尝试找到connectionId和sessionId都匹配的标签
                tab = tabs.find(t =>
                    t.connectionId === connectionId &&
                    t.sessionId === sessionId
                );

                // 如果还没找到，尝试找到以conn-{connectionId}-{sessionId}开头的标签
                if (!tab) {
                    const tabPrefix = `conn-${connectionId}-${sessionId}`;
                    tab = tabs.find(t => t.key && t.key.startsWith(tabPrefix));

                    if (tab) {
                        console.log(`找到前缀匹配的标签: ${tab.key}，原始tabKey: ${tabKey}`);
                    }
                } else {
                    console.log(`找到连接ID和会话ID匹配的标签: ${tab.key}，原始tabKey: ${tabKey}`);
                }
            }

            if (!tab) {
                console.error(`找不到标签: ${tabKey}`);
                return;
            }

            // 使用提取的参数处理事件
            handleTerminalReadyWithTab(
                tab,
                connectionId ? (typeof connectionId === 'string' ? parseInt(connectionId, 10) : connectionId) : tab.connectionId,
                sessionId ? (typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId) : tab.sessionId,
                protocol || tab.protocol || 'ssh',
                terminalInstance
            );
        };

        // 辅助函数：使用标签和参数处理终端就绪事件
        const handleTerminalReadyWithTab = (
            tab: TerminalTab,
            connId: number,
            sessId: number,
            proto: string,
            termInstance?: any
        ) => {
            // 确保tab对象有必要的属性
            if (!tab.connectionId && connId) {
                tab.connectionId = connId;
            }
            if (!tab.sessionId && sessId) {
                tab.sessionId = sessId;
            }
            if (!tab.protocol && proto) {
                tab.protocol = proto;
            }

            // 检查是否已有活跃的WebSocket连接
            if (tab.webSocketRef?.current &&
                (tab.webSocketRef.current.readyState === WebSocket.CONNECTING ||
                    tab.webSocketRef.current.readyState === WebSocket.OPEN)) {
                console.log(`标签 ${tab.key} 已有活跃WebSocket连接，跳过WebSocket创建，直接初始化终端`);

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
                }
                return;
            }

            // 首先创建WebSocket连接，确保连接成功后再初始化终端
            const finalConnId = tab.connectionId || connId || 0;
            const finalSessId = tab.sessionId || sessId || 0;

            if (finalConnId && finalSessId && typeof createWebSocketConnection === 'function') {
                console.log(`开始创建WebSocket连接: connId=${finalConnId}, sessId=${finalSessId}, tabKey=${tab.key}`);

                createWebSocketConnection(finalConnId, finalSessId, tab.key);

                // 检查WebSocket连接状态
                setTimeout(() => {
                    // 确认WebSocket连接建立后再初始化终端
                    if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                        console.log(`WebSocket连接已建立, 现在初始化终端实例: ${tab.key}`);

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
                        } else {
                            console.error('初始化终端函数不存在');
                        }
                    } else {
                        console.error(`WebSocket连接未建立: ${tab.webSocketRef?.current?.readyState}`);
                        // 尝试重新连接
                        createWebSocketConnection(finalConnId, finalSessId, tab.key);

                        // 延迟重试终端初始化
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('terminal-init-retry', {
                                detail: { tabKey: tab.key }
                            }));
                        }, 1500);
                    }
                }, 1000); // 给WebSocket足够的时间建立连接
            } else {
                console.error('无法创建WebSocket连接: connId=', finalConnId, 'sessId=', finalSessId, 'createWebSocketConnection=', !!createWebSocketConnection);
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

    // 处理终端大小调整事件
    useEffect(() => {
        const handleTerminalSizeChanged = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { cols, rows, tabKey, connectionId, sessionId } = customEvent.detail;

            console.log(`终端大小调整事件: cols=${cols}, rows=${rows}, tabKey=${tabKey}`);

            // 查找对应的标签
            let tab = tabs.find(t => t.key === tabKey);

            // 如果找不到完全匹配的标签，尝试通过connectionId和sessionId查找
            if (!tab && connectionId && sessionId) {
                console.log(`大小调整: 未找到完全匹配的标签 ${tabKey}，尝试通过connectionId和sessionId查找`);

                // 尝试找到connectionId和sessionId都匹配的标签
                tab = tabs.find(t =>
                    t.connectionId === connectionId &&
                    t.sessionId === sessionId
                );

                // 如果还没找到，尝试找到以conn-{connectionId}-{sessionId}开头的标签
                if (!tab) {
                    const tabPrefix = `conn-${connectionId}-${sessionId}`;
                    tab = tabs.find(t => t.key && t.key.startsWith(tabPrefix));

                    if (tab) {
                        console.log(`大小调整: 找到前缀匹配的标签: ${tab.key}，原始tabKey: ${tabKey}`);
                    }
                } else {
                    console.log(`大小调整: 找到连接ID和会话ID匹配的标签: ${tab.key}，原始tabKey: ${tabKey}`);
                }
            }

            if (!tab) {
                console.error(`大小调整: 找不到标签: ${tabKey}`);
                return;
            }

            // 如果标签存在WebSocket连接，发送大小调整命令
            if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                try {
                    // 假设后端期望一个特定格式的大小调整消息
                    const resizeMessage = JSON.stringify({
                        type: 'resize',
                        cols: cols,
                        rows: rows
                    });

                    tab.webSocketRef.current.send(resizeMessage);
                    console.log(`大小调整命令已发送: ${resizeMessage}`);
                } catch (error) {
                    console.error('发送大小调整命令失败:', error);
                }
            } else {
                console.warn(`大小调整: WebSocket未连接，无法发送大小调整命令: ${tabKey}`);
            }
        };

        window.addEventListener('terminal-size-changed', handleTerminalSizeChanged);
        return () => {
            window.removeEventListener('terminal-size-changed', handleTerminalSizeChanged);
        };
    }, [tabs]);

    // 返回子组件
    return <>{children}</>;
};

export default TerminalEventManager;

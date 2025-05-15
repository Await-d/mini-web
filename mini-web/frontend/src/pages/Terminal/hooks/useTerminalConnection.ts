import React, { useState, useCallback, useEffect, useRef, useMemo, createRef } from 'react';
import type { RefObject } from 'react';
import { message } from 'antd';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { connectionAPI, sessionAPI } from '../../../services/api';
import type { Connection } from '../../../services/api';
import { useTerminal } from '../../../contexts/TerminalContext';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { WindowSize, TerminalMessage } from '../utils/terminalConfig';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';

// 导入拆分出的子Hook
import { useTerminalInitialization } from './useTerminalInitialization';
import { useWebSocketManager, quickReconnect } from './useWebSocketManager';
import { useTerminalData } from './useTerminalData';
import { useTerminalUI } from './useTerminalUI';

// 确保terminalStateRef.current.tabs被推断为TerminalTab[]类型
declare module '../../../contexts/TerminalContext' {
    interface TerminalState {
        tabs: TerminalTab[];
        activeTabKey: string;
    }
}

// 存储重试定时器的引用
const retryTimersRef = { current: [] as ReturnType<typeof setTimeout>[] };

/**
 * 清除所有终端重试定时器
 */
const clearRetryTimers = () => {
    if (retryTimersRef.current.length > 0) {
        retryTimersRef.current.forEach(timerId => {
            clearTimeout(timerId);
        });
        retryTimersRef.current = [];
    }
};

/**
 * 全局清除函数，可以从控制台调用
 */
if (typeof window !== 'undefined') {
    (window as any).clearTerminalRetries = clearRetryTimers;
}

// 跟踪已初始化的标签页
const initializedTabs = new Set<string>();

/**
 * 保存会话信息到localStorage
 */
const saveSessionInfo = (connectionId: number, sessionId?: number) => {
    if (!connectionId) return;

    try {
        const sessionInfo = {
            connectionId,
            sessionId: sessionId || null,
            timestamp: Date.now()
        };

        localStorage.setItem('session_info', JSON.stringify(sessionInfo));
    } catch (error) {
        console.error(`保存会话信息失败:`, error);
    }
};

// 创建isLoadingRef
const isLoadingRef = { current: false }; // 使用对象模拟ref以避免重复渲染

/**
 * 格式化创建标签的数据
 */
const formatTabData = (connection: any, sessionId?: number): TerminalTab => {
    const protocol = connection.protocol || 'SSH';
    const hostname = connection.host || 'localhost';
    const port = connection.port || 22;
    const username = connection.username || 'root';

    return {
        key: `tab-${connection.id}-${sessionId || 'nosession'}-${Date.now()}`,
        title: connection.name || `${hostname}:${port}`,
        icon: null,
        status: 'connecting',
        connectionId: connection.id,
        sessionId: sessionId,
        connection: connection,
        isConnected: false,
        terminalRef: createRef<HTMLDivElement>(),
        xtermRef: createRef<Terminal>(),
        webSocketRef: createRef<WebSocket>(),
        fitAddonRef: createRef<FitAddon>(),
        searchAddonRef: createRef<SearchAddon>(),
        messageQueueRef: createRef<string[]>(),
        protocol,
        hostname,
        port,
        username
    };
};

/**
 * 终端连接的主Hook，整合各子Hook的功能
 */
export const useTerminalConnection = () => {
    const { connectionId } = useParams<{ connectionId: string }>();
    const [searchParams] = useSearchParams();
    const sessionParam = searchParams.get('session');
    const navigate = useNavigate();

    // 使用终端上下文
    const { state, addTab, closeTab, setActiveTab, updateTab } = useTerminal();
    const { tabs, activeTabKey } = state;

    // 使用拆分的终端初始化Hook
    const {
        initializeTerminal,
        attachTerminalFocusHandlers,
        resizeTerminal
    } = useTerminalInitialization();

    // 使用拆分的WebSocket管理Hook
    const {
        isConnected,
        setIsConnected,
        reconnectCountRef,
        connectionAttemptRef,
        createWebSocketConnection,
        createSimpleConnection,
        createConnectionHelp,
        createRetryInterface,
        sendData,
        registerGlobalHelpers
    } = useWebSocketManager();

    // 使用拆分的终端数据Hook
    const {
        terminalMode,
        setTerminalMode,
        networkLatency,
        setNetworkLatency,
        setupModeDetection,
        setupLatencyMeasurement,
        createTerminalTools
    } = useTerminalData();

    // 使用拆分的终端UI Hook
    const {
        fullscreen,
        setFullscreen,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleFullscreen
    } = useTerminalUI();

    const [connection, setConnection] = useState<Connection | null>(null);
    const [terminalSize, setTerminalSize] = useState<WindowSize>({ cols: 80, rows: 24 });

    // 添加一个useRef来跟踪已处理过的连接ID和会话ID组合
    const processedConnectionRef = useRef<Set<string>>(new Set());

    // 保存间隔定时器引用以便清理
    const intervalsRef = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});

    // 发送数据到服务器
    const sendDataToServer = useCallback((data: string) => {
        const activeTab = tabs.find(tab => tab.key === activeTabKey);
        if (!activeTab) return;

        // 发送数据
        sendData(activeTab, data);
    }, [activeTabKey, tabs, sendData]);

    // 清理URL中的查询参数，但保留连接ID，以便刷新页面后能恢复会话
    const cleanURL = useCallback(() => {
        // 获取当前路径名
        const currentPath = window.location.pathname;

        // 先查找活动标签，显式添加类型断言
        const activeTab = (tabs.find(tab => tab.key === activeTabKey) ||
            (terminalStateRef.current?.tabs as TerminalTab[])?.find(tab => tab.key === terminalStateRef.current?.activeTabKey)) as TerminalTab | undefined;

        // 保存会话信息到localStorage，确保刷新页面时可以恢复
        if (activeTab) {
            // 在导航前保存WebSocket引用和连接信息到window对象，便于导航后恢复
            if (typeof window !== 'undefined') {
                (window as any).preservedTabKey = activeTab.key;
                (window as any).preservedSessionId = activeTab.sessionId;
                (window as any).preservedConnectionId = activeTab.connectionId;
                (window as any).needsReconnect = true;
            }

            const sessionInfo = {
                connectionId: activeTab.connectionId,
                sessionId: activeTab.sessionId,
                tabKey: activeTab.key,
                connectionProtocol: activeTab.connection?.protocol,
                connectionName: activeTab.connection?.name,
                isConnected: activeTab.isConnected,
                timestamp: Date.now() // 添加时间戳，便于验证会话新鲜度
            };

            // 保存到localStorage - 同时使用两个键存储，增加恢复成功率
            localStorage.setItem('current_terminal_session', JSON.stringify(sessionInfo));
            localStorage.setItem('terminal_last_session', JSON.stringify(sessionInfo));

            // 使用history API更新URL，不触发导航
            try {
                window.history.replaceState(
                    {
                        preservedTabKey: activeTab.key,
                        preservedConnectionId: activeTab.connectionId,
                        preservedSessionId: activeTab.sessionId
                    },
                    '',
                    currentPath
                );

                // 设置一个标记，表示URL已清理但可能需要恢复连接
                if (typeof window !== 'undefined') {
                    (window as any).urlCleanedTimestamp = Date.now();
                }

                // 立即检查连接状态并尝试恢复
                setTimeout(() => {

                    // 重新获取当前标签页，添加类型断言
                    const currentTab = (tabs.find(tab => tab.key === activeTab.key) ||
                        (terminalStateRef.current?.tabs as TerminalTab[])?.find(tab => tab.key === activeTab.key)) as TerminalTab | undefined;

                    if (currentTab && (!currentTab.isConnected || !currentTab.webSocketRef?.current)) {

                        // 确保标签处于激活状态
                        setActiveTab(currentTab.key);

                        // 直接调用创建简单连接函数
                        if (typeof window !== 'undefined') {
                            // 尝试使用导入的quickReconnect函数
                            if (typeof (window as any).quickReconnect === 'function') {
                                (window as any).quickReconnect();
                                return;
                            }

                            if ((window as any).createSimpleConnectionGlobal && currentTab.sessionId) {
                                (window as any).createSimpleConnectionGlobal(currentTab);
                            } else if ((window as any).manualConnect) {
                                (window as any).manualConnect();
                            } else if ((window as any).quickConnect && currentTab.sessionId) {
                                (window as any).quickConnect(currentTab.sessionId);
                            }
                        }
                    }
                }, 100);
            } catch (e) {
                console.error("【连接流程】使用history API清理URL失败:", e);
                // 回退到使用导航（但这可能导致WebSocket连接丢失）
                navigate(currentPath, { replace: true });
            }
        } else {
            console.warn("【连接流程】无法保存会话信息，活动标签不存在");
            // 保留URL参数直到标签创建成功
            if (tabs.length === 0 && (terminalStateRef.current?.tabs?.length || 0) === 0) {
                return;
            } else {
                // 如果有标签但找不到活动标签，尝试保存第一个标签的信息
                const firstTab = terminalStateRef.current?.tabs?.[0] || tabs[0];
                if (firstTab) {
                    // 在导航前保存到window对象
                    if (typeof window !== 'undefined') {
                        // 明确类型断言为TerminalTab
                        const tab = firstTab as TerminalTab;
                        (window as any).preservedTabKey = tab.key;
                        (window as any).preservedSessionId = tab.sessionId;
                        (window as any).preservedConnectionId = tab.connectionId;
                        (window as any).needsReconnect = true;
                    }

                    localStorage.setItem('current_terminal_session', JSON.stringify({
                        connectionId: (firstTab as TerminalTab).connectionId,
                        sessionId: (firstTab as TerminalTab).sessionId,
                        tabKey: (firstTab as TerminalTab).key,
                        connectionProtocol: (firstTab as TerminalTab).connection?.protocol,
                        connectionName: (firstTab as TerminalTab).connection?.name,
                        isConnected: (firstTab as TerminalTab).isConnected,
                        timestamp: Date.now()
                    }));

                    // 使用history API
                    try {
                        window.history.replaceState({
                            preservedTabKey: (firstTab as TerminalTab).key,
                            preservedConnectionId: (firstTab as TerminalTab).connectionId,
                            preservedSessionId: (firstTab as TerminalTab).sessionId
                        }, '', currentPath);
                    } catch (e) {
                        console.error("【连接流程】使用history API清理URL失败:", e);
                        navigate(currentPath, { replace: true });
                    }
                } else {
                    console.log("【连接流程】找不到任何标签，暂不清理URL参数");
                }
            }
        }
    }, [activeTabKey, navigate, tabs]);

    // 自定义addTab函数，用于创建终端标签
    const addTabWithConnection = useCallback((connectionId: number, sessionId: number, connectionInfo: any) => {
        // 清除所有重试计时器，确保干净的开始
        clearRetryTimers();

        // 生成唯一的标签键
        const timestamp = Date.now();
        const tabKey = `conn-${connectionId}-session-${sessionId}-${timestamp}`;

        // 终端引用
        const terminalRef = createRef<HTMLDivElement>();
        const xtermRef = createRef<Terminal>();
        const webSocketRef = createRef<WebSocket>();
        const fitAddonRef = createRef<FitAddon>();
        const searchAddonRef = createRef<SearchAddon>();

        // 消息队列引用
        const messageQueueRef = createRef<string[]>();
        messageQueueRef.current = [];

        // 创建新标签对象
        const newTab: TerminalTab = {
            key: tabKey,
            title: connectionInfo.name || `连接${connectionId}`,
            connectionId: connectionId,
            sessionId: sessionId,
            connection: connectionInfo,
            isConnected: false,
            terminalRef,
            xtermRef,
            webSocketRef,
            fitAddonRef,
            searchAddonRef,
            messageQueueRef
        };

        // 添加标签
        addTab(newTab);

        // 设置为活动标签
        setActiveTab(tabKey);

        // 保存最新创建的标签到localStorage
        localStorage.setItem('terminal_last_created_tab', tabKey);

        // 直接更新terminalStateRef以确保立即生效
        if (terminalStateRef && terminalStateRef.current) {
            // 先确保标签在数组中
            if (!terminalStateRef.current.tabs.some(t => t.key === tabKey)) {
                terminalStateRef.current.tabs.push(newTab);
            }

            // 再设置活动标签
            terminalStateRef.current.activeTabKey = tabKey;
        }

        // 触发DOM就绪事件，使用多个延迟以增加成功率
        [100, 250, 500, 750, 1000].forEach(delay => {
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('terminal-ready', {
                    detail: { tabKey: tabKey }
                }));
            }, delay);
        });

        // 立即触发标签激活事件
        window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
            detail: { tabKey: tabKey, isNewTab: true }
        }));

        // 返回标签键，用于后续操作
        return tabKey;
    }, [addTab, setActiveTab, clearRetryTimers]);

    /**
     * 创建新的会话
     */
    const createNewSession = useCallback(async (connectionId: number): Promise<number | null> => {
        try {
            const response = await sessionAPI.createSession(connectionId);

            // 修改检查方式以适应API响应格式
            if (response && response.data && response.data.code === 200 && response.data.data) {
                const sessionId = response.data.data.id;
                return sessionId;
            } else {
                console.error('【会话创建】创建会话失败:', response?.data);
                return null;
            }
        } catch (error) {
            console.error('【会话创建】创建会话出现异常:', error);
            return null;
        }
    }, []);

    // DOM就绪检查和初始化函数
    const checkAndInitTerminal = useCallback((tabKey: string, retryCount = 0) => {
        if (!terminalStateRef.current) {
            console.error(`【连接流程】terminalStateRef.current为空，无法检查DOM就绪状态`);
            return;
        }

        const tab = terminalStateRef.current.tabs.find(t => t.key === tabKey);

        if (!tab) {
            console.error(`【连接流程】无法找到标签: ${tabKey}`);
            return;
        }

        // 保证connectionId和sessionId存在
        if (!tab.connectionId || !tab.sessionId) {
            console.error(`【连接流程】标签缺少connectionId或sessionId: ${tabKey}`);
            return;
        }

        const terminalElement = document.getElementById(`terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`);

        if (!terminalElement) {
            if (retryCount < 5) {
                setTimeout(() => checkAndInitTerminal(tabKey, retryCount + 1), 250);
            } else {
                console.error(`【连接流程】终端DOM元素不可用，已达到最大重试次数`);
                message.error('无法初始化终端界面，请刷新页面重试');
            }
            return;
        }

        // DOM已就绪，设置引用并初始化连接
        if (tab.terminalRef) {
            tab.terminalRef.current = terminalElement as HTMLDivElement;

            // 分发DOM就绪事件
            window.dispatchEvent(new CustomEvent('terminal-ready', {
                detail: { tabKey }
            }));
        }

        // 初始化WebSocket连接，确保参数类型正确
        if (typeof tab.connectionId === 'number' && typeof tab.sessionId === 'number') {
            // 延迟初始化WebSocket连接，确保DOM和事件处理程序已就绪
            setTimeout(() => {
                try {
                    createWebSocketConnection(tab.connectionId as number, tab.sessionId as number, tabKey);
                } catch (error) {
                    console.error(`【连接流程】初始化WebSocket连接失败:`, error);
                    message.error('连接服务器失败，请重试');

                    // 添加重试按钮
                    if (tab.terminalRef?.current) {
                        const retryButton = document.createElement('button');
                        retryButton.innerText = '重试连接';
                        retryButton.style.position = 'absolute';
                        retryButton.style.top = '50%';
                        retryButton.style.left = '50%';
                        retryButton.style.transform = 'translate(-50%, -50%)';
                        retryButton.style.padding = '8px 16px';
                        retryButton.style.backgroundColor = '#1677ff';
                        retryButton.style.color = 'white';
                        retryButton.style.border = 'none';
                        retryButton.style.borderRadius = '4px';
                        retryButton.style.cursor = 'pointer';

                        retryButton.onclick = () => {
                            if (tab.terminalRef?.current) {
                                tab.terminalRef.current.innerHTML = '';
                                checkAndInitTerminal(tabKey, 0);
                            }
                        };

                        tab.terminalRef.current.appendChild(retryButton);
                    }
                }
            }, 300);
        } else {
            console.error(`【连接流程】无法初始化WebSocket连接，参数类型错误: ${tabKey}`);
        }
    }, [createWebSocketConnection]);

    // 将fetchConnectionAndCreateTab函数用useCallback包装
    const fetchConnectionAndCreateTab = useCallback(async (connectionId: number, sessionId?: number) => {

        // 先检查是否已经存在对应的标签页
        const existingTabs = [...tabs, ...(terminalStateRef.current?.tabs || [])];
        const existingTab = existingTabs.find(tab =>
            tab.connectionId === connectionId &&
            tab.sessionId === sessionId
        );

        if (existingTab) {
            // 设置为活动标签
            setActiveTab(existingTab.key);

            // 触发激活事件
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
                    detail: { tabKey: existingTab.key, isNewTab: false }
                }));
            }, 100);

            return existingTab;
        }

        // 创建一个锁，防止同一会话创建多个标签
        const lockKey = `creating-tab-lock-${connectionId}-${sessionId || 'nosession'}`;
        if ((window as any)[lockKey]) {
            return null;
        }
        (window as any)[lockKey] = true;

        try {
            // 从API获取连接详情
            const response = await connectionAPI.getConnection(connectionId);
            if (response && response.data && response.data.data) {
                const connectionData = response.data.data;

                // 再次检查是否已创建标签（可能在API请求期间被其他流程创建）
                const latestExistingTab = [...tabs, ...(terminalStateRef.current?.tabs || [])].find(tab =>
                    tab.connectionId === connectionId &&
                    tab.sessionId === sessionId
                );

                if (latestExistingTab) {
                    setActiveTab(latestExistingTab.key);
                    return latestExistingTab;
                }

                // 使用格式化函数创建标签数据
                const newTab = formatTabData(connectionData, sessionId);

                // 保存会话信息到localStorage
                saveSessionInfo(connectionId, sessionId);

                addTab(newTab);

                // 设置为活动标签
                setActiveTab(newTab.key);

                // 延迟分发激活事件，确保DOM元素已渲染
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
                        detail: { tabKey: newTab.key, isNewTab: true }
                    }));
                }, 100);

                return newTab;
            } else {
                console.error(`【获取连接】获取连接详情失败:`, response);
                message.error('获取连接详情失败');
                return null;
            }
        } catch (error) {
            console.error(`【获取连接】获取连接详情出错:`, error);
            message.error('获取连接详情时发生错误');
            return null;
        } finally {
            // 无论成功或失败，解除锁定
            setTimeout(() => {
                delete (window as any)[lockKey];
            }, 500);
        }
    }, [addTab, setActiveTab]);

    // 清理重复标签页的函数
    const cleanupDuplicateTabs = useCallback(() => {
        if (!tabs || tabs.length <= 1) return;

        // 首先收集所有标签，按connectionId和sessionId分组
        const tabGroups = new Map<string, TerminalTab[]>();

        // 将标签按连接和会话ID分组
        tabs.forEach(tab => {
            if (tab.connectionId && tab.connectionId > 0) {
                const key = `${tab.connectionId}-${tab.sessionId || 'nosession'}`;
                if (!tabGroups.has(key)) {
                    tabGroups.set(key, []);
                }
                tabGroups.get(key)!.push(tab);
            }
        });

        // 处理每个分组，保留一个最新的标签
        const tabsToRemove: string[] = [];

        for (const [key, groupTabs] of tabGroups.entries()) {
            if (groupTabs.length <= 1) continue; // 如果只有一个标签，无需处理

            // 按创建时间从新到旧排序
            const sortedTabs = [...groupTabs].sort((a, b) => {
                const aTimestamp = parseInt(a.key.split('-').pop() || '0', 10);
                const bTimestamp = parseInt(b.key.split('-').pop() || '0', 10);
                return bTimestamp - aTimestamp;
            });

            // 保留最新的一个标签，其余标记为待删除
            for (let i = 1; i < sortedTabs.length; i++) {
                tabsToRemove.push(sortedTabs[i].key);
            }
        }

        // 移除多余的标签页
        if (tabsToRemove.length > 0) {
            tabsToRemove.forEach(tabKey => {
                // 检查这个标签是否是当前活动标签
                if (activeTabKey !== tabKey) {
                    closeTab(tabKey);
                }
            });
        }
    }, [tabs, closeTab, activeTabKey]);

    // 初始化和恢复标签
    useEffect(() => {
        // 如果没有URL参数但存在保存的会话，恢复会话
        if (!connectionId && tabs.length === 0) {
            // 检查是否标记了所有标签已关闭
            const allTabsClosed = localStorage.getItem('all_tabs_closed');
            if (allTabsClosed === 'true') {
                // 确保删除旧的会话信息，防止重复尝试恢复
                localStorage.removeItem('session_info');
                localStorage.removeItem('terminal_last_session');
                localStorage.removeItem('current_terminal_session');
                return;
            }

            // 检查标签是否已经从localStorage恢复
            const tabsRestoredFlag = localStorage.getItem('tabs_restored');
            if (tabsRestoredFlag === 'true') {
                return;
            }

            const savedSession = localStorage.getItem('session_info') || localStorage.getItem('terminal_last_session');
            if (savedSession) {
                // 从本地存储获取会话信息
                try {
                    const sessionInfo = JSON.parse(savedSession);
                    if (sessionInfo.connectionId && sessionInfo.sessionId) {
                        // 检查是否正在处理URL参数中的连接
                        if (processedConnectionRef.current.has(`${sessionInfo.connectionId}-${sessionInfo.sessionId}`)) {
                            return;
                        }

                        // 只有检查all_tabs_closed为false时才恢复会话
                        const doubleCheck = localStorage.getItem('all_tabs_closed');
                        if (doubleCheck === 'true') {
                            return;
                        }

                        // 清除URL中的查询参数
                        const { protocol, host, pathname } = window.location;
                        const newUrl = `${protocol}//${host}${pathname}`;
                        window.history.replaceState({}, document.title, newUrl);

                        // 清除all_tabs_closed标记，因为我们正在恢复会话
                        localStorage.removeItem('all_tabs_closed');

                        // 恢复连接
                        navigate(`/terminal/${sessionInfo.connectionId}?session=${sessionInfo.sessionId}`);
                    }
                } catch (e) {
                    console.error('【连接流程】解析保存的会话信息失败:', e);
                }
            }
        }

        // 在组件初始化时清理重复标签页
        cleanupDuplicateTabs();
    }, []);

    // 当标签页数量变化时，也尝试清理重复标签页
    useEffect(() => {
        if (tabs && tabs.length > 1) {
            // 延迟执行，确保标签页加载完成
            const timer = setTimeout(() => {
                cleanupDuplicateTabs();
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [tabs.length, cleanupDuplicateTabs]);

    // 监听窗口大小变化
    useEffect(() => {
        const handleResize = () => {
            if (tabs.length === 0) return;

            // 获取当前活动标签页
            const activeTab = tabs.find(tab => tab.key === activeTabKey);
            if (!activeTab || !activeTab.fitAddonRef?.current || !activeTab.xtermRef?.current) return;

            setTimeout(() => {
                try {
                    activeTab.fitAddonRef.current!.fit();

                    // 获取新的终端尺寸
                    const newCols = activeTab.xtermRef.current!.cols;
                    const newRows = activeTab.xtermRef.current!.rows;

                    // 只有在尺寸变化时才更新状态和发送消息
                    if (newCols !== terminalSize.cols || newRows !== terminalSize.rows) {
                        setTerminalSize({ cols: newCols, rows: newRows });

                        // 发送调整大小的消息到服务器
                        if (activeTab.webSocketRef?.current &&
                            activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
                            const resizeMessage = {
                                type: 'resize',
                                cols: newCols,
                                rows: newRows
                            };
                            activeTab.webSocketRef.current.send(JSON.stringify(resizeMessage));
                        }
                    }
                } catch (e) {
                    console.error('调整终端大小失败:', e);
                }
            }, 0);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeTabKey, tabs, terminalSize]);

    // 添加全局样式表来强制隐藏xterm-link-layer
    useEffect(() => {
        // 创建一个样式表强制隐藏xterm-link-layer
        const style = document.createElement('style');
        style.innerHTML = `
      .xterm-link-layer {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
        document.head.appendChild(style);

        return () => {
            document.head.removeChild(style);
        };
    }, []);

    // 切换全屏
    const handleToggleFullscreen = useCallback(() => {
        // 调用子Hook中的toggleFullscreen来切换全屏状态
        toggleFullscreen();

        // 调整终端大小
        setTimeout(() => {
            const activeTab = tabs.find(tab => tab.key === activeTabKey);
            if (!activeTab) return;

            // 调整终端大小
            resizeTerminal(activeTab);
        }, 100);
    }, [activeTabKey, tabs, toggleFullscreen, resizeTerminal]);

    // 监听终端大小变化
    useEffect(() => {
        const handleResizeTerminal = () => {
            const activeTab = tabs.find(tab => tab.key === activeTabKey);
            if (!activeTab || !activeTab.fitAddonRef?.current || !activeTab.xtermRef?.current) return;

            try {
                activeTab.fitAddonRef.current.fit();

                // 获取新尺寸
                const newSize = {
                    cols: activeTab.xtermRef.current.cols,
                    rows: activeTab.xtermRef.current.rows
                };

                // 发送尺寸调整消息到服务器
                if (activeTab.isConnected &&
                    activeTab.webSocketRef?.current &&
                    activeTab.webSocketRef.current.readyState === WebSocket.OPEN &&
                    (newSize.cols !== terminalSize.cols || newSize.rows !== terminalSize.rows)) {
                    const resizeMessage = {
                        type: 'resize',
                        cols: newSize.cols,
                        rows: newSize.rows
                    };
                    activeTab.webSocketRef.current.send(JSON.stringify(resizeMessage));

                    // 更新状态
                    setTerminalSize(newSize);
                }
            } catch (e) {
                console.error('调整终端大小失败', e);
            }
        };

        // 添加窗口大小变化事件监听
        window.addEventListener('resize', handleResizeTerminal);

        // 添加全屏变化监听
        document.addEventListener('fullscreenchange', handleResizeTerminal);
        document.addEventListener('webkitfullscreenchange', handleResizeTerminal);
        document.addEventListener('mozfullscreenchange', handleResizeTerminal);
        document.addEventListener('MSFullscreenChange', handleResizeTerminal);

        return () => {
            window.removeEventListener('resize', handleResizeTerminal);
            document.removeEventListener('fullscreenchange', handleResizeTerminal);
            document.removeEventListener('webkitfullscreenchange', handleResizeTerminal);
            document.removeEventListener('mozfullscreenchange', handleResizeTerminal);
            document.removeEventListener('MSFullscreenChange', handleResizeTerminal);
        };
    }, [activeTabKey, tabs, terminalSize]);

    // 全局恢复会话函数
    const attemptGlobalRecovery = () => {
        // 检查是否有保存的会话信息
        const savedSession = localStorage.getItem('terminal_last_session');
        if (!savedSession) {
            return;
        }
    };

    // 导航后重连函数
    const reconnectAfterNavigation = () => {
        // 执行全局恢复
        attemptGlobalRecovery();
    };

    // 注册全局函数
    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).attemptGlobalRecovery = attemptGlobalRecovery;
            (window as any).reconnectAfterNavigation = reconnectAfterNavigation;
        }

        return () => {
            // 清理
            if (typeof window !== 'undefined') {
                delete (window as any).attemptGlobalRecovery;
                delete (window as any).reconnectAfterNavigation;
            }
        };
    }, []);

    // URL清理后检查连接状态
    useEffect(() => {

        // 检查是否有标签和连接
        const hasActiveTab = (terminalStateRef.current?.tabs?.length || 0) > 0 || tabs.length > 0;
        const hasSavedSession = localStorage.getItem('terminal_last_session') !== null;
        // 检查是否手动关闭过标签页
        const manuallyClosedTabs = localStorage.getItem('manually_closed_tabs') === 'true';

        // 如果是手动关闭的标签，不自动恢复
        if (manuallyClosedTabs) {
            return;
        }

        // 如果没有活动标签但有保存的会话，尝试恢复连接
        if (!hasActiveTab && hasSavedSession) {

            // 尝试使用全局重连函数
            if (typeof window !== 'undefined' && (window as any).reconnectTerminal) {
                (window as any).reconnectTerminal();
            }
        }
    }, [tabs.length, connectionId, quickReconnect]);

    // 监听DOM准备事件
    useEffect(() => {
        // 用于跟踪已经初始化的标签
        const initializedTabs = new Set<string>();

        const handleTerminalReady = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (customEvent.detail && customEvent.detail.tabKey) {
                const tabKey = customEvent.detail.tabKey;

                // 如果标签已初始化，不重复处理
                if (initializedTabs.has(tabKey)) {
                    return;
                }


                // 获取标签信息
                const tab = terminalStateRef.current?.tabs.find(t => t.key === tabKey);

                // 没有找到标签，记录错误并返回
                if (!tab) {
                    console.error(`【事件响应】找不到标签: ${tabKey}`);
                    return;
                }

                // 如果已经初始化终端，跳过
                if (tab.xtermRef?.current) {
                    initializedTabs.add(tabKey);
                    return;
                }

                // DOM引用存在的情况
                if (tab.terminalRef?.current) {

                    // 执行初始化和连接逻辑
                    const handleTerminalData = (data: string) => {
                        if (!data) return;
                        // 发送数据到服务器
                        sendDataToServer(data);
                    };

                    try {
                        // 初始化终端实例
                        const initialized = initializeTerminal(tab, handleTerminalData);
                        if (initialized) {

                            // 标记为已初始化
                            initializedTabs.add(tabKey);

                            // 准备连接
                            if (tab.connectionId && tab.sessionId) {
                                // 使用参数形式2: connectionId, sessionId, tabKey
                                const connectionId = Number(tab.connectionId);
                                const sessionId = Number(tab.sessionId);

                                if (!isNaN(connectionId) && !isNaN(sessionId)) {
                                    createWebSocketConnection(connectionId, sessionId, tabKey);
                                } else {
                                    console.error(`【事件响应】无法创建WebSocket连接，参数无效: connectionId=${tab.connectionId}, sessionId=${tab.sessionId}`);
                                }
                            } else {
                                console.error(`【事件响应】无法创建WebSocket连接，缺少connectionId或sessionId: ${tabKey}`);
                            }
                        } else {
                            console.error(`【事件响应】终端初始化失败: ${tabKey}`);
                        }
                    } catch (err) {
                        console.error(`【事件响应】终端初始化出错: ${tabKey}`, err);
                    }
                } else if (tab) {
                    // DOM元素不存在，尝试重新查找
                    const domId = `terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`;

                    const terminalElement = document.getElementById(domId);
                    if (terminalElement) {
                        // 设置DOM引用并重新触发事件
                        tab.terminalRef.current = terminalElement as HTMLDivElement;

                        // 重新触发终端就绪事件，但仅限于没有初始化过的情况
                        if (!initializedTabs.has(tabKey)) {
                            setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('terminal-ready', {
                                    detail: { tabKey: tabKey }
                                }));
                            }, 100);
                        }
                    } else {
                        // 仅在未初始化过的情况下添加重试
                        if (!initializedTabs.has(tabKey)) {
                            console.error(`【事件响应】无法找到DOM元素: ${domId}，将在500ms后重试`);

                            // 添加重试
                            const timerId = setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('terminal-ready', {
                                    detail: { tabKey: tabKey }
                                }));
                            }, 500);

                            // 保存定时器ID以便清理
                            retryTimersRef.current.push(timerId);
                        }
                    }
                } else {
                    console.error(`【事件响应】找不到标签: ${tabKey}`);
                }
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('terminal-ready', handleTerminalReady);
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('terminal-ready', handleTerminalReady);
            }
        };
    }, []);

    // 创建一个防抖延迟函数，避免短时间内重复创建标签
    const createTabDebounced = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 全局锁，用于防止多组件创建同一标签
    const getGlobalLock = (connectionId: string, sessionId: string | null): boolean => {
        const lockKey = `global_tab_creation_lock_${connectionId}_${sessionId || 'nosession'}`;
        if ((window as any)[lockKey]) {
            return false; // 已锁定，无法获得锁
        }
        (window as any)[lockKey] = true;

        // 设置自动解锁定时器（安全措施）
        setTimeout(() => {
            delete (window as any)[lockKey];
        }, 5000);

        return true; // 获得锁成功
    };

    // 释放全局锁
    const releaseGlobalLock = (connectionId: string, sessionId: string | null) => {
        const lockKey = `global_tab_creation_lock_${connectionId}_${sessionId || 'nosession'}`;
        delete (window as any)[lockKey];
    };

    // 添加useEffect监听connectionId和sessionParam变化
    useEffect(() => {
        if (connectionId && parseInt(connectionId) > 0) {
            // 创建唯一标识符来跟踪这个连接ID和会话ID组合是否已处理
            const connectionKey = `${connectionId}-${sessionParam || 'nosession'}`;

            // 如果已经处理过这个组合，直接返回避免重复处理
            if (processedConnectionRef.current.has(connectionKey)) {
                return;
            }

            // 检查是否存在全局钩子阻止标签创建
            const parentPreventCreation = (window as any).PARENT_CREATING_TAB === connectionKey;
            if (parentPreventCreation) {
                return;
            }

            // 尝试获取全局锁
            if (!getGlobalLock(connectionId, sessionParam)) {
                return;
            }


            // 确保显示加载提示
            if (!isLoadingRef.current) {
                message.loading(`正在连接到远程服务器...`, 0.5);
                isLoadingRef.current = true;
            }

            // 标记为已处理，避免重复处理
            processedConnectionRef.current.add(connectionKey);

            // 清除之前的定时器
            if (createTabDebounced.current) {
                clearTimeout(createTabDebounced.current);
            }

            // 使用防抖延迟处理，避免快速连续调用导致创建多个标签
            createTabDebounced.current = setTimeout(() => {
                try {
                    // 在处理前先进行全面的重复检查
                    // 同时检查上下文状态和组件状态中的标签
                    const allTabs = [
                        ...(terminalStateRef.current?.tabs || []),
                        ...tabs
                    ];

                    // 创建一个Map确保唯一性
                    const uniqueTabs = new Map<string, TerminalTab>();

                    // 去重，确保每个connectionId+sessionId组合只有一个标签
                    allTabs.forEach(tab => {
                        if (tab.connectionId && (tab.sessionId !== undefined)) {
                            const key = `${tab.connectionId}-${tab.sessionId || 'nosession'}`;
                            if (!uniqueTabs.has(key) ||
                                parseInt(tab.key.split('-').pop() || '0') >
                                parseInt(uniqueTabs.get(key)!.key.split('-').pop() || '0')) {
                                uniqueTabs.set(key, tab);
                            }
                        }
                    });

                    // 检查是否已经存在具有相同connectionId和sessionId的标签
                    const tabKey = `${parseInt(connectionId)}-${sessionParam ? parseInt(sessionParam) : 'nosession'}`;
                    const existingTab = uniqueTabs.get(tabKey) || allTabs.find(tab =>
                        tab.connectionId === parseInt(connectionId) &&
                        ((!sessionParam && !tab.sessionId) ||
                            (sessionParam && tab.sessionId === parseInt(sessionParam)))
                    );

                    if (existingTab) {
                        // 如果存在，只要激活该标签即可
                        setActiveTab(existingTab.key);

                        // 清理URL参数，防止重复处理
                        try {
                            window.history.replaceState({}, '', '/terminal/');
                        } catch (e) {
                            console.error('清理URL参数失败:', e);
                        }
                    } else {
                        // 不存在，创建新标签
                        const sessionId = sessionParam ? parseInt(sessionParam) : undefined;
                        fetchConnectionAndCreateTab(parseInt(connectionId), sessionId);
                    }
                } finally {
                    // 无论处理结果如何，释放锁以允许后续操作
                    releaseGlobalLock(connectionId, sessionParam);
                }
            }, 100); // 延长延迟时间，给其他组件更多时间检测重复
        }

        // 组件卸载时清理
        return () => {
            if (createTabDebounced.current) {
                clearTimeout(createTabDebounced.current);
            }
            // 释放所有可能的锁
            if (connectionId && sessionParam) {
                releaseGlobalLock(connectionId, sessionParam);
            }
        };
    }, [connectionId, sessionParam]);

    return {
        connection,
        tabs,
        activeTabKey,
        fullscreen,
        isConnected,
        terminalSize,
        networkLatency,
        terminalMode,
        sidebarCollapsed,
        cleanURL,
        toggleFullscreen,
        sendDataToServer,
        setNetworkLatency,
        setTerminalMode,
        setSidebarCollapsed,
        setIsConnected,
        clearRetryTimers, // 导出清除重试函数
        // 导出额外的有用函数
        createConnectionHelp,
        createRetryInterface
    };
};

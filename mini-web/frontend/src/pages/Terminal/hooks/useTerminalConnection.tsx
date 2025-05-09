import { useState, useEffect, useRef, createRef } from 'react';
import { message } from 'antd';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { useTerminal, terminalStateRef } from '../../../contexts/TerminalContext';
import { connectionAPI, sessionAPI, type Connection } from '../../../services/api';

// 创建一个Set用于跟踪正在处理的连接请求，避免重复创建
const pendingConnections = new Set<number>();

/**
 * 自定义Hook - 终端连接管理
 * 用于处理终端连接、创建会话等操作
 */
export const useTerminalConnection = () => {
    const { connectionId } = useParams<{ connectionId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);

    const [openConnection, setOpenConnection] = useState<Connection | null>(null);
    const [activeTab, setActiveTabState] = useState<TerminalTab | null>(null);
    const { state: terminalState, addTab, setActiveTab, updateTab } = useTerminal();
    const { tabs, activeTabKey } = terminalState;

    // 创建防抖处理引用
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 连接状态引用，用于异步操作中访问最新状态
    const connectionStateRef = useRef({
        initialLoadDone: false,
        hasConnection: false,
        isConnected: false,
        activeConnection: null as Connection | null,
        initialConnectionId: connectionId,
    });

    /**
     * 获取连接信息
     */
    const getConnectionById = async (id: number): Promise<Connection | null> => {
        try {
            const response = await connectionAPI.getConnection(id);
            if (response && response.data && response.data.data) {
                return response.data.data;
            }
            return null;
        } catch (error) {
            console.error('获取连接信息时出错:', error);
            return null;
        }
    };

    /**
     * 处理新连接请求
     */
    const handleNewConnection = async (connectionId: number) => {
        // 检查是否已经在处理这个连接请求
        if (pendingConnections.has(connectionId)) {
            console.log(`【连接包装器】已有相同连接(${connectionId})请求处理中，忽略重复请求`);
            return;
        }

        // 添加到待处理集合
        pendingConnections.add(connectionId);
        console.log(`【连接包装器】处理新连接: ${connectionId}`);

        try {
            // 查询连接信息
            const connection = await getConnectionById(connectionId);

            if (!connection) {
                console.error(`无法获取连接信息: connectionId=${connectionId}`);
                message.error('无法获取连接信息');
                pendingConnections.delete(connectionId);
                return;
            }

            // 检查是否已有相同连接ID的活动标签页
            const existingTab = tabs.find(tab =>
                tab.connectionId === connectionId && tab.isConnected
            );

            if (existingTab) {
                console.log(`【连接包装器】发现相同连接ID的活动标签，激活该标签: ${existingTab.key}`);
                setActiveTab(existingTab.key);
                pendingConnections.delete(connectionId);
                return;
            }

            // 创建会话
            const sessionResponse = await sessionAPI.createSession(connectionId);

            if (!sessionResponse || !sessionResponse.data || !sessionResponse.data.data || !sessionResponse.data.data.id) {
                console.error('创建会话失败', sessionResponse);
                message.error('创建会话失败');
                pendingConnections.delete(connectionId);
                return;
            }

            const sessionId = sessionResponse.data.data.id;

            // 生成唯一键
            const timestamp = Date.now();
            const tabKey = `conn-${connectionId}-session-${sessionId}-${timestamp}`;

            // 初始化消息队列的引用
            const messageQueue = createRef<string[]>();
            messageQueue.current = []; // 明确初始化为空数组

            // 创建新标签
            const newTab: TerminalTab = {
                key: tabKey,
                title: connection.name || '未命名连接',
                connectionId,
                sessionId,
                connection,
                isConnected: false,
                terminalRef: createRef<HTMLDivElement>(),
                xtermRef: createRef<Terminal>(),
                webSocketRef: createRef<WebSocket>(),
                fitAddonRef: createRef<FitAddon>(),
                searchAddonRef: createRef<SearchAddon>(),
                messageQueueRef: messageQueue
            };

            // 添加到标签列表
            addTab(newTab);

            // 标记为活动标签
            setActiveTab(tabKey);

            // 设置打开的连接
            setOpenConnection(connection);

            // 清理URL中的会话参数
            if (location.pathname.includes('/terminal/')) {
                navigate(`/terminal/${connectionId}`, { replace: true });
            }

            // 连接成功后的提示
            message.success(`已创建会话: ${connection.name}`);
        } catch (error) {
            console.error('处理新连接时出错:', error);
            message.error('连接失败，请重试');
        } finally {
            // 处理完成后从待处理集合中移除
            pendingConnections.delete(connectionId);
        }
    };

    /**
     * 检查并处理URL中的连接ID
     */
    useEffect(() => {
        if (!connectionId || connectionStateRef.current.initialLoadDone) return;

        // 设置初始化标记
        connectionStateRef.current.initialLoadDone = true;
        const numericConnectionId = parseInt(connectionId, 10);

        if (!isNaN(numericConnectionId)) {
            // 使用防抖处理，避免快速多次点击造成重复连接
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            debounceTimerRef.current = setTimeout(() => {
                // 检查是否已有使用该连接ID的标签
                const existingTab = tabs.find(tab => tab.connectionId === numericConnectionId);

                if (existingTab) {
                    console.log(`【连接流程】找到已存在的标签，激活标签: ${existingTab.key}`);
                    setActiveTab(existingTab.key);
                } else {
                    // 创建新的连接
                    handleNewConnection(numericConnectionId);
                }
            }, 300); // 300ms防抖时间
        }

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [connectionId, tabs]);

    // 更新活动标签引用
    useEffect(() => {
        if (activeTabKey && activeTabKey !== 'no-tabs') {
            const tab = tabs.find(t => t.key === activeTabKey);
            setActiveTabState(tab || null);
        } else {
            setActiveTabState(null);
        }
    }, [activeTabKey, tabs]);

    // 返回必要的连接状态和方法
    return {
        connection: openConnection,
        activeTabKey,
        tabs,
        isConnected: activeTab?.isConnected || false,
        activeTab,
        handleNewConnection,
        getConnectionById
    };
}; 
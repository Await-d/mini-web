/*
 * @Author: Await
 * @Date: 2025-05-17 20:14:15
 * @LastEditors: Await
 * @LastEditTime: 2025-05-23 14:10:29
 * @Description: 根据URL参数处理标签页的自定义hook
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, createRef, useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { connectionAPI } from '../../../services/api';

/**
 * 从URL参数中提取终端标签信息
 * 如果URL包含有效的连接ID和会话ID，且该标签不存在，则自动创建新标签
 */
const useTabFromUrl = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { state, addTab, setActiveTab } = useTerminal();
    const { tabs, activeTabKey } = state;
    const [isProcessing, setIsProcessing] = useState(false);

    // 解析URL参数
    const connectionId = new URLSearchParams(location.search).get('connection')
        || location.pathname.split('/').pop();
    const sessionParam = new URLSearchParams(location.search).get('session');
    const tabKeyParam = new URLSearchParams(location.search).get('tabKey');

    // 检查标签关闭状态是否已过期
    const checkAndClearClosingFlags = () => {
        const closingFlagsExpiry = localStorage.getItem('closing_flags_expiry');

        if (closingFlagsExpiry && parseInt(closingFlagsExpiry) < Date.now()) {
            // 清理所有关闭标志
            localStorage.removeItem('force_closing_last_tab');
            localStorage.removeItem('all_tabs_closed');
            localStorage.removeItem('recently_closed_tab');
            localStorage.removeItem('closing_flags_expiry');
            return false;
        }

        return localStorage.getItem('force_closing_last_tab') === 'true' ||
            localStorage.getItem('all_tabs_closed') === 'true';
    };

    // 处理URL参数并创建或激活标签
    const processTabFromParams = async () => {
        if (!connectionId || isProcessing) return;

        setIsProcessing(true);

        try {
            // 检查是否是正在关闭标签，且检查关闭标志是否已过期
            const closingActive = checkAndClearClosingFlags();
            const recentlyClosedTab = localStorage.getItem('recently_closed_tab');

            // 只有当关闭标志有效且当前标签是最近关闭的标签时，才跳过创建
            if (closingActive && recentlyClosedTab === tabKeyParam) {
                console.log('标签正在关闭过程中，跳过创建');
                setIsProcessing(false);
                return;
            }

            // 首先检查是否已有对应的标签页
            let existingTab;

            // 如果提供了tabKey，优先根据tabKey查找
            if (tabKeyParam) {
                existingTab = tabs.find(tab => tab.key === tabKeyParam);
            }

            // 如果没找到且有connectionId和sessionParam，根据这两个参数查找
            if (!existingTab && connectionId && sessionParam) {
                existingTab = tabs.find(tab =>
                    String(tab.connectionId) === String(connectionId) &&
                    String(tab.sessionId) === String(sessionParam)
                );
            }

            // 如果找到现有标签，激活它
            if (existingTab) {
                if (activeTabKey !== existingTab.key) {
                    // 激活现有标签
                    console.log(`激活现有标签: ${existingTab.key}`);
                    setActiveTab(existingTab.key);

                    // 更新URL，确保包含正确的参数
                    if (location.pathname !== `/terminal/${existingTab.connectionId}` ||
                        !location.search.includes(`session=${existingTab.sessionId}`)) {
                        navigate(
                            `/terminal/${existingTab.connectionId}?session=${existingTab.sessionId}&tabKey=${existingTab.key}`,
                            { replace: true }
                        );
                    }
                }
            }
            // 否则创建新标签
            else if (connectionId) {
                try {
                    // 获取连接信息
                    const connResponse = await connectionAPI.getConnection(Number(connectionId));
                    if (connResponse.data.code === 200) {
                        const connectionData = connResponse.data.data;

                        // 生成标签key
                        const timestamp = Date.now();
                        const tabKey = tabKeyParam || `conn-${connectionId}-session-${sessionParam || 'new'}-${timestamp}`;

                        // 创建新标签
                        console.log(`创建新标签: ${tabKey}, 连接ID: ${connectionId}, 会话ID: ${sessionParam}`);

                        // 清除所有关闭标志，确保新标签可以正常创建
                        localStorage.removeItem('force_closing_last_tab');
                        localStorage.removeItem('all_tabs_closed');
                        localStorage.removeItem('recently_closed_tab');
                        localStorage.removeItem('closing_flags_expiry');

                        addTab({
                            key: tabKey,
                            title: connectionData.name || `终端 ${connectionId}`,
                            connectionId: Number(connectionId),
                            sessionId: sessionParam ? Number(sessionParam) : undefined,
                            connection: connectionData,
                            protocol: connectionData.protocol,
                            isConnected: false,
                            terminalRef: createRef<HTMLDivElement>(),
                            webSocketRef: createRef<WebSocket>(),
                            messageQueueRef: createRef<Array<{ type: string; data: string | number[]; timestamp: number }>>(),
                            isGraphical: ['rdp', 'vnc'].includes(connectionData.protocol?.toLowerCase() || '')
                        });

                        // 更新URL，确保包含tabKey
                        if (!location.search.includes(`tabKey=${tabKey}`)) {
                            navigate(
                                `/terminal/${connectionId}?session=${sessionParam || ''}&tabKey=${tabKey}`,
                                { replace: true }
                            );
                        }

                        // 延迟设置活动标签，确保标签已创建
                        setTimeout(() => {
                            setActiveTab(tabKey);
                        }, 50);
                    }
                } catch (error) {
                    console.error('获取连接信息失败:', error);
                }
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // 当URL参数变化时处理标签
    useEffect(() => {
        processTabFromParams();
    }, [connectionId, sessionParam, tabKeyParam]);

    return {
        connectionId,
        sessionParam,
        tabKeyParam
    };
};

export default useTabFromUrl; 
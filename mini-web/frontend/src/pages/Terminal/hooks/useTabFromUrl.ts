/*
 * @Author: Await
 * @Date: 2025-05-17 20:14:15
 * @LastEditors: Await
 * @LastEditTime: 2025-05-18 08:43:09
 * @Description: 根据URL参数处理标签页的自定义hook
 */
import { useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { connectionAPI, sessionAPI } from '../../../services/api';
import { message } from 'antd';

/**
 * 检查是否已创建标签页 - 更全面的检查方法
 * @param tabs 当前标签页数组
 * @param connectionId 连接ID
 * @param sessionId 会话ID
 * @param tabKey 标签页键
 * @returns 找到的标签页或undefined
 */
const findExistingTab = (
    tabs: TerminalTab[],
    connectionId: string | null,
    sessionId: string | null,
    tabKey: string | null
): TerminalTab | undefined => {
    // 优先通过连接ID和会话ID查找，这是最可靠的方式
    if (connectionId && sessionId) {
        const tabByIds = tabs.find(tab =>
            tab.connectionId === Number(connectionId) &&
            tab.sessionId === Number(sessionId)
        );
        if (tabByIds) {
            return tabByIds;
        }
    }

    // 然后，通过tabKey查找
    if (tabKey) {
        const tabByKey = tabs.find(tab => tab.key === tabKey);
        if (tabByKey) {
            return tabByKey;
        }
    }

    // 最后，通过部分键匹配尝试查找
    if (connectionId && sessionId) {
        // 检查所有可能的前缀格式
        const partialKey1 = `conn-${connectionId}-session-${sessionId}`;
        const partialKey2 = `tab-${connectionId}-${sessionId}`;

        const tabByPartialKey = tabs.find(tab =>
            tab.key.startsWith(partialKey1) ||
            tab.key.startsWith(partialKey2)
        );

        if (tabByPartialKey) {
            return tabByPartialKey;
        }
    }

    return undefined;
};

/**
 * 检查是否处于标签关闭状态
 * 综合判断多个标志，确保关闭过程不被打断
 */
const isInTabClosingProcess = (): boolean => {
    const forceClosingLastTab = localStorage.getItem('force_closing_last_tab') === 'true';
    const allTabsClosed = localStorage.getItem('all_tabs_closed') === 'true';
    const recentlyClosedTab = localStorage.getItem('recently_closed_tab');

    // 判断是否设置了过期时间
    const flagExpiry = parseInt(localStorage.getItem('closing_flags_expiry') || '0', 10);
    const now = Date.now();

    // 如果过期时间已到，自动清除标志
    if (flagExpiry > 0 && now > flagExpiry) {
        clearAllTabClosingFlags();
        return false;
    }

    // 只要有任一标志，都视为正在关闭标签
    return forceClosingLastTab || allTabsClosed || !!recentlyClosedTab;
};

/**
 * 清理所有标签关闭标志
 */
const clearAllTabClosingFlags = () => {
    localStorage.removeItem('force_closing_last_tab');
    localStorage.removeItem('all_tabs_closed');
    localStorage.removeItem('recently_closed_tab');
    localStorage.removeItem('closing_flags_expiry');
    localStorage.removeItem('last_tab_close_time');
};

/**
 * 清理所有标签相关数据
 */
const cleanupTabData = (): void => {
    // 清理标签数据
    localStorage.removeItem('terminal_tabs');
    localStorage.removeItem('terminal_active_tab');

    // 保留recently_closed_tab标志一段时间，防止立即重新创建
    setTimeout(() => {
        localStorage.removeItem('recently_closed_tab');
    }, 3000);

    // 移除强制关闭标志，但保留全部关闭标志
    // 全部关闭标志将在明确创建新标签时移除
    localStorage.removeItem('force_closing_last_tab');
};

/**
 * 从URL参数中创建或激活标签页的Hook
 */
export const useTabFromUrl = () => {
    const { state, setActiveTab } = useTerminal();
    const { tabs, activeTabKey } = state;
    const navigate = useNavigate();
    const { connectionId } = useParams<{ connectionId: string }>();
    const [searchParams] = useSearchParams();
    const sessionParam = searchParams.get('session');
    const tabKeyParam = searchParams.get('tabKey');

    // 用于跟踪是否已经处理过当前URL参数
    const processedRef = useRef({
        connectionId: null as string | null,
        sessionId: null as string | null,
        tabKey: null as string | null,
        processed: false, // 添加一个标志表示是否已处理
        lastProcessTime: 0, // 记录上次处理时间
        closingInProgress: false // 标记是否正在进行关闭操作
    });

    /**
     * 根据连接ID和会话ID创建或激活标签页
     */
    const processTabFromParams = useCallback(() => {
        // 检查是否有forceCreate参数
        const forceCreate = searchParams.get('forceCreate') === 'true';

        // 如果有forceCreate参数，强制清除所有关闭标志
        if (forceCreate) {
            clearAllTabClosingFlags();
        }

        // 如果标签关闭过程中，且不是强制创建，直接跳过创建
        if (isInTabClosingProcess() && !forceCreate) {
            processedRef.current.closingInProgress = true;
            return;
        }

        // 如果上一次处理是关闭操作，且时间间隔太短（5秒内），也跳过处理，除非是强制创建
        if (processedRef.current.closingInProgress &&
            Date.now() - processedRef.current.lastProcessTime < 5000 &&
            !forceCreate) {
            return;
        }

        // 重置关闭标志
        processedRef.current.closingInProgress = false;

        if (!connectionId || !sessionParam) {
            return;
        }

        // 防止重复处理同样的URL参数
        const currentTab = {
            connectionId,
            sessionId: sessionParam,
            tabKey: tabKeyParam
        };

        if (processedRef.current.connectionId === currentTab.connectionId &&
            processedRef.current.sessionId === currentTab.sessionId &&
            processedRef.current.tabKey === currentTab.tabKey &&
            processedRef.current.processed &&
            Date.now() - processedRef.current.lastProcessTime < 2000 &&
            !forceCreate) {
            return;
        }

        // 更新处理状态
        processedRef.current = {
            ...currentTab,
            processed: true,
            lastProcessTime: Date.now(),
            closingInProgress: false
        };

        // 如果不是强制创建，再次检查是否有关闭标志，确保不会创建不必要的标签
        if (!forceCreate && isInTabClosingProcess()) {
            return;
        }

        // 防止重复标签
        const existingTab = findExistingTab(tabs, connectionId, sessionParam, tabKeyParam);
        if (existingTab) {
            setActiveTab(existingTab.key);
            return;
        }

        // 当URL中带有tabKey参数时，优先使用它；否则动态生成
        let finalTabKey = tabKeyParam;
        if (!finalTabKey) {
            finalTabKey = `conn-${connectionId}-session-${sessionParam}-${Date.now()}`;
        } else if (finalTabKey.startsWith('tab-')) {
            // 如果传入的tabKey不符合格式标准，修正格式
            const parts = finalTabKey.split('-');
            finalTabKey = `conn-${parts[1]}-session-${parts[2]}-${parts[3] || Date.now()}`;
        }

        // 如果不是强制创建，最终检查，确保不会因为导航事件立即创建标签
        if (!forceCreate && isInTabClosingProcess()) {
            return;
        }

        // 创建新标签前，清除所有关闭标志
        clearAllTabClosingFlags();

        // 创建新标签 - 通过事件通知TerminalContext
        const event = new CustomEvent('open-terminal-tab', {
            detail: {
                tabKey: finalTabKey,
                connectionId: parseInt(connectionId),
                sessionId: parseInt(sessionParam),
                connectionName: `连接 ${connectionId} 会话 ${sessionParam}`,
                timestamp: Date.now(),
                forceCreate: true // 添加强制创建标志
            }
        });
        window.dispatchEvent(event);
    }, [connectionId, sessionParam, tabKeyParam, tabs, setActiveTab, searchParams]);

    // 监听URL参数变化
    useEffect(() => {
        // 如果没有connectionId，表示可能是关闭标签后的状态
        if (!connectionId) {
            // 如果当前路径是/terminal，可能是关闭标签后的状态
            if (window.location.pathname === '/terminal') {
                // 记录关闭状态
                processedRef.current.closingInProgress = true;
                processedRef.current.lastProcessTime = Date.now();

                // 延迟清理，确保标签关闭操作完成
                setTimeout(() => {
                    // 再次检查是否在标签关闭过程中
                    if (localStorage.getItem('force_closing_last_tab') === 'true' ||
                        localStorage.getItem('all_tabs_closed') === 'true') {
                        // 清理标签相关数据
                        cleanupTabData();
                    }
                }, 500);
            }
            return;
        }

        // 防止在标签关闭过程中处理URL参数
        if (isInTabClosingProcess()) {
            processedRef.current.closingInProgress = true;
            processedRef.current.lastProcessTime = Date.now();
            return;
        }

        // 延迟处理URL参数，等待标签关闭流程彻底完成
        const timer = setTimeout(() => {
            // 再次检查是否在标签关闭过程中
            if (!isInTabClosingProcess()) {
                // 检查从上次关闭标签到现在的时间是否足够长（至少3秒）
                if (processedRef.current.closingInProgress &&
                    Date.now() - processedRef.current.lastProcessTime < 3000) {
                    return;
                }

                processTabFromParams();
            }
        }, 500);

        return () => {
            clearTimeout(timer);
        };
    }, [connectionId, sessionParam, tabKeyParam, processTabFromParams]);

    return {
        currentConnectionId: connectionId,
        currentSessionId: sessionParam,
        currentTabKey: tabKeyParam || activeTabKey
    };
};

export default useTabFromUrl; 
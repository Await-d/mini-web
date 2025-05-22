/*
 * @Author: Await
 * @Date: 2025-05-21 20:20:30
 * @LastEditors: Await
 * @LastEditTime: 2025-05-21 20:20:30
 * @Description: 终端事件处理钩子
 */
import { useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { TerminalTab } from '../Terminal.d';

/**
 * 终端事件处理钩子返回类型
 */
interface UseTerminalEventsReturn {
    addEventListeners: () => void;
    removeEventListeners: () => void;
}

/**
 * 终端事件处理钩子参数类型
 */
interface UseTerminalEventsParams {
    tabs: TerminalTab[];
    activeTabKey: string;
    refreshTab?: (tabKey: string) => void;
    duplicateTab?: (tabKey: string) => void;
    setActiveTab?: (tabKey: string) => void;
    closeTab?: (tabKey: string) => void;
}

/**
 * 终端事件处理钩子
 * 用于统一管理终端相关事件的监听和处理
 */
export const useTerminalEvents = ({
    tabs,
    activeTabKey,
    refreshTab,
    duplicateTab,
    setActiveTab,
    closeTab
}: UseTerminalEventsParams): UseTerminalEventsReturn => {

    // 处理标签刷新事件
    const handleTabRefresh = useCallback((event: Event) => {
        const customEvent = event as CustomEvent;
        const tabKey = customEvent.detail?.tabKey;
        if (!tabKey) return;

        // 尝试找到对应标签
        const tab = tabs.find(tab => tab.key === tabKey);
        if (!tab) {
            message.error(`无法找到标签: ${tabKey}`);
            return;
        }

        message.info(`正在刷新标签: ${tab.title}`);

        // 如果存在刷新函数则调用
        if (refreshTab) {
            refreshTab(tabKey);
        }
    }, [tabs, refreshTab]);

    // 处理标签复制事件
    const handleTabDuplicate = useCallback((event: Event) => {
        const customEvent = event as CustomEvent;
        const tabKey = customEvent.detail?.tabKey;
        if (!tabKey) return;

        // 尝试找到对应标签
        const tab = tabs.find(tab => tab.key === tabKey);
        if (!tab) {
            message.error(`无法找到标签: ${tabKey}`);
            return;
        }

        message.info(`正在复制标签: ${tab.title}`);

        // 如果存在复制函数则调用
        if (duplicateTab) {
            duplicateTab(tabKey);
        }
    }, [tabs, duplicateTab]);

    // 处理标签激活事件
    const handleTabActivate = useCallback((event: Event) => {
        const customEvent = event as CustomEvent;
        const tabKey = customEvent.detail?.tabKey;
        if (!tabKey || tabKey === activeTabKey) return;

        // 激活指定标签
        if (setActiveTab) {
            setActiveTab(tabKey);
        }
    }, [activeTabKey, setActiveTab]);

    // 处理标签关闭事件
    const handleTabClose = useCallback((event: Event) => {
        const customEvent = event as CustomEvent;
        const tabKey = customEvent.detail?.tabKey;
        if (!tabKey) return;

        // 尝试找到对应标签
        const tab = tabs.find(tab => tab.key === tabKey);
        if (!tab) {
            message.error(`无法找到标签: ${tabKey}`);
            return;
        }

        // 如果存在关闭函数则调用
        if (closeTab) {
            closeTab(tabKey);
        }
    }, [tabs, closeTab]);

    // 添加事件监听
    const addEventListeners = useCallback(() => {
        window.addEventListener('terminal-tab-refresh', handleTabRefresh);
        window.addEventListener('terminal-tab-duplicate', handleTabDuplicate);
        window.addEventListener('terminal-tab-activate', handleTabActivate);
        window.addEventListener('terminal-tab-close', handleTabClose);
    }, [handleTabRefresh, handleTabDuplicate, handleTabActivate, handleTabClose]);

    // 移除事件监听
    const removeEventListeners = useCallback(() => {
        window.removeEventListener('terminal-tab-refresh', handleTabRefresh);
        window.removeEventListener('terminal-tab-duplicate', handleTabDuplicate);
        window.removeEventListener('terminal-tab-activate', handleTabActivate);
        window.removeEventListener('terminal-tab-close', handleTabClose);
    }, [handleTabRefresh, handleTabDuplicate, handleTabActivate, handleTabClose]);

    // 自动添加和移除事件监听
    useEffect(() => {
        addEventListeners();
        return removeEventListeners;
    }, [addEventListeners, removeEventListeners]);

    return {
        addEventListeners,
        removeEventListeners
    };
}; 
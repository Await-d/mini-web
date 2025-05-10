import React, { useEffect, useRef, useCallback, useContext } from 'react';
import type { FC, PropsWithChildren } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { useTerminal } from '../../../contexts/TerminalContext';
import { type Connection } from '../../../services/api';

interface TerminalTabPersistenceProps {
    tabs: TerminalTab[];
    activeTabKey: string;
}

/**
 * 终端标签页持久化组件
 * 集中处理标签页的读取、保存、新增和删除逻辑
 * 确保页面刷新后能正确恢复所有标签页
 */
const TerminalTabPersistence: FC<PropsWithChildren<TerminalTabPersistenceProps>> = ({
    children,
    tabs,
    activeTabKey
}) => {
    // 使用useTerminal钩子获取终端上下文操作函数
    const { addTab, setActiveTab } = useTerminal();

    // 存储上次保存的标签数据，用于避免重复保存
    const lastSavedDataRef = useRef<string>('');

    // 存储标签数据到localStorage
    const saveTabsToLocalStorage = useCallback((currentTabs: TerminalTab[], currentActiveKey: string) => {
        try {
            if (currentTabs.length === 0) {
                // 如果没有标签，则清除localStorage中的数据
                localStorage.removeItem('terminal_tabs');
                localStorage.removeItem('terminal_active_tab');
                return;
            }

            // 准备要保存的标签数据
            const tabsToSave = currentTabs.map(tab => ({
                key: tab.key,
                title: tab.title,
                connectionId: tab.connectionId,
                sessionId: tab.sessionId,
                protocol: tab.protocol,
                hostname: tab.hostname,
                port: tab.port,
                username: tab.username,
                connection: tab.connection ? {
                    id: tab.connection.id,
                    name: tab.connection.name,
                    host: tab.connection.host,
                    port: tab.connection.port,
                    protocol: tab.connection.protocol,
                    username: tab.connection.username
                } : undefined
            }));

            // 序列化标签数据
            const tabsJson = JSON.stringify(tabsToSave);

            // 保存标签数据到localStorage
            localStorage.setItem('terminal_tabs', tabsJson);
            localStorage.setItem('terminal_active_tab', currentActiveKey);
            localStorage.setItem('tabs_last_saved', new Date().toISOString());
            localStorage.setItem('active_tab_last_saved', new Date().toISOString());

            // 更新上次保存的数据
            lastSavedDataRef.current = tabsJson;
        } catch (error) {
            // 错误处理，无需打印日志
        }
    }, []);

    // 从localStorage加载标签数据
    const loadTabsFromLocalStorage = useCallback(async () => {
        try {
            const tabsJson = localStorage.getItem('terminal_tabs');
            const savedActiveTab = localStorage.getItem('terminal_active_tab');

            if (!tabsJson) {
                return;
            }

            // 解析标签数据
            const parsedTabs = JSON.parse(tabsJson) as Array<Partial<TerminalTab>>;

            if (!Array.isArray(parsedTabs) || parsedTabs.length === 0) {
                return;
            }

            // 逐个添加标签，确保UI能正确响应
            const delayStep = 100; // 每个标签添加间隔100ms

            parsedTabs.forEach((tab, index) => {
                // 跳过无效标签
                if (!tab || !tab.key) return;

                // 延迟添加，避免DOM更新冲突
                setTimeout(() => {
                    // 检查标签是否已存在
                    const tabExists = tabs.some(t => t.key === tab.key);
                    if (!tabExists) {
                        addTab(tab as TerminalTab);
                    }

                    // 如果是最后一个标签，设置活动标签
                    if (index === parsedTabs.length - 1 && savedActiveTab) {
                        // 确保活动标签存在
                        const activeTabExists = parsedTabs.some(t => t.key === savedActiveTab);
                        if (activeTabExists) {
                            setActiveTab(savedActiveTab);
                        }
                    }
                }, index * delayStep);
            });
        } catch (error) {
            // 错误处理，无需打印日志
        }
    }, [addTab, setActiveTab, tabs]);

    // 组件挂载时从localStorage加载标签
    useEffect(() => {
        // 只在tabs为空时加载
        if (tabs.length === 0) {
            loadTabsFromLocalStorage();
        }
    }, [loadTabsFromLocalStorage, tabs.length]);

    // 当tabs或activeTabKey变化时保存到localStorage
    useEffect(() => {
        // 避免保存空标签集
        if (tabs.length === 0) return;

        // 使用较短的延迟保存，只需一次
        const saveTimer = setTimeout(() => {
            saveTabsToLocalStorage(tabs, activeTabKey);
        }, 200);

        return () => clearTimeout(saveTimer);
    }, [tabs, activeTabKey, saveTabsToLocalStorage]);

    // 监听标签删除事件
    useEffect(() => {
        // 定义事件处理函数
        const handleTabRemove = (event: CustomEvent) => {
            const { tabKey } = event.detail;
            if (!tabKey) return;

            // 删除标签后立即保存最新的标签状态
            setTimeout(() => {
                const updatedTabs = tabs.filter(tab => tab.key !== tabKey);
                const newActiveKey = activeTabKey === tabKey && updatedTabs.length > 0
                    ? updatedTabs[updatedTabs.length - 1].key
                    : activeTabKey;

                saveTabsToLocalStorage(updatedTabs, newActiveKey);
            }, 100);
        };

        // 添加事件监听
        window.addEventListener('terminal-tab-removed' as any, handleTabRemove as EventListener);

        // 清理函数
        return () => {
            window.removeEventListener('terminal-tab-removed' as any, handleTabRemove as EventListener);
        };
    }, [tabs, activeTabKey, saveTabsToLocalStorage]);

    // 监听标签添加事件
    useEffect(() => {
        // 定义事件处理函数
        const handleTabAdd = (event: CustomEvent) => {
            const { tab } = event.detail;
            if (!tab || !tab.key) return;

            // 添加标签后立即保存
            setTimeout(() => {
                const updatedTabs = [...tabs, tab];
                saveTabsToLocalStorage(updatedTabs, tab.key);
            }, 100);
        };

        // 添加事件监听
        window.addEventListener('terminal-tab-added' as any, handleTabAdd as EventListener);

        // 清理函数
        return () => {
            window.removeEventListener('terminal-tab-added' as any, handleTabAdd as EventListener);
        };
    }, [tabs, saveTabsToLocalStorage]);

    // 监听标签激活事件
    useEffect(() => {
        // 定义标签激活事件处理函数
        const handleTabActivated = (event: CustomEvent) => {
            const { tabKey } = event.detail;
            if (!tabKey) return;

            // 直接保存活动标签
            localStorage.setItem('terminal_active_tab', tabKey);

            // 延迟200ms保存所有标签
            setTimeout(() => {
                saveTabsToLocalStorage(tabs, tabKey);
            }, 200);
        };

        // 定义会话创建事件处理函数
        const handleSessionCreated = (event: CustomEvent) => {
            const { tabKey } = event.detail;
            if (!tabKey) return;

            // 一段时间后检查标签是否已保存
            setTimeout(() => {
                const savedTabsJson = localStorage.getItem('terminal_tabs');
                const savedActiveTab = localStorage.getItem('terminal_active_tab');

                if (!savedTabsJson || !savedTabsJson.includes(tabKey) || savedActiveTab !== tabKey) {
                    saveTabsToLocalStorage(tabs, tabKey);
                }
            }, 500);
        };

        // 添加事件监听
        window.addEventListener('terminal-tab-activated' as any, handleTabActivated as EventListener);
        window.addEventListener('session-created' as any, handleSessionCreated as EventListener);

        // 清理函数
        return () => {
            window.removeEventListener('terminal-tab-activated' as any, handleTabActivated as EventListener);
            window.removeEventListener('session-created' as any, handleSessionCreated as EventListener);
        };
    }, [tabs, saveTabsToLocalStorage]);

    // 在组件卸载前保存标签状态
    useEffect(() => {
        return () => {
            if (tabs.length > 0) {
                saveTabsToLocalStorage(tabs, activeTabKey);
            }
        };
    }, [tabs, activeTabKey, saveTabsToLocalStorage]);

    return <>{children}</>;
};

export default TerminalTabPersistence; 
import React, { useCallback } from 'react';
import { message } from 'antd';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { createRef } from 'react';

/**
 * 终端事件处理Hook
 */
export const useTerminalEvents = () => {
    /**
     * 关闭会话
     */
    const handleCloseSession = useCallback((tab?: TerminalTab) => {
        if (!tab) {
            message.warning('没有可关闭的会话');
            return;
        }

        // 关闭WebSocket连接
        if (tab.webSocketRef && tab.webSocketRef.current) {
            try {
                tab.webSocketRef.current.close();
            } catch (e) {
                console.error('关闭WebSocket连接失败:', e);
            }
        }

        // 需要根据你的实际情况修改以下逻辑
        message.success('会话已关闭');
    }, []);

    /**
     * 复制终端内容
     */
    const handleCopyContent = useCallback((activeTab?: TerminalTab) => {
        if (!activeTab || !activeTab.xtermRef?.current) {
            message.warning('无法复制内容：终端未初始化');
            return;
        }

        try {
            // 尝试获取终端选中内容
            const selection = activeTab.xtermRef.current.getSelection();

            if (selection) {
                navigator.clipboard.writeText(selection)
                    .then(() => message.success('内容已复制到剪贴板'))
                    .catch(err => {
                        console.error('复制到剪贴板失败:', err);
                        message.error('复制失败，请手动选择并复制');
                    });
            } else {
                message.info('请先在终端中选择要复制的内容');
            }
        } catch (e) {
            console.error('复制终端内容出错:', e);
            message.error('复制出错，请手动选择并复制');
        }
    }, []);

    /**
     * 下载日志内容
     */
    const handleDownloadLog = useCallback((activeTab?: TerminalTab) => {
        if (!activeTab || !activeTab.xtermRef?.current) {
            message.warning('无法下载日志：终端未初始化');
            return;
        }

        try {
            // 从缓冲区获取日志内容
            const lines = activeTab.xtermRef.current.buffer.active.getLine ?
                Array.from({ length: activeTab.xtermRef.current.buffer.active.length },
                    (_, i) => activeTab.xtermRef.current?.buffer.active.getLine(i)) : [];

            const content = lines.map(line => line?.translateToString() || '').join('\n');

            // 创建下载链接
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = `terminal_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;

            // 触发下载
            document.body.appendChild(link);
            link.click();

            // 清理
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);

            message.success('日志已下载');
        } catch (e) {
            console.error('下载日志出错:', e);
            message.error('下载日志失败');
        }
    }, []);

    /**
     * 标签页切换
     */
    const handleTabChange = useCallback((newActiveKey: string) => {
        // 发布切换标签事件
        const event = new CustomEvent('set-active-tab', {
            detail: { key: newActiveKey }
        });
        window.dispatchEvent(event);

        // 触发标签激活事件
        window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
            detail: {
                tabKey: newActiveKey
            }
        }));

        // 保存活动标签
        localStorage.setItem('terminal_active_tab', newActiveKey);
    }, []);

    /**
     * 标签页编辑（关闭、添加）
     */
    const handleTabEdit = useCallback((targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
        // 处理关闭标签页
        if (action === 'remove' && typeof targetKey === 'string') {
            // 关闭前检查WebSocket连接
            const tabs = terminalStateRef.current?.tabs || [];
            const tabToClose = tabs.find(tab => tab.key === targetKey);
            if (tabToClose?.webSocketRef?.current) {
                try {
                    tabToClose.webSocketRef.current.close();
                } catch (e) {
                    console.error(`关闭WebSocket连接出错:`, e);
                }
            }

            // 发布关闭标签事件
            const event = new CustomEvent('close-tab', { detail: { key: targetKey } });
            window.dispatchEvent(event);
        }
    }, []);

    /**
     * 切换侧边栏
     */
    const handleToggleSidebar = useCallback(() => {
        // 实现切换侧边栏的逻辑
    }, []);

    /**
     * 获取当前活动标签页
     */
    const getActiveTab = useCallback(() => {
        const state = terminalStateRef.current;
        if (!state) return undefined;

        const { activeTabKey, tabs } = state;
        return tabs.find(tab => tab.key === activeTabKey);
    }, []);

    return {
        handleCloseSession,
        handleCopyContent,
        handleDownloadLog,
        handleTabChange,
        handleTabEdit,
        handleToggleSidebar,
        getActiveTab
    };
}; 
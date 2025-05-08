import { useCallback } from 'react';
import { message } from 'antd';
import { terminalStateRef } from '../../../contexts/TerminalContext';
import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * 终端事件处理Hook
 */
export const useTerminalEvents = () => {
    /**
     * 关闭会话
     */
    const handleCloseSession = useCallback((activeTab?: TerminalTab) => {
        if (!activeTab) {
            console.warn('无法关闭会话：未找到活动标签');
            return;
        }

        // 关闭WebSocket连接
        if (activeTab.webSocketRef?.current) {
            try {
                activeTab.webSocketRef.current.close();
                console.log('已关闭WebSocket连接');
            } catch (e) {
                console.error('关闭WebSocket连接出错:', e);
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
            const lines = activeTab.xtermRef.current.buffer.active.getLines();
            const content = lines.map(line => line.translateToString()).join('\n');

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
     * 添加新标签页
     */
    const handleAddNewTab = useCallback(() => {
        console.log('添加新标签页');
        // 实现创建新标签页的逻辑
    }, []);

    /**
     * 标签页切换
     */
    const handleTabChange = useCallback((newActiveKey: string) => {
        console.log('切换到标签页:', newActiveKey);
        // 实现标签页切换的逻辑
    }, []);

    /**
     * 标签页编辑（关闭、添加）
     */
    const handleTabEdit = useCallback((targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
        console.log('编辑标签页:', targetKey, action);
        // 实现标签页编辑的逻辑
    }, []);

    /**
     * 切换侧边栏
     */
    const handleToggleSidebar = useCallback(() => {
        console.log('切换侧边栏');
        // 实现切换侧边栏的逻辑
    }, []);

    /**
     * 获取当前活动标签页
     */
    const getActiveTab = useCallback(() => {
        const { activeTabKey, tabs } = terminalStateRef.current;
        return tabs.find(tab => tab.key === activeTabKey);
    }, []);

    return {
        handleCloseSession,
        handleCopyContent,
        handleDownloadLog,
        handleAddNewTab,
        handleTabChange,
        handleTabEdit,
        handleToggleSidebar,
        getActiveTab
    };
}; 
import { useCallback } from 'react';
import { Modal, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTerminal } from '../../../contexts/TerminalContext';
import { sessionAPI } from '../../../services/api';
import { closeAllSessions } from '../utils';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { createRef } from 'react';
import type { Connection } from '../../../services/api';

/**
 * 终端事件处理Hook - 处理所有终端相关的用户交互
 */
export const useTerminalEvents = () => {
    const navigate = useNavigate();
    const { state, closeTab, addTab, setActiveTab } = useTerminal();
    const { tabs, activeTabKey } = state;

    // 获取活动标签页
    const getActiveTab = useCallback((): TerminalTab | undefined => {
        return tabs.find(tab => tab.key === activeTabKey);
    }, [activeTabKey, tabs]);

    // 关闭会话
    const handleCloseSession = useCallback(() => {
        const activeTab = getActiveTab();
        if (!activeTab) {
            message.warning('没有可关闭的会话');
            return;
        }

        Modal.confirm({
            title: '确认关闭',
            content: '确定要关闭此会话吗？',
            okText: '关闭',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                // 关闭WebSocket连接
                if (activeTab.webSocketRef?.current) {
                    try {
                        activeTab.webSocketRef.current.close();
                    } catch (e) {
                        console.error('关闭WebSocket连接失败:', e);
                    }
                }

                closeTab(activeTab.key);
                message.success('会话已关闭');
            },
        });
    }, [closeTab, getActiveTab]);

    // 关闭所有会话
    const handleCloseAllSessions = useCallback(() => {
        Modal.confirm({
            title: '确认关闭',
            content: '确定要关闭所有会话并返回连接列表吗？',
            okText: '关闭',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                const result = await closeAllSessions(tabs);
                if (result) {
                    message.success('所有会话已关闭');
                    navigate('/connections');
                } else {
                    message.error('关闭会话失败，请稍后再试');
                }
            },
        });
    }, [navigate, tabs]);

    // 复制终端内容
    const handleCopyContent = useCallback(() => {
        const activeTab = getActiveTab();
        if (!activeTab || !activeTab.xtermRef?.current) {
            message.info('没有可复制的内容');
            return;
        }

        try {
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
    }, [getActiveTab]);

    // 下载日志功能
    const handleDownloadLog = useCallback(() => {
        const activeTab = getActiveTab();
        if (!activeTab || !activeTab.xtermRef?.current) {
            message.info('没有可下载的内容');
            return;
        }

        try {
            const term = activeTab.xtermRef.current;
            const buffer = term.buffer.active;
            const lineCount = buffer.length;
            let logContent = '';

            for (let i = 0; i < lineCount; i++) {
                const line = buffer.getLine(i);
                if (line) {
                    logContent += line.translateToString() + '\n';
                }
            }

            if (!logContent) {
                message.info('没有可下载的内容');
                return;
            }

            // 创建下载链接
            const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `terminal_log_${activeTab.sessionId || 'session'}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
            document.body.appendChild(a);
            a.click();

            // 清理
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            message.success('日志已下载');
        } catch (e) {
            console.error('下载日志出错:', e);
            message.error('下载日志失败');
        }
    }, [getActiveTab]);

    // 添加新标签
    const handleAddNewTab = useCallback(() => {
        const activeTab = getActiveTab();
        if (!activeTab || !activeTab.connection) {
            message.error('无法创建新标签：未找到当前连接信息');
            return;
        }

        const connection = activeTab.connection;

        // 使用当前连接创建新会话
        sessionAPI.createSession(connection.id)
            .then(response => {
                if (response.data && response.data.code === 200) {
                    const session = response.data.data;
                    // 使用上下文管理器添加标签
                    const now = Date.now();
                    const tabKey = `tab-${connection.id}-${session.id}-${now}`;

                    // 创建完整的标签对象
                    const newTab: TerminalTab = {
                        key: tabKey,
                        title: connection.name || `${connection.host}:${connection.port}`,
                        protocol: connection.protocol,
                        status: 'connecting',
                        connectionId: connection.id,
                        sessionId: session.id,
                        connection,
                        isConnected: false,
                        // 创建所需的引用
                        terminalRef: createRef<HTMLDivElement>(),
                        xtermRef: createRef(),
                        webSocketRef: createRef<WebSocket>(),
                        fitAddonRef: createRef(),
                        searchAddonRef: createRef(),
                        messageQueueRef: createRef<string[]>(),
                        // 添加额外的属性
                        hostname: connection.host,
                        port: connection.port,
                        username: connection.username
                    };

                    addTab(newTab);
                } else {
                    message.error('创建会话失败');
                }
            })
            .catch(error => {
                console.error('创建会话失败:', error);
                message.error('创建会话失败，请稍后再试');
            });
    }, [addTab, getActiveTab]);

    // 搜索终端内容
    const handleSearch = useCallback(() => {
        const activeTab = getActiveTab();
        if (!activeTab || !activeTab.searchAddonRef?.current) {
            message.error('搜索功能不可用');
            return;
        }

        const searchText = prompt('请输入搜索内容:');
        if (searchText) {
            activeTab.searchAddonRef.current.findNext(searchText);
        }
    }, [getActiveTab]);

    // 标签页变更处理
    const handleTabChange = useCallback((newActiveKey: string) => {
        setActiveTab(newActiveKey);

        // 触发标签激活事件
        window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
            detail: { tabKey: newActiveKey }
        }));

        // 确保更新本地存储的会话信息
        const activeTab = tabs.find(tab => tab.key === newActiveKey);
        if (activeTab) {
            localStorage.setItem('terminal_active_tab', newActiveKey);
            localStorage.setItem('current_terminal_session', JSON.stringify({
                connectionId: activeTab.connectionId,
                sessionId: activeTab.sessionId,
                tabKey: activeTab.key,
                connectionProtocol: activeTab.connection?.protocol,
                connectionName: activeTab.connection?.name,
                isConnected: activeTab.isConnected,
                timestamp: Date.now()
            }));
        }
    }, [setActiveTab, tabs]);

    // 标签编辑处理（添加/删除标签）
    const handleTabEdit = useCallback((
        targetKey: React.MouseEvent<Element, MouseEvent> | React.KeyboardEvent<Element> | string,
        action: 'add' | 'remove'
    ) => {
        if (action === 'add') {
            handleAddNewTab();
        } else if (action === 'remove') {
            // 确保targetKey是字符串
            const tabKey = typeof targetKey === 'string' ? targetKey : '';
            if (tabKey) {
                // 找到要关闭的标签页
                const tabToClose = tabs.find(tab => tab.key === tabKey);
                if (!tabToClose) return;

                // 关闭前检查WebSocket连接
                if (tabToClose.webSocketRef?.current) {
                    try {
                        tabToClose.webSocketRef.current.close();
                    } catch (e) {
                        console.error(`关闭WebSocket连接出错:`, e);
                    }
                }

                // 如果是最后一个标签且它是当前会话，清除localStorage中的会话信息
                if (tabs.length === 1) {
                    localStorage.removeItem('current_terminal_session');
                }

                closeTab(tabKey);
            }
        }
    }, [closeTab, handleAddNewTab, tabs]);

    // 切换侧边栏
    const handleToggleSidebar = useCallback(() => {
        // 创建并分发自定义事件
        window.dispatchEvent(new CustomEvent('toggle-operation-sidebar', { detail: {} }));
    }, []);

    return {
        handleCloseSession,
        handleCloseAllSessions,
        handleCopyContent,
        handleDownloadLog,
        handleAddNewTab,
        handleSearch,
        handleTabChange,
        handleTabEdit,
        handleToggleSidebar,
        getActiveTab
    };
};

export default useTerminalEvents; 
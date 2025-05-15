import React, { useState, useEffect, createRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { useTerminal } from '../../contexts/TerminalContext';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import type { TerminalTab } from '../../contexts/TerminalContext';
import TerminalConnector from './components/TerminalConnectionWrapper';

// 组件导入
import TerminalHeader from './components/TerminalHeader';
import TerminalTabs from './components/TerminalTabs';
import TerminalGuide from './components/TerminalGuide';
import TerminalContainers from './components/TerminalContainers';
import TerminalEventManager from './components/TerminalEventManager';
import TerminalSettingsApplier, { applyTerminalSettings } from './components/TerminalSettingsApplier';
import TerminalTabPersistence from './components/TerminalTabPersistence';
import TerminalSettings from './TerminalSettings';

import type { Connection } from '../../services/api';

// Hooks
import { useTerminalEvents } from './hooks/useTerminalEvents';
import { useTerminalConnection } from './hooks/useTerminalConnection';
import { useWebSocketManager } from './hooks/useWebSocketManager';
import { useTerminalInitialization } from './hooks/useTerminalInitialization';

// 样式
import styles from './styles.module.css';
import './Terminal.css';

// 工具函数
import loadTerminalDependencies from './utils/loadTerminalDependencies';

/**
 * 保存会话信息到localStorage
 */
const saveSessionInfo = (connectionId: number, sessionId: number, tabKey: string, connection?: any) => {
    try {
        const sessionInfo = {
            connectionId,
            sessionId,
            tabKey,
            timestamp: Date.now(),
            ...(connection && {
                connectionProtocol: connection.protocol,
                connectionName: connection.name,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                connection: connection
            })
        };

        localStorage.setItem('current_terminal_session', JSON.stringify(sessionInfo));
        localStorage.removeItem('all_tabs_closed');
    } catch (error) {
        console.error('保存会话信息失败:', error);
    }
};

/**
 * 终端组件
 */
function TerminalComponent(): React.ReactNode {
    // 终端上下文
    const {
        state: terminalState,
        addTab,
        closeTab,
        setActiveTab,
    } = useTerminal();
    const tabs = terminalState?.tabs || [];

    // 路由参数
    const { connectionId } = useParams<{ connectionId: string }>();
    const navigate = useNavigate();
    const searchParams = useSearchParams();
    const sessionParam = searchParams[0]?.get('session');

    // 状态
    const [loading, setLoading] = useState(true);
    const [settingsVisible, setSettingsVisible] = useState(false);

    // Hooks
    const connectionProps = useTerminalConnection();
    const connectionParamsForConnector = connectionId ? {
        connectionId: parseInt(connectionId),
        sessionId: sessionParam ? parseInt(sessionParam) : undefined
    } : undefined;

    const {
        handleCopyContent,
        handleDownloadLog,
        handleTabChange: originalHandleTabChange,
        handleToggleSidebar,
        getActiveTab
    } = useTerminalEvents();

    const { createWebSocketConnection } = useWebSocketManager();
    const { initTerminal } = useTerminalInitialization();

    // 加载依赖
    useEffect(() => {
        loadTerminalDependencies();

        // 设置加载完成
        const timer = setTimeout(() => {
            setLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, []);

    // 标签切换处理
    const handleTabChange = (key: string) => {
        originalHandleTabChange(key);
        localStorage.setItem('terminal_active_tab', key);

        // 清理URL参数
        try {
            window.history.replaceState({}, '', '/terminal/');
        } catch (e) {
            setTimeout(() => {
                navigate('/terminal/');
            }, 0);
        }
    };

    // 标签关闭处理
    const handleTabClose = (key: string) => {
        closeTab(key);
    };

    // 使用连接信息添加标签
    const addTabWithConnection = (connection: Connection, connectionId: number, sessionId?: number) => {
        const now = Date.now();
        const tabKey = `tab-${connectionId}-${sessionId || 'nosession'}-${now}`;

        // 创建新标签
        const newTab: TerminalTab = {
            key: tabKey,
            title: connection.name || `${connection.host}:${connection.port}`,
            protocol: connection.protocol,
            status: 'connecting',
            connectionId,
            sessionId,
            connection,
            isConnected: false,
            // 创建所需的引用
            terminalRef: createRef<HTMLDivElement>(),
            xtermRef: createRef<XTerminal>(),
            webSocketRef: createRef<WebSocket>(),
            fitAddonRef: createRef<FitAddon>(),
            searchAddonRef: createRef<SearchAddon>(),
            messageQueueRef: createRef<string[]>(),
            // 添加额外的属性
            hostname: connection.host,
            port: connection.port,
            username: connection.username
        };

        // 添加标签
        addTab(newTab);

        // 保存会话信息
        if (sessionId) {
            saveSessionInfo(connectionId, sessionId, tabKey, connection);
        }

        // 设置活动标签
        setActiveTab(newTab.key);

        // 清理URL参数
        try {
            window.history.replaceState({}, '', '/terminal/');
        } catch (e) {
            console.error('清理URL参数失败:', e);
        }

        return tabKey;
    };

    // 如果正在加载，显示加载指示器
    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                flexDirection: 'column'
            }}>
                <Spin size="large" />
                <div style={{ marginTop: '20px' }}>正在加载终端组件...</div>
            </div>
        );
    }

    return (
        <div className={styles.terminalPage} style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <TerminalConnector connectionParams={connectionParamsForConnector}>
                {(connProps) => {
                    // 确保总是有tab数组
                    const displayTabs = connProps.tabs || [];
                    const finalTabs = (displayTabs && displayTabs.length > 0)
                        ? displayTabs
                        : terminalState?.tabs || [];

                    return (
                        <TerminalTabPersistence
                            tabs={finalTabs}
                            activeTabKey={connProps.activeTabKey}
                        >
                            <TerminalSettingsApplier>
                                <TerminalEventManager
                                    tabs={finalTabs}
                                    activeTabKey={connProps.activeTabKey}
                                    setActiveTab={setActiveTab}
                                    createWebSocketConnection={createWebSocketConnection}
                                    initTerminal={initTerminal}
                                >
                                    {/* 终端标题 */}
                                    <div className={`${styles.terminalHeader} ${connProps.fullscreen ? styles.fullscreenHeader : ''}`}>
                                        <TerminalTabs
                                            tabs={finalTabs}
                                            activeKey={connProps.activeTabKey}
                                            onTabChange={handleTabChange}
                                            onTabEdit={(targetKey, action) => {
                                                if (action === 'remove') {
                                                    handleTabClose(targetKey.toString());
                                                }
                                            }}
                                            onTabClose={handleTabClose}
                                        />
                                        {/* 工具栏 */}
                                        <div className={styles.terminalToolbar}>
                                            <TerminalHeader
                                                onCopyContent={handleCopyContent}
                                                onDownloadLog={handleDownloadLog}
                                                networkLatency={connProps.networkLatency}
                                                terminalMode={connProps.terminalMode || 'normal'}
                                                onToggleCode={() => { }}
                                                onToggleSplit={() => { }}
                                                onOpenSettings={() => setSettingsVisible(true)}
                                                onToggleFullscreen={connProps.toggleFullscreen || (() => { })}
                                                onCloseTab={() => handleTabClose(connProps.activeTabKey)}
                                            />
                                        </div>
                                    </div>

                                    {/* 终端内容区域 */}
                                    {connProps.tabsCount > 0 ? (
                                        <TerminalContainers
                                            tabs={finalTabs}
                                            activeTabKey={connProps.activeTabKey}
                                        />
                                    ) : (
                                        <TerminalGuide
                                            onToggleSidebar={handleToggleSidebar}
                                            sidebarCollapsed={!!connProps.sidebarCollapsed}
                                        />
                                    )}

                                    {/* 设置面板 */}
                                    <TerminalSettings
                                        visible={settingsVisible}
                                        onCancel={() => setSettingsVisible(false)}
                                        onApply={(settings) => {
                                            const activeTab = getActiveTab();
                                            if (
                                                activeTab &&
                                                activeTab.xtermRef?.current &&
                                                activeTab.fitAddonRef?.current
                                            ) {
                                                applyTerminalSettings(
                                                    settings,
                                                    activeTab,
                                                    activeTab.xtermRef.current,
                                                    activeTab.fitAddonRef.current
                                                );
                                            }
                                            setSettingsVisible(false);
                                        }}
                                    />
                                </TerminalEventManager>
                            </TerminalSettingsApplier>
                        </TerminalTabPersistence>
                    );
                }}
            </TerminalConnector>
        </div>
    );
}

export default TerminalComponent;

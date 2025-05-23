/*
 * @Author: Await
 * @Date: 2025-05-21 15:31:39
 * @LastEditors: Await
 * @LastEditTime: 2025-05-23 19:34:00
 * @Description: 终端容器组件，负责渲染适当的终端类型
 */
import React, { useEffect, useCallback, useRef, useState } from 'react';
import './TerminalContainers.module.css';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { Connection } from '../Terminal.d';
import SimpleTerminal from '../../../components/SimpleTerminal';
import RdpTerminal from '../../../components/RdpTerminal';

// 判断是否为图形化协议
const isGraphicalProtocol = (protocol?: string): boolean => {
    return protocol === 'rdp' || protocol === 'vnc';
};

// 获取标签的协议类型
const getTabProtocol = (tab: TerminalTab): string => {
    // 从连接或标签中获取协议
    return tab.protocol || 'ssh';
};

// 终端容器组件属性
interface TerminalContainersProps {
    tabs: TerminalTab[];
    activeTabKey: string;
    isConnected?: boolean;
    connection?: Connection;
    createWebSocketConnection?: (sessionId: number | string, tabKey: string) => WebSocket | null;
}

/**
 * 终端容器组件
 * 根据标签的协议类型，创建和管理不同类型的终端容器
 */
const TerminalContainers: React.FC<TerminalContainersProps> = ({
    tabs,
    activeTabKey,
    isConnected,
    connection,
    createWebSocketConnection
}) => {
    // 确保tabs是一个数组
    const safeTabs = Array.isArray(tabs) ? tabs : [];

    // 终端容器引用的集合，用于跟踪已创建的DOM容器
    const containerRefsMap = useRef<Map<string, boolean>>(new Map());

    // 触发终端就绪事件
    const triggerTerminalReady = (tab: TerminalTab) => {
        if (!tab) return;

        window.dispatchEvent(new CustomEvent('terminal-ready', {
            detail: {
                tabKey: tab.key,
                connectionId: tab.connectionId,
                sessionId: tab.sessionId,
                protocol: getTabProtocol(tab)
            }
        }));
    };

    // 处理特定标签的终端初始化
    const initializeTerminalForTab = useCallback((tabKey: string) => {
        console.log(`初始化标签的终端: ${tabKey}`);

        // 创建WebSocket连接
        const tab = safeTabs.find(t => t.key === tabKey);

        // 添加更详细的调试信息
        if (!tab) {
            console.error(`无法找到标签: ${tabKey}, 可用标签: ${safeTabs.map(t => t.key).join(', ')}`);
            return;
        }

        console.log(`标签 ${tabKey} 信息:`, {
            key: tab.key,
            connectionId: tab.connectionId,
            sessionId: tab.sessionId,
            hasWebSocketRef: !!tab.webSocketRef,
            webSocketState: tab.webSocketRef?.current?.readyState,
            hasCreateWebSocketConnection: !!createWebSocketConnection
        });

        if (!tab.sessionId) {
            console.error(`无法创建WebSocket连接: 标签 ${tabKey} 缺少sessionId`);
            console.log(`标签完整信息:`, tab);
            return;
        }

        if (!createWebSocketConnection) {
            console.error(`无法创建WebSocket连接: createWebSocketConnection函数未提供`);
            return;
        }

        if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
            console.log(`标签 ${tabKey} 已有活跃的WebSocket连接，跳过创建`);
            triggerTerminalReady(tab);
            return;
        }

        // 创建WebSocket连接
        console.log(`为标签 ${tabKey} 创建WebSocket连接，sessionId: ${tab.sessionId}`);
        try {
            const newWs = createWebSocketConnection(tab.sessionId, tabKey);

            // 更新WebSocket引用
            if (tab.webSocketRef && newWs) {
                tab.webSocketRef.current = newWs;

                // 等待连接建立后触发终端就绪事件
                if (newWs.readyState === WebSocket.OPEN) {
                    triggerTerminalReady(tab);
                } else {
                    newWs.addEventListener('open', () => {
                        triggerTerminalReady(tab);
                    });

                    // 添加错误处理
                    newWs.addEventListener('error', (e) => {
                        console.error(`WebSocket连接错误: ${e}`);
                    });
                }
            } else if (!newWs) {
                console.error(`WebSocket连接创建失败: sessionId=${tab.sessionId}, tabKey=${tabKey}`);
            }
        } catch (error) {
            console.error(`为标签 ${tabKey} 创建WebSocket连接失败:`, error);
        }
    }, [safeTabs, createWebSocketConnection]);

    // 初始化已激活标签的终端
    useEffect(() => {
        if (activeTabKey && safeTabs.some(tab => tab.key === activeTabKey)) {
            initializeTerminalForTab(activeTabKey);
        }
    }, [activeTabKey, initializeTerminalForTab, safeTabs]);

    // 确保所有标签都有DOM容器
    useEffect(() => {
        // 创建所有标签的DOM容器
        safeTabs.forEach(tab => {
            const containerId = `terminal-container-${tab.key}`;
            const containerElement = document.getElementById(containerId);

            if (!containerElement) {
                console.error(`找不到终端容器元素: ${containerId}`);
            } else if (!containerRefsMap.current.has(tab.key)) {
                // 记录容器已创建
                containerRefsMap.current.set(tab.key, true);
                console.log(`终端容器已创建: ${containerId}`);

                // 如果是活动标签，初始化终端
                if (tab.key === activeTabKey) {
                    initializeTerminalForTab(tab.key);
                }
            }
        });
    }, [safeTabs, activeTabKey, initializeTerminalForTab]);

    // 处理终端容器可见性
    const getContainerStyle = (tabKey: string) => {
        return {
            display: tabKey === activeTabKey ? 'flex' : 'none',
            width: '100%',
            height: '100%',
            position: 'relative' as const,
        };
    };

    // 渲染特定标签的终端组件
    const renderTerminalForTab = (tab: TerminalTab) => {
        // 确定协议类型
        const protocol = getTabProtocol(tab);
        const isGraphical = isGraphicalProtocol(protocol);

        // 根据协议类型选择终端组件
        if (isGraphical) {
            return (
                <RdpTerminal
                    key={`rdp-${tab.key}`}
                    connectionId={tab.connectionId || 0}
                    sessionId={tab.sessionId || 0}
                    webSocketRef={tab.webSocketRef}
                    visible={tab.key === activeTabKey}
                />
            );
        } else {
            return (
                <SimpleTerminal
                    key={`simple-${tab.key}`}
                    connectionId={tab.connectionId || 0}
                    sessionId={tab.sessionId || 0}
                    webSocketRef={tab.webSocketRef}
                    visible={tab.key === activeTabKey}
                />
            );
        }
    };

    return (
        <div className="terminal-containers-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
            {/* 为每个标签创建容器 */}
            {safeTabs.map(tab => (
                <div
                    key={tab.key}
                    id={`terminal-container-${tab.key}`}
                    className="terminal-container"
                    style={getContainerStyle(tab.key)}
                    ref={tab.terminalRef}
                >
                    {renderTerminalForTab(tab)}
                </div>
            ))}

            {/* 当没有标签时显示提示 */}
            {safeTabs.length === 0 && (
                <div className="no-terminal-message" style={{ padding: '20px', textAlign: 'center' }}>
                    请从左侧菜单选择一个连接
                </div>
            )}
        </div>
    );
};

export default TerminalContainers; 
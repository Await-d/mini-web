/*
 * @Author: Await
 * @Date: 2025-05-21 15:31:39
 * @LastEditors: Await
 * @LastEditTime: 2025-05-23 20:43:35
 * @Description: 终端容器组件，负责渲染适当的终端类型
 */
import React, { useEffect, useCallback, useRef, useState } from 'react';
import styles from './TerminalContainers.module.css';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { Connection } from '../Terminal.d';
import SimpleTerminal from '../../../components/SimpleTerminal';
import RdpTerminal from '../../../components/RdpTerminal';
import webSocketService from '../services/WebSocketService';

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

    // 记录已初始化的WebSocket连接
    const initializedWebSocketsRef = useRef<Set<string>>(new Set());

    // 初始化WebSocket连接
    const initializeWebSocket = useCallback((tab: TerminalTab) => {
        // 如果已经初始化或没有必要的属性，跳过
        if (!tab || !tab.sessionId || initializedWebSocketsRef.current.has(tab.key)) {
            return;
        }

        console.log(`初始化WebSocket连接: tabKey=${tab.key}, sessionId=${tab.sessionId}`);

        // 使用createWebSocketConnection函数创建WebSocket连接
        if (createWebSocketConnection) {
            try {
                const ws = createWebSocketConnection(tab.sessionId, tab.key);

                // 如果WebSocket创建成功，保存到标签引用
                if (ws && tab.webSocketRef) {
                    tab.webSocketRef.current = ws;
                    initializedWebSocketsRef.current.add(tab.key);

                    console.log(`WebSocket连接已创建: tabKey=${tab.key}`);
                } else {
                    console.error(`WebSocket连接创建失败: tabKey=${tab.key}`);
                }
            } catch (error) {
                console.error(`创建WebSocket连接出错: tabKey=${tab.key}`, error);
            }
        } else {
            // 如果没有传入createWebSocketConnection，尝试使用WebSocketService
            try {
                const ws = webSocketService.connect(tab);

                if (ws && tab.webSocketRef) {
                    tab.webSocketRef.current = ws;
                    initializedWebSocketsRef.current.add(tab.key);

                    console.log(`WebSocket连接已创建(使用Service): tabKey=${tab.key}`);
                }
            } catch (error) {
                console.error(`创建WebSocket连接出错(使用Service): tabKey=${tab.key}`, error);
            }
        }
    }, [createWebSocketConnection]);

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

    // 处理终端重连请求
    const handleReconnectRequest = useCallback((connectionId: number, sessionId: string | number) => {
        console.log(`处理重连请求: connectionId=${connectionId}, sessionId=${sessionId}`);

        // 查找对应的标签
        const tab = safeTabs.find(t =>
            t.connectionId === connectionId &&
            t.sessionId === sessionId
        );

        if (!tab) {
            console.error(`找不到匹配的标签: connectionId=${connectionId}, sessionId=${sessionId}`);
            return;
        }

        // 重置初始化状态
        initializedWebSocketsRef.current.delete(tab.key);

        // 触发重连事件
        window.dispatchEvent(new CustomEvent('terminal-reconnect', {
            detail: {
                tabKey: tab.key,
                connectionId,
                sessionId
            }
        }));
    }, [safeTabs]);

    // 确保所有标签都有DOM容器并初始化WebSocket
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

                // 如果是活动标签，初始化WebSocket并触发终端就绪事件
                if (tab.key === activeTabKey) {
                    // 初始化WebSocket连接
                    initializeWebSocket(tab);

                    // 延迟触发终端就绪事件，确保DOM和WebSocket都已准备就绪
                    setTimeout(() => {
                        triggerTerminalReady(tab);
                    }, 100);
                }
            }
        });
    }, [safeTabs, activeTabKey, initializeWebSocket]);

    // 标签激活时初始化WebSocket
    useEffect(() => {
        // 当标签激活时，确保其WebSocket已初始化
        const activeTab = safeTabs.find(tab => tab.key === activeTabKey);
        if (activeTab && !initializedWebSocketsRef.current.has(activeTab.key)) {
            // 初始化WebSocket连接
            initializeWebSocket(activeTab);

            // 延迟触发终端就绪事件
            setTimeout(() => {
                triggerTerminalReady(activeTab);
            }, 100);
        }
    }, [activeTabKey, safeTabs, initializeWebSocket]);

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
                    onReconnectRequest={handleReconnectRequest}
                />
            );
        }
    };

    return (
        <div className={styles.terminalContainersWrapper}>
            {/* 为每个标签创建容器 */}
            {safeTabs.map(tab => (
                <div
                    key={tab.key}
                    id={`terminal-container-${tab.key}`}
                    className={styles.terminalContainer}
                    style={getContainerStyle(tab.key)}
                    ref={tab.terminalRef}
                >
                    {renderTerminalForTab(tab)}
                </div>
            ))}

            {/* 当没有标签时显示提示 */}
            {safeTabs.length === 0 && (
                <div className={styles.noTerminalMessage}>
                    请从左侧菜单选择一个连接
                </div>
            )}
        </div>
    );
};

export default TerminalContainers; 
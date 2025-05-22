/*
 * @Author: Await
 * @Date: 2025-05-10 22:19:37
 * @LastEditors: Await
 * @LastEditTime: 2025-05-21 20:23:05
 * @Description: 终端容器管理组件
 */
import React, { useCallback, useEffect } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { Connection } from '../Terminal.d';
import GraphicalTerminal from '../../../components/GraphicalTerminal';
import RdpTerminal from '../../../components/RdpTerminal';
import SimpleTerminal from '../../../components/SimpleTerminal';
import { getTabProtocol, isGraphicalProtocol } from '../utils/protocolHandler';
import styles from '../styles.module.css';

interface TerminalContainersProps {
    tabs: TerminalTab[];
    activeTabKey: string;
    isConnected?: boolean;
    connection?: Connection;
    createWebSocketConnection?: (tab: TerminalTab) => WebSocket | null;
}

/**
 * 终端容器管理组件
 * 负责管理多个终端容器的渲染和切换显示
 */
const TerminalContainers: React.FC<TerminalContainersProps> = ({
    tabs,
    activeTabKey,
    createWebSocketConnection
}) => {
    // 处理RDP调整大小
    const handleRdpResize = useCallback((tab: TerminalTab, width: number, height: number) => {
        if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
            try {
                const resizeCommand = JSON.stringify({
                    type: 'resize',
                    width,
                    height
                });
                tab.webSocketRef.current.send(resizeCommand);
            } catch (error) {
                console.error('发送RDP调整大小命令失败:', error);
            }
        }
    }, []);

    // 处理输入数据发送
    const handleRdpInput = useCallback((tab: TerminalTab, data: string) => {
        if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
            try {
                tab.webSocketRef.current.send(data);
            } catch (error) {
                console.error('发送RDP输入数据失败:', error);
            }
        }
    }, []);

    // 当激活标签变化时触发终端就绪事件
    useEffect(() => {
        if (!activeTabKey) {
            console.log('没有激活的标签键');
            return;
        }

        // 查找激活的标签
        const activeTab = tabs.find(tab => tab.key === activeTabKey);
        if (!activeTab) {
            console.error(`在标签列表(${tabs.length}个标签)中找不到激活的标签: ${activeTabKey}`);

            // 记录所有标签键以便调试
            const tabKeys = tabs.map(t => t.key).join(', ');
            console.log(`可用标签键: [${tabKeys}]`);

            // 可以考虑在合适的时机重新激活一个有效的标签
            if (tabs.length > 0) {
                console.log('将在1秒后尝试激活第一个可用标签');
                setTimeout(() => {
                    if (tabs.length > 0 && activeTabKey !== tabs[0].key) {
                        const event = new CustomEvent('terminal-tab-activated', {
                            detail: { tabKey: tabs[0].key }
                        });
                        window.dispatchEvent(event);
                    }
                }, 1000);
            }
            return;
        }

        console.log(`激活标签: ${activeTabKey}, 准备触发终端就绪事件`);

        // 检查是否有DOM容器
        if (!activeTab.terminalRef?.current) {
            console.error(`标签 ${activeTabKey} 没有创建DOM容器`);
            return;
        }

        // 验证连接ID和会话ID
        let connectionId = activeTab.connectionId || (activeTab.connection ? activeTab.connection.id : null);
        let sessionId = activeTab.sessionId;
        let protocol = activeTab.protocol || (activeTab.connection ? activeTab.connection.protocol : null);

        if (!connectionId) {
            console.error(`标签 ${activeTabKey} 没有有效的连接ID`);
            // 尝试从标签键中提取连接ID
            const match = activeTab.key.match(/conn-(\d+)/);
            if (match && match[1]) {
                connectionId = parseInt(match[1], 10);
                console.log(`从标签键中提取的连接ID: ${connectionId}`);
            }
        }

        if (!sessionId) {
            console.error(`标签 ${activeTabKey} 没有有效的会话ID`);
            // 尝试从标签键中提取会话ID
            const match = activeTab.key.match(/session-(\d+)/);
            if (match && match[1]) {
                sessionId = parseInt(match[1], 10);
                console.log(`从标签键中提取的会话ID: ${sessionId}`);
            }
        }

        // 检查DOM容器是否已创建
        // 仅当有标签、标签有DOM容器、标签有连接ID和会话ID时，触发终端就绪事件
        if (connectionId && sessionId) {
            // 检查标签页是否已有WebSocket连接
            if (activeTab.webSocketRef?.current) {
                const readyState = activeTab.webSocketRef.current.readyState;
                if (readyState === WebSocket.OPEN) {
                    console.log(`标签 ${activeTabKey} 已有打开的WebSocket连接，跳过创建`);
                } else if (readyState === WebSocket.CONNECTING) {
                    console.log(`标签 ${activeTabKey} 的WebSocket连接正在建立中，跳过创建`);
                } else {
                    // 连接已关闭或正在关闭，需要重新创建
                    console.log(`标签 ${activeTabKey} 的WebSocket连接状态异常(${readyState})，将触发重新连接`);
                    console.log(`触发终端就绪事件: tabKey=${activeTabKey}, connectionId=${connectionId}, sessionId=${sessionId}, protocol=${protocol}`);

                    // 触发终端就绪事件
                    window.dispatchEvent(new CustomEvent('terminal-ready', {
                        detail: {
                            tabKey: activeTabKey,
                            connectionId: connectionId,
                            sessionId: sessionId,
                            protocol: protocol
                        }
                    }));
                }
            } else {
                // 没有WebSocket连接，需要创建
                console.log(`触发终端就绪事件: tabKey=${activeTabKey}, connectionId=${connectionId}, sessionId=${sessionId}, protocol=${protocol}`);

                // 触发终端就绪事件
                window.dispatchEvent(new CustomEvent('terminal-ready', {
                    detail: {
                        tabKey: activeTabKey,
                        connectionId: connectionId,
                        sessionId: sessionId,
                        protocol: protocol
                    }
                }));
            }
        } else {
            console.error(`无法触发终端就绪事件: 缺少connectionId(${connectionId})或sessionId(${sessionId})`);
            console.log('标签信息:', {
                key: activeTab.key,
                connectionId: activeTab.connectionId,
                sessionId: activeTab.sessionId,
                hasConnection: !!activeTab.connection,
                connectionInfo: activeTab.connection ? {
                    id: activeTab.connection.id,
                    protocol: activeTab.connection.protocol
                } : null
            });
        }
    }, [activeTabKey, tabs]);

    return (
        <div className={styles.terminalContainers}>
            {tabs.map(tab => {
                // 获取标签协议
                const protocol = getTabProtocol(tab);
                const isGraphical = protocol ? isGraphicalProtocol(protocol) : false;
                const isRdp = protocol === 'rdp';
                const isVisible = tab.key === activeTabKey;

                // 提取connection信息
                const connectionId = tab.connectionId || 0;
                const sessionId = tab.sessionId || '';

                // 创建一个唯一id，用于标识DOM元素
                const terminalDomId = `terminal-element-conn-${connectionId}-session-${sessionId}`;

                // 根据可见性设置CSS类名
                const visibilityClass = isVisible ? styles.visible : styles.hidden;

                return (
                    <div
                        key={tab.key}
                        className={`${styles.terminalContainer} ${visibilityClass}`}
                        data-key={tab.key}
                        data-protocol={protocol || 'unknown'}
                        data-graphical={isGraphical ? 'true' : 'false'}
                        data-connection-id={connectionId}
                        data-session-id={sessionId}
                    >
                        {isGraphical ? (
                            isRdp ? (
                                <RdpTerminal
                                    connectionId={connectionId}
                                    sessionId={sessionId}
                                    webSocketRef={tab.webSocketRef}
                                    onResize={(width, height) => handleRdpResize(tab, width, height)}
                                    onInput={(data) => handleRdpInput(tab, data)}
                                />
                            ) : (
                                <GraphicalTerminal
                                    connectionId={connectionId}
                                    sessionId={sessionId}
                                    webSocketRef={tab.webSocketRef}
                                />
                            )
                        ) : (
                            <SimpleTerminal
                                connectionId={connectionId}
                                sessionId={sessionId}
                                webSocketRef={tab.webSocketRef}
                                visible={isVisible}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TerminalContainers; 
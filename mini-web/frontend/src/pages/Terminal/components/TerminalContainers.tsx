/*
 * @Author: Await
 * @Date: 2025-05-10 22:19:37
 * @LastEditors: Await
 * @LastEditTime: 2025-05-18 12:00:48
 * @Description: 终端容器管理组件
 */
import React, { useCallback, useEffect } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import GraphicalTerminal from '../../../components/GraphicalTerminal';
import RdpTerminal from '../../../components/RdpTerminal';
import { getTabProtocol, isGraphicalProtocol } from '../utils/protocolHandler';
import styles from '../styles.module.css';

interface TerminalContainersProps {
    tabs: TerminalTab[];
    activeTabKey: string;
}

/**
 * 终端容器管理组件
 * 负责管理多个终端容器的渲染和切换显示
 */
const TerminalContainers: React.FC<TerminalContainersProps> = ({
    tabs,
    activeTabKey
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

        // 检查是否已经有WebSocket连接
        const hasExistingConnection = activeTab.webSocketRef?.current &&
            (activeTab.webSocketRef.current.readyState === WebSocket.CONNECTING ||
                activeTab.webSocketRef.current.readyState === WebSocket.OPEN);

        if (!hasExistingConnection) {
            console.log(`激活标签: ${activeTabKey}, 准备触发终端就绪事件`);

            // 提取连接和会话信息
            const connectionId = activeTab.connectionId || activeTab.connection?.id || 0;
            const sessionId = activeTab.sessionId || '';

            // 检查必要条件
            if (!connectionId || !sessionId) {
                console.error(`标签缺少必要的连接信息: connectionId=${connectionId}, sessionId=${sessionId}`);
                return;
            }

            // 使用自定义事件通知终端已准备就绪，传递完整的连接信息
            const event = new CustomEvent('terminal-ready', {
                detail: {
                    tabKey: activeTabKey,
                    connectionId,
                    sessionId,
                    protocol: activeTab.protocol || activeTab.connection?.protocol || 'ssh'
                }
            });

            console.log(`触发终端就绪事件: tabKey=${activeTabKey}, connectionId=${connectionId}, sessionId=${sessionId}`);
            window.dispatchEvent(event);
        } else {
            console.log(`标签 ${activeTabKey} 已有WebSocket连接，跳过创建`);
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
                        style={{
                            visibility: isVisible ? 'visible' : 'hidden',
                            zIndex: isVisible ? 10 : -1,
                            height: '100%',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            overflow: 'hidden'
                        }}
                    >
                        {isRdp ? (
                            // RDP终端
                            <div
                                id={terminalDomId}
                                ref={node => {
                                    if (node && tab.terminalRef) {
                                        tab.terminalRef.current = node;
                                    }
                                }}
                                className={styles.rdpContainer}
                                style={{
                                    height: '100%',
                                    width: '100%',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    overflow: 'hidden'
                                }}
                            >
                                <RdpTerminal
                                    webSocketRef={tab.webSocketRef}
                                    connectionId={connectionId}
                                    sessionId={sessionId}
                                    onResize={(width, height) => handleRdpResize(tab, width, height)}
                                    onInput={(data) => handleRdpInput(tab, data)}
                                />
                            </div>
                        ) : isGraphical ? (
                            // 其他图形终端
                            <div
                                id={terminalDomId}
                                ref={node => {
                                    if (node && tab.terminalRef) {
                                        tab.terminalRef.current = node;
                                    }
                                }}
                                className={styles.graphicalTerminalContainer}
                                style={{
                                    height: '100%',
                                    width: '100%',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    overflow: 'hidden'
                                }}
                            >
                                <GraphicalTerminal
                                    protocol={protocol || 'unknown'}
                                    visible={isVisible}
                                    webSocketRef={tab.webSocketRef}
                                />
                            </div>
                        ) : (
                            // 非图形终端(xterm)
                            <div
                                id={terminalDomId}
                                ref={node => {
                                    if (node && tab.terminalRef) {
                                        tab.terminalRef.current = node;
                                        console.log(`SSH终端DOM容器已创建 ID=${terminalDomId}`, node);
                                    }
                                }}
                                className={styles.xtermPlaceholder}
                                style={{
                                    height: '100%',
                                    width: '100%',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    overflow: 'hidden',
                                    backgroundColor: '#1e1e1e',
                                    color: '#ffffff',
                                    padding: '10px',
                                    boxSizing: 'border-box',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    zIndex: isVisible ? 1 : -1,
                                    visibility: isVisible ? 'visible' : 'hidden'
                                }}
                            >
                                <div style={{ fontSize: '14px', color: '#0f0', marginBottom: '10px' }}>
                                    <strong>正在初始化{protocol}终端...</strong>
                                    <div>连接信息：</div>
                                    <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                        <li>协议: {protocol}</li>
                                        <li>连接ID: {connectionId}</li>
                                        <li>会话ID: {sessionId}</li>
                                        <li>标签键: {tab.key}</li>
                                    </ul>
                                    <div>
                                        {tab.connection?.host && <div>主机: {tab.connection.host}</div>}
                                        {tab.connection?.port && <div>端口: {tab.connection.port}</div>}
                                        {tab.connection?.username && <div>用户名: {tab.connection.username}</div>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TerminalContainers; 
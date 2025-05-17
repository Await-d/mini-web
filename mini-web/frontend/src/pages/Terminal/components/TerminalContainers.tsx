/*
 * @Author: Await
 * @Date: 2025-05-10 22:19:37
 * @LastEditors: Await
 * @LastEditTime: 2025-05-17 14:12:40
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
        if (activeTabKey) {
            // 使用自定义事件通知终端已准备就绪
            const event = new CustomEvent('terminal-ready', {
                detail: { tabKey: activeTabKey }
            });
            window.dispatchEvent(event);
        }
    }, [activeTabKey]);

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
                                    }
                                }}
                                className={styles.xtermPlaceholder}
                                style={{
                                    height: '100%',
                                    width: '100%',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    overflow: 'hidden'
                                }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TerminalContainers; 
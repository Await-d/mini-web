/*
 * @Author: Await
 * @Date: 2025-05-10 22:19:37
 * @LastEditors: Await
 * @LastEditTime: 2025-05-15 21:47:25
 * @Description: 终端容器管理组件
 */
import React, { useEffect } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import GraphicalTerminal from '../../../components/GraphicalTerminal';
import RdpTerminal from '../../../components/RdpTerminal';
import { getTabProtocol, isGraphicalProtocol } from '../utils/protocolHandler';
import styles from '../styles.module.css';
import '../Terminal.css';

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
    useEffect(() => {
        console.log('TerminalContainers重新渲染:', { tabsCount: tabs.length, activeTabKey });
    }, [tabs, activeTabKey]);

    return (
        <div className="terminalContainers">
            {tabs.map(tab => {
                // 获取标签协议
                const protocol = getTabProtocol(tab);
                const isGraphical = protocol ? isGraphicalProtocol(protocol) : false;
                const isRdp = protocol === 'rdp';
                const isVisible = tab.key === activeTabKey;

                // 设置可见性类名
                const visibilityClass = isVisible ? 'visible' : 'hidden';

                return (
                    <div
                        key={tab.key}
                        className={`terminal-container ${visibilityClass}`}
                        data-key={tab.key}
                        data-protocol={protocol || 'unknown'}
                        data-graphical={isGraphical ? 'true' : 'false'}
                        style={{
                            display: isVisible ? 'block' : 'none',
                            visibility: isVisible ? 'visible' : 'hidden'
                        }}
                    >
                        {isRdp ? (
                            // RDP终端
                            <div className="rdp-container">
                                <RdpTerminal
                                    webSocketRef={tab.webSocketRef}
                                    connectionId={tab.connectionId || 0}
                                    sessionId={tab.sessionId ? tab.sessionId.toString() : 'default'}
                                    onResize={(width, height) => {
                                        if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                                            try {
                                                const resizeCommand = JSON.stringify({
                                                    type: 'resize',
                                                    width,
                                                    height
                                                });
                                                tab.webSocketRef.current.send(resizeCommand);
                                            } catch (error) {
                                                console.error('发送RDP大小调整命令失败:', error);
                                            }
                                        }
                                    }}
                                    onInput={(data) => {
                                        if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                                            tab.webSocketRef.current.send(data);
                                        }
                                    }}
                                />
                            </div>
                        ) : isGraphical ? (
                            // 其他图形终端
                            <div className="graphical-terminal-container">
                                <GraphicalTerminal
                                    protocol={protocol || 'unknown'}
                                    visible={isVisible}
                                    webSocketRef={tab.webSocketRef}
                                />
                            </div>
                        ) : (
                            // 非图形终端(xterm)
                            <div className="xterm-placeholder" />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TerminalContainers; 
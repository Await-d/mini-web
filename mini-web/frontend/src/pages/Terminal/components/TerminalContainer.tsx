import React, { useEffect, useRef } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import styles from '../styles.module.css';

interface TerminalContainerProps {
    tab: TerminalTab;
    activeTabKey: string;
    onTerminalReady?: (tabKey: string, domId: string, connectionId?: number, sessionId?: number) => void;
}

/**
 * 终端容器组件
 * 负责渲染终端DOM容器，并在DOM准备就绪后通知父组件
 */
const TerminalContainer: React.FC<TerminalContainerProps> = ({
    tab,
    activeTabKey,
    onTerminalReady
}) => {
    // 创建DOM初始化标记的引用
    const initFiredRef = useRef(false);
    const uniqueDomId = `terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`;

    // 在DOM准备好时通知父组件
    useEffect(() => {
        // 仅对活动标签触发终端初始化
        if (activeTabKey === tab.key && !initFiredRef.current) {
            // 确保DOM元素已准备就绪
            const timer = setTimeout(() => {
                // 触发自定义事件，通知终端准备好了
                if (onTerminalReady) {
                    onTerminalReady(tab.key, uniqueDomId, tab.connectionId, tab.sessionId);
                } else {
                    // 作为备选方案，使用自定义事件
                    window.dispatchEvent(new CustomEvent('terminal-ready', {
                        detail: {
                            tabKey: tab.key,
                            domId: uniqueDomId,
                            connectionId: tab.connectionId,
                            sessionId: tab.sessionId
                        }
                    }));
                }

                // 标记初始化已触发
                initFiredRef.current = true;
            }, 100);

            // 清理函数
            return () => clearTimeout(timer);
        }
    }, [tab, activeTabKey, uniqueDomId, onTerminalReady]);

    return (
        <div
            id={uniqueDomId}
            ref={tab.terminalRef}
            className={`${styles.terminalContainer} ${activeTabKey === tab.key ? styles.activeTerminal : styles.hiddenTerminal}`}
            data-tab-key={tab.key}
            data-connection-id={tab.connectionId}
            data-session-id={tab.sessionId}
        />
    );
};

export default TerminalContainer; 
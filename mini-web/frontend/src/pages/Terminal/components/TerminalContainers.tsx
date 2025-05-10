/*
 * @Author: Await
 * @Date: 2025-05-10 22:19:37
 * @LastEditors: Await
 * @LastEditTime: 2025-05-10 22:24:17
 * @Description: 请填写简介
 */
import React, { useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import TerminalContainer from './TerminalContainer';
import styles from '../styles.module.css';

interface TerminalContainersProps {
    tabs: TerminalTab[];
    activeTabKey: string;
}

/**
 * 终端容器管理组件
 * 负责管理多个终端容器的渲染和事件分发
 */
const TerminalContainers: React.FC<TerminalContainersProps> = ({
    tabs,
    activeTabKey
}) => {
    // 处理终端DOM准备就绪的回调
    const handleTerminalReady = useCallback((tabKey: string, domId: string, connectionId?: number, sessionId?: number) => {
        // 分派初始化事件，通知父组件
        window.dispatchEvent(new CustomEvent('terminal-ready', {
            detail: {
                tabKey,
                domId,
                connectionId,
                sessionId
            }
        }));
    }, []);

    // 如果没有标签，不渲染
    if (!tabs || tabs.length === 0) {
        return null;
    }

    return (
        <div className={styles.terminalContainer}>
            {tabs.map((tab) => (
                <TerminalContainer
                    key={tab.key}
                    tab={tab}
                    activeTabKey={activeTabKey}
                    onTerminalReady={handleTerminalReady}
                />
            ))}
        </div>
    );
};

export default TerminalContainers; 
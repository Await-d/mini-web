/*
 * @Author: Await
 * @Date: 2025-05-11 10:45:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-11 10:45:00
 * @Description: 重新设计的终端容器组件
 */
import React, { useEffect, useRef, useState } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import styles from '../styles.module.css';
import { Spin, message } from 'antd';
import { LoadingOutlined, ReloadOutlined } from '@ant-design/icons';

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
    const retryCountRef = useRef(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const uniqueDomId = `terminal-element-conn-${tab.connectionId}-session-${tab.sessionId}`;

    // 重试初始化终端
    const retryInitialization = () => {
        if (retryCountRef.current >= 3) {
            setError('终端初始化失败，请刷新页面重试');
            return;
        }

        retryCountRef.current++;
        setLoading(true);
        setError(null);
        initFiredRef.current = false;

        message.info('正在重试初始化终端...');

        // 延迟触发初始化
        setTimeout(() => {
            if (activeTabKey === tab.key) {
                triggerTerminalReady();
            }
        }, 500);
    };

    // 触发终端就绪事件
    const triggerTerminalReady = () => {
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
        setLoading(false);
    };

    // 在DOM准备好时通知父组件
    useEffect(() => {
        // 仅对活动标签触发终端初始化
        if (activeTabKey === tab.key && !initFiredRef.current) {
            setLoading(true);

            // 确保DOM元素已准备就绪
            const timer = setTimeout(() => {
                triggerTerminalReady();
            }, 500); // 增加延迟时间，确保DOM和React状态都已就绪

            // 清理函数
            return () => {
                clearTimeout(timer);
                setLoading(false);
            };
        }

        // 如果不是活动标签，重置状态
        if (activeTabKey !== tab.key) {
            setLoading(false);
            setError(null);
        }

    }, [tab, activeTabKey, uniqueDomId, onTerminalReady]);

    // 添加渲染成功的监听器
    useEffect(() => {
        const handleTerminalInitialized = (event: CustomEvent) => {
            if (event.detail?.tabKey === tab.key) {
                setLoading(false);
                setError(null);
            }
        };

        // 添加初始化成功的事件监听
        window.addEventListener('terminal-initialized' as any, handleTerminalInitialized as EventListener);

        // 添加初始化失败的监听
        const handleTerminalError = (event: CustomEvent) => {
            if (event.detail?.tabKey === tab.key) {
                setLoading(false);
                setError(event.detail.error || '终端初始化失败');
            }
        };

        window.addEventListener('terminal-error' as any, handleTerminalError as EventListener);

        return () => {
            window.removeEventListener('terminal-initialized' as any, handleTerminalInitialized as EventListener);
            window.removeEventListener('terminal-error' as any, handleTerminalError as EventListener);
        };
    }, [tab.key]);

    // 判断是否显示当前终端
    const isVisible = activeTabKey === tab.key;

    return (
        <div className={`${styles.terminalContainerWrapper} ${isVisible ? styles.activeTerminal : styles.inactiveTerminal}`}>
            {isVisible && loading && (
                <div className={styles.terminalLoadingOverlay}>
                    <Spin
                        indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
                    />
                    <div className={styles.loadingText}>正在初始化终端...</div>
                </div>
            )}

            {isVisible && error && (
                <div className={styles.terminalErrorOverlay}>
                    <div className={styles.terminalError}>
                        <p>{error}</p>
                        <button
                            className={styles.retryButton}
                            onClick={retryInitialization}
                        >
                            <ReloadOutlined /> 重试
                        </button>
                    </div>
                </div>
            )}

            <div
                id={uniqueDomId}
                ref={tab.terminalRef}
                className={styles.terminalContainer}
                data-tab-key={tab.key}
                data-connection-id={tab.connectionId}
                data-session-id={tab.sessionId}
                data-protocol={tab.protocol || 'ssh'}
                data-active={isVisible}
            />
            {console.log(`SSH终端DOM容器已创建 ID=${uniqueDomId}`, document.getElementById(uniqueDomId))}
        </div>
    );
};

export default TerminalContainer; 
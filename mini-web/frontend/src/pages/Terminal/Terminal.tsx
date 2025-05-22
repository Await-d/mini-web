/*
 * @Author: Await
 * @Date: 2025-05-08 19:49:33
 * @LastEditors: Await
 * @LastEditTime: 2025-05-15 21:20:22
 * @Description: 请填写简介
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import TerminalNotConnected from './components/TerminalNotConnected';
import TerminalConnector from './components/TerminalConnectionWrapper';
import './Terminal.css';

const Terminal: React.FC = () => {
    // 获取URL参数
    const [searchParams] = useSearchParams();
    const { connectionId: pathConnectionId } = useParams<{ connectionId: string }>();
    // 路径参数优先，查询参数其次
    const connectionId = pathConnectionId || searchParams.get('id');
    const sessionId = searchParams.get('sessionId');

    // 连接状态
    const [isConnectionRestored, setIsConnectionRestored] = useState(false);

    // 页面可见性变化处理
    useEffect(() => {
        // 页面可见性变化处理函数
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // 页面变为可见状态，检查连接

                // 尝试恢复连接
                if (typeof window !== 'undefined') {
                    // 优先使用全局恢复函数
                    if ((window as any).attemptGlobalRecovery) {
                        // 使用全局恢复函数尝试恢复连接
                        const success = (window as any).attemptGlobalRecovery();
                        if (success) {
                            setIsConnectionRestored(true);
                        }
                    }
                    // 其次使用reconnectAfterNavigation函数
                    else if ((window as any).reconnectAfterNavigation) {
                        // 使用重连函数尝试恢复连接
                        (window as any).reconnectAfterNavigation();
                        setIsConnectionRestored(true);
                    }
                    // 最后，如果有保存的会话ID，尝试使用quickConnect
                    else if ((window as any).quickConnect) {
                        const savedSessionId = localStorage.getItem('last_session_id');
                        if (savedSessionId) {
                            // 使用快速连接函数尝试恢复连接
                            (window as any).quickConnect(parseInt(savedSessionId, 10));
                            setIsConnectionRestored(true);
                        }
                    }
                }
            }
        };

        // 监听页面可见性变化
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 页面加载后检查一次
        setTimeout(() => {
            // 页面加载后检查连接状态
            handleVisibilityChange();
        }, 500);

        // 每隔10秒检查一次连接状态，防止意外断开
        const intervalId = setInterval(() => {
            // 定期检查连接状态
            // 如果页面可见，尝试恢复连接
            if (document.visibilityState === 'visible' &&
                typeof window !== 'undefined' &&
                (window as any).attemptGlobalRecovery) {
                (window as any).attemptGlobalRecovery();
            }
        }, 10000);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(intervalId);
        };
    }, []);

    // URL参数变化时的处理
    useEffect(() => {
        if (connectionId || sessionId) {
            // URL参数变化，读取连接ID和会话ID

            // 保存到localStorage以备恢复
            if (sessionId) {
                localStorage.setItem('last_session_id', sessionId);
            }
            if (connectionId) {
                localStorage.setItem('last_connection_id', connectionId);
            }
        }
    }, [connectionId, sessionId]);

    return (
        <div className="terminal-page">
            <TerminalConnector>
                {({ hasConnection, tabsCount, activeTabKey, isConnected }) => {
                    // 终端连接组件就绪

                    // 判断是否显示已连接终端
                    if (hasConnection || tabsCount > 0 || activeTabKey !== 'no-tabs' || isConnected || isConnectionRestored) {
                        // 使用子组件进行终端DOM初始化，无需手动操作DOM
                    }

                    // 显示未连接终端组件
                    return <TerminalNotConnected />;
                }}
            </TerminalConnector>
        </div>
    );
};

export default Terminal; 
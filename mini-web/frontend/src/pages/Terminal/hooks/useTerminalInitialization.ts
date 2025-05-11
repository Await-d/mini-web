import {useCallback} from 'react';
import type {TerminalTab} from '../../../contexts/TerminalContext';
import {initTerminal} from '../utils';
import {Terminal} from 'xterm';

/**
 * 强制刷新终端显示
 * @param term 终端实例
 */
const forceTerminalRefresh = (term: Terminal) => {
    if (!term) return;

    try {
        // 刷新所有行
        term.refresh(0, term.rows - 1);
        console.log('终端显示已强制刷新');
    } catch (e) {
        console.error('强制刷新终端失败:', e);
    }
};

/**
 * 专门处理终端初始化的Hook
 */
export const useTerminalInitialization = () => {
    /**
     * 初始化终端实例
     */
    const initializeTerminal = useCallback((
        activeTab: TerminalTab,
        handleTerminalData: (data: string) => void
    ) => {
        try {
            if (!activeTab.terminalRef?.current) {
                console.error('终端容器不存在，无法初始化终端');

                // 分发初始化失败事件
                window.dispatchEvent(new CustomEvent('terminal-error', {
                    detail: {
                        tabKey: activeTab.key,
                        error: '终端容器不存在，无法初始化终端'
                    }
                }));

                return false;
            }

            console.log('正在初始化终端...');

            // 创建更强大的数据处理函数，确保数据被发送到WebSocket
            const enhancedDataHandler = (data: string) => {
                console.log('🚀 增强型数据处理: 收到用户输入', data.length > 20 ? data.substring(0, 20) + '...' : data);

                // 确保handleTerminalData被正确调用
                if (typeof handleTerminalData === 'function') {
                    try {
                        // 调用原始处理函数
                        handleTerminalData(data);

                        // 使用sendDataToServer方法（如果存在）
                        if (typeof activeTab.sendDataToServer === 'function') {
                            console.log('🚀 使用sendDataToServer方法发送数据到WebSocket');
                            activeTab.sendDataToServer(data);
                        }
                        // 直接通过WebSocket发送数据
                        else if (activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
                            console.log('🚀 直接通过WebSocket发送数据');
                            activeTab.webSocketRef.current.send(data);
                        } else {
                            console.error('❌ 无法发送数据：没有可用的WebSocket连接');
                        }
                    } catch (e) {
                        console.error('❌ 发送数据到服务器失败:', e);
                    }
                } else {
                    console.error('❌ handleTerminalData不是一个函数');
                }

                return true; // 返回true表示数据已处理
            };

            // 使用initTerminal进行初始化
            const terminalInstance = initTerminal(
                activeTab.terminalRef.current,
                enhancedDataHandler
            );

            if (!terminalInstance) {
                console.error('终端初始化失败');

                // 分发初始化失败事件
                window.dispatchEvent(new CustomEvent('terminal-error', {
                    detail: {
                        tabKey: activeTab.key,
                        error: '终端实例创建失败'
                    }
                }));

                return false;
            }

            // 保存终端引用到window对象用于调试
            if (typeof window !== 'undefined') {
                (window as any).lastTerminalInstance = terminalInstance;
            }

            // 保存引用到Tab对象
            const {term, fitAddon, searchAddon} = terminalInstance;
            activeTab.xtermRef.current = term;
            activeTab.fitAddonRef.current = fitAddon;
            activeTab.searchAddonRef.current = searchAddon;

            // 确保messageQueueRef正确初始化
            if (!activeTab.messageQueueRef) {
                activeTab.messageQueueRef = {current: terminalInstance.messageQueue};
            } else {
                activeTab.messageQueueRef.current = terminalInstance.messageQueue;
            }

            // 添加终端就绪事件监听器
            const handleTerminalReady = (event: Event) => {
                const customEvent = event as CustomEvent;
                if (customEvent.detail?.terminalInstance === term) {
                    // 终端已就绪，可以进行后续操作
                    console.log('终端就绪事件触发，开始后续初始化操作');
                    // 分发初始化成功事件
                    window.dispatchEvent(new CustomEvent('terminal-initialized', {
                        detail: {
                            tabKey: activeTab.key,
                            terminalInstance
                        }
                    }));

                    // 清除事件监听器
                    window.removeEventListener('terminal-ready', handleTerminalReady);
                }
            };

            // 监听终端就绪事件
            window.addEventListener('terminal-ready', handleTerminalReady);


            // 保存刷新间隔引用以便清理
            activeTab.cleanupRef = {
                current: () => {
                    window.removeEventListener('terminal-ready', handleTerminalReady);
                }
            };

            return true;
        } catch (error) {
            console.error('终端初始化过程出错:', error);

            // 分发初始化失败事件
            window.dispatchEvent(new CustomEvent('terminal-error', {
                detail: {
                    tabKey: activeTab.key,
                    error: `终端初始化错误: ${error instanceof Error ? error.message : String(error)}`
                }
            }));

            return false;
        }
    }, []);

    /**
     * 添加终端焦点事件
     */
    const attachTerminalFocusHandlers = useCallback((
        activeTab: TerminalTab
    ) => {
        if (!activeTab.terminalRef?.current) return;

        const handleTerminalFocus = () => {
            if (activeTab.xtermRef?.current) {
                console.log('设置终端焦点');

                try {
                    // 增强焦点处理
                    setTimeout(() => {
                        if (activeTab.xtermRef?.current) {
                            activeTab.xtermRef.current.focus();
                            console.log('终端焦点已设置', document.activeElement === activeTab.terminalRef.current);

                            // 发送一个空白字符测试输入
                            if (activeTab.webSocketRef?.current &&
                                activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
                                console.log('发送测试字符以确认输入功能');
                            }
                        }
                    }, 100);


                    // 设置回车键特殊处理事件监听器
                    if (activeTab.xtermRef.current && activeTab.webSocketRef?.current && activeTab.terminalRef?.current) {
                        const handleReturnKey = (event: KeyboardEvent) => {
                            if (event.key === 'Enter' && activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
                                console.log('检测到页面级回车键事件，确保命令执行');
                                // 发送一个额外的回车确保命令执行
                                setTimeout(() => {
                                    if (activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
                                        activeTab.webSocketRef.current.send('\r\n');
                                    }
                                }, 10);
                            }
                        };

                        // 确保terminalRef.current存在后再添加/移除事件监听器
                        if (activeTab.terminalRef?.current) {
                            // 移除可能存在的旧监听器
                            activeTab.terminalRef.current.removeEventListener('keydown', handleReturnKey);
                            // 添加新的监听器
                            activeTab.terminalRef.current.addEventListener('keydown', handleReturnKey);
                        }
                    }
                } catch (e) {
                    console.error('设置终端焦点失败:', e);
                }
            }
        };

        // 添加焦点事件监听器
        activeTab.terminalRef.current.addEventListener('click', handleTerminalFocus);
        activeTab.terminalRef.current.addEventListener('focus', handleTerminalFocus);

        // 设置初始焦点
        handleTerminalFocus();

        // 添加全局键盘事件监听
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // 如果当前终端处于活动状态，处理键盘事件
            if (document.activeElement === activeTab.terminalRef.current ||
                activeTab.terminalRef.current?.contains(document.activeElement)) {
                // 处理特殊键...
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);

        // 返回清理函数
        return () => {
            activeTab.terminalRef.current?.removeEventListener('click', handleTerminalFocus);
            activeTab.terminalRef.current?.removeEventListener('focus', handleTerminalFocus);
            window.removeEventListener('keydown', handleGlobalKeyDown);
        };
    }, []);

    /**
     * 调整终端大小
     */
    const resizeTerminal = useCallback((
        activeTab: TerminalTab
    ) => {
        if (!activeTab.fitAddonRef?.current || !activeTab.xtermRef?.current) return;

        try {
            activeTab.fitAddonRef.current.fit();

            // 获取新的终端尺寸
            const newCols = activeTab.xtermRef.current.cols;
            const newRows = activeTab.xtermRef.current.rows;

            // 发送调整大小的消息到服务器
            if (activeTab.webSocketRef?.current &&
                activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
                try {
                    // 创建调整大小消息
                    const resizeMessage = JSON.stringify({
                        type: 'resize',
                        cols: newCols,
                        rows: newRows,
                        width: activeTab.terminalRef?.current?.clientWidth || 0,
                        height: activeTab.terminalRef?.current?.clientHeight || 0
                    });

                    // 发送消息
                    activeTab.webSocketRef.current.send(resizeMessage);
                    console.log('已发送终端调整大小消息', {cols: newCols, rows: newRows});
                } catch (e) {
                    console.error('发送终端调整大小消息失败:', e);
                }
            }
        } catch (error) {
            console.error('调整终端大小失败:', error);
        }
    }, []);

    return {
        initializeTerminal,
        attachTerminalFocusHandlers,
        resizeTerminal
    };
};

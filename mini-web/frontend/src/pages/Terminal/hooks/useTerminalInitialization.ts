import { useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { initTerminal } from '../utils';
import { Terminal } from 'xterm';

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

            console.log(`正在初始化终端... tabKey=${activeTab.key}, DOM元素ID=${activeTab.terminalRef.current.id}`);

            // 检查WebSocket连接状态
            if (!activeTab.webSocketRef?.current ||
                (activeTab.webSocketRef.current.readyState !== WebSocket.CONNECTING &&
                    activeTab.webSocketRef.current.readyState !== WebSocket.OPEN)) {
                console.warn(`初始化终端前发现WebSocket未连接: ${activeTab.key}`);

                // 确保有连接ID和会话ID
                if (activeTab.connectionId && activeTab.sessionId) {
                    // 触发连接事件
                    const event = new CustomEvent('terminal-connection-needed', {
                        detail: {
                            tabKey: activeTab.key,
                            connectionId: activeTab.connectionId,
                            sessionId: activeTab.sessionId,
                            protocol: activeTab.protocol || activeTab.connection?.protocol
                        }
                    });
                    window.dispatchEvent(event);

                    console.log(`已触发WebSocket连接事件: ${activeTab.key}`);

                    // 需要先连接WebSocket，延迟初始化终端
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('terminal-init-retry', {
                            detail: { tabKey: activeTab.key }
                        }));
                    }, 1000);

                    return false;
                }
            }

            // 如果已经有初始化的终端实例，则复用
            if (activeTab.xtermRef?.current) {
                console.log('检测到已有终端实例，更新数据处理器并刷新显示');

                try {
                    // 重新绑定数据处理器
                    import('../utils/initTerminal').then(({ rebindDataHandler }) => {
                        if (activeTab.xtermRef?.current) {
                            rebindDataHandler(activeTab.xtermRef.current, handleTerminalData);
                            console.log('数据处理器已更新');

                            // 刷新终端显示
                            forceTerminalRefresh(activeTab.xtermRef.current);

                            // 添加就绪消息
                            activeTab.xtermRef.current.writeln('\r\n\x1b[32m终端已重新连接!\x1b[0m\r\n');
                        }
                    });

                    return true;
                } catch (e) {
                    console.error('更新终端实例失败，将重新创建:', e);
                    // 继续执行，创建新实例
                }
            }

            // 创建更强大的数据处理函数，确保数据被发送到WebSocket
            const enhancedDataHandler = (data: string) => {
                console.log('🚀 增强型数据处理: 收到用户输入', data.length > 20 ? data.substring(0, 20) + '...' : data);

                // 确保handleTerminalData被正确调用
                if (typeof handleTerminalData === 'function') {
                    try {
                        // 调用原始处理函数
                        const result = handleTerminalData(data);
                        console.log('🚀 终端数据已发送到WebSocket', result ? '成功' : '失败');

                        // 使用sendDataToServer方法（如果存在）
                        if (!result && typeof activeTab.sendDataToServer === 'function') {
                            console.log('🚀 使用sendDataToServer方法发送数据到WebSocket');
                            const altResult = activeTab.sendDataToServer(data);
                            console.log('🚀 备用发送方法结果:', altResult);
                        }
                        // 直接通过WebSocket发送数据
                        else if (!result && activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
                            console.log('🚀 直接通过WebSocket发送数据');
                            activeTab.webSocketRef.current.send(data);
                            console.log('🚀 数据已直接发送到WebSocket');
                        }
                    } catch (e) {
                        console.error('❌ 发送数据到服务器失败:', e);

                        // 尝试重新连接
                        if (activeTab.connectionId && activeTab.sessionId) {
                            console.log('尝试重新连接WebSocket...');
                            window.dispatchEvent(new CustomEvent('terminal-connection-needed', {
                                detail: {
                                    tabKey: activeTab.key,
                                    connectionId: activeTab.connectionId,
                                    sessionId: activeTab.sessionId
                                }
                            }));
                        }
                    }
                } else {
                    console.error('❌ handleTerminalData不是一个函数');

                    // 尝试通过WebSocket直接发送
                    if (activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
                        try {
                            console.log('🔄 尝试通过WebSocket直接发送数据');
                            activeTab.webSocketRef.current.send(data);
                            console.log('✅ 数据已直接发送到WebSocket');
                        } catch (e) {
                            console.error('❌ WebSocket直接发送失败:', e);
                        }
                    }
                }

                return true; // 返回true表示数据已处理
            };

            // 使用initTerminal进行初始化
            console.log('调用initTerminal函数创建新的终端实例');
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

            console.log('终端实例创建成功:', terminalInstance);

            // 保存终端引用到window对象用于调试
            if (typeof window !== 'undefined') {
                (window as any).lastTerminalInstance = terminalInstance;
                (window as any).activeTerminals = (window as any).activeTerminals || {};
                (window as any).activeTerminals[activeTab.key] = terminalInstance;
            }

            // 保存引用到Tab对象
            const { term, fitAddon, searchAddon } = terminalInstance;
            activeTab.xtermRef = activeTab.xtermRef || { current: null };
            activeTab.xtermRef.current = term;

            activeTab.fitAddonRef = activeTab.fitAddonRef || { current: null };
            activeTab.fitAddonRef.current = fitAddon;

            activeTab.searchAddonRef = activeTab.searchAddonRef || { current: null };
            activeTab.searchAddonRef.current = searchAddon;

            // 显示欢迎消息
            term.writeln('\r\n\x1b[32m欢迎使用SSH终端！\x1b[0m');
            term.writeln('\r\n连接中，请稍候...');

            // 记录终端状态
            console.log('终端初始化成功', {
                termExists: !!term,
                containerExists: !!activeTab.terminalRef.current,
                fitAddonExists: !!fitAddon,
                tabKey: activeTab.key,
                protocol: activeTab.connection?.protocol || activeTab.protocol
            });

            // 确保messageQueueRef正确初始化
            if (!activeTab.messageQueueRef) {
                activeTab.messageQueueRef = { current: terminalInstance.messageQueue };
            } else {
                activeTab.messageQueueRef.current = terminalInstance.messageQueue;
            }

            // 添加终端就绪事件监听器
            const handleTerminalReady = (event: Event) => {
                const customEvent = event as CustomEvent;
                if (customEvent.detail?.terminalInstance === term) {
                    // 终端已就绪，可以进行后续操作
                    console.log('终端就绪事件触发，开始后续初始化操作');

                    // 调整终端大小
                    try {
                        if (fitAddon) {
                            fitAddon.fit();
                            console.log('终端大小已调整:', term.cols, 'x', term.rows);

                            // 发送调整大小命令到服务器
                            if (activeTab.webSocketRef?.current?.readyState === WebSocket.OPEN) {
                                const resizeCommand = JSON.stringify({
                                    type: 'resize',
                                    cols: term.cols,
                                    rows: term.rows
                                });
                                activeTab.webSocketRef.current.send(resizeCommand);
                                console.log('终端大小调整命令已发送到服务器');
                            }
                        }
                    } catch (e) {
                        console.error('调整终端大小失败:', e);
                    }

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
                    console.log('已发送终端调整大小消息', { cols: newCols, rows: newRows });
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

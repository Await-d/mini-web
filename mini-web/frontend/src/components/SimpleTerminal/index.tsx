/*
 * @Author: Await
 * @Date: 2025-05-21 20:45:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-31 19:59:15
 * @Description: 简易终端组件，使用本地回显模式
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Spin, Button, Tooltip } from 'antd';
import { FolderOutlined, FileOutlined, ExpandOutlined, ShrinkOutlined } from '@ant-design/icons';
import FileBrowser from './FileBrowser';
import './styles.css';
import { parseTerminalOutput, ansiToHtml } from '../../pages/Terminal/utils/terminalUtils';

interface SimpleTerminalProps {
    connectionId: number;
    sessionId: string | number;
    webSocketRef: React.RefObject<WebSocket | null>;
    visible?: boolean;
    onReconnectRequest?: (connectionId: number, sessionId: string | number) => void;
    tabKey?: string; // 添加tabKey属性
}

const SimpleTerminal: React.FC<SimpleTerminalProps> = ({
    connectionId,
    sessionId,
    webSocketRef,
    visible,
    onReconnectRequest,
    tabKey
}) => {
    // 基本状态
    const [output, setOutput] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

    // 本地回显模式状态
    const [currentPrompt, setCurrentPrompt] = useState('');
    const [localInput, setLocalInput] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);

    // 命令历史
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // 光标闪烁
    const [cursorVisible, setCursorVisible] = useState(true);

    // 跟踪最后发送的命令，用于防止重复显示
    const [lastSentCommand, setLastSentCommand] = useState<string>('');

    // 跟踪是否已显示欢迎信息，避免重复显示
    const [welcomeShown, setWelcomeShown] = useState(false);

    // 文件浏览器状态
    const [fileBrowserVisible, setFileBrowserVisible] = useState(false);
    const [showSplitView, setShowSplitView] = useState(false);

    // 提示符正则表达式 - 更宽松的匹配模式
    const promptRegex = /.*[@].*[$#]\s*$/;

    // 检查是否是系统消息
    const isSystemMessage = useCallback((text: string) => {
        // 连接ID模式：conn-X-session-XXX-XXXXXXXXXXXX
        const connectionIdPattern = /^conn-\d+-session-\d+-\d+$/;

        // JSON初始化消息模式
        const jsonInitPattern = /^\s*\{.*"type"\s*:\s*"init".*\}\s*$/;

        // 反向搜索控制序列模式
        const reverseSearchPattern = /\[A\[A\[26P\(reverse-i-search\)`':/;

        // WebSocket系统消息模式
        const systemPatterns = [
            connectionIdPattern,
            jsonInitPattern,
            reverseSearchPattern,
            /^WebSocket\s+connected/i,
            /^Connection\s+established/i,
            /^Session\s+initialized/i,
            /^\s*\{.*"type"\s*:\s*"heartbeat".*\}\s*$/
        ];

        // 检查是否匹配任何系统消息模式
        return systemPatterns.some(pattern => pattern.test(text.trim()));
    }, []);

    // 清理文本，移除系统消息部分
    const cleanSystemMessages = useCallback((text: string) => {
        // 移除JSON系统消息
        let cleaned = text.replace(/\s*\{[^{}]*"type"\s*:\s*"(init|heartbeat)"[^{}]*\}\s*/g, '');

        // 移除连接ID
        cleaned = cleaned.replace(/\s*conn-\d+-session-\d+-\d+\s*/g, '');

        // 移除null字符
        cleaned = cleaned.replace(/\^@/g, '');

        // 移除反向搜索控制序列
        cleaned = cleaned.replace(/\[A\[A\[26P\(reverse-i-search\)`':/g, '(reverse-i-search)`\':');

        // 移除多余的空白
        cleaned = cleaned.trim();

        return cleaned;
    }, []);

    const outputRef = useRef<HTMLDivElement>(null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<HTMLDivElement>(null);

    // 滚动到底部
    const scrollToBottom = useCallback(() => {
        if (outputRef.current) {
            setTimeout(() => {
                if (outputRef.current) {
                    outputRef.current.scrollTop = outputRef.current.scrollHeight;
                }
            }, 10);
        }
    }, []);

    // 处理服务器返回的数据
    const processServerData = useCallback((text: string) => {
        console.log('收到WebSocket消息(文本):', text);

        // 检查是否是反向搜索消息
        if (text.includes('[A[A[26P(reverse-i-search)')) {
            // 这是反向搜索消息，提取搜索内容
            const searchMatch = text.match(/\(reverse-i-search\)`([^']*)':/);
            if (searchMatch && searchMatch[1]) {
                const searchTerm = searchMatch[1];
                // 显示格式化的反向搜索提示
                const searchDisplay = `(reverse-i-search)\`${searchTerm}': `;

                // 如果有匹配的命令，也提取出来
                const commandMatch = text.match(/\(reverse-i-search\)`[^']*':(.*)/);
                const matchedCommand = commandMatch && commandMatch[1] ? commandMatch[1].trim() : '';

                if (matchedCommand) {
                    setOutput(prev => {
                        // 移除上一个反向搜索提示（如果存在）
                        const filtered = prev.filter(line => !line.includes('(reverse-i-search)'));
                        return [...filtered, `${searchDisplay}${matchedCommand}`];
                    });
                } else {
                    setOutput(prev => {
                        // 移除上一个反向搜索提示（如果存在）
                        const filtered = prev.filter(line => !line.includes('(reverse-i-search)'));
                        return [...filtered, searchDisplay];
                    });
                }

                scrollToBottom();
                return;
            }
        }

        const cleanedText = cleanSystemMessages(text);

        // 如果清理后没有内容，则忽略
        if (!cleanedText) {
            console.log('清理后无有效内容，忽略消息:', text);
            return;
        }

        // 检查清理后的文本是否是纯系统消息
        if (isSystemMessage(cleanedText)) {
            console.log('忽略系统消息:', cleanedText);
            return;
        }

        try {
            // 尝试解析为JSON
            const data = JSON.parse(cleanedText);
            if (data.type === 'data' && data.data) {
                // 处理命令执行结果
                const lines = data.data.split('\n').filter((line: string) => line.trim());
                setOutput(prev => [...prev, ...lines]);
                scrollToBottom();
            } else if (data.type === 'error') {
                setError(`服务器错误: ${data.message || '未知错误'}`);
            } else if (data.type === 'connected') {
                setOutput(prev => [...prev, '连接成功，终端已就绪']);
                setConnectionStatus('connected');
                setLoading(false);
            } else if (data.type === 'heartbeat_response') {
                console.log('收到心跳响应');
                //TODO 心跳响应
            } else if (data.type === 'init') {
                // 忽略初始化消息，不在终端中显示
                console.log('收到初始化消息，已忽略显示');
                return;
            }
        } catch (jsonError) {
            // 分行处理文本 - 使用清理后的文本
            const lines = cleanedText.split('\n').map(line => line.trim()).filter(line => line);

            // 存储需要显示的输出行
            const outputLines: string[] = [];

            // 检查每一行，找到最后一个提示符
            let newPrompt: string | null = null;

            for (const line of lines) {
                // 跳过系统消息行
                if (isSystemMessage(line)) {
                    console.log('跳过系统消息行:', line);
                    continue;
                }

                if (promptRegex.test(line)) {
                    // 这是一个提示符
                    newPrompt = line;
                } else if (line.trim()) {
                    // 检查是否是服务器返回的控制字符回显，如果是则忽略
                    const trimmedLine = line.trim();

                    // 忽略服务器返回的控制字符回显
                    if (trimmedLine === '^C' || trimmedLine === '^D' || trimmedLine === '^Z') {
                        continue;
                    }

                    const trimmedLastCommand = lastSentCommand?.trim();

                    // 更宽松的匹配：处理空格差异
                    const normalizedLine = trimmedLine.replace(/\s+/g, ' '); // 将多个空格替换为单个空格
                    const normalizedLastCommand = trimmedLastCommand?.replace(/\s+/g, ' ');

                    if (normalizedLastCommand &&
                        (normalizedLine === normalizedLastCommand ||
                            trimmedLine === trimmedLastCommand)) {
                        // 这是命令回显，跳过
                        continue;
                    } else {
                        outputLines.push(line);
                    }
                }
            }

            // 如果找到新的提示符，清除lastSentCommand并更新当前提示符
            if (newPrompt) {
                setCurrentPrompt(newPrompt);
                // 收到新提示符说明命令执行完成，清除lastSentCommand
                if (lastSentCommand) {
                    setLastSentCommand('');
                }
            }

            // 添加输出行到显示
            if (outputLines.length > 0) {
                setOutput(prev => [...prev, ...outputLines]);
            }

            scrollToBottom();
        }
    }, [promptRegex, scrollToBottom, isSystemMessage, cleanSystemMessages, lastSentCommand]);

    // 光标闪烁效果
    useEffect(() => {
        const interval = setInterval(() => {
            setCursorVisible(prev => !prev);
        }, 500);
        return () => clearInterval(interval);
    }, []);

    // 处理WebSocket消息
    useEffect(() => {
        if (!webSocketRef || !webSocketRef.current) {
            setConnectionStatus('error');
            setError('终端连接未初始化');
            return;
        }

        const ws = webSocketRef.current;

        // 根据WebSocket状态设置连接状态
        switch (ws.readyState) {
            case WebSocket.CONNECTING:
                setConnectionStatus('connecting');
                setLoading(true);
                setError(null);
                break;
            case WebSocket.OPEN:
                setConnectionStatus('connected');
                setLoading(false);
                setError(null);
                break;
            case WebSocket.CLOSING:
            case WebSocket.CLOSED:
                setConnectionStatus('disconnected');
                setError('终端连接已关闭');
                break;
        }

        const handleOpen = () => {
            setConnectionStatus('connected');
            setLoading(false);
            setError(null);

            // 只在第一次连接时显示欢迎信息（仅前端显示）
            if (!welcomeShown) {
                const welcomeMessages = [
                    '<span class="welcome-separator">' + '='.repeat(60) + '</span>',
                    '<span class="welcome-title">🚀 欢迎使用 Mini Web 远程终端</span>',
                    '<span class="welcome-success">✨ 连接已建立，终端就绪</span>',
                    '<span class="welcome-tip">💡 提示：支持命令历史记录（↑↓键），Tab补全等功能</span>',
                    '<span class="welcome-contact">📧 如有问题请联系管理员</span>',
                    '<span class="welcome-separator">' + '='.repeat(60) + '</span>',
                    ''
                ];

                setOutput(prev => [...prev, ...welcomeMessages]);
                setWelcomeShown(true);
            }

            // 连接成功后自动聚焦终端
            setTimeout(() => {
                focusTerminal();
                scrollToBottom();
            }, 100);
        };

        const handleClose = () => {
            setConnectionStatus('disconnected');
            setError('终端连接已关闭');
        };

        const handleError = (e: Event) => {
            console.error('WebSocket错误:', e);
            setConnectionStatus('error');
            setError('终端连接出错');
        };

        const handleMessage = (event: MessageEvent) => {
            try {
                if (event.data instanceof Blob) {
                    event.data.text().then(processServerData).catch(error => {
                        console.error('读取Blob数据出错:', error);
                    });
                } else if (typeof event.data === 'string') {
                    processServerData(event.data);
                } else {
                    console.log('收到未知类型数据:', typeof event.data);
                }
            } catch (e) {
                console.error('处理WebSocket消息时出错:', e);
            }
        };

        // 添加事件监听器
        ws.addEventListener('open', handleOpen);
        ws.addEventListener('message', handleMessage);
        ws.addEventListener('close', handleClose);
        ws.addEventListener('error', handleError);

        // 清理函数
        return () => {
            if (ws) {
                ws.removeEventListener('open', handleOpen);
                ws.removeEventListener('message', handleMessage);
                ws.removeEventListener('close', handleClose);
                ws.removeEventListener('error', handleError);
            }
        };
    }, [webSocketRef, processServerData]);

    // 处理键盘输入 - 本地回显模式
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        e.preventDefault();

        // 检查WebSocket连接状态
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            setError('终端连接已断开，无法发送命令');
            return;
        }

        try {
            if (e.key === 'Enter') {
                // 回车键 - 发送完整命令
                if (localInput.trim()) {
                    // 添加到命令历史
                    setCommandHistory(prev => [localInput, ...prev.slice(0, 19)]);

                    // 显示完整的命令行（只显示一行提示符+命令）
                    const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;
                    const fullCommand = `${cleanPrompt}${localInput}`;
                    setOutput(prev => [...prev, fullCommand]);

                    // 记录发送的命令，用于防止重复显示
                    setLastSentCommand(localInput);

                    // 发送命令到服务器
                    webSocketRef.current.send(localInput + '\r\n');
                }

                // 重置输入状态
                setLocalInput('');
                setCursorPosition(0);
                setHistoryIndex(-1);
                scrollToBottom();

            } else if (e.key === 'Backspace') {
                // 退格键 - 本地删除字符
                if (cursorPosition > 0) {
                    const newInput = localInput.slice(0, cursorPosition - 1) + localInput.slice(cursorPosition);
                    setLocalInput(newInput);
                    setCursorPosition(prev => prev - 1);
                }

            } else if (e.key === 'Delete') {
                // Delete键 - 删除光标后的字符
                if (cursorPosition < localInput.length) {
                    const newInput = localInput.slice(0, cursorPosition) + localInput.slice(cursorPosition + 1);
                    setLocalInput(newInput);
                }

            } else if (e.key === 'ArrowLeft') {
                // 左箭头 - 移动光标
                if (cursorPosition > 0) {
                    setCursorPosition(prev => prev - 1);
                }

            } else if (e.key === 'ArrowRight') {
                // 右箭头 - 移动光标
                if (cursorPosition < localInput.length) {
                    setCursorPosition(prev => prev + 1);
                }

            } else if (e.key === 'ArrowUp') {
                // 上箭头 - 历史命令
                if (commandHistory.length > 0) {
                    const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
                    setHistoryIndex(newIndex);
                    const historyCommand = commandHistory[newIndex];
                    setLocalInput(historyCommand);
                    setCursorPosition(historyCommand.length);
                }

            } else if (e.key === 'ArrowDown') {
                // 下箭头 - 历史命令
                if (historyIndex > 0) {
                    const newIndex = historyIndex - 1;
                    setHistoryIndex(newIndex);
                    const historyCommand = commandHistory[newIndex];
                    setLocalInput(historyCommand);
                    setCursorPosition(historyCommand.length);
                } else if (historyIndex === 0) {
                    setHistoryIndex(-1);
                    setLocalInput('');
                    setCursorPosition(0);
                }

            } else if (e.key === 'Home') {
                // Home键 - 光标移到开头
                setCursorPosition(0);

            } else if (e.key === 'End') {
                // End键 - 光标移到末尾
                setCursorPosition(localInput.length);

            } else if (e.key === 'Tab') {
                // Tab键 - 发送到服务器进行自动补全
                webSocketRef.current.send('\t');

            } else if (e.key === 'c' && e.ctrlKey) {
                // Ctrl+C - 显示^C并中断当前命令
                const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;
                const interruptedLine = `${cleanPrompt}${localInput}^C`;
                setOutput(prev => [...prev, interruptedLine]);

                // 发送中断信号
                webSocketRef.current.send('\x03');

                // 清空当前输入
                setLocalInput('');
                setCursorPosition(0);
                scrollToBottom();

            } else if (e.key === 'd' && e.ctrlKey) {
                // Ctrl+D - 显示^D并发送EOF
                if (localInput === '') {
                    const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;
                    const eofLine = `${cleanPrompt}^D`;
                    setOutput(prev => [...prev, eofLine]);
                }
                webSocketRef.current.send('\x04');
                setLocalInput('');
                setCursorPosition(0);
                scrollToBottom();

            } else if (e.key === 'z' && e.ctrlKey) {
                // Ctrl+Z - 显示^Z并发送SIGTSTP
                const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;
                const suspendLine = `${cleanPrompt}${localInput}^Z`;
                setOutput(prev => [...prev, suspendLine]);

                webSocketRef.current.send('\x1A');
                setLocalInput('');
                setCursorPosition(0);
                scrollToBottom();

            } else if (e.key === 'r' && e.ctrlKey) {
                // Ctrl+R - 反向搜索历史命令
                // 直接发送控制字符，但不在本地显示原始控制序列
                // 而是显示一个更友好的提示
                const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;
                const searchLine = `${cleanPrompt}(reverse-i-search)\`': `;
                setOutput(prev => [...prev, searchLine]);

                // 发送Ctrl+R字符
                webSocketRef.current.send('\x12');

                // 清空本地输入，让服务器端处理搜索
                setLocalInput('');
                setCursorPosition(0);
                scrollToBottom();

            } else if (e.ctrlKey && e.key.length === 1) {
                // 其他Ctrl+字符组合
                const code = e.key.toUpperCase().charCodeAt(0) - 64;
                if (code > 0 && code < 27) {
                    const controlChar = String.fromCharCode(code);
                    webSocketRef.current.send(controlChar);
                }

            } else if (e.key.length === 1) {
                // 普通字符 - 本地显示
                const newInput = localInput.slice(0, cursorPosition) + e.key + localInput.slice(cursorPosition);
                setLocalInput(newInput);
                setCursorPosition(prev => prev + 1);
            }
        } catch (e) {
            console.error('处理按键失败:', e);
            setError('处理按键失败，请检查连接状态');
        }
    };

    // 聚焦终端
    const focusTerminal = useCallback(() => {
        if (terminalRef.current) {
            terminalRef.current.focus();
        }
    }, []);

    // 获取连接状态文本
    const getConnectionStatusText = () => {
        switch (connectionStatus) {
            case 'connecting':
                return '正在连接终端...';
            case 'connected':
                return '终端已连接';
            case 'disconnected':
                return '终端连接已断开';
            case 'error':
                return '终端连接出错';
            default:
                return '终端状态未知';
        }
    };

    // 处理重连请求
    const handleReconnectRequest = () => {
        if (onReconnectRequest) {
            onReconnectRequest(connectionId, sessionId);
        }
    };

    // 渲染当前输入行
    const renderCurrentInputLine = () => {
        if (!currentPrompt) {
            return null;
        }

        // 只取最后一行作为提示符
        const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;

        const beforeCursor = localInput.slice(0, cursorPosition);
        const atCursor = localInput.slice(cursorPosition, cursorPosition + 1) || ' ';
        const afterCursor = localInput.slice(cursorPosition + 1);

        // 确保空格字符正确显示
        const displayBeforeCursor = beforeCursor;
        const displayAtCursor = atCursor === ' ' ? '\u00A0' : atCursor; // 使用不间断空格
        const displayAfterCursor = afterCursor;

        return (
            <div className="terminal-input-line">
                <span
                    className="terminal-prompt"
                    dangerouslySetInnerHTML={{ __html: ansiToHtml(cleanPrompt) }}
                />
                <span className="terminal-input-before">{displayBeforeCursor}</span>
                <span className={`terminal-cursor ${cursorVisible ? 'visible' : ''}`}>{displayAtCursor}</span>
                <span className="terminal-input-after">{displayAfterCursor}</span>
            </div>
        );
    };

    return (
        <div
            className="simple-terminal-container"
            ref={terminalContainerRef}
            style={{ display: visible ? 'flex' : 'none' }}
            onClick={focusTerminal}
            onFocus={focusTerminal}
        >
            {/* 工具栏 */}
            <div className="terminal-toolbar">
                <div className="toolbar-buttons">
                    <Tooltip title="文件浏览器">
                        <Button
                            icon={<FolderOutlined />}
                            size="small"
                            type={fileBrowserVisible ? 'primary' : 'default'}
                            onClick={() => {
                                setFileBrowserVisible(!fileBrowserVisible);
                                if (!fileBrowserVisible) {
                                    setShowSplitView(true);
                                }
                            }}
                        >
                            文件
                        </Button>
                    </Tooltip>
                    {fileBrowserVisible && (
                        <>
                            <Tooltip title={showSplitView ? '收起分屏' : '展开分屏'}>
                                <Button
                                    icon={showSplitView ? <ShrinkOutlined /> : <ExpandOutlined />}
                                    size="small"
                                    onClick={() => setShowSplitView(!showSplitView)}
                                />
                            </Tooltip>
                        </>
                    )}
                </div>
            </div>

            {/* 主内容区域 */}
            <div className={`terminal-main-content ${showSplitView ? 'split-view' : ''}`}>
                {/* 终端区域 */}
                <div className={`terminal-panel ${showSplitView ? 'half-width' : 'full-width'}`}>
                    {loading && (
                        <div className="terminal-loading">
                            <Spin size="large" spinning={true}>
                                <div className="spin-content-placeholder">
                                    <div className="loading-tip">{getConnectionStatusText()}</div>
                                </div>
                            </Spin>
                        </div>
                    )}

                    {error && (
                        <div className="terminal-error">
                            <div className="error-message">{error}</div>
                            {connectionStatus === 'disconnected' && (
                                <button onClick={handleReconnectRequest} className="reconnect-button">
                                    重新连接
                                </button>
                            )}
                        </div>
                    )}

                    <div
                        className="terminal-output"
                        ref={outputRef}
                        style={{ display: loading ? 'none' : 'block' }}
                        onClick={focusTerminal}
                    >
                        {output.map((line, index) => {
                            // 检查是否为欢迎信息
                            const isWelcomeLine = line.includes('welcome-') ||
                                line.includes('欢迎使用') ||
                                line.includes('连接已建立') ||
                                line.includes('提示：') ||
                                line.includes('如有问题') ||
                                (line.includes('='.repeat(30)));

                            return (
                                <div key={index} className={`terminal-line ${isWelcomeLine ? 'welcome-line' : ''}`}>
                                    <span dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }} />
                                </div>
                            );
                        })}

                        {/* 当前输入行 */}
                        {connectionStatus === 'connected' && renderCurrentInputLine()}
                    </div>
                </div>

                {/* 文件浏览器区域 */}
                {fileBrowserVisible && showSplitView && (
                    <div className="file-browser-panel half-width">
                        <FileBrowser
                            webSocketRef={webSocketRef}
                            visible={fileBrowserVisible}
                            connectionId={connectionId}
                            sessionId={sessionId}
                            tabKey={tabKey}
                            onClose={() => {
                                setFileBrowserVisible(false);
                                setShowSplitView(false);
                            }}
                        />
                    </div>
                )}
            </div>

            {/* 文件浏览器模态框（当不是分屏模式时） */}
            {fileBrowserVisible && !showSplitView && (
                <div className="file-browser-modal">
                    <FileBrowser
                        webSocketRef={webSocketRef}
                        visible={fileBrowserVisible}
                        connectionId={connectionId}
                        sessionId={sessionId}
                        tabKey={tabKey}
                        onClose={() => setFileBrowserVisible(false)}
                    />
                </div>
            )}

            <div
                ref={terminalRef}
                className="terminal-input-focus"
                tabIndex={0}
                onKeyDown={handleKeyDown}
                style={{
                    position: 'absolute',
                    left: '-9999px',
                    opacity: 0,
                    pointerEvents: 'none'
                }}
            />
        </div>
    );
};

export default SimpleTerminal; 
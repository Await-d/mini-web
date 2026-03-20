/*
 * @Author: Await
 * @Date: 2025-05-21 20:45:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-02 20:13:35
 * @Description: 简易终端组件，使用本地回显模式
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Spin, Button, Tooltip, Modal, App } from 'antd';
import {
    FolderOutlined,
    FileOutlined,
    ExpandOutlined,
    ShrinkOutlined,
    ThunderboltOutlined,
    BlockOutlined,
    QuestionCircleOutlined
} from '@ant-design/icons';
import FileBrowser from './FileBrowser';
import BatchCommands from '../BatchCommands';
import QuickCommands from '../QuickCommands';
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
    const { message } = App.useApp();
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

    // 快捷功能状态
    const [batchCommandsVisible, setBatchCommandsVisible] = useState(false);
    const [quickCommandsVisible, setQuickCommandsVisible] = useState(false);
    const [helpVisible, setHelpVisible] = useState(false);

    // 密码输入模式状态
    const [passwordMode, setPasswordMode] = useState(false);
    const [lastPasswordPrompt, setLastPasswordPrompt] = useState('');

    // 提示符正则表达式 - 更宽松的匹配模式
    const promptRegex = /.*[@].*[$#]\s*$/;

    // 检查是否是密码提示
    const isPasswordPrompt = useCallback((text: string) => {
        const passwordPrompts = [
            'password:',
            'password for',
            'enter password',
            '请输入密码',
            '[sudo] password for',
            'Password:',
            'Password for',
            'password required',
            'enter your password',
            'please enter password',
            'authentication required',
            'sudo password',
            'user password'
        ];

        const lowercaseText = text.toLowerCase().trim();
        return passwordPrompts.some(prompt => lowercaseText.includes(prompt));
    }, []);

    // 密码提示就绪状态
    const [passwordPromptReady, setPasswordPromptReady] = useState(false);

    // 检查是否是成功登录的指示器
    const isSuccessIndicator = useCallback((text: string) => {
        const successIndicators = [
            '$',
            '#',
            '>',
            'welcome',
            'login successful',
            'authentication successful',
            'root@',
            '~'
        ];

        const lowercaseText = text.toLowerCase().trim();
        return successIndicators.some(indicator => lowercaseText.includes(indicator));
    }, []);

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
                // 心跳响应已由WebSocketService自动处理
                // WebSocketService会计算RTT延迟、评估连接质量并发送terminal-heartbeat事件
                console.debug('收到心跳响应 (由WebSocketService处理)');
                // UI组件可以监听terminal-heartbeat事件以显示连接质量
                // 格式: { tabKey, latency, quality, timestamp }
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

                // 检查是否是密码提示
                if (isPasswordPrompt(line)) {
                    console.log('检测到密码提示:', line);
                    // 立即设置密码模式
                    setPasswordMode(true);
                    setLastPasswordPrompt(line);
                    outputLines.push(`<span class="password-prompt">🔐 ${line}</span>`);

                    // 添加延迟确保系统完全准备好接收密码
                    setTimeout(() => {
                        setPasswordPromptReady(true);
                        console.log('密码提示就绪，可以安全输入密码');
                    }, 200); // 200ms延迟确保系统就绪

                    continue;
                }

                // 检查是否退出密码模式 - 检查错误信息或成功指示器
                if (passwordMode) {
                    const lowercaseLine = line.toLowerCase();
                    const isError = lowercaseLine.includes('sorry') ||
                        lowercaseLine.includes('incorrect') ||
                        lowercaseLine.includes('failed') ||
                        lowercaseLine.includes('wrong') ||
                        lowercaseLine.includes('try again');

                    if (isError) {
                        // 密码错误，保持密码模式
                        console.log('密码错误，保持密码模式:', line);
                        outputLines.push(`<span class="error-line">❌ ${line}</span>`);
                        continue;
                    } else if (isSuccessIndicator(line) || promptRegex.test(line)) {
                        // 成功或新提示符，退出密码模式
                        console.log('密码验证成功或收到新提示符，退出密码模式:', line);
                        setPasswordMode(false);
                        setLastPasswordPrompt('');
                        setPasswordPromptReady(false);
                    }
                }

                if (promptRegex.test(line)) {
                    // 这是一个提示符
                    newPrompt = line;
                    // 如果收到提示符，也退出密码模式
                    if (passwordMode) {
                        setPasswordMode(false);
                        setLastPasswordPrompt('');
                        setPasswordPromptReady(false);
                    }
                } else if (line.trim()) {
                    // 检查是否是服务器返回的控制字符回显，如果是则忽略
                    const trimmedLine = line.trim();

                    // 忽略服务器返回的控制字符回显
                    if (trimmedLine === '^C' || trimmedLine === '^D' || trimmedLine === '^Z') {
                        continue;
                    }

                    // 检查是否是密码行（包含星号的行）
                    const isPasswordLine = passwordMode && /\*+/.test(trimmedLine);
                    if (isPasswordLine) {
                        console.log('检测到密码行:', trimmedLine);

                        // 限制显示的星号数量，避免显示过长
                        let displayLine = line;
                        if (trimmedLine.length > 50) {
                            // 如果星号太多，只显示合理数量的星号
                            const maxStars = 20; // 最多显示20个星号
                            const maskedPortion = '*'.repeat(maxStars);
                            displayLine = line.replace(/\*+/, maskedPortion);
                            console.log('密码行过长，已截短显示:', displayLine);
                        }

                        outputLines.push(`<span class="password-input-line">${displayLine}</span>`);
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
                // 收到新提示符时退出密码模式
                if (passwordMode) {
                    console.log('收到新提示符，退出密码模式:', newPrompt);
                    setPasswordMode(false);
                    setLastPasswordPrompt('');
                    setPasswordPromptReady(false);
                }
            }

            // 添加输出行到显示
            if (outputLines.length > 0) {
                setOutput(prev => [...prev, ...outputLines]);
            }

            scrollToBottom();
        }
    }, [promptRegex, scrollToBottom, isSystemMessage, cleanSystemMessages, lastSentCommand, passwordMode, isPasswordPrompt, isSuccessIndicator]);

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

        // 处理来自TerminalConnectionWrapper的terminal-message事件
        const handleTerminalMessage = (event: CustomEvent) => {
            try {
                const { data, dataType, tabKey: eventTabKey } = event.detail;

                // 确保消息是针对当前标签页的
                if (tabKey && eventTabKey !== tabKey) {
                    return;
                }

                const dataPreview = typeof data === 'string' ? data.substring(0, 50) : `[${typeof data}] ${data}`;
                console.log(`🎯 SimpleTerminal收到terminal-message事件: tabKey=${eventTabKey}, dataType=${dataType}, data预览:`, dataPreview);

                if (dataType === 'terminal-output' || dataType === 'text') {
                    // 处理终端输出数据 - 确保是字符串
                    const textData = typeof data === 'string' ? data : String(data);
                    processServerData(textData);
                } else if (dataType === 'special-command') {
                    // 处理特殊命令
                    console.log('SimpleTerminal处理特殊命令:', data);
                } else if (dataType === 'json' || dataType === 'object') {
                    // 处理JSON数据（可能是状态更新等）
                    try {
                        const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
                        console.log('SimpleTerminal处理JSON数据:', jsonData);

                        // 如果JSON数据包含终端输出，提取并处理
                        if (jsonData && jsonData.data && typeof jsonData.data === 'string') {
                            processServerData(jsonData.data);
                        }
                    } catch (e) {
                        console.error('解析JSON数据失败:', e);
                        // 如果JSON解析失败，尝试作为字符串处理
                        const textData = typeof data === 'string' ? data : String(data);
                        processServerData(textData);
                    }
                } else {
                    // 其他类型的数据，尝试转换为字符串处理
                    console.log('SimpleTerminal处理其他类型数据:', dataType, data);
                    const textData = typeof data === 'string' ? data : String(data);
                    processServerData(textData);
                }
            } catch (e) {
                console.error('处理terminal-message事件时出错:', e);
            }
        };

        // 添加事件监听器
        ws.addEventListener('open', handleOpen);
        // 注释掉直接的message监听，改为使用terminal-message事件
        // ws.addEventListener('message', handleMessage);
        ws.addEventListener('close', handleClose);
        ws.addEventListener('error', handleError);

        // 添加自定义terminal-message事件监听器
        window.addEventListener('terminal-message', handleTerminalMessage as EventListener);

        // 清理函数
        return () => {
            if (ws) {
                ws.removeEventListener('open', handleOpen);
                // ws.removeEventListener('message', handleMessage);
                ws.removeEventListener('close', handleClose);
                ws.removeEventListener('error', handleError);
            }
            window.removeEventListener('terminal-message', handleTerminalMessage as EventListener);
        };
    }, [webSocketRef, processServerData, tabKey]);

    // 发送单个命令到终端
    const sendCommand = useCallback((command: string) => {
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            setError('终端连接已断开，无法发送命令');
            message.error('终端连接已断开');
            return;
        }

        // 如果是密码模式但还没有就绪，延迟发送
        if (passwordMode && !passwordPromptReady) {
            console.log('密码模式未就绪，延迟500ms后重试发送');
            setTimeout(() => sendCommand(command), 500);
            return;
        }

        try {
            // 清理命令，去除前后空格
            const cleanCommand = command.trim();
            console.log('原始命令:', `"${command}"`, '清理后命令:', `"${cleanCommand}"`);

            // 在密码模式下特殊处理本地回显
            if (passwordMode) {
                // 密码模式：只显示掩码，不显示提示符
                const maskedCommand = '*'.repeat(cleanCommand.length);
                setOutput(prev => [...prev, `<span class="password-input-line">${maskedCommand}</span>`]);
                console.log('密码模式下发送命令:', `[密码已隐藏:${cleanCommand.length}字符]`, '就绪状态:', passwordPromptReady);
            } else {
                // 普通模式：显示命令（本地回显）
                const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;
                if (cleanPrompt) {
                    const fullCommand = `${cleanPrompt}${cleanCommand}`;
                    setOutput(prev => [...prev, fullCommand]);
                }
            }

            // 记录发送的命令
            setLastSentCommand(cleanCommand);

            // 使用二进制协议发送到服务器
            if (tabKey) {
                (async () => {
                    try {
                        const { default: webSocketService } = await import('../../pages/Terminal/services/WebSocketService');
                        const commandWithCR = cleanCommand + '\r\n';

                        // 详细日志记录实际发送的数据
                        console.log('发送给WebSocketService的数据详情:');
                        console.log('  原始命令:', JSON.stringify(command));
                        console.log('  清理后命令:', JSON.stringify(cleanCommand));
                        console.log('  添加回车后:', JSON.stringify(commandWithCR));
                        console.log('  字节长度:', new TextEncoder().encode(commandWithCR).length);
                        console.log('  字节数组:', Array.from(new TextEncoder().encode(commandWithCR)));

                        await webSocketService.sendData({ key: tabKey } as any, commandWithCR, true);
                        console.log('通过二进制协议发送命令:', cleanCommand);
                    } catch (error) {
                        console.warn('二进制协议发送失败，使用传统方式:', error);
                        webSocketRef.current?.send(cleanCommand + '\r\n');
                    }
                })();
            } else {
                // 回退到传统方式
                webSocketRef.current.send(cleanCommand + '\r\n');
            }

            // 成功消息也要考虑密码模式
            if (passwordMode) {
                message.success(`已发送密码输入`);
            } else {
                message.success(`已发送命令: ${cleanCommand}`);
            }
            scrollToBottom();
        } catch (e) {
            console.error('发送命令失败:', e);
            message.error('发送命令失败');
        }
    }, [webSocketRef, currentPrompt, scrollToBottom, setLastSentCommand, passwordMode, passwordPromptReady]);

    // 发送批量命令
    const sendBatchCommands = useCallback((commands: string[]) => {
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            setError('终端连接已断开，无法发送命令');
            message.error('终端连接已断开');
            return;
        }

        try {
            message.info(`开始执行 ${commands.length} 条批量命令`);

            commands.forEach((command, index) => {
                setTimeout(() => {
                    sendCommand(command);
                    if (index === commands.length - 1) {
                        message.success('批量命令执行完成');
                    }
                }, index * 500); // 每个命令间隔500ms
            });
        } catch (e) {
            console.error('批量命令执行失败:', e);
            message.error('批量命令执行失败');
        }
    }, [sendCommand, webSocketRef]);

    // 处理键盘输入 - 本地回显模式和快捷键
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        // 如果有弹窗打开，只处理ESC关闭弹窗，其他键盘事件不处理
        if (batchCommandsVisible || quickCommandsVisible || helpVisible) {
            // ESC - 关闭所有弹窗
            if (e.key === 'Escape') {
                e.preventDefault();
                setBatchCommandsVisible(false);
                setQuickCommandsVisible(false);
                setHelpVisible(false);
            }
            // 其他所有键盘事件都不处理，让模态框内的输入框正常工作
            return;
        }

        // 快捷键处理 (不阻止默认行为)
        if (e.ctrlKey || e.altKey) {
            // Ctrl+Shift+B - 打开批量命令
            if (e.ctrlKey && e.shiftKey && e.key === 'B') {
                e.preventDefault();
                setBatchCommandsVisible(true);
                return;
            }

            // Ctrl+Shift+Q - 打开快速命令
            if (e.ctrlKey && e.shiftKey && e.key === 'Q') {
                e.preventDefault();
                setQuickCommandsVisible(true);
                return;
            }

            // Ctrl+Shift+F - 打开文件浏览器
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                setFileBrowserVisible(!fileBrowserVisible);
                if (!fileBrowserVisible) {
                    setShowSplitView(true);
                }
                return;
            }

            // Ctrl+Shift+H 或 F1 - 显示帮助
            if ((e.ctrlKey && e.shiftKey && e.key === 'H') || e.key === 'F1') {
                e.preventDefault();
                setHelpVisible(true);
                return;
            }
        }

        e.preventDefault();

        // 检查WebSocket连接状态
        if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            setError('终端连接已断开，无法发送命令');
            return;
        }

        try {
            if (e.key === 'Enter') {
                // 回车键 - 发送完整命令
                const trimmedInput = localInput.trim();
                if (trimmedInput) {
                    console.log('键盘输入原始:', `"${localInput}"`, '清理后:', `"${trimmedInput}"`);

                    // 只在非密码模式下添加到命令历史
                    if (!passwordMode) {
                        setCommandHistory(prev => [trimmedInput, ...prev.slice(0, 19)]);
                    }

                    // 显示完整的命令行
                    const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;
                    let displayCommand;

                    if (passwordMode) {
                        // 密码模式：显示星号
                        const maskedInput = '*'.repeat(trimmedInput.length);
                        displayCommand = `${cleanPrompt}${maskedInput}`;
                    } else {
                        // 普通模式：显示明文
                        displayCommand = `${cleanPrompt}${trimmedInput}`;
                    }

                    setOutput(prev => [...prev, displayCommand]);

                    // 记录发送的命令，用于防止重复显示
                    setLastSentCommand(trimmedInput);

                    // 使用二进制协议发送命令到服务器 - 无论是否为密码模式都发送原始输入
                    console.log('发送命令:', passwordMode ? `密码输入(长度:${trimmedInput.length})` : trimmedInput);
                    console.log('当前密码模式状态:', passwordMode);

                    if (tabKey) {
                        (async () => {
                            try {
                                const { default: webSocketService } = await import('../../pages/Terminal/services/WebSocketService');
                                await webSocketService.sendData({ key: tabKey } as any, trimmedInput + '\r\n', true);
                                console.log('通过二进制协议发送输入:', passwordMode ? `[密码已隐藏:${trimmedInput.length}字符]` : trimmedInput);
                            } catch (error) {
                                console.warn('二进制协议发送失败，使用传统方式:', error);
                                webSocketRef.current?.send(trimmedInput + '\r\n');
                            }
                        })();
                    } else {
                        // 回退到传统方式
                        webSocketRef.current.send(trimmedInput + '\r\n');
                    }
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
                // 使用二进制协议发送Ctrl+C
                if (tabKey) {
                    (async () => {
                        try {
                            const { default: webSocketService } = await import('../../pages/Terminal/services/WebSocketService');
                            await webSocketService.sendData({ key: tabKey } as any, '\x03', true);
                            console.log('通过二进制协议发送 Ctrl+C');
                        } catch (error) {
                            console.warn('二进制协议发送失败，使用传统方式:', error);
                            webSocketRef.current?.send('\x03');
                        }
                    })();
                } else {
                    webSocketRef.current.send('\x03');
                }

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
                // 使用二进制协议发送Ctrl+D
                if (tabKey) {
                    (async () => {
                        try {
                            const { default: webSocketService } = await import('../../pages/Terminal/services/WebSocketService');
                            await webSocketService.sendData({ key: tabKey } as any, '\x04', true);
                            console.log('通过二进制协议发送 Ctrl+D');
                        } catch (error) {
                            console.warn('二进制协议发送失败，使用传统方式:', error);
                            webSocketRef.current?.send('\x04');
                        }
                    })();
                } else {
                    webSocketRef.current.send('\x04');
                }
                setLocalInput('');
                setCursorPosition(0);
                scrollToBottom();

            } else if (e.key === 'z' && e.ctrlKey) {
                // Ctrl+Z - 显示^Z并发送SIGTSTP
                const cleanPrompt = currentPrompt.split('\n').pop() || currentPrompt;
                const suspendLine = `${cleanPrompt}${localInput}^Z`;
                setOutput(prev => [...prev, suspendLine]);

                // 使用二进制协议发送Ctrl+Z
                if (tabKey) {
                    (async () => {
                        try {
                            const { default: webSocketService } = await import('../../pages/Terminal/services/WebSocketService');
                            await webSocketService.sendData({ key: tabKey } as any, '\x1A', true);
                            console.log('通过二进制协议发送 Ctrl+Z');
                        } catch (error) {
                            console.warn('二进制协议发送失败，使用传统方式:', error);
                            webSocketRef.current?.send('\x1A');
                        }
                    })();
                } else {
                    webSocketRef.current.send('\x1A');
                }
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
        // 如果有弹窗打开，不聚焦终端
        if (batchCommandsVisible || quickCommandsVisible || helpVisible) {
            return;
        }
        if (terminalRef.current) {
            terminalRef.current.focus();
        }
    }, [batchCommandsVisible, quickCommandsVisible, helpVisible]);

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

        // 在密码模式下将输入替换为星号
        let displayBeforeCursor = beforeCursor;
        let displayAtCursor = atCursor === ' ' ? '\u00A0' : atCursor; // 使用不间断空格
        let displayAfterCursor = afterCursor;

        if (passwordMode) {
            displayBeforeCursor = '*'.repeat(beforeCursor.length);
            displayAtCursor = atCursor === ' ' ? '\u00A0' : '*';
            displayAfterCursor = '*'.repeat(afterCursor.length);
        }

        const inputLineClass = passwordMode ? 'terminal-input-line password-mode' : 'terminal-input-line';

        return (
            <div className={inputLineClass}>
                {passwordMode && (
                    <span className="password-indicator">🔐</span>
                )}
                <span
                    className="terminal-prompt"
                    dangerouslySetInnerHTML={{ __html: ansiToHtml(cleanPrompt) }}
                />
                <span className={passwordMode ? "terminal-input-before password-input" : "terminal-input-before"}>
                    {displayBeforeCursor}
                </span>
                <span className={`terminal-cursor ${cursorVisible ? 'visible' : ''}`}>{displayAtCursor}</span>
                <span className={passwordMode ? "terminal-input-after password-input" : "terminal-input-after"}>
                    {displayAfterCursor}
                </span>
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
                {/* 密码模式指示器 */}
                {passwordMode && (
                    <div style={{
                        color: passwordPromptReady ? '#52c41a' : '#faad14',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <span className="password-indicator">🔐</span>
                        <span>
                            密码输入模式 {passwordPromptReady ? '(就绪)' : '(准备中...)'}
                        </span>
                    </div>
                )}
                <div className="toolbar-buttons">
                    <Tooltip title="文件浏览器 (Ctrl+Shift+F)">
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
                        <Tooltip title={showSplitView ? '收起分屏' : '展开分屏'}>
                            <Button
                                icon={showSplitView ? <ShrinkOutlined /> : <ExpandOutlined />}
                                size="small"
                                onClick={() => setShowSplitView(!showSplitView)}
                            />
                        </Tooltip>
                    )}

                    <Tooltip title="快速命令 (Ctrl+Shift+Q)">
                        <Button
                            icon={<ThunderboltOutlined />}
                            size="small"
                            type={quickCommandsVisible ? 'primary' : 'default'}
                            onClick={() => setQuickCommandsVisible(true)}
                        >
                            快速
                        </Button>
                    </Tooltip>

                    <Tooltip title="批量命令 (Ctrl+Shift+B)">
                        <Button
                            icon={<BlockOutlined />}
                            size="small"
                            type={batchCommandsVisible ? 'primary' : 'default'}
                            onClick={() => setBatchCommandsVisible(true)}
                        >
                            批量
                        </Button>
                    </Tooltip>

                    <Tooltip title="快捷键帮助 (F1 或 Ctrl+Shift+H)">
                        <Button
                            icon={<QuestionCircleOutlined />}
                            size="small"
                            onClick={() => setHelpVisible(true)}
                        >
                            帮助
                        </Button>
                    </Tooltip>
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

                            // 检查是否为密码相关行
                            const isPasswordLine = line.includes('password-prompt') ||
                                line.includes('🔐') ||
                                isPasswordPrompt(line);

                            // 检查是否为错误信息
                            const isErrorLine = line.toLowerCase().includes('sorry') ||
                                line.toLowerCase().includes('incorrect') ||
                                line.toLowerCase().includes('failed') ||
                                line.toLowerCase().includes('wrong');

                            let lineClass = 'terminal-line';
                            if (isWelcomeLine) lineClass += ' welcome-line';
                            if (isPasswordLine) lineClass += ' password-mode';
                            if (isErrorLine) lineClass += ' error-line';

                            return (
                                <div key={index} className={lineClass}>
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

            {/* 批量命令模态框 */}
            <BatchCommands
                visible={batchCommandsVisible}
                onClose={() => setBatchCommandsVisible(false)}
                onSendCommands={sendBatchCommands}
            />

            {/* 快速命令模态框 */}
            <QuickCommands
                visible={quickCommandsVisible}
                onClose={() => setQuickCommandsVisible(false)}
                onSendCommand={sendCommand}
            />

            {/* 快捷键帮助模态框 */}
            <ShortcutHelpModal
                visible={helpVisible}
                onClose={() => setHelpVisible(false)}
            />

            <div
                ref={terminalRef}
                className="terminal-input-focus"
                tabIndex={0}
                onKeyDown={handleKeyDown}
                style={{
                    position: 'absolute',
                    left: '-9999px',
                    opacity: 0,
                    pointerEvents: batchCommandsVisible || quickCommandsVisible || helpVisible ? 'none' : 'auto'
                }}
            />
        </div>
    );
};

// 快捷键帮助模态框组件
const ShortcutHelpModal: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
    const shortcuts = [
        {
            category: "基本功能",
            items: [
                { key: "Ctrl + Shift + F", desc: "打开/关闭文件浏览器" },
                { key: "Ctrl + Shift + Q", desc: "打开快速命令面板" },
                { key: "Ctrl + Shift + B", desc: "打开批量命令面板" },
                { key: "F1 / Ctrl + Shift + H", desc: "显示快捷键帮助" },
                { key: "Esc", desc: "关闭所有弹窗" }
            ]
        },
        {
            category: "终端操作",
            items: [
                { key: "Enter", desc: "执行命令" },
                { key: "↑ / ↓", desc: "浏览命令历史" },
                { key: "Tab", desc: "命令自动补全" },
                { key: "Ctrl + C", desc: "中断当前命令" },
                { key: "Ctrl + D", desc: "发送EOF信号" },
                { key: "Ctrl + Z", desc: "暂停当前进程" },
                { key: "Ctrl + R", desc: "反向搜索历史命令" }
            ]
        },
        {
            category: "文本编辑",
            items: [
                { key: "Home", desc: "光标移动到行首" },
                { key: "End", desc: "光标移动到行末" },
                { key: "← / →", desc: "移动光标" },
                { key: "Backspace", desc: "删除光标前字符" },
                { key: "Delete", desc: "删除光标后字符" }
            ]
        }
    ];

    return (
        <Modal
            title="快捷键帮助"
            open={visible}
            onCancel={onClose}
            footer={[
                <Button key="close" onClick={onClose}>
                    关闭
                </Button>
            ]}
            width={600}
        >
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {shortcuts.map((category, index) => (
                    <div key={index} style={{ marginBottom: 24 }}>
                        <h4 style={{
                            fontSize: 16,
                            fontWeight: 'bold',
                            marginBottom: 16,
                            color: '#1890ff',
                            borderBottom: '1px solid #f0f0f0',
                            paddingBottom: 8
                        }}>
                            {category.category}
                        </h4>
                        {category.items.map((item, idx) => (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px 0',
                                    borderBottom: idx < category.items.length - 1 ? '1px solid #f5f5f5' : 'none'
                                }}
                            >
                                <code style={{
                                    backgroundColor: '#f6f8fa',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                                    fontSize: 12,
                                    border: '1px solid #e1e4e8'
                                }}>
                                    {item.key}
                                </code>
                                <span style={{
                                    marginLeft: 16,
                                    color: '#666',
                                    flex: 1,
                                    textAlign: 'left',
                                    paddingLeft: 16
                                }}>
                                    {item.desc}
                                </span>
                            </div>
                        ))}
                    </div>
                ))}
                <div style={{
                    marginTop: 24,
                    padding: 16,
                    backgroundColor: '#f6ffed',
                    borderRadius: 6,
                    border: '1px solid #b7eb8f'
                }}>
                    <h5 style={{ color: '#52c41a', marginBottom: 8 }}>💡 小贴士：</h5>
                    <ul style={{ margin: 0, paddingLeft: 20, color: '#666' }}>
                        <li>快速命令：保存常用命令，一键执行</li>
                        <li>批量命令：按顺序执行多条命令，支持保存命令集</li>
                        <li>文件浏览器：支持上传、下载、编辑文件</li>
                        <li>命令历史：使用上下箭头键快速回调历史命令</li>
                    </ul>
                </div>
            </div>
        </Modal>
    );
};

export default SimpleTerminal; 
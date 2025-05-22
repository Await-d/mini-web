/*
 * @Author: Await
 * @Date: 2025-05-21 20:45:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-21 21:01:53
 * @Description: 简易终端组件，不使用xterm.js
 */
import React, { useEffect, useRef, useState } from 'react';
import { Input } from 'antd';
import './styles.css';

interface SimpleTerminalProps {
    connectionId: number;
    sessionId: string | number;
    webSocketRef: React.RefObject<WebSocket>;
    visible: boolean;
}

const SimpleTerminal: React.FC<SimpleTerminalProps> = ({
    connectionId,
    sessionId,
    webSocketRef,
    visible
}) => {
    const [output, setOutput] = useState<string[]>([]);
    const [input, setInput] = useState('');
    const outputRef = useRef<HTMLDivElement>(null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);

    // 处理WebSocket消息
    useEffect(() => {
        if (!webSocketRef.current) {
            console.error('WebSocket引用为空');
            return;
        }

        const handleMessage = (event: MessageEvent) => {
            try {
                // 首先尝试解析为JSON
                try {
                    const jsonData = JSON.parse(event.data);
                    // 处理各种类型的JSON消息
                    if (jsonData.type === 'data') {
                        appendOutput(jsonData.data);
                    } else if (jsonData.type === 'error') {
                        appendOutput(`错误: ${jsonData.message}`, 'error');
                    } else if (jsonData.type === 'connected') {
                        appendOutput(`已连接到 ${jsonData.host}:${jsonData.port}`, 'system');
                    } else if (jsonData.type === 'disconnected') {
                        appendOutput('连接已断开', 'system');
                    } else {
                        // 其他JSON消息
                        appendOutput(`收到消息: ${JSON.stringify(jsonData)}`, 'info');
                    }
                } catch (e) {
                    // 不是JSON，当作普通文本处理
                    appendOutput(event.data);
                }
            } catch (error) {
                console.error('处理WebSocket消息时出错:', error);
                appendOutput(`处理消息出错: ${error instanceof Error ? error.message : String(error)}`, 'error');
            }
        };

        const handleOpen = () => {
            appendOutput('WebSocket连接已建立', 'system');
            // 发送初始化数据
            const initData = {
                type: 'init',
                connectionId,
                sessionId,
                terminalType: 'simple'
            };
            webSocketRef.current?.send(JSON.stringify(initData));
        };

        const handleClose = () => {
            appendOutput('WebSocket连接已关闭', 'system');
        };

        const handleError = (error: Event) => {
            appendOutput(`WebSocket错误: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
        };

        // 添加事件监听器
        webSocketRef.current.addEventListener('message', handleMessage);
        webSocketRef.current.addEventListener('open', handleOpen);
        webSocketRef.current.addEventListener('close', handleClose);
        webSocketRef.current.addEventListener('error', handleError);

        // 清理函数
        return () => {
            webSocketRef.current?.removeEventListener('message', handleMessage);
            webSocketRef.current?.removeEventListener('open', handleOpen);
            webSocketRef.current?.removeEventListener('close', handleClose);
            webSocketRef.current?.removeEventListener('error', handleError);
        };
    }, [connectionId, sessionId, webSocketRef]);

    // 处理输入提交
    const handleInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();

            if (input.trim()) {
                // 显示用户输入
                appendOutput(`$ ${input}`, 'command');

                // 发送到WebSocket
                if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
                    webSocketRef.current.send(input + '\n');
                } else {
                    appendOutput('错误: WebSocket连接未打开', 'error');
                }

                // 清空输入
                setInput('');
            }
        }
    };

    // 添加输出文本
    const appendOutput = (text: string, type: 'normal' | 'error' | 'system' | 'command' | 'info' = 'normal') => {
        // 根据类型添加前缀
        let formattedText = text;
        if (type === 'error') {
            formattedText = `[错误] ${text}`;
        } else if (type === 'system') {
            formattedText = `[系统] ${text}`;
        } else if (type === 'info') {
            formattedText = `[信息] ${text}`;
        }

        // 处理换行符，分割成多行
        const lines = formattedText.split('\n');

        setOutput(prev => {
            // 保留最多1000行输出
            const newOutput = [...prev, ...lines.filter(line => line !== '')];
            if (newOutput.length > 1000) {
                return newOutput.slice(newOutput.length - 1000);
            }
            return newOutput;
        });

        // 滚动到底部
        setTimeout(() => {
            if (outputRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
            }
        }, 0);
    };

    // 处理特殊按键
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // 处理Tab键
        if (e.key === 'Tab') {
            e.preventDefault();
            setInput(prev => prev + '    '); // 插入4个空格
        }

        // Ctrl+C发送中断
        if (e.key === 'c' && e.ctrlKey) {
            if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
                webSocketRef.current.send('\x03'); // CTRL+C的ASCII码
                appendOutput('^C', 'command');
            }
        }

        // Ctrl+L清屏
        if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            setOutput([]);
        }
    };

    // 焦点管理
    useEffect(() => {
        if (visible && terminalContainerRef.current) {
            const inputElement = terminalContainerRef.current.querySelector('input');
            if (inputElement) {
                inputElement.focus();
            }
        }
    }, [visible]);

    // 渲染
    return (
        <div
            className="simple-terminal-container"
            ref={terminalContainerRef}
            style={{ display: visible ? 'flex' : 'none' }}
        >
            <div className="terminal-output" ref={outputRef}>
                {output.map((line, index) => (
                    <div
                        key={index}
                        className={`terminal-line ${line.startsWith('[错误]') ? 'error-line' :
                            line.startsWith('[系统]') ? 'system-line' :
                                line.startsWith('[信息]') ? 'info-line' :
                                    line.startsWith('$') ? 'command-line' : ''
                            }`}
                    >
                        {line}
                    </div>
                ))}
            </div>
            <div className="terminal-input-container">
                <span className="prompt">$&nbsp;</span>
                <Input
                    className="terminal-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={handleInputSubmit}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    bordered={false}
                />
            </div>
        </div>
    );
};

export default SimpleTerminal; 
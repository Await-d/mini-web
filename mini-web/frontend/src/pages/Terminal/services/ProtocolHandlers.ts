/*
 * @Author: Await
 * @Date: 2025-05-18 17:20:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-18 09:07:37
 * @Description: 协议特定的消息处理器
 */
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { writeColorText } from '../utils/terminalUtils';
import type { ProtocolHandler } from './WebSocketService';
import { WebSocketService } from './WebSocketService';

/**
 * SSH协议消息处理器
 */
export const SshProtocolHandler: ProtocolHandler = {
    handleMessage: (tab: TerminalTab, event: MessageEvent) => {
        if (!tab.xtermRef?.current) return;

        try {
            // 处理SSH协议消息
            if (typeof event.data === 'string') {
                // 尝试解析JSON消息
                if (event.data.startsWith('{') && event.data.endsWith('}')) {
                    try {
                        const jsonData = JSON.parse(event.data);

                        // 处理系统消息
                        if (jsonData.type === 'system') {
                            writeColorText(tab.xtermRef.current, jsonData.message + '\r\n', 'yellow');
                            return;
                        }

                        // 处理错误消息
                        if (jsonData.type === 'error') {
                            writeColorText(tab.xtermRef.current, jsonData.message + '\r\n', 'red');
                            return;
                        }

                        // 处理延迟/ping消息
                        if (jsonData.type === 'latency' || jsonData.type === 'ping' || jsonData.type === 'pong') {
                            // 忽略这类消息，不显示给用户
                            return;
                        }
                    } catch (e) {
                        // 解析JSON失败，作为普通文本处理
                        tab.xtermRef.current.write(event.data);
                    }
                } else {
                    // 直接写入终端
                    tab.xtermRef.current.write(event.data);
                }
            } else if (event.data instanceof ArrayBuffer) {
                // 处理二进制数据
                const view = new Uint8Array(event.data);
                const decoder = new TextDecoder();
                const text = decoder.decode(view);
                tab.xtermRef.current.write(text);
            }
        } catch (error) {
            console.error('SSH消息处理错误:', error);
        }
    },

    handleOpen: (tab: TerminalTab) => {
        if (!tab.xtermRef?.current) return;

        // 连接建立后，显示欢迎消息
        writeColorText(tab.xtermRef.current, '=== SSH连接已建立 ===\r\n', 'green');
    },

    handleClose: (tab: TerminalTab) => {
        if (!tab.xtermRef?.current) return;

        // 连接关闭时，显示断开消息
        writeColorText(tab.xtermRef.current, '=== SSH连接已断开 ===\r\n', 'yellow');
    },

    handleError: (tab: TerminalTab, error: Event) => {
        if (!tab.xtermRef?.current) return;

        // 连接错误时，显示错误消息
        writeColorText(tab.xtermRef.current, `=== SSH连接错误: ${error} ===\r\n`, 'red');
    }
};

/**
 * Telnet协议消息处理器
 */
export const TelnetProtocolHandler: ProtocolHandler = {
    handleMessage: (tab: TerminalTab, event: MessageEvent) => {
        if (!tab.xtermRef?.current) return;

        // Telnet消息处理与SSH类似，但可能需要特殊处理Telnet协商命令
        if (typeof event.data === 'string') {
            tab.xtermRef.current.write(event.data);
        } else if (event.data instanceof ArrayBuffer) {
            const view = new Uint8Array(event.data);

            // 处理Telnet协商命令
            // 实际实现应解析Telnet命令，这里简化为直接显示
            const decoder = new TextDecoder();
            const text = decoder.decode(view);
            tab.xtermRef.current.write(text);
        }
    },

    handleOpen: (tab: TerminalTab) => {
        if (!tab.xtermRef?.current) return;
        writeColorText(tab.xtermRef.current, '=== Telnet连接已建立 ===\r\n', 'green');
    },

    handleClose: (tab: TerminalTab) => {
        if (!tab.xtermRef?.current) return;
        writeColorText(tab.xtermRef.current, '=== Telnet连接已断开 ===\r\n', 'yellow');
    }
};

// 自定义RDP组件引用接口
interface RdpComponent {
    handleMessage: (event: MessageEvent) => void;
}

/**
 * RDP协议消息处理器
 * RDP是图形协议，消息处理不同于文本协议
 */
export const RdpProtocolHandler: ProtocolHandler = {
    handleMessage: (tab: TerminalTab, event: MessageEvent) => {
        // RDP消息需要转发给RDP组件进行处理
        // 使用类型断言处理rdpComponentRef属性
        const rdpComponent = (tab as any).rdpComponentRef?.current as RdpComponent | undefined;

        if (rdpComponent && typeof rdpComponent.handleMessage === 'function') {
            rdpComponent.handleMessage(event);
        } else if (tab.xtermRef?.current) {
            // 回退到文本模式显示状态消息
            if (typeof event.data === 'string') {
                try {
                    const jsonData = JSON.parse(event.data);
                    if (jsonData.type === 'status') {
                        writeColorText(tab.xtermRef.current, `[RDP状态] ${jsonData.message}\r\n`, 'cyan');
                    }
                } catch (e) {
                    // 不是JSON，忽略
                }
            }
        }
    },

    handleOpen: (tab: TerminalTab) => {
        console.log('RDP连接已建立', tab.key);
    },

    handleClose: (tab: TerminalTab) => {
        console.log('RDP连接已断开', tab.key);
    },

    handleError: (tab: TerminalTab, error: Event) => {
        console.error('RDP连接错误:', error);
        if (tab.xtermRef?.current) {
            writeColorText(tab.xtermRef.current, `=== RDP连接错误 ===\r\n`, 'red');
        }
    }
};

// 自定义VNC组件引用接口
interface VncComponent {
    handleMessage: (event: MessageEvent) => void;
}

/**
 * VNC协议消息处理器
 */
export const VncProtocolHandler: ProtocolHandler = {
    handleMessage: (tab: TerminalTab, event: MessageEvent) => {
        // VNC消息处理类似于RDP
        const vncComponent = (tab as any).vncComponentRef?.current as VncComponent | undefined;

        if (vncComponent && typeof vncComponent.handleMessage === 'function') {
            vncComponent.handleMessage(event);
        } else if (tab.xtermRef?.current) {
            // 回退到文本模式
            if (typeof event.data === 'string') {
                try {
                    const jsonData = JSON.parse(event.data);
                    if (jsonData.type === 'status') {
                        writeColorText(tab.xtermRef.current, `[VNC状态] ${jsonData.message}\r\n`, 'cyan');
                    }
                } catch (e) {
                    // 不是JSON，忽略
                }
            }
        }
    },

    handleOpen: (tab: TerminalTab) => {
        console.log('VNC连接已建立', tab.key);
    },

    handleClose: (tab: TerminalTab) => {
        console.log('VNC连接已断开', tab.key);
    }
};

// 导出所有协议处理器
export const ProtocolHandlers = {
    ssh: SshProtocolHandler,
    telnet: TelnetProtocolHandler,
    rdp: RdpProtocolHandler,
    vnc: VncProtocolHandler
};

/**
 * 初始化协议处理器
 * 在应用启动时调用此函数，注册所有协议处理器
 */
export const initializeProtocolHandlers = () => {
    // 注册所有协议处理器
    WebSocketService.registerProtocolHandler('ssh', SshProtocolHandler);
    WebSocketService.registerProtocolHandler('telnet', TelnetProtocolHandler);
    WebSocketService.registerProtocolHandler('rdp', RdpProtocolHandler);
    WebSocketService.registerProtocolHandler('vnc', VncProtocolHandler);

    console.log('【WebSocket】所有协议处理器已注册');
};

export default ProtocolHandlers; 
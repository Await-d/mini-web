/**
 * RDP连接辅助工具
 * 提供RDP协议特定的连接和命令处理功能
 */

import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * 创建RDP WebSocket连接
 * @param sessionId 会话ID
 * @param tab 终端标签对象
 * @returns 创建的WebSocket对象或null
 */
export const createRdpConnection = (sessionId: number, tab: TerminalTab): WebSocket | null => {
    if (!sessionId) {
        console.error('创建RDP连接失败: 缺少会话ID');
        return null;
    }

    try {
        // 获取WebSocket URL
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = process.env.NODE_ENV === 'production' 
          ? window.location.host  // 生产环境使用当前host和port
          : 'localhost:8080';     // 开发环境使用localhost:8080

        // 获取认证令牌
        const token = localStorage.getItem('token');

        // 添加token参数到URL以解决认证问题
        const wsUrl = `${wsProtocol}//${wsHost}/ws/rdp/${sessionId}?token=${token}`;

        console.log(`[RDP] 创建连接: ${wsUrl}`);

        // 创建WebSocket
        const ws = new WebSocket(wsUrl);

        // 设置事件处理函数
        ws.onopen = () => {
            console.log('[RDP] 连接已建立');

            // 发送初始化命令
            const initCmd = {
                type: 'init',
                protocol: 'rdp',
                width: window.innerWidth * 0.9,
                height: window.innerHeight * 0.8
            };
            ws.send(JSON.stringify(initCmd));

            // 更新标签状态
            if (tab) {
                tab.isConnected = true;
            }
        };

        ws.onerror = (error) => {
            console.error('[RDP] 连接错误:', error);
            if (tab) {
                tab.isConnected = false;
            }
        };

        ws.onclose = () => {
            console.log('[RDP] 连接已关闭');
            if (tab) {
                tab.isConnected = false;
            }
        };

        return ws;
    } catch (error) {
        console.error('[RDP] 创建连接失败:', error);
        return null;
    }
};

/**
 * 发送RDP特殊按键命令
 * @param ws WebSocket对象
 * @param keyCombo 按键组合
 * @returns 是否发送成功
 */
export const sendRdpKeyCombo = (ws: WebSocket | null, keyCombo: string): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('[RDP] 发送按键失败: WebSocket未连接');
        return false;
    }

    try {
        const command = {
            type: 'key_combo',
            protocol: 'rdp',
            combo: keyCombo
        };
        ws.send(JSON.stringify(command));
        console.log(`[RDP] 发送按键: ${keyCombo}`);
        return true;
    } catch (error) {
        console.error('[RDP] 发送按键失败:', error);
        return false;
    }
};

/**
 * 发送RDP调整大小命令
 * @param ws WebSocket对象
 * @param width 宽度
 * @param height 高度
 * @returns 是否发送成功
 */
export const sendRdpResize = (ws: WebSocket | null, width: number, height: number): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('[RDP] 调整大小失败: WebSocket未连接');
        return false;
    }

    try {
        const command = {
            type: 'resize',
            protocol: 'rdp',
            width,
            height
        };
        ws.send(JSON.stringify(command));
        console.log(`[RDP] 调整大小: ${width}x${height}`);
        return true;
    } catch (error) {
        console.error('[RDP] 调整大小失败:', error);
        return false;
    }
};

/**
 * 发送RDP剪贴板命令
 * @param ws WebSocket对象
 * @param action 操作类型: 'get' | 'set'
 * @param text 要设置的文本 (仅在action='set'时使用)
 * @returns 是否发送成功
 */
export const sendRdpClipboard = (ws: WebSocket | null, action: 'get' | 'set', text?: string): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('[RDP] 剪贴板操作失败: WebSocket未连接');
        return false;
    }

    try {
        const command = {
            type: 'clipboard',
            protocol: 'rdp',
            action,
            ...(text ? { text } : {})
        };
        ws.send(JSON.stringify(command));
        console.log(`[RDP] 剪贴板操作: ${action}`);
        return true;
    } catch (error) {
        console.error('[RDP] 剪贴板操作失败:', error);
        return false;
    }
};

/**
 * 发送RDP刷新屏幕命令
 * @param ws WebSocket对象
 * @returns 是否发送成功
 */
export const sendRdpRefresh = (ws: WebSocket | null): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('[RDP] 刷新屏幕失败: WebSocket未连接');
        return false;
    }

    try {
        const command = {
            type: 'refresh',
            protocol: 'rdp'
        };
        ws.send(JSON.stringify(command));
        console.log('[RDP] 刷新屏幕');
        return true;
    } catch (error) {
        console.error('[RDP] 刷新屏幕失败:', error);
        return false;
    }
};

/**
 * 发送ping命令以测量网络延迟
 * @param ws WebSocket对象
 * @returns 发送时间戳或null (如果发送失败)
 */
export const sendRdpPing = (ws: WebSocket | null): number | null => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('[RDP] 发送ping失败: WebSocket未连接');
        return null;
    }

    try {
        const timestamp = Date.now();
        const command = {
            type: 'ping',
            protocol: 'rdp',
            timestamp
        };
        ws.send(JSON.stringify(command));
        console.log('[RDP] 发送ping');
        return timestamp;
    } catch (error) {
        console.error('[RDP] 发送ping失败:', error);
        return null;
    }
}; 
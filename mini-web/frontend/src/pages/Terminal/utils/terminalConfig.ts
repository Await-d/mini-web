/*
 * @Author: Await
 * @Date: 2025-05-08 18:19:21
 * @LastEditors: Await
 * @LastEditTime: 2025-05-08 19:31:59
 * @Description: 请填写简介
 */
// 终端配置常量和类型

// 终端配置常量
export const TERMINAL_FONT_SIZE = 14;
export const TERMINAL_BG_COLOR = '#1e1e1e';
export const TERMINAL_FG_COLOR = '#f0f0f0';
export const TERMINAL_CURSOR_COLOR = '#ffffff';

export interface WindowSize {
    cols: number;
    rows: number;
}

// WebSocket消息类型扩展
export interface TerminalMessage {
    type: 'resize' | 'data' | 'error' | 'ping' | 'pong' | 'auth' | 'system' | 'control' | 'latency' | 'config';
    data?: any;
    cols?: number;
    rows?: number;
    error?: string;
    timestamp?: number;
    width?: number;
    height?: number;
    token?: string;
    connectionInfo?: {
        protocol?: string;
        host?: string;
        port?: number;
        username?: string;
        sessionId?: number;
    };
} 
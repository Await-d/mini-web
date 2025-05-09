import { FC, ReactNode } from 'react';
import { TerminalTab } from '../../contexts/TerminalContext';

// 导出TerminalTab类型，以便其他文件可以直接从这里导入
export type { TerminalTab };

// 终端连接包装器属性
export interface TerminalConnectionWrapperProps {
    children: (props: ConnectionChildProps) => ReactNode;
    connectionParams?: {
        connectionId: number;
        sessionId?: number;
    };
}

// 连接子组件属性 - 传递给内部渲染函数
export interface ConnectionChildProps {
    hasConnection: boolean;
    tabsCount: number;
    activeTabKey: string;
    isConnected: boolean;
    tabs: TerminalTab[]; // 必需项，添加完整标签数组
    connection?: any;
    fullscreen?: boolean;
    terminalSize?: any;
    networkLatency?: number | null; // 修改为支持null值
    terminalMode?: string;
    sidebarCollapsed?: boolean;
    toggleFullscreen?: () => void;
    sendDataToServer?: (data: string) => void;
    clearRetryTimers?: () => void;
    [key: string]: any; // 支持其他可能的属性
}

// 终端设置
export interface TerminalSettings {
    fontSize: number;
    fontFamily: string;
    cursorBlink: boolean;
    background: string;
    foreground: string;
    scrollback?: number;
}

// 其他终端相关类型定义
export type ProtocolType = 'ssh' | 'telnet' | 'rdp' | 'vnc';
export type TerminalMode = 'normal' | 'fullscreen';
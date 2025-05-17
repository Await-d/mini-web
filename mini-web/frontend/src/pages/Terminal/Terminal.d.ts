/*
 * @Author: Await
 * @Date: 2025-05-10 19:47:25
 * @LastEditors: Await
 * @LastEditTime: 2025-05-17 18:26:12
 * @Description: 请填写简介
 */
import { FC, ReactNode } from 'react';
import { TerminalTab } from '../../contexts/TerminalContext';
import { Connection } from '../../services/api';

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

// 窗口大小类型
export interface WindowSize {
    cols: number;
    rows: number;
}

// 连接子组件属性 - 传递给内部渲染函数
export interface ConnectionChildProps {
    // 基本连接状态
    hasConnection: boolean;
    tabsCount: number;
    activeTabKey: string;
    isConnected: boolean;

    // 核心数据
    tabs: TerminalTab[]; // 标签页数组
    connection?: Connection | null; // 当前连接信息

    // UI状态
    fullscreen?: boolean;
    terminalSize?: WindowSize;
    networkLatency?: number | null;
    terminalMode?: string;
    sidebarCollapsed?: boolean;

    // 功能方法
    toggleFullscreen?: () => void;
    sendDataToServer?: (data: string) => void;
    refreshTab?: (tabKey: string) => void;
    duplicateTab?: (tabKey: string) => void;
    closeWebSocketConnection?: (tab: TerminalTab) => void;
    createWebSocketConnection?: (tab: TerminalTab) => void;

    // 允许其他属性
    [key: string]: any;
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
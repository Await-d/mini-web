/*
 * @Author: Await
 * @Date: 2025-05-10 19:47:25
 * @LastEditors: Await
 * @LastEditTime: 2025-05-22 21:04:38
 * @Description: 终端相关类型定义
 */
import { FC, ReactNode, RefObject } from 'react';
import { TerminalTab } from '../../contexts/TerminalContext';
import { Connection as ApiConnection } from '../../services/api';

// 导出Connection类型
export type Connection = ApiConnection;

// 导出TerminalTab类型，以便其他文件可以直接从这里导入
export type { TerminalTab };

/**
 * 连接参数类型
 */
export interface ConnectionParams {
    connectionId: number;
    sessionId: number | string;
}

/**
 * 终端事件管理器属性
 */
export interface TerminalEventManagerProps {
    children: React.ReactNode;
    tabs: TerminalTab[];
    activeTabKey: string;
    setActiveTab: (key: string) => void;
    createWebSocketConnection?: (sessionId: string | number, tabKey: string) => WebSocket | null;
}

/**
 * 终端连接包装器属性
 */
export interface TerminalConnectionWrapperProps {
    connectionParams?: ConnectionParams;
    children: (props: ConnectionChildProps) => React.ReactNode;
}

/**
 * 连接子组件属性
 */
export interface ConnectionChildProps {
    hasConnection: boolean;
    tabsCount: number;
    activeTabKey: string;
    isConnected: boolean;
    tabs?: TerminalTab[];
    connection?: Connection;
    fullscreen?: boolean;
    terminalSize?: { cols: number; rows: number };
    networkLatency?: number | null;
    terminalMode?: string;
    sidebarCollapsed?: boolean;
    toggleFullscreen?: () => void;
    sendDataToServer?: (data: any) => Promise<boolean>;
    createWebSocketConnection?: (sessionId: number | string, tabKey: string) => WebSocket | null;
}

// 窗口大小类型
export interface WindowSize {
    cols: number;
    rows: number;
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
export type ProtocolType = 'ssh' | 'telnet' | 'rdp' | 'vnc' | 'spice';
export type TerminalMode = 'normal' | 'fullscreen';

/**
 * 终端标签信息类型
 */
export interface TabInfo {
    key: string;
    title: string;
    connectionId: number;
    sessionId: number | string;
    connection?: any;
}

/**
 * 终端容器组件属性
 */
export interface TerminalContainersProps {
    tabs: any[];
    activeTabKey: string;
    isConnected?: boolean;
    connection?: Connection;
    createWebSocketConnection?: (sessionId: number | string, tabKey: string) => WebSocket | null;
}

/**
 * 终端标签页组件属性 - 从组件外部导入的类型
 */
export interface TerminalTabsComponentProps {
    tabs: TerminalTab[];
    activeTabKey: string;
    onTabChange: (key: string) => void;
    onTabClose: (key: string) => void;
    onTabRefresh?: (key: string) => void;
    onTabDuplicate?: (key: string) => void;
    onTabEdit?: (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => void;
    networkLatency?: number | null;
}

/**
 * SimpleTerminal组件属性
 */
export interface SimpleTerminalProps {
    connectionId: number;
    sessionId: string | number;
    webSocketRef: RefObject<WebSocket | null>;
    visible?: boolean;
}

/**
 * GraphicalTerminal组件属性
 */
export interface GraphicalTerminalProps {
    connectionId: number;
    sessionId: string | number;
    webSocketRef: RefObject<WebSocket | null>;
    protocol: string;
    onResize?: (width: number, height: number) => void;
    visible?: boolean;
}

/**
 * RdpTerminal组件属性
 */
export interface RdpTerminalProps {
    connectionId: number;
    sessionId: string | number;
    webSocketRef: RefObject<WebSocket | null>;
    visible?: boolean;
    onResize?: (width: number, height: number) => void;
    onInput?: (data: string) => void;
}
// 针对终端组件的类型声明
import React from 'react';

// 定义 TerminalConnected 的 Props 接口
export interface TerminalConnectedProps { }

// 定义 TerminalNotConnected 的 Props 接口
export interface TerminalNotConnectedProps { }

// 定义 TerminalConnectionWrapper 的 Props 接口
export interface TerminalConnectionWrapperProps {
    connectionParams?: {
        connectionId?: number;
        sessionId?: number;
    };
    children: (props: {
        hasConnection: boolean;
        tabsCount: number;
        activeTabKey: string;
        isConnected: boolean;
        tabs?: any[];
        connection?: any;
        fullscreen?: boolean;
        terminalSize?: any;
        networkLatency?: number;
        terminalMode?: string;
        sidebarCollapsed?: boolean;
        toggleFullscreen?: () => void;
        sendDataToServer?: (data: string) => void;
    }) => React.ReactNode;
} 
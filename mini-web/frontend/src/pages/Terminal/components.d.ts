// 为 Terminal 组件目录下的组件提供类型声明
import React from 'react';
import { TerminalConnectedProps, TerminalNotConnectedProps, TerminalConnectionWrapperProps } from './Terminal.d';

// 声明组件模块，使 TypeScript 能够正确识别
declare module './components/TerminalConnected' {
    const TerminalConnected: React.FC<TerminalConnectedProps>;
    export default TerminalConnected;
}

declare module './components/TerminalNotConnected' {
    const TerminalNotConnected: React.FC<TerminalNotConnectedProps>;
    export default TerminalNotConnected;
}

declare module './components/TerminalConnectionWrapper' {
    const TerminalConnectionWrapper: React.FC<TerminalConnectionWrapperProps>;
    export default TerminalConnectionWrapper;
} 
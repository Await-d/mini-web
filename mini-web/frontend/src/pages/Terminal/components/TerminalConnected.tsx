import React from 'react';

interface TerminalConnectedProps { }

const TerminalConnected: React.FC<TerminalConnectedProps> = () => {
    return (
        <div className="terminal-connected-container">
            <div className="terminal-connected-content">
                {/* 终端内容将在这里渲染 */}
            </div>
        </div>
    );
};

export default TerminalConnected; 
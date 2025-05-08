import React from 'react';
import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';

interface TerminalNotConnectedProps { }

const TerminalNotConnected: React.FC<TerminalNotConnectedProps> = () => {
    const navigate = useNavigate();

    return (
        <div className="terminal-not-connected">
            <div className="terminal-not-connected-content">
                <h2>终端未连接</h2>
                <p>请选择一个现有连接或创建新连接</p>
                <div className="terminal-not-connected-actions">
                    <Button
                        type="primary"
                        onClick={() => navigate('/connections')}
                    >
                        连接列表
                    </Button>
                    <Button
                        onClick={() => navigate('/connections/new')}
                    >
                        创建新连接
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default TerminalNotConnected; 
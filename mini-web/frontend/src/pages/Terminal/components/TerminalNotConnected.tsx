import React from 'react';
import { Button, Empty } from 'antd';
import { useNavigate } from 'react-router-dom';
import { LinkOutlined, PlusOutlined } from '@ant-design/icons';

interface TerminalNotConnectedProps { }

const TerminalNotConnected: React.FC<TerminalNotConnectedProps> = () => {
    const navigate = useNavigate();

    return (
        <div className="terminal-not-connected">
            <div className="terminal-not-connected-content">
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    imageStyle={{ opacity: 0.5, filter: 'brightness(200%)' }}
                    description={
                        <span style={{ color: '#e6e6e6', fontSize: '16px' }}>
                            请选择或创建一个连接
                        </span>
                    }
                />
                <div className="terminal-not-connected-actions">
                    <Button
                        type="primary"
                        icon={<LinkOutlined />}
                        onClick={() => navigate('/connections')}
                    >
                        连接列表
                    </Button>
                    <Button
                        icon={<PlusOutlined />}
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
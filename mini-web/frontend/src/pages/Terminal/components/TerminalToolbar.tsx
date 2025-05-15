import React from 'react';
import { Button, Tooltip, Space, Dropdown, Typography } from 'antd';
import {
    CopyOutlined,
    ClearOutlined,
    SettingOutlined,
    FullscreenOutlined,
    FontSizeOutlined,
    BgColorsOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

// 终端连接状态类型
type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface TerminalToolbarProps {
    title?: string;
    onCopy: () => void;
    onClear: () => void;
    onFullscreen: () => void;
    onFontSizeChange: (size: number) => void;
    connected: boolean;
    connectionStatus?: ConnectionStatus;
    networkLatency?: number | null;
}

const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
    title,
    onCopy,
    onClear,
    onFullscreen,
    onFontSizeChange,
    connected,
    connectionStatus,
    networkLatency
}) => {
    // 字体大小选项
    const fontSizeItems: MenuProps['items'] = [
        { key: '12', label: '12px' },
        { key: '14', label: '14px' },
        { key: '16', label: '16px' },
        { key: '18', label: '18px' },
        { key: '20', label: '20px' }
    ];

    // 处理字体大小选择
    const handleFontSizeSelect: MenuProps['onClick'] = ({ key }) => {
        onFontSizeChange(parseInt(key));
    };

    return (
        <div className="terminal-toolbar" style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            zIndex: 50,
            display: 'flex',
            gap: '8px'
        }}>
            {title && (
                <div className="terminal-title" style={{
                    color: '#fff',
                    background: 'rgba(0,0,0,0.5)',
                    padding: '0 8px',
                    borderRadius: '4px',
                    lineHeight: '32px',
                    marginRight: '8px'
                }}>
                    {title}
                    {networkLatency && (
                        <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.8 }}>
                            {networkLatency}ms
                        </span>
                    )}
                </div>
            )}

            <Space>
                <Tooltip title="复制终端内容">
                    <Button
                        icon={<CopyOutlined />}
                        onClick={onCopy}
                        type="text"
                        className="terminal-toolbar-btn"
                        style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', border: 'none' }}
                    >
                        复制内容
                    </Button>
                </Tooltip>

                <Tooltip title="清空终端">
                    <Button
                        icon={<ClearOutlined />}
                        onClick={onClear}
                        type="text"
                        className="terminal-toolbar-btn"
                        style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', border: 'none' }}
                    >
                        清屏
                    </Button>
                </Tooltip>

                <Tooltip title="字体大小">
                    <Dropdown
                        menu={{ items: fontSizeItems, onClick: handleFontSizeSelect }}
                        placement="topLeft"
                    >
                        <Button
                            icon={<FontSizeOutlined />}
                            type="text"
                            className="terminal-toolbar-btn"
                            style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', border: 'none' }}
                        />
                    </Dropdown>
                </Tooltip>

                <Tooltip title="全屏">
                    <Button
                        icon={<FullscreenOutlined />}
                        onClick={onFullscreen}
                        type="text"
                        className="terminal-toolbar-btn"
                        style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', border: 'none' }}
                    />
                </Tooltip>
            </Space>
        </div>
    );
};

export default TerminalToolbar; 
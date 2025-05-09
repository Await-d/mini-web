import React from 'react';
import { Button, Tooltip, Space, Dropdown } from 'antd';
import {
    CopyOutlined,
    ClearOutlined,
    SettingOutlined,
    FullscreenOutlined,
    FontSizeOutlined,
    BgColorsOutlined,
    ReloadOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

interface TerminalToolbarProps {
    onCopy: () => void;
    onClear: () => void;
    onFullscreen: () => void;
    onReconnect: () => void;
    onFontSizeChange: (size: number) => void;
    connected: boolean;
}

const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
    onCopy,
    onClear,
    onFullscreen,
    onReconnect,
    onFontSizeChange,
    connected
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

                <Tooltip title="重新连接">
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={onReconnect}
                        type="text"
                        className="terminal-toolbar-btn"
                        style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', border: 'none' }}
                        disabled={!connected}
                    >
                        重连
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
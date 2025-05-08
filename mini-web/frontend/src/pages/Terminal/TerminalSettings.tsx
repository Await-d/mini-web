import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Switch, Button, Tabs, Select, Divider, ColorPicker, Space, message } from 'antd';
import type { Color } from 'antd/es/color-picker';

const { Option } = Select;

// 终端设置接口
export interface TerminalSettingsProps {
    visible: boolean;
    onClose: () => void;
    onApply: (settings: TerminalSettings) => void;
}

// 终端设置数据接口
export interface TerminalSettings {
    fontSize: number;
    fontFamily: string;
    background: string;
    foreground: string;
    cursorBlink: boolean;
    scrollback: number;
    backendUrl?: string;
    backendPort?: number;
    wsTestEnabled?: boolean; // 是否启用WebSocket测试模式
}

// 默认设置
const defaultSettings: TerminalSettings = {
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    background: '#1e1e1e',
    foreground: '#f0f0f0',
    cursorBlink: true,
    scrollback: 3000,
    backendUrl: window.location.hostname,
    backendPort: 8081,  // 尝试使用8081端口
    wsTestEnabled: false
};

// 字体选项
const fontFamilyOptions = [
    'Menlo, Monaco, "Courier New", monospace',
    'Consolas, "Liberation Mono", monospace',
    '"Courier New", Courier, monospace',
    '"Source Code Pro", monospace',
    'monospace',
];

const TerminalSettings: React.FC<TerminalSettingsProps> = ({ visible, onClose, onApply }) => {
    const [form] = Form.useForm();
    const [currentSettings, setCurrentSettings] = useState<TerminalSettings>({ ...defaultSettings });

    // 加载已保存的设置
    useEffect(() => {
        const savedSettings = localStorage.getItem('terminal_settings');
        if (savedSettings) {
            try {
                const parsedSettings = JSON.parse(savedSettings);
                setCurrentSettings({ ...defaultSettings, ...parsedSettings });
                form.setFieldsValue({ ...defaultSettings, ...parsedSettings });
            } catch (e) {
                console.error('读取保存的设置失败:', e);
            }
        }
    }, [form]);

    // 处理设置应用
    const handleApply = () => {
        form.validateFields().then(values => {
            const newSettings: TerminalSettings = {
                ...currentSettings,
                ...values,
            };

            // 保存设置到localStorage
            localStorage.setItem('terminal_settings', JSON.stringify(newSettings));

            setCurrentSettings(newSettings);
            onApply(newSettings);
            onClose();
        });
    };

    // 重置为默认设置
    const handleReset = () => {
        form.setFieldsValue(defaultSettings);
        setCurrentSettings({ ...defaultSettings });
    };

    // 定义Tabs的items
    const tabItems = [
        {
            key: 'appearance',
            label: '外观',
            children: (
                <>
                    <Form.Item label="字体大小" name="fontSize">
                        <InputNumber min={10} max={30} />
                    </Form.Item>

                    <Form.Item label="字体" name="fontFamily">
                        <Select>
                            {fontFamilyOptions.map((font, index) => (
                                <Option key={index} value={font}>
                                    <span style={{ fontFamily: font }}>
                                        {font.split(',')[0].replace(/"/g, '')}
                                    </span>
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Divider orientation="left">颜色</Divider>

                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Form.Item label="背景色" name="background">
                            <ColorPicker showText />
                        </Form.Item>

                        <Form.Item label="前景色" name="foreground">
                            <ColorPicker showText />
                        </Form.Item>
                    </Space>
                </>
            )
        },
        {
            key: 'behavior',
            label: '行为',
            children: (
                <>
                    <Form.Item label="光标闪烁" name="cursorBlink" valuePropName="checked">
                        <Switch />
                    </Form.Item>

                    <Form.Item label="滚动历史行数" name="scrollback">
                        <InputNumber min={500} max={10000} step={100} />
                    </Form.Item>
                </>
            )
        },
        {
            key: 'connection',
            label: '连接设置',
            children: (
                <>
                    <Divider orientation="left">后端服务设置</Divider>
                    <p style={{ marginBottom: 16, color: '#666' }}>
                        如果后端服务不在同一域名或默认端口下，可以在这里配置
                    </p>

                    <Form.Item label="后端服务地址" name="backendUrl">
                        <Input placeholder="例如：localhost 或 api.example.com" />
                    </Form.Item>

                    <Form.Item label="后端服务端口" name="backendPort">
                        <InputNumber min={1} max={65535} placeholder="例如：8080" />
                    </Form.Item>

                    <Form.Item label="启用WebSocket测试模式" name="wsTestEnabled" valuePropName="checked">
                        <Switch />
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            onClick={async () => {
                                const values = form.getFieldsValue();
                                const backendUrl = values.backendUrl || window.location.hostname;
                                const backendPort = values.backendPort || 8081;

                                // 定义测试URL
                                const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

                                // 测试不同的路径
                                const paths = [
                                    '/api/ws/ping',
                                    '/ws/ping',
                                    '/api/health',
                                    '/health'
                                ];

                                // 显示测试信息
                                message.loading('正在测试WebSocket连接...', 0);

                                let success = false;

                                for (const path of paths) {
                                    const testUrl = `${wsProtocol}//${backendUrl}:${backendPort}${path}`;
                                    try {
                                        const ws = new WebSocket(testUrl);

                                        // 等待连接结果
                                        await new Promise<void>((resolve) => {
                                            const timeout = setTimeout(() => {
                                                ws.close();
                                                resolve();
                                            }, 3000);

                                            ws.onopen = () => {
                                                success = true;
                                                clearTimeout(timeout);
                                                ws.close();
                                                resolve();
                                            };

                                            ws.onerror = () => {
                                                clearTimeout(timeout);
                                                resolve();
                                            };
                                        });

                                        if (success) {
                                            message.destroy();
                                            message.success(`连接成功！${testUrl} 可用`);
                                            break;
                                        }
                                    } catch (error) {
                                        console.error('WebSocket测试失败:', error);
                                    }
                                }

                                if (!success) {
                                    message.destroy();
                                    message.error('WebSocket连接测试失败，请检查后端服务是否正常运行');
                                }
                            }}
                        >
                            测试WebSocket连接
                        </Button>
                    </Form.Item>

                    <Divider orientation="left">连接状态</Divider>
                    <p style={{ marginBottom: 16 }}>
                        <b>注意：</b> WebSocket连接失败可能有以下原因：
                    </p>
                    <ul style={{ marginBottom: 16 }}>
                        <li>后端服务未启动</li>
                        <li>WebSocket端点不可用</li>
                        <li>浏览器安全限制（跨域问题）</li>
                        <li>会话ID无效或已过期</li>
                        <li>协议处理程序未完全实现</li>
                    </ul>
                    <p>
                        在开发阶段，后端可能使用了模拟实现而非真实远程连接。
                    </p>
                </>
            )
        }
    ];

    return (
        <Modal
            title="终端设置"
            open={visible}
            onCancel={onClose}
            width={600}
            footer={[
                <Button key="reset" onClick={handleReset}>
                    重置默认
                </Button>,
                <Button key="cancel" onClick={onClose}>
                    取消
                </Button>,
                <Button key="apply" type="primary" onClick={handleApply}>
                    应用
                </Button>,
            ]}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={currentSettings}
            >
                <Tabs defaultActiveKey="appearance" items={tabItems} />
            </Form>
        </Modal>
    );
};

export default TerminalSettings;
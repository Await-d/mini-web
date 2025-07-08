import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Switch, Button, Tabs, Select, Divider, ColorPicker, Space, message } from 'antd';
import type { Color } from 'antd/es/color-picker';

const { Option } = Select;

// 终端设置接口
export interface TerminalSettingsProps {
    visible?: boolean;
    onCancel?: () => void;
    onApply?: (settings: TerminalSettings) => void;
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
    backendPort: 8080,  // 使用8080端口，与后端服务配置一致，不要修改
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

const TerminalSettings: React.FC<TerminalSettingsProps> = ({
    visible = false,
    onCancel,
    onApply
}) => {
    const [form] = Form.useForm();
    const [currentSettings, setCurrentSettings] = useState<TerminalSettings>({ ...defaultSettings });

    // 加载设置函数 - 将其提取为单独函数以提高可读性
    const loadSettings = () => {
        const savedSettings = localStorage.getItem('terminal_settings');
        if (savedSettings) {
            try {
                const parsedSettings = JSON.parse(savedSettings);
                // 强制使用8080端口，不管localStorage里存的是什么
                const mergedSettings = {
                    ...defaultSettings,
                    ...parsedSettings,
                    backendPort: 8080  // 强制使用8080端口
                };

                // 处理颜色值，确保为字符串格式
                const formattedSettings = {
                    ...mergedSettings,
                    background: typeof mergedSettings.background === 'object' ?
                        mergedSettings.background.toHexString() : mergedSettings.background,
                    foreground: typeof mergedSettings.foreground === 'object' ?
                        mergedSettings.foreground.toHexString() : mergedSettings.foreground
                };

                setCurrentSettings(formattedSettings);
                return formattedSettings;
            } catch (e) {
                console.error('读取保存的设置失败:', e);
            }
        }

        // 返回默认设置
        return { ...defaultSettings };
    };

    // 当弹窗可见性变化时，加载设置
    useEffect(() => {
        if (visible) {
            // 加载设置
            const settings = loadSettings();

            // 设置表单值
            form.setFieldsValue(settings);
        }
    }, [visible, form]);

    // 处理设置应用
    const handleApply = () => {
        // 手动获取表单值而不是使用validateFields，避免表单验证问题
        const values = form.getFieldsValue();

        // 处理可能的空值，使用默认值
        const processedValues = {
            fontSize: values.fontSize || defaultSettings.fontSize,
            fontFamily: values.fontFamily || defaultSettings.fontFamily,
            scrollback: values.scrollback || defaultSettings.scrollback,
            cursorBlink: typeof values.cursorBlink === 'boolean' ? values.cursorBlink : defaultSettings.cursorBlink,
            backendUrl: values.backendUrl || defaultSettings.backendUrl,
            backendPort: values.backendPort || defaultSettings.backendPort,
            wsTestEnabled: typeof values.wsTestEnabled === 'boolean' ? values.wsTestEnabled : defaultSettings.wsTestEnabled,
        };

        // 转换ColorPicker的值为十六进制字符串
        const formattedValues = {
            ...processedValues,
            background: values.background ?
                (typeof values.background === 'object' ? values.background.toHexString() : values.background)
                : defaultSettings.background,
            foreground: values.foreground ?
                (typeof values.foreground === 'object' ? values.foreground.toHexString() : values.foreground)
                : defaultSettings.foreground
        };

        const newSettings: TerminalSettings = {
            ...currentSettings,
            ...formattedValues,
        };

        // 确保值的类型正确
        if (typeof newSettings.backendPort === 'string') {
            newSettings.backendPort = parseInt(newSettings.backendPort, 10);
        }

        // 强制使用8080端口，确保WebSocket连接成功
        newSettings.backendPort = 8080;

        // 保存设置到localStorage
        localStorage.setItem('terminal_settings', JSON.stringify(newSettings));

        // 应用新终端设置
        setCurrentSettings(newSettings);
        if (onApply) {
            onApply(newSettings);
        }
        if (onCancel) {
            onCancel();
        }
    };

    // 重置为默认设置
    const handleReset = () => {
        // 使用setTimeout确保在下一个事件循环中设置表单值
        setTimeout(() => {
            if (form) {
                form.setFieldsValue({ ...defaultSettings });
                // 重置表单为默认设置
            }
        }, 0);
        setCurrentSettings({ ...defaultSettings });
        if (onApply) {
            onApply(defaultSettings);
        }
        if (onCancel) {
            onCancel();
        }
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
                        <InputNumber min={1} max={65535} placeholder="例如：8080" disabled />
                        <div style={{ marginTop: 4, color: '#666' }}>端口固定为8080，不可修改</div>
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
                                const backendPort = values.backendPort || 8080; // 默认使用8080端口

                                // 定义测试URL
                                const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

                                // 测试不同的路径
                                const paths = [
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
                                        // 不再记录测试失败的详细错误
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

    // 仅在对话框可见时才渲染内容，减少不必要的渲染
    const renderContent = () => {
        if (!visible) {
            return null;
        }

        return (
            <Form
                form={form}
                layout="vertical"
                name="terminalSettingsForm"
                preserve={false}
            >
                <Tabs defaultActiveKey="appearance" items={tabItems} />
            </Form>
        );
    };

    return (
        <Modal
            title="终端设置"
            open={visible}
            onCancel={onCancel}
            width={600}
            destroyOnHidden={true}
            footer={[
                <Button key="reset" onClick={handleReset}>
                    重置默认
                </Button>,
                <Button key="cancel" onClick={onCancel}>
                    取消
                </Button>,
                <Button key="apply" type="primary" onClick={handleApply}>
                    应用
                </Button>,
            ]}
        >
            {renderContent()}
        </Modal>
    );
};

export default TerminalSettings;
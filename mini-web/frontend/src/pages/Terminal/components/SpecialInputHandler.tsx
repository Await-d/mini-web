import React, { useState, useEffect } from 'react';
import { Modal, Input, Button, Radio, Space, Alert } from 'antd';
import { EyeInvisibleOutlined, EyeTwoTone, CheckOutlined, CloseOutlined } from '@ant-design/icons';

// 特殊命令类型
export type SpecialCommandType =
    | 'password'
    | 'sudo'
    | 'confirm'
    | 'editor'
    | 'progress'
    | 'install'
    | 'login'
    | 'menu'
    | 'normal';

// 特殊命令信息接口
export interface SpecialCommandInfo {
    type: SpecialCommandType;
    prompt: string;
    masked: boolean;
    expectInput: boolean;
    timeout: number;
    options?: string[];
    description: string;
}

interface SpecialInputHandlerProps {
    specialInfo: SpecialCommandInfo | null;
    onResponse: (response: string) => void;
    onCancel: () => void;
    visible: boolean;
}

const SpecialInputHandler: React.FC<SpecialInputHandlerProps> = ({
    specialInfo,
    onResponse,
    onCancel,
    visible
}) => {
    const [inputValue, setInputValue] = useState('');
    const [selectedOption, setSelectedOption] = useState<string>('');
    const [countdown, setCountdown] = useState<number>(0);

    // 重置状态
    useEffect(() => {
        if (visible && specialInfo) {
            setInputValue('');
            setSelectedOption('');
            setCountdown(specialInfo.timeout || 0);

            // 对于确认操作，预选择默认选项
            if (specialInfo.type === 'confirm' && specialInfo.options && specialInfo.options.length > 0) {
                // 默认选择第二个选项（通常是"no"或"n"）
                setSelectedOption(specialInfo.options[1] || specialInfo.options[0]);
            }
        }
    }, [visible, specialInfo]);

    // 倒计时
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (visible && countdown > 0) {
            timer = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
        } else if (visible && countdown === 0 && specialInfo?.timeout && specialInfo.timeout > 0) {
            // 超时自动取消
            onCancel();
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [visible, countdown, specialInfo?.timeout, onCancel]);

    // 处理输入确认
    const handleConfirm = () => {
        if (specialInfo?.type === 'confirm' || specialInfo?.type === 'menu') {
            onResponse(selectedOption);
        } else {
            onResponse(inputValue);
        }
    };

    // 处理取消
    const handleCancel = () => {
        if (specialInfo?.type === 'password' || specialInfo?.type === 'sudo' || specialInfo?.type === 'login') {
            // 对于密码输入，发送 Ctrl+C
            onResponse('\x03');
        } else {
            onCancel();
        }
    };

    // 获取模态框标题
    const getModalTitle = () => {
        if (!specialInfo) return '';

        switch (specialInfo.type) {
            case 'password':
                return '密码输入';
            case 'sudo':
                return 'sudo 认证';
            case 'login':
                return '登录认证';
            case 'confirm':
                return '确认操作';
            case 'menu':
                return '菜单选择';
            case 'editor':
                return '编辑器模式';
            default:
                return '特殊输入';
        }
    };

    // 获取提示信息类型
    const getAlertType = () => {
        if (!specialInfo) return 'info';

        switch (specialInfo.type) {
            case 'password':
            case 'sudo':
            case 'login':
                return 'warning' as const;
            case 'confirm':
                return 'info' as const;
            case 'menu':
                return 'info' as const;
            default:
                return 'info' as const;
        }
    };

    // 渲染输入组件
    const renderInput = () => {
        if (!specialInfo) return null;

        if (specialInfo.type === 'confirm') {
            return (
                <Radio.Group
                    value={selectedOption}
                    onChange={(e) => setSelectedOption(e.target.value)}
                    size="large"
                >
                    <Space direction="vertical">
                        {specialInfo.options?.map((option) => (
                            <Radio key={option} value={option}>
                                {option === 'y' || option === 'yes' ? '是 (Yes)' :
                                    option === 'n' || option === 'no' ? '否 (No)' : option}
                            </Radio>
                        ))}
                    </Space>
                </Radio.Group>
            );
        }

        if (specialInfo.type === 'menu') {
            return (
                <Radio.Group
                    value={selectedOption}
                    onChange={(e) => setSelectedOption(e.target.value)}
                    size="large"
                >
                    <Space direction="vertical">
                        {specialInfo.options?.map((option) => (
                            <Radio key={option} value={option}>
                                选项 {option}
                            </Radio>
                        ))}
                    </Space>
                </Radio.Group>
            );
        }

        // 密码输入或普通输入
        if (specialInfo.masked) {
            return (
                <Input.Password
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onPressEnter={handleConfirm}
                    placeholder="请输入密码"
                    size="large"
                    autoFocus
                    iconRender={(visible: boolean) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                />
            );
        }

        return (
            <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onPressEnter={handleConfirm}
                placeholder="请输入内容"
                size="large"
                autoFocus
            />
        );
    };

    // 渲染操作按钮
    const renderButtons = () => {
        const isConfirmDisabled = () => {
            if (specialInfo?.type === 'confirm' || specialInfo?.type === 'menu') {
                return !selectedOption;
            }
            return !inputValue.trim();
        };

        return (
            <Space>
                <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={handleConfirm}
                    disabled={isConfirmDisabled()}
                    size="large"
                >
                    确认
                </Button>
                <Button
                    icon={<CloseOutlined />}
                    onClick={handleCancel}
                    size="large"
                >
                    {specialInfo?.type === 'password' || specialInfo?.type === 'sudo' || specialInfo?.type === 'login'
                        ? '取消 (Ctrl+C)'
                        : '取消'}
                </Button>
            </Space>
        );
    };

    if (!specialInfo || !visible) {
        return null;
    }

    return (
        <Modal
            title={getModalTitle()}
            open={visible}
            onCancel={handleCancel}
            footer={renderButtons()}
            width={500}
            centered
            maskClosable={false}
            keyboard={false}
            closable={false}
        >
            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {/* 提示信息 */}
                <Alert
                    message={specialInfo.description}
                    description={
                        <div>
                            <div>{specialInfo.prompt}</div>
                            {countdown > 0 && (
                                <div style={{ marginTop: 8, color: '#ff4d4f' }}>
                                    {countdown} 秒后超时
                                </div>
                            )}
                        </div>
                    }
                    type={getAlertType()}
                    showIcon
                />

                {/* 输入组件 */}
                {renderInput()}

                {/* 安全提示 */}
                {(specialInfo.type === 'password' || specialInfo.type === 'sudo' || specialInfo.type === 'login') && (
                    <Alert
                        message="安全提示"
                        description="您的密码将通过加密连接传输，不会被明文存储。"
                        type="info"
                        showIcon
                        style={{ fontSize: '12px' }}
                    />
                )}
            </Space>
        </Modal>
    );
};

export default SpecialInputHandler; 
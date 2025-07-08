import { useState, useCallback, useEffect } from 'react';
import type { SpecialCommandInfo } from '../components/SpecialInputHandler';

interface UseSpecialCommandHandlerProps {
    sendDataToServer?: (data: string) => Promise<boolean>;
}

export const useSpecialCommandHandler = ({ sendDataToServer }: UseSpecialCommandHandlerProps = {}) => {
    const [specialCommand, setSpecialCommand] = useState<SpecialCommandInfo | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);

    // 处理特殊命令响应
    const handleSpecialResponse = useCallback(async (response: string) => {
        if (sendDataToServer) {
            try {
                // 为响应添加换行符
                const formattedResponse = response.endsWith('\n') ? response : response + '\n';
                await sendDataToServer(formattedResponse);
                console.log('特殊命令响应已发送:', response);
            } catch (error) {
                console.error('发送特殊命令响应失败:', error);
            }
        }

        // 关闭模态框
        setIsModalVisible(false);
        setSpecialCommand(null);
    }, [sendDataToServer]);

    // 取消特殊命令
    const handleSpecialCancel = useCallback(() => {
        setIsModalVisible(false);
        setSpecialCommand(null);
    }, []);

    // 处理来自后端的特殊命令数据
    const processSpecialCommand = useCallback((specialData: any) => {
        if (!specialData || specialData.type === 'normal') {
            // 如果是普通命令或没有特殊数据，关闭模态框
            if (isModalVisible) {
                setIsModalVisible(false);
                setSpecialCommand(null);
            }
            return;
        }

        // 创建特殊命令信息
        const commandInfo: SpecialCommandInfo = {
            type: specialData.type || 'normal',
            prompt: specialData.prompt || '',
            masked: specialData.masked || false,
            expectInput: specialData.expectInput || false,
            timeout: specialData.timeout || 0,
            options: specialData.options || [],
            description: specialData.description || '特殊操作'
        };

        console.log('检测到特殊命令:', commandInfo);

        // 只有期待输入的特殊命令才显示模态框
        if (commandInfo.expectInput) {
            setSpecialCommand(commandInfo);
            setIsModalVisible(true);
        } else {
            // 对于不期待输入的特殊命令（如进度显示），可以在这里处理UI更新
            console.log('非输入型特殊命令:', commandInfo.type, '-', commandInfo.description);
        }
    }, [isModalVisible]);

    // 监听键盘快捷键
    useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
            // ESC键取消特殊命令
            if (event.key === 'Escape' && isModalVisible) {
                handleSpecialCancel();
            }
        };

        if (isModalVisible) {
            document.addEventListener('keydown', handleKeyPress);
            return () => {
                document.removeEventListener('keydown', handleKeyPress);
            };
        }
    }, [isModalVisible, handleSpecialCancel]);

    return {
        // 状态
        specialCommand,
        isModalVisible,

        // 处理函数
        handleSpecialResponse,
        handleSpecialCancel,
        processSpecialCommand,

        // 设置函数（用于调试或手动触发）
        setSpecialCommand,
        setIsModalVisible
    };
};

export default useSpecialCommandHandler; 
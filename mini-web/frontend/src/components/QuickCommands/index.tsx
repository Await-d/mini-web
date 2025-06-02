import React, { useState, useEffect } from 'react';
import { Modal, Input, List, Button, Tooltip } from 'antd';
import { SendOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import './style.css';

export interface QuickCommandsProps {
  visible?: boolean;
  onClose?: () => void;
  onSendCommand?: (command: string) => void;
  onSendCommandWithDelay?: (command: string, delay: number) => void;
  passwordMode?: boolean;
}

const QuickCommands: React.FC<QuickCommandsProps> = ({
  visible = false,
  onClose,
  onSendCommand,
  onSendCommandWithDelay,
  passwordMode = false
}) => {
  const [commands, setCommands] = useState<string[]>([]);
  const [newCommand, setNewCommand] = useState('');
  const [editIndex, setEditIndex] = useState<number | null>(null);

  // 加载保存的命令
  useEffect(() => {
    const savedCommands = localStorage.getItem('quickCommands');
    if (savedCommands) {
      try {
        setCommands(JSON.parse(savedCommands));
      } catch (e) {
        console.error('Failed to parse saved commands', e);
      }
    }
  }, []);

  // 保存命令到localStorage
  const saveCommands = (cmds: string[]) => {
    localStorage.setItem('quickCommands', JSON.stringify(cmds));
    setCommands(cmds);
  };

  // 添加新命令
  const handleAddCommand = () => {
    if (!newCommand.trim()) return;

    if (editIndex !== null) {
      // 编辑现有命令
      const updatedCommands = [...commands];
      updatedCommands[editIndex] = newCommand;
      saveCommands(updatedCommands);
      setEditIndex(null);
    } else {
      // 添加新命令
      saveCommands([...commands, newCommand]);
    }
    setNewCommand('');
  };

  // 删除命令
  const handleDeleteCommand = (index: number) => {
    const updatedCommands = commands.filter((_, i) => i !== index);
    saveCommands(updatedCommands);

    if (editIndex === index) {
      setEditIndex(null);
      setNewCommand('');
    }
  };

  // 编辑命令
  const handleEditCommand = (index: number) => {
    setNewCommand(commands[index]);
    setEditIndex(index);
  };

  // 检查是否是密码相关命令
  const isPasswordCommand = (command: string) => {
    const passwordCommands = [
      'sudo',
      'su -',
      'su root',
      'passwd',
      'ssh',
      'mysql -p',
      'psql'
    ];
    const lowerCommand = command.toLowerCase().trim();
    return passwordCommands.some(cmd => lowerCommand.startsWith(cmd));
  };

  // 发送命令
  const handleSendCommand = (command: string) => {
    // 清理命令前后的空格
    const cleanCommand = command.trim();
    console.log('QuickCommands发送命令:', `"${command}"` + ' -> ' + `"${cleanCommand}"`);

    // 如果当前在密码模式下，直接发送，可能需要延迟
    if (passwordMode && onSendCommandWithDelay) {
      console.log('密码模式下发送命令，使用延迟发送');
      onSendCommandWithDelay(cleanCommand, 200); // 200ms延迟
    } else if (isPasswordCommand(cleanCommand) && onSendCommandWithDelay) {
      // 如果是可能触发密码提示的命令，正常发送（不延迟）
      console.log('检测到密码相关命令，正常发送');
      if (onSendCommand) {
        onSendCommand(cleanCommand);
      }
    } else if (onSendCommand) {
      // 普通命令，正常发送
      onSendCommand(cleanCommand);
    }
  };

  return (
    <Modal
      title="快速命令"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <div className="quick-commands-container">
        <div className="add-command-form">
          <Input
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            onPressEnter={handleAddCommand}
            placeholder="输入命令"
            addonAfter={
              <Button
                type="primary"
                size="small"
                onClick={handleAddCommand}
              >
                {editIndex !== null ? '更新' : '添加'}
              </Button>
            }
          />
        </div>

        <List
          className="commands-list"
          bordered
          dataSource={commands}
          renderItem={(command, index) => (
            <List.Item
              actions={[
                <Tooltip title="发送命令">
                  <Button
                    icon={<SendOutlined />}
                    onClick={() => handleSendCommand(command)}
                    type="primary"
                    size="small"
                  />
                </Tooltip>,
                <Tooltip title="编辑命令">
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => handleEditCommand(index)}
                    size="small"
                  />
                </Tooltip>,
                <Tooltip title="删除命令">
                  <Button
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteCommand(index)}
                    danger
                    size="small"
                  />
                </Tooltip>
              ]}
            >
              <div className="command-item">
                <code>{command}</code>
              </div>
            </List.Item>
          )}
        />
      </div>
    </Modal>
  );
};

export default QuickCommands;
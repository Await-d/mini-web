import React, { useState, useEffect } from 'react';
import { Modal, Input, List, Button, Tooltip } from 'antd';
import { SendOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import './style.css';

export interface QuickCommandsProps {
  visible?: boolean;
  onClose?: () => void;
  onSendCommand?: (command: string) => void;
}

const QuickCommands: React.FC<QuickCommandsProps> = ({
  visible = false,
  onClose,
  onSendCommand
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

  // 发送命令
  const handleSendCommand = (command: string) => {
    if (onSendCommand) {
      onSendCommand(command);
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
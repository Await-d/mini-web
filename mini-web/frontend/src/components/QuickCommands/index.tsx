import React, { useState, useEffect } from 'react';
import { Button, Input, Space, Tooltip, Drawer, Form, message } from 'antd';
import { 
  SendOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  SaveOutlined,
  CloseOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import styles from './styles.module.css';

interface QuickCommand {
  id: string;
  name: string;
  command: string;
  shortcut?: string;
}

interface QuickCommandsProps {
  onSendCommand: (command: string) => void;
  protocol: 'ssh' | 'telnet' | 'rdp' | 'vnc';
}

const QuickCommands: React.FC<QuickCommandsProps> = ({ onSendCommand, protocol }) => {
  const [commands, setCommands] = useState<QuickCommand[]>([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingCommand, setEditingCommand] = useState<QuickCommand | null>(null);
  const [form] = Form.useForm();

  // 只对SSH和Telnet协议显示快捷命令
  const showCommands = protocol === 'ssh' || protocol === 'telnet';
  console.log("QuickCommands协议检查:", protocol, "显示状态:", showCommands);

  // 加载保存的命令
  useEffect(() => {
    const savedCommands = localStorage.getItem('quick_commands');
    if (savedCommands) {
      try {
        setCommands(JSON.parse(savedCommands));
      } catch (err) {
        console.error('解析保存的命令失败:', err);
      }
    } else {
      // 默认命令
      const defaultCommands: QuickCommand[] = [
        { id: '1', name: '检查磁盘空间', command: 'df -h' },
        { id: '2', name: '内存使用情况', command: 'free -m' },
        { id: '3', name: '系统负载', command: 'uptime' },
        { id: '4', name: '进程列表', command: 'ps aux | head -10' },
      ];
      setCommands(defaultCommands);
      localStorage.setItem('quick_commands', JSON.stringify(defaultCommands));
    }
  }, []);

  // 记录组件渲染到控制台，帮助调试
  useEffect(() => {
    console.log("QuickCommands组件渲染，协议:", protocol, "显示状态:", showCommands);
  }, [protocol, showCommands]);

  // 保存命令到本地存储
  const saveCommands = (updatedCommands: QuickCommand[]) => {
    localStorage.setItem('quick_commands', JSON.stringify(updatedCommands));
    setCommands(updatedCommands);
  };

  // 发送命令
  const handleSendCommand = (command: string) => {
    if (!command.trim()) return;
    
    // 添加换行符，确保命令执行
    // 使用实际的回车符和换行符，而不是字符串表示
    const commandWithNewline = command + '\r\n';
    onSendCommand(commandWithNewline);
    message.success(`已发送命令: ${command}`);
  };

  // 添加或更新命令
  const handleSaveCommand = (values: any) => {
    if (editingCommand) {
      // 更新命令
      const updatedCommands = commands.map(cmd => 
        cmd.id === editingCommand.id 
          ? { ...values, id: editingCommand.id } 
          : cmd
      );
      saveCommands(updatedCommands);
      message.success('命令已更新');
    } else {
      // 添加命令
      const newCommand: QuickCommand = {
        ...values,
        id: Date.now().toString(),
      };
      saveCommands([...commands, newCommand]);
      message.success('命令已添加');
    }
    
    setEditingCommand(null);
    setDrawerVisible(false);
    form.resetFields();
  };

  // 删除命令
  const handleDeleteCommand = (id: string) => {
    const updatedCommands = commands.filter(cmd => cmd.id !== id);
    saveCommands(updatedCommands);
    message.success('命令已删除');
  };

  // 编辑命令
  const handleEditCommand = (command: QuickCommand) => {
    setEditingCommand(command);
    form.setFieldsValue(command);
    setDrawerVisible(true);
  };

  if (!showCommands) {
    console.log("QuickCommands不显示，当前协议:", protocol);
    return null;
  }

  return (
    <div className={styles.quickCommands}>
      <div className={styles.commandList}>
        {commands.map(cmd => (
          <Tooltip key={cmd.id} title={cmd.command}>
            <Button 
              size="small"
              onClick={() => handleSendCommand(cmd.command)}
              className={styles.commandButton}
            >
              <ThunderboltOutlined /> {cmd.name}
              <div className={styles.commandActions}>
                <EditOutlined className={styles.editIcon} onClick={(e) => {
                  e.stopPropagation();
                  handleEditCommand(cmd);
                }} />
                <DeleteOutlined className={styles.deleteIcon} onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCommand(cmd.id);
                }} />
              </div>
            </Button>
          </Tooltip>
        ))}
        <Button 
          size="small" 
          type="default"
          icon={<PlusOutlined />} 
          onClick={() => {
            setEditingCommand(null);
            form.resetFields();
            setDrawerVisible(true);
          }}
        >
          添加
        </Button>
      </div>

      <Drawer
        title={editingCommand ? "编辑命令" : "添加命令"}
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={300}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveCommand}
        >
          <Form.Item
            name="name"
            label="命令名称"
            rules={[{ required: true, message: '请输入命令名称' }]}
          >
            <Input placeholder="检查磁盘空间" />
          </Form.Item>
          
          <Form.Item
            name="command"
            label="命令内容"
            rules={[{ required: true, message: '请输入命令内容' }]}
          >
            <Input.TextArea rows={3} placeholder="df -h" />
          </Form.Item>
          
          <Form.Item
            name="shortcut"
            label="快捷键 (可选)"
          >
            <Input placeholder="Ctrl+D" />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit"
                icon={<SaveOutlined />}
              >
                保存
              </Button>
              <Button 
                onClick={() => setDrawerVisible(false)}
                icon={<CloseOutlined />}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default QuickCommands;
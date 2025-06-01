import React, { useState, useEffect } from 'react';
import { Button, Input, Modal, Space, App } from 'antd';
import {
  SendOutlined,
  DeleteOutlined,
  PlusOutlined
} from '@ant-design/icons';
import styles from './styles.module.css';

const { TextArea } = Input;

export interface BatchCommandsProps {
  visible?: boolean;
  onClose?: () => void;
  onSendCommands?: (commands: string[]) => void;
}

const BatchCommands: React.FC<BatchCommandsProps> = ({
  visible = false,
  onClose,
  onSendCommands
}) => {
  const { message } = App.useApp();
  const [commands, setCommands] = useState<string[]>([]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandSets, setCommandSets] = useState<{ name: string, commands: string[] }[]>([]);
  const [currentSet, setCurrentSet] = useState<number | null>(null);

  // 加载保存的命令集
  useEffect(() => {
    const savedSets = localStorage.getItem('batchCommandSets');
    if (savedSets) {
      try {
        setCommandSets(JSON.parse(savedSets));
      } catch (e) {
        console.error('Failed to parse saved command sets', e);
      }
    }
  }, []);

  // 保存命令集
  const saveCommandSets = (sets: { name: string, commands: string[] }[]) => {
    localStorage.setItem('batchCommandSets', JSON.stringify(sets));
    setCommandSets(sets);
  };

  // 添加命令到当前批处理
  const addCommand = () => {
    if (!currentCommand.trim()) return;
    setCommands([...commands, currentCommand]);
    setCurrentCommand('');
  };

  // 删除命令
  const removeCommand = (index: number) => {
    setCommands(commands.filter((_, i) => i !== index));
  };

  // 发送所有命令
  const sendCommands = () => {
    if (commands.length === 0) {
      message.warning('请至少添加一条命令');
      return;
    }

    if (onSendCommands) {
      onSendCommands(commands);
      onClose?.(); // 发送后关闭模态框
    }
  };

  // 保存当前命令集
  const saveCurrentSet = () => {
    if (commands.length === 0) {
      message.warning('请至少添加一条命令');
      return;
    }

    const name = prompt('请输入命令集名称', `命令集 ${commandSets.length + 1}`);
    if (!name) return;

    const newSets = [...commandSets, { name, commands: [...commands] }];
    saveCommandSets(newSets);
    message.success('命令集已保存');
  };

  // 加载命令集
  const loadCommandSet = (index: number) => {
    setCommands([...commandSets[index].commands]);
    setCurrentSet(index);
  };

  // 删除命令集
  const deleteCommandSet = (index: number) => {
    const newSets = commandSets.filter((_, i) => i !== index);
    saveCommandSets(newSets);
    if (currentSet === index) {
      setCurrentSet(null);
    }
  };

  // 确认发送批量命令
  const confirmSendCommands = () => {
    if (commands.length === 0) {
      message.warning('请至少添加一条命令');
      return;
    }

    Modal.confirm({
      title: '确认发送',
      content: (
        <div>
          <p>即将发送以下 {commands.length} 条命令:</p>
          <pre className={styles.previewCommands}>
            {commands.map((cmd, i) => `${i + 1}. ${cmd}`).join('\n')}
          </pre>
        </div>
      ),
      onOk() {
        sendCommands();
      }
    });
  };

  return (
    <Modal
      title="批量命令执行"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <div className={styles.batchCommandsContainer}>
        {/* 已保存的命令集 */}
        {commandSets.length > 0 && (
          <div className={styles.commandSets}>
            <h4>已保存的命令集</h4>
            <div className={styles.commandSetsList}>
              {commandSets.map((set, index) => (
                <div key={index} className={styles.commandSetItem}>
                  <Button
                    onClick={() => loadCommandSet(index)}
                    type={currentSet === index ? 'primary' : 'default'}
                  >
                    {set.name} ({set.commands.length}条)
                  </Button>
                  <Button
                    icon={<DeleteOutlined />}
                    danger
                    size="small"
                    onClick={() => deleteCommandSet(index)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 添加命令 */}
        <div className={styles.addCommand}>
          <TextArea
            value={currentCommand}
            onChange={(e) => setCurrentCommand(e.target.value)}
            placeholder="输入命令，按添加按钮或回车添加到列表"
            autoSize={{ minRows: 2, maxRows: 6 }}
            onPressEnter={(e) => {
              e.preventDefault();
              addCommand();
            }}
          />
          <div className={styles.commandActions}>
            <Button
              type="primary"
              onClick={addCommand}
              icon={<PlusOutlined />}
            >
              添加命令
            </Button>
          </div>
        </div>

        {/* 命令列表 */}
        <div className={styles.commandList}>
          <h4>命令列表 ({commands.length})</h4>
          {commands.length === 0 ? (
            <div className={styles.emptyList}>
              命令列表为空，请添加命令
            </div>
          ) : (
            <div className={styles.commands}>
              {commands.map((command, index) => (
                <div key={index} className={styles.commandItem}>
                  <div className={styles.commandNumber}>{index + 1}.</div>
                  <div className={styles.commandContent}>{command}</div>
                  <Button
                    icon={<DeleteOutlined />}
                    danger
                    size="small"
                    onClick={() => removeCommand(index)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className={styles.batchActions}>
          <Space>
            <Button
              type="primary"
              onClick={confirmSendCommands}
              icon={<SendOutlined />}
              disabled={commands.length === 0}
            >
              发送所有命令
            </Button>
            <Button
              onClick={saveCurrentSet}
              disabled={commands.length === 0}
            >
              保存为命令集
            </Button>
            <Button
              onClick={() => setCommands([])}
              disabled={commands.length === 0}
            >
              清空列表
            </Button>
          </Space>
        </div>
      </div>
    </Modal>
  );
};

export default BatchCommands;
import React, { useState } from 'react';
import { Button, Input, Modal, Space, Checkbox, Radio, Divider, message, Tooltip } from 'antd';
import { 
  SendOutlined, 
  BorderlessTableOutlined, 
  PauseOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import styles from './styles.module.css';

const { TextArea } = Input;

interface BatchCommandsProps {
  onSendCommand: (command: string) => void;
  protocol: 'ssh' | 'telnet' | 'rdp' | 'vnc';
}

const BatchCommands: React.FC<BatchCommandsProps> = ({ onSendCommand, protocol }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [batchCommands, setBatchCommands] = useState('');
  const [delay, setDelay] = useState(1000);
  const [waitForPrompt, setWaitForPrompt] = useState(true);
  const [confirmBeforeSend, setConfirmBeforeSend] = useState(true);
  const [executeMode, setExecuteMode] = useState('sequential');
  const [isSending, setIsSending] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // 只对SSH和Telnet协议显示
  const showBatchCommands = protocol === 'ssh' || protocol === 'telnet';
  
  if (!showBatchCommands) {
    console.log("BatchCommands组件不显示，协议:", protocol);
    return null;
  }
  
  console.log("BatchCommands组件显示，协议:", protocol);

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const handleSendBatch = () => {
    if (!batchCommands.trim()) {
      message.error('请输入命令');
      return;
    }

    // 分割命令行
    const commands = batchCommands
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // 过滤空行和注释

    if (commands.length === 0) {
      message.error('没有有效命令');
      return;
    }

    if (confirmBeforeSend) {
      Modal.confirm({
        title: '确认发送',
        content: (
          <div>
            <p>即将发送以下 {commands.length} 条命令:</p>
            <pre className={styles.previewCommands}>
              {commands.map((cmd, i) => `${i+1}. ${cmd}`).join('\n')}
            </pre>
          </div>
        ),
        onOk() {
          executeBatchCommands(commands);
        }
      });
    } else {
      executeBatchCommands(commands);
    }
  };

  const executeBatchCommands = (commands: string[]) => {
    setIsSending(true);
    setCurrentIndex(0);
    
    if (executeMode === 'bulk') {
      // 全部一次性发送
      const combinedCommand = commands.join('\n') + '\n';
      onSendCommand(combinedCommand);
      setIsSending(false);
      setIsModalVisible(false);
      message.success(`已发送 ${commands.length} 条命令`);
    } else {
      // 顺序发送
      sendNextCommand(commands, 0);
    }
  };

  const sendNextCommand = (commands: string[], index: number) => {
    if (index >= commands.length) {
      // 全部发送完成
      setIsSending(false);
      setIsModalVisible(false);
      message.success(`已发送全部 ${commands.length} 条命令`);
      return;
    }

    // 更新当前发送的命令索引
    setCurrentIndex(index);
    
    // 发送当前命令
    const command = commands[index] + '\n';
    onSendCommand(command);
    
    // 计划下一条命令
    setTimeout(() => {
      sendNextCommand(commands, index + 1);
    }, delay);
  };

  const handleStop = () => {
    setIsSending(false);
    message.info('已停止发送');
  };

  return (
    <>
      <Button 
        size="small" 
        icon={<BorderlessTableOutlined />} 
        onClick={showModal}
      >
        批量命令
      </Button>

      <Modal
        title="批量命令执行"
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={600}
        style={{ top: '50px' }}
      >
        <div className={styles.batchCommandContainer}>
          <div>
            <label className={styles.textAreaLabel}>
              输入多行命令 (每行一条，使用#开头的行作为注释):
            </label>
            <TextArea
              rows={8}
              value={batchCommands}
              onChange={(e) => setBatchCommands(e.target.value)}
              placeholder="# 输入多行命令，每行一条&#10;ls -la&#10;cd /var/log&#10;tail -n 20 syslog"
              className={styles.batchTextArea}
              disabled={isSending}
            />
          </div>
          
          <Divider style={{ margin: '12px 0' }} />
          
          <div className={styles.optionsContainer}>
            <div className={styles.optionGroup}>
              <label>执行模式:</label>
              <Radio.Group 
                value={executeMode} 
                onChange={(e) => setExecuteMode(e.target.value)}
                disabled={isSending}
              >
                <Radio value="sequential">顺序执行</Radio>
                <Radio value="bulk">批量执行</Radio>
              </Radio.Group>
            </div>
            
            {executeMode === 'sequential' && (
              <div className={styles.optionGroup}>
                <label>命令间延迟 (毫秒):</label>
                <Input 
                  type="number" 
                  value={delay} 
                  onChange={(e) => setDelay(Number(e.target.value))}
                  style={{ width: 100 }}
                  min={100}
                  max={10000}
                  disabled={isSending}
                />
              </div>
            )}
            
            <div className={styles.optionGroup}>
              <Checkbox 
                checked={confirmBeforeSend} 
                onChange={(e) => setConfirmBeforeSend(e.target.checked)}
                disabled={isSending}
              >
                发送前确认
              </Checkbox>
            </div>
          </div>
          
          <div className={styles.buttonsContainer}>
            {isSending ? (
              <div className={styles.sendingStatus}>
                <div className={styles.progressInfo}>
                  <div className={styles.progressText}>
                    正在发送命令 {currentIndex + 1}/{batchCommands.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length}
                  </div>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressBarInner} 
                      style={{ 
                        width: `${(currentIndex + 1) / batchCommands.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length * 100}%` 
                      }}
                    ></div>
                  </div>
                  <div className={styles.progressTime}>
                    预计剩余时间: {Math.round((batchCommands.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length - currentIndex - 1) * delay / 1000)} 秒
                  </div>
                </div>
                <Button 
                  icon={<PauseOutlined />} 
                  onClick={handleStop}
                  danger
                  className={styles.stopButton}
                >
                  停止
                </Button>
              </div>
            ) : (
              <Space>
                <Button 
                  type="primary" 
                  icon={<SendOutlined />} 
                  onClick={handleSendBatch}
                >
                  发送
                </Button>
                <Button onClick={handleCancel}>取消</Button>
                <Tooltip title="每行一条命令。空行和以#开头的行将被忽略。顺序执行会在每条命令之间等待指定的延迟时间。">
                  <QuestionCircleOutlined />
                </Tooltip>
              </Space>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default BatchCommands;
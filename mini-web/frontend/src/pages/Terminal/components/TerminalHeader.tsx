import React from 'react';
import { Button, Tooltip } from 'antd';
import {
  PlusOutlined,
  CopyOutlined,
  DownloadOutlined,
  CodeOutlined,
  BuildOutlined,
  SettingOutlined,
  FullscreenOutlined,
  CloseOutlined
} from '@ant-design/icons';
import styles from '../styles.module.css';

interface TerminalHeaderProps {
  connection?: any;
  connectionName?: string;
  connectionInfo?: string;
  isConnected?: boolean;
  networkLatency?: number;
  terminalMode?: string;
  fullscreen?: boolean;
  onAddTab?: () => void;
  onCopyContent?: () => void;
  onDownloadLog?: () => void;
  onShowSettings?: () => void;
  onCodePanel?: () => void;
  onBuildPanel?: () => void;
  onToggleFullscreen?: () => void;
  onCloseSession?: () => void;
  onOpenSettings?: () => void;
  onOpenQuickCommands?: () => void;
  onOpenBatchCommands?: () => void;
}

const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  connection,
  connectionName,
  connectionInfo,
  isConnected,
  networkLatency,
  terminalMode = 'normal',
  fullscreen,
  onAddTab,
  onCopyContent,
  onDownloadLog,
  onShowSettings,
  onCodePanel,
  onBuildPanel,
  onToggleFullscreen,
  onCloseSession,
  onOpenSettings,
  onOpenQuickCommands,
  onOpenBatchCommands
}) => {
  // 从connection中获取名称和信息（如果未直接提供）
  const connName = connectionName || (connection?.name || connection?.host || '未命名连接');
  const connInfo = connectionInfo || (connection?.username ? `${connection.username}@${connection.host || ''}:${connection.port || ''}` : '');

  // 兼容处理回调函数
  const handleSettings = onShowSettings || onOpenSettings;
  const handleCodePanel = onCodePanel || onOpenQuickCommands;
  const handleBuildPanel = onBuildPanel || onOpenBatchCommands;

  return (
    <div className={styles.terminalHeader}>
      <div className={styles.terminalInfo}>
        {connName ? (
          <>
            <span>{connName}</span>
            {connInfo && <span className={styles.hostInfo}>{connInfo}</span>}
          </>
        ) : (
          <span>Terminal</span>
        )}
      </div>
      <div className={styles.terminalControls}>
        <Tooltip title="新标签页">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined style={{ fontSize: '14px' }} />}
            onClick={onAddTab}
          />
        </Tooltip>
        <Tooltip title="复制终端内容">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined style={{ fontSize: '14px' }} />}
            onClick={onCopyContent}
          />
        </Tooltip>
        <Tooltip title="下载终端日志">
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined style={{ fontSize: '14px' }} />}
            onClick={onDownloadLog}
          />
        </Tooltip>

        {terminalMode && (
          <span className={styles.terminalMode}>{terminalMode}</span>
        )}

        {networkLatency !== undefined && networkLatency !== null ? (
          <span className={
            networkLatency < 100
              ? styles.latencyGood
              : networkLatency < 300
                ? styles.latencyMedium
                : styles.latencyPoor
          }>
            {networkLatency}ms
          </span>
        ) : (
          <span className={styles.latencyUnknown}>ms</span>
        )}

        <Tooltip title="命令面板">
          <Button
            type="text"
            size="small"
            icon={<CodeOutlined style={{ fontSize: '14px' }} />}
            onClick={handleCodePanel}
          />
        </Tooltip>
        <Tooltip title="构建工具">
          <Button
            type="text"
            size="small"
            icon={<BuildOutlined style={{ fontSize: '14px' }} />}
            onClick={handleBuildPanel}
          />
        </Tooltip>
        <Tooltip title="终端设置">
          <Button
            type="text"
            size="small"
            icon={<SettingOutlined style={{ fontSize: '14px' }} />}
            onClick={handleSettings}
          />
        </Tooltip>
        <Tooltip title="全屏模式">
          <Button
            type="text"
            size="small"
            icon={<FullscreenOutlined style={{ fontSize: '14px' }} />}
            onClick={onToggleFullscreen}
          />
        </Tooltip>
        <Tooltip title="关闭当前会话">
          <Button
            type="text"
            danger
            size="small"
            icon={<CloseOutlined style={{ fontSize: '14px' }} />}
            onClick={onCloseSession}
            className="close-session-btn"
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default TerminalHeader;
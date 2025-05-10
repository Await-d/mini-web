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
  networkLatency?: number | null;
  terminalMode?: string;
  fullscreen?: boolean;
  addNewTab?: () => void;       // 添加与实际使用一致的属性名
  onAddTab?: () => void;        // 保留旧属性以兼容
  onCopyContent?: () => void;
  onDownloadLog?: () => void;
  onShowSettings?: () => void;
  onToggleCode?: () => void;    // 添加与实际使用一致的属性名
  onToggleSplit?: () => void;   // 添加与实际使用一致的属性名
  onCodePanel?: () => void;     // 保留旧属性以兼容
  onBuildPanel?: () => void;
  onToggleFullscreen?: () => void;
  onCloseSession?: () => void;
  onCloseTab?: () => void;      // 添加与实际使用一致的属性名
  onOpenSettings?: () => void;
  onOpenQuickCommands?: () => void;
  onOpenBatchCommands?: () => void;
}

const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  networkLatency,
  terminalMode = 'normal',
  fullscreen,
  onAddTab,
  addNewTab,
  onCopyContent,
  onDownloadLog,
  onShowSettings,
  onCodePanel,
  onToggleCode,
  onToggleSplit,
  onBuildPanel,
  onToggleFullscreen,
  onCloseSession,
  onCloseTab,
  onOpenSettings,
  onOpenQuickCommands,
  onOpenBatchCommands
}) => {
  // 从connection中获取名称和信息（如果未直接提供）
  // 兼容处理回调函数
  const handleSettings = onShowSettings || onOpenSettings;
  const handleCodePanel = onCodePanel || onToggleCode || onOpenQuickCommands;
  const handleBuildPanel = onBuildPanel || onToggleSplit || onOpenBatchCommands;
  const handleAddTab = addNewTab || onAddTab;
  const handleCloseSession = onCloseSession || onCloseTab;

  return (
    <div className={styles.terminalHeader}>
      <div className={styles.terminalInfo}>      </div>
      <div className={styles.terminalControls}>
        <Tooltip title="新标签页">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined style={{ fontSize: '14px' }} />}
            onClick={handleAddTab}
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
            onClick={handleCloseSession}
            className="close-session-btn"
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default TerminalHeader;

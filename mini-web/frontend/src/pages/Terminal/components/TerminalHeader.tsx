import React from 'react';
import { Button, Tooltip, Space, Typography } from 'antd';
import {
  FullscreenOutlined, FullscreenExitOutlined, SettingOutlined,
  CloseOutlined, CopyOutlined, DownloadOutlined, PlusOutlined,
  CodeOutlined, BuildOutlined
} from '@ant-design/icons';
import type { Connection } from '../../../services/api';
import styles from '../styles.module.css';

const { Text } = Typography;

export interface TerminalHeaderProps {
  connection?: any;
  fullscreen?: boolean;
  terminalMode?: string;
  networkLatency?: number;
  isConnected?: boolean;
  onToggleFullscreen?: () => void;
  onOpenSettings?: () => void;
  onOpenQuickCommands?: () => void;
  onOpenBatchCommands?: () => void;
  onCopyContent: (activeTab?: any) => void;
  onDownloadLog: (activeTab?: any) => void;
  onAddTab: () => void;
  onCloseSession: (activeTab?: any) => void;
}

const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  connection,
  fullscreen = false,
  terminalMode = 'normal',
  networkLatency,
  isConnected = false,
  onToggleFullscreen,
  onOpenSettings,
  onOpenQuickCommands,
  onOpenBatchCommands,
  onCopyContent,
  onDownloadLog,
  onAddTab,
  onCloseSession
}) => {
  return (
    <div className={styles.terminalHeader} style={{ padding: '4px 12px' }}>
      <div className={styles.terminalInfo}>
        <span style={{ fontSize: '15px', fontWeight: 'bold' }}>
          {connection?.name}
          <Text type="secondary" style={{ fontSize: '13px', marginLeft: '8px' }}>
            {connection?.host}:{connection?.port} - {connection?.protocol.toUpperCase()}
          </Text>
        </span>
        {connection && (
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '已连接' : '未连接'}
          </span>
        )}
      </div>
      <div className={styles.terminalControls}>
        <Space>
          <Tooltip title="新建标签">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={onAddTab}
            />
          </Tooltip>
          <Tooltip title="复制选中内容">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => onCopyContent(null)}
            />
          </Tooltip>
          <Tooltip title="下载日志">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => onDownloadLog(null)}
            />
          </Tooltip>
          <Tooltip title="终端模式">
            <div className={`terminal-mode ${terminalMode}`}>
              {terminalMode}
            </div>
          </Tooltip>
          {networkLatency !== undefined && (
            <Tooltip title="网络延迟">
              <div className={`network-latency ${networkLatency > 200 ? 'high' : networkLatency > 100 ? 'medium' : 'low'}`}>
                {networkLatency}ms
              </div>
            </Tooltip>
          )}
          <Tooltip title="快速命令">
            <Button
              type="text"
              size="small"
              icon={<CodeOutlined />}
              onClick={onOpenQuickCommands}
            />
          </Tooltip>
          <Tooltip title="批量命令">
            <Button
              type="text"
              size="small"
              icon={<BuildOutlined />}
              onClick={onOpenBatchCommands}
            />
          </Tooltip>
          <Tooltip title="终端设置">
            <Button
              type="text"
              size="small"
              icon={<SettingOutlined />}
              onClick={onOpenSettings}
            />
          </Tooltip>
          <Tooltip title={fullscreen ? "退出全屏" : "全屏"}>
            <Button
              type="text"
              size="small"
              icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={onToggleFullscreen}
            />
          </Tooltip>
          <Button
            type="text"
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => onCloseSession(null)}
            className="close-session-btn"
          />
        </Space>
      </div>
    </div>
  );
};

export default TerminalHeader;
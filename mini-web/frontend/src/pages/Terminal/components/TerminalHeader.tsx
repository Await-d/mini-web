import React from 'react';
import { Button, Tooltip, Space, Typography } from 'antd';
import {
  FullscreenOutlined, FullscreenExitOutlined, SettingOutlined,
  CloseOutlined, CopyOutlined, DownloadOutlined, PlusOutlined
} from '@ant-design/icons';
import type { Connection } from '../../../services/api';
import styles from '../styles.module.css';

const { Text } = Typography;

interface TerminalHeaderProps {
  connection: Connection | null;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
  onCopyContent: () => void;
  onDownloadLog: () => void;
  onAddTab: () => void;
  onCloseSession: () => void;
}

const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  connection,
  fullscreen,
  onToggleFullscreen,
  onOpenSettings,
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
              onClick={onCopyContent}
            />
          </Tooltip>
          <Tooltip title="下载日志">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={onDownloadLog}
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
            onClick={onCloseSession}
            title="关闭会话"
            className="close-session-btn"
          />
        </Space>
      </div>
    </div>
  );
};

export default TerminalHeader;
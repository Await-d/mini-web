import React, { useMemo, useState } from 'react';
import { Tabs, Spin, Tooltip, Menu, Modal, Badge, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  CodeOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ApiOutlined,
  ReloadOutlined,
  CopyOutlined,
  CloseOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  MoreOutlined
} from '@ant-design/icons';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { TerminalTabsProps } from '../Terminal.d';
import styles from './TerminalTabs.module.css';

/**
 * 标签页组件接口
 */
export interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeTabKey: string;
  onTabChange: (activeTabKey: string) => void;
  onTabEdit: (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => void;
  onTabClose: (key: string) => void;
  onTabRefresh?: (key: string) => void;
  onTabDuplicate?: (key: string) => void;
  networkLatency?: number | null; // 添加网络延迟属性
}

// 右键菜单项类型
type ContextMenuItem = {
  key: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
} & (
    | { type: 'divider'; label?: React.ReactNode }
    | { type?: undefined; label: React.ReactNode }
  );

/**
 * 渲染网络延迟信息
 */
const NetworkLatencyDisplay: React.FC<{ latency: number | null | undefined }> = ({ latency }) => {
  if (latency === null || latency === undefined) {
    return null;
  }

  // 根据延迟值计算显示样式
  let latencyClass = styles.latencyNormal;
  let latencyText = `${latency}ms`;

  if (latency < 100) {
    latencyClass = styles.latencyGood;
  } else if (latency >= 100 && latency < 300) {
    latencyClass = styles.latencyNormal;
  } else if (latency >= 300 && latency < 600) {
    latencyClass = styles.latencyWarning;
  } else {
    latencyClass = styles.latencyBad;
  }

  return (
    <div className={styles.networkLatencyContainer}>
      <span>延迟:</span>
      <span className={`${styles.latencyBadge} ${latencyClass}`}>
        {latencyText}
      </span>
    </div>
  );
};

/**
 * 终端标签页组件
 * 显示并管理终端标签页
 */
const TerminalTabs: React.FC<TerminalTabsProps> = ({
  tabs,
  activeTabKey,
  onTabChange,
  onTabEdit,
  onTabClose,
  onTabRefresh,
  onTabDuplicate,
  networkLatency
}) => {
  // 上下文菜单状态
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [contextMenuTabKey, setContextMenuTabKey] = useState<string | null>(null);
  const [showConfirmCloseAll, setShowConfirmCloseAll] = useState(false);

  // 处理标签切换
  const handleTabChange = (key: string) => {
    onTabChange(key);
  };

  // 打开上下文菜单
  const openContextMenu = (e: React.MouseEvent, tabKey: string) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuTabKey(tabKey);
    setContextMenuVisible(true);
  };

  // 关闭上下文菜单
  const closeContextMenu = () => {
    setContextMenuVisible(false);
  };

  // 刷新标签
  const handleRefreshTab = () => {
    if (!contextMenuTabKey) return;

    if (onTabRefresh) {
      onTabRefresh(contextMenuTabKey);
    } else {
      // 触发标签刷新事件，由具体的终端容器处理刷新逻辑
      window.dispatchEvent(new CustomEvent('terminal-tab-refresh', {
        detail: { tabKey: contextMenuTabKey }
      }));
    }
    closeContextMenu();
  };

  // 复制标签
  const handleDuplicateTab = () => {
    if (!contextMenuTabKey) return;

    if (onTabDuplicate) {
      onTabDuplicate(contextMenuTabKey);
    }
    closeContextMenu();
  };

  // 关闭标签
  const handleCloseTab = () => {
    if (!contextMenuTabKey) return;
    onTabClose(contextMenuTabKey);
    closeContextMenu();
  };

  // 上下文菜单项
  const contextMenuItems = [
    {
      key: 'refresh',
      label: '刷新连接',
      icon: <ReloadOutlined />,
      onClick: handleRefreshTab,
    },
    {
      key: 'duplicate',
      label: '复制标签页',
      icon: <CopyOutlined />,
      onClick: handleDuplicateTab,
    },
    {
      key: 'divider1',
      type: 'divider',
    },
    {
      key: 'close',
      label: '关闭标签页',
      icon: <CloseOutlined />,
      onClick: handleCloseTab,
      danger: true,
    },
  ];

  // 处理菜单项点击
  const handleMenuClick = (e: any) => {
    const key = e.key;
    switch (key) {
      case 'refresh':
        handleRefreshTab();
        break;
      case 'duplicate':
        handleDuplicateTab();
        break;
      case 'close':
        handleCloseTab();
        break;
      default:
        break;
    }
  };

  // 渲染标签标题
  const renderTabTitle = (tab: TerminalTab) => {
    const isConnected = tab.isConnected;
    const statusColor = isConnected ? 'green' : 'red';

    return (
      <div className={styles.tabTitleContainer}>
        <Badge color={statusColor} />
        <span className={styles.tabTitle}>
          {tab.title}
        </span>
        <Dropdown
          overlay={
            <Menu>
              <Menu.Item
                key="refresh"
                icon={<ReloadOutlined />}
                onClick={(e) => {
                  e.domEvent.stopPropagation();
                  onTabRefresh?.(tab.key);
                }}
              >
                刷新连接
              </Menu.Item>
              <Menu.Item
                key="duplicate"
                icon={<CopyOutlined />}
                onClick={(e) => {
                  e.domEvent.stopPropagation();
                  onTabDuplicate?.(tab.key);
                }}
              >
                复制标签页
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                key="close"
                icon={<CloseOutlined />}
                onClick={(e) => {
                  e.domEvent.stopPropagation();
                  onTabClose(tab.key);
                }}
              >
                关闭标签页
              </Menu.Item>
            </Menu>
          }
          trigger={['click']}
          placement="bottomRight"
        >
          <MoreOutlined
            className={styles.tabMoreIcon}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      </div>
    );
  };

  return (
    <div className={styles.terminalTabsContainer} onClick={closeContextMenu}>
      <Tabs
        type="card"
        className={styles.terminalTabs}
        activeKey={activeTabKey}
        onChange={handleTabChange}
        onEdit={(targetKey, action) => {
          if (action === 'remove' && typeof targetKey === 'string') {
            onTabClose(targetKey);
          }
        }}
        hideAdd
      >
        {tabs.map(tab => (
          <Tabs.TabPane
            key={tab.key}
            tab={renderTabTitle(tab)}
            closable={true}
          />
        ))}
      </Tabs>

      {/* 上下文菜单 */}
      {contextMenuVisible && (
        <div
          className={styles.contextMenu}
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenuItems.map(item =>
            item.type === 'divider' ? (
              <div key={item.key} className={styles.divider} />
            ) : (
              <div
                key={item.key}
                className={`${styles.menuItem} ${item.danger ? styles.danger : ''}`}
                onClick={item.onClick}
              >
                {item.icon}
                <span>{item.label}</span>
              </div>
            )
          )}
        </div>
      )}

      {/* 确认关闭所有标签的对话框 */}
      <Modal
        title="确认关闭"
        open={showConfirmCloseAll}
        onOk={() => {
          tabs.forEach(tab => onTabClose(tab.key));
          setShowConfirmCloseAll(false);
        }}
        onCancel={() => setShowConfirmCloseAll(false)}
        okText="关闭所有"
        cancelText="取消"
      >
        <p>确定要关闭所有标签页吗？这将终止所有活动连接。</p>
      </Modal>
    </div>
  );
};

export default TerminalTabs;
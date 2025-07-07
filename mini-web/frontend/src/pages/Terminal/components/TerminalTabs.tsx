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
import type { TerminalTabsComponentProps } from '../Terminal.d'; // 重命名导入的类型
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
  // 确保tabs是一个数组
  const safeTabs = Array.isArray(tabs) ? tabs : [];

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

  // 渲染标签延迟徽章
  const renderLatencyBadge = (latency: number | null | undefined) => {
    if (latency === null || latency === undefined) {
      return null;
    }

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
      <span className={`${styles.latencyBadge} ${latencyClass}`} style={{ marginRight: '6px', fontSize: '10px' }}>
        {latencyText}
      </span>
    );
  };

  // 渲染标签标题
  const renderTabTitle = (tab: TerminalTab) => {
    const isConnected = tab.isConnected;
    const statusColor = isConnected ? 'green' : 'red';

    return (
      <div className={styles.tabTitleContainer}>
        <Badge color={statusColor} />
        {renderLatencyBadge(tab.networkLatency)}
        <span className={styles.tabTitle}>
          {tab.title}
        </span>
        <Dropdown
          menu={{
            items: [
              {
                key: "refresh",
                icon: <ReloadOutlined />,
                label: "刷新连接",
                onClick: (e: any) => {
                  e.domEvent.stopPropagation();
                  onTabRefresh?.(tab.key);
                }
              },
              {
                key: "duplicate",
                icon: <CopyOutlined />,
                label: "复制标签页",
                onClick: (e: any) => {
                  e.domEvent.stopPropagation();
                  onTabDuplicate?.(tab.key);
                }
              },
              {
                type: "divider" as const
              },
              {
                key: "close",
                icon: <CloseOutlined />,
                label: "关闭标签页",
                onClick: (e: any) => {
                  e.domEvent.stopPropagation();
                  onTabClose(tab.key);
                }
              }
            ]
          }}
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

  // 关闭所有标签
  const handleCloseAll = () => {
    setShowConfirmCloseAll(false);
    // 关闭所有标签
    safeTabs.forEach(tab => {
      onTabClose(tab.key);
    });
  };

  // 构建标签页配置
  const tabItems = useMemo(() => {
    return safeTabs.map(tab => ({
      key: tab.key,
      label: renderTabTitle(tab),
      closable: true,
      children: null, // 内容在TerminalContainers组件中渲染
    }));
  }, [safeTabs]);

  // 如果没有标签，返回空内容
  if (safeTabs.length === 0) {
    return null;
  }

  return (
    <div className={styles.terminalTabsContainer} onContextMenu={(e) => e.preventDefault()}>
      <div className={styles.tabsWrapper}>
        <Tabs
          type="editable-card"
          activeKey={activeTabKey}
          onChange={handleTabChange}
          onEdit={onTabEdit}
          items={tabItems}
          className={styles.tabs}
          animated={false}
          hideAdd
          tabBarExtraContent={
            <NetworkLatencyDisplay latency={networkLatency} />
          }
        />
      </div>

      {/* 标签右键菜单 */}
      {contextMenuVisible && (
        <div
          className={styles.contextMenu}
          style={{
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
          }}
        >
          <Menu
            items={contextMenuItems}
            onClick={handleMenuClick}
            style={{ minWidth: '150px' }}
          />
        </div>
      )}

      {/* 遮罩层 - 用于捕获全局点击关闭上下文菜单 */}
      {contextMenuVisible && (
        <div
          className={styles.contextMenuOverlay}
          onClick={closeContextMenu}
        />
      )}

      {/* 关闭所有标签确认对话框 */}
      <Modal
        title="关闭所有标签"
        open={showConfirmCloseAll}
        onOk={handleCloseAll}
        onCancel={() => setShowConfirmCloseAll(false)}
        okText="确认"
        cancelText="取消"
      >
        <p>确定要关闭所有终端标签吗？这将断开所有连接。</p>
      </Modal>
    </div>
  );
};

export default TerminalTabs;
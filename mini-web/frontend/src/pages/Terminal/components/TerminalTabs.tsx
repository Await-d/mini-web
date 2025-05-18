import React, { useMemo, useState } from 'react';
import { Tabs, Spin, Tooltip, Menu, Modal } from 'antd';
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
  ThunderboltOutlined
} from '@ant-design/icons';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import styles from './TerminalTabs.module.css';

/**
 * 标签页组件接口
 */
export interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeKey: string;
  onTabChange: (activeKey: string) => void;
  onTabEdit: (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => void;
  onTabClose: (key: string) => void;
  onAddTab?: () => void;
  onRefreshTab?: (key: string) => void;
  onDuplicateTab?: (key: string) => void;
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
  activeKey,
  onTabChange,
  onTabEdit,
  onTabClose,
  onRefreshTab,
  onDuplicateTab,
  networkLatency
}) => {
  // 状态：右键菜单相关
  const [contextMenuTabKey, setContextMenuTabKey] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);

  // 处理标签切换
  const handleTabChange = (key: string) => {
    onTabChange(key);

    // 分发标签激活事件
    window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
      detail: { tabKey: key, isNewTab: false }
    }));
  };

  // 处理标签右键点击
  const handleContextMenu = (event: React.MouseEvent, tabKey: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuTabKey(tabKey);
    setContextMenuPosition({
      x: event.clientX,
      y: event.clientY
    });
  };

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenuTabKey(null);
    setContextMenuPosition(null);
  };

  // 关闭当前标签
  const handleCloseTab = () => {
    if (!contextMenuTabKey) return;
    onTabClose(contextMenuTabKey);
    closeContextMenu();
  };

  // 关闭其他标签
  const handleCloseOtherTabs = () => {
    if (!contextMenuTabKey) return;

    Modal.confirm({
      title: '关闭其他标签',
      content: '确定要关闭除当前标签外的所有标签吗？',
      onOk: () => {
        tabs.forEach(tab => {
          if (tab.key !== contextMenuTabKey) {
            onTabClose(tab.key);
          }
        });
        closeContextMenu();
      },
      onCancel: () => {
        closeContextMenu();
      }
    });
  };

  // 关闭所有标签
  const handleCloseAllTabs = () => {
    Modal.confirm({
      title: '关闭所有标签',
      content: '确定要关闭所有标签吗？',
      onOk: () => {
        tabs.forEach(tab => {
          onTabClose(tab.key);
        });
        closeContextMenu();
      },
      onCancel: () => {
        closeContextMenu();
      }
    });
  };

  // 刷新标签页
  const handleRefreshTab = () => {
    if (!contextMenuTabKey) return;

    if (onRefreshTab) {
      // 使用传入的刷新函数
      onRefreshTab(contextMenuTabKey);
    } else {
      // 触发标签刷新事件，由具体的终端容器处理刷新逻辑
      window.dispatchEvent(new CustomEvent('terminal-tab-refresh', {
        detail: { tabKey: contextMenuTabKey }
      }));
    }
    closeContextMenu();
  };

  // 复制连接
  const handleDuplicateTab = () => {
    if (!contextMenuTabKey) return;

    if (onDuplicateTab) {
      onDuplicateTab(contextMenuTabKey);
    }
    closeContextMenu();
  };

  // 右键菜单项
  const contextMenuItems: ContextMenuItem[] = [
    {
      key: 'refresh',
      label: '刷新',
      icon: <ReloadOutlined />,
      onClick: handleRefreshTab
    },
    {
      key: 'duplicate',
      label: '复制连接',
      icon: <CopyOutlined />,
      onClick: handleDuplicateTab
    },
    {
      key: 'divider',
      type: 'divider'
    },
    {
      key: 'close',
      label: '关闭标签页',
      icon: <CloseOutlined />,
      onClick: handleCloseTab
    },
    {
      key: 'closeOthers',
      label: '关闭其他标签页',
      icon: <CloseCircleOutlined />,
      onClick: handleCloseOtherTabs
    },
    {
      key: 'closeAll',
      label: '关闭所有标签页',
      icon: <CloseCircleOutlined />,
      danger: true,
      onClick: handleCloseAllTabs
    }
  ];

  // 菜单点击处理
  const handleMenuClick: MenuProps['onClick'] = (e) => {
    const item = contextMenuItems.find(item => item.key === e.key);
    if (item && item.onClick) {
      item.onClick();
    }
  };

  // 根据连接类型获取适当的图标
  const getProtocolIcon = (protocol?: string) => {
    switch (protocol?.toLowerCase()) {
      case 'ssh':
        return <CloudServerOutlined className={styles.ssh} />;
      case 'rdp':
        return <DesktopOutlined className={styles.rdp} />;
      case 'vnc':
        return <DatabaseOutlined className={styles.vnc} />;
      case 'telnet':
        return <ApiOutlined className={styles.telnet} />;
      default:
        return <CodeOutlined />;
    }
  };

  // 使用useMemo构建标签项目以避免不必要的重新计算
  const items = useMemo(() =>
    tabs.map((tab) => ({
      key: tab.key,
      label: (
        <Tooltip title={tab.title} mouseEnterDelay={0.8}>
          <span
            className={styles.tabLabel}
            onContextMenu={(e) => handleContextMenu(e, tab.key)}
          >
            <span className={styles.tabIcon}>
              {tab.icon || getProtocolIcon(tab.protocol)}
            </span>
            <span className={styles.tabTitle}>{tab.title}</span>
            {tab.status === 'connecting' || !tab.isConnected ? (
              <Spin size="small" style={{ marginLeft: 4 }} />
            ) : null}
          </span>
        </Tooltip>
      ),
      closable: true,
      children: null // 标签页内容在主容器中渲染
    })),
    [tabs]
  );

  return (
    <div className={styles.terminalTabsContainer} onClick={closeContextMenu}>
      <Tabs
        activeKey={activeKey}
        type="editable-card"
        hideAdd={true}
        onChange={handleTabChange}
        onEdit={onTabEdit}
        className={styles.terminalTabs}
        tabBarStyle={{ margin: 0, borderBottom: 0 }}
        items={items}
        size="small"
        tabPosition="top"
        animated={{ inkBar: true, tabPane: false }}
        moreIcon={<span style={{ color: '#1677ff', fontSize: '14px' }}>···</span>}
      />

      {/* 网络延迟信息显示 */}
      <NetworkLatencyDisplay latency={networkLatency} />

      {/* 标签右键菜单 */}
      {contextMenuPosition && contextMenuTabKey && (
        <div
          style={{
            position: 'fixed',
            zIndex: 1000,
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
            backgroundColor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            borderRadius: '6px',
            padding: '8px 0'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Menu onClick={handleMenuClick} mode="vertical" style={{ border: 'none' }}>
            {contextMenuItems.map(item =>
              item.type === 'divider' ? (
                <Menu.Divider key={item.key} />
              ) : (
                <Menu.Item
                  key={item.key}
                  icon={item.icon}
                  danger={item.danger}
                >
                  {item.label}
                </Menu.Item>
              )
            )}
          </Menu>
        </div>
      )}
    </div>
  );
};

export default TerminalTabs;
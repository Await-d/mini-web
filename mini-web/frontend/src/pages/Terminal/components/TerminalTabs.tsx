import React from 'react';
import { Tabs } from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons'; // 使用CloseCircleOutlined替代CloseOutlined
import type { TabsProps } from 'antd';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import styles from '../styles.module.css';

export interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeKey: string;
  onTabChange: (activeKey: string) => void;
  onTabEdit: (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => void;
  onTabClose: (key: string) => void;
  onAddTab: () => void;
}

const TerminalTabs: React.FC<TerminalTabsProps> = ({
  tabs,
  activeKey,
  onTabChange,
  onTabEdit,
  onTabClose,
  onAddTab
}) => {
  // 构建标签项 - 只包含标签头，不包含内容
  const items: TabsProps['items'] = tabs.map((tab) => ({
    key: tab.key,
    label: (
      <span className={styles.tabTitleContainer}>
        <span className={styles.tabTitleText}>
          {tab.title}
          <span className={styles.tabInfo}>
            {tab.networkLatency !== undefined && tab.networkLatency !== null && (
              <span className={
                tab.networkLatency < 100
                  ? styles.tabLatencyGood
                  : tab.networkLatency < 300
                    ? styles.tabLatencyMedium
                    : styles.tabLatencyPoor
              }>
                {tab.networkLatency}ms
              </span>
            )}
            {tab.terminalMode && tab.terminalMode !== 'normal' && (
              <span className={styles.tabMode}>
                {tab.terminalMode}
              </span>
            )}
          </span>
        </span>
        <CloseCircleOutlined
          className={styles.closeIcon}
          onClick={(e) => {
            e.stopPropagation();
            onTabClose(tab.key);
          }}
        />
      </span>
    ),
    // 使用空的占位符，实际内容由父组件控制
    children: <div className="terminal-tab-placeholder"></div>,
  }));

  // 添加一个默认标签项，当没有标签时显示
  if (items.length === 0) {
    items.push({
      key: 'empty-tab',
      label: '无连接',
      children: <div className="terminal-empty">请创建或选择一个连接</div>,
      closable: false
    });
  }

  return (
    <Tabs
      type="editable-card"
      hideAdd={false}
      onChange={onTabChange}
      activeKey={activeKey}
      onEdit={onTabEdit}
      items={items}
      addIcon={<span onClick={onAddTab}>新标签</span>}
      className={styles.terminalTabs}
    />
  );
};

export default TerminalTabs;
import React, { useMemo, useEffect, useRef } from 'react';
import { Tabs, Spin } from 'antd';
import { CloseOutlined } from '@ant-design/icons'; // 使用更小的关闭图标
import type { TabsProps } from 'antd';
import type { TerminalTab } from '../Terminal.d'; // 确保正确导入类型
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
  onAddTab: () => void;
}

/**
 * 终端标签页组件
 */
const TerminalTabs: React.FC<TerminalTabsProps> = ({
  tabs,
  activeKey,
  onTabChange,
  onTabEdit,
  onTabClose,
  onAddTab
}) => {
  // 记录上一次的活动标签，用于检测变化
  const prevActiveKeyRef = useRef<string>(activeKey);

  // 监听activeKey变化
  useEffect(() => {
    if (prevActiveKeyRef.current !== activeKey) {
      console.log(`【标签组件】活动标签已变更: ${prevActiveKeyRef.current} -> ${activeKey}`);
      prevActiveKeyRef.current = activeKey;
    }
  }, [activeKey]);

  // 在组件开始时添加日志记录
  useEffect(() => {
    console.log('【TerminalTabs】标签数量:', tabs.length, '活动标签:', activeKey);
  }, [tabs, activeKey]);

  // 处理关闭标签事件
  const handleTabClose = (e: React.MouseEvent | React.KeyboardEvent | string) => {
    if (typeof e !== 'string' && e.stopPropagation) {
      e.stopPropagation();
    }
    const targetKey = typeof e === 'string' ? e : (e.currentTarget as HTMLElement).id;
    onTabClose(targetKey);
  };

  // 处理标签切换
  const handleTabChange = (key: string) => {
    console.log(`【标签组件】手动切换到标签: ${key}`);
    onTabChange(key);

    // 分发标签激活事件
    window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
      detail: { tabKey: key, isNewTab: false }
    }));
  };

  // 去重复的标签
  const uniqueTabs = useMemo(() => {
    const seen = new Set();
    return tabs.filter(tab => {
      if (seen.has(tab.key)) {
        return false;
      }
      seen.add(tab.key);
      return true;
    });
  }, [tabs]);

  console.log('【标签组件】渲染标签页组件:', {
    原始标签数: tabs.length,
    去重后标签数: uniqueTabs.length,
    活动标签: activeKey,
    标签列表: uniqueTabs.map(t => t.key)
  });

  // 构建标签项目
  const items = uniqueTabs.map((tab) => ({
    key: tab.key,
    label: (
      <span className={styles.tabLabel}>
        {tab.icon && <span className={styles.tabIcon}>{tab.icon}</span>}
        <span className={styles.tabTitle}>{tab.title}</span>
        {tab.status === 'connecting' || !tab.isConnected ? (
          <Spin size="small" style={{ marginLeft: 8 }} />
        ) : null}
      </span>
    ),
    closable: true,
    children: null // 标签页内容在主容器中渲染
  }));

  return (
    <div className={styles.terminalTabsContainer}>
      <Tabs
        activeKey={activeKey}
        type="editable-card"
        hideAdd={false}
        onChange={handleTabChange}
        onEdit={onTabEdit}
        className={styles.terminalTabs}
        tabBarStyle={{ margin: 0 }}
        items={items}
        addIcon={<span onClick={onAddTab}>+</span>}
        size="small"
        tabPosition="top"
        animated={{ inkBar: true, tabPane: false }}
      />
    </div>
  );
};

export default TerminalTabs;
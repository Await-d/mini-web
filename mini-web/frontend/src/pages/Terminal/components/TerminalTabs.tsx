import React, { useMemo, useEffect, useRef } from 'react';
import { Tabs } from 'antd';
import { CloseOutlined } from '@ant-design/icons'; // 使用更小的关闭图标
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
  // 记录上一次的活动标签，用于检测变化
  const prevActiveKeyRef = useRef<string>(activeKey);

  // 监听activeKey变化
  useEffect(() => {
    if (prevActiveKeyRef.current !== activeKey) {
      console.log(`【标签组件】活动标签已变更: ${prevActiveKeyRef.current} -> ${activeKey}`);
      prevActiveKeyRef.current = activeKey;
    }
  }, [activeKey]);

  // 处理关闭标签事件，直接调用onTabClose回调
  const handleCloseTab = (e: React.MouseEvent, key: string) => {
    e.stopPropagation(); // 阻止冒泡，避免触发Tab选中事件
    e.preventDefault(); // 防止默认行为
    console.log('【标签关闭】用户点击自定义关闭按钮', key);
    // 直接调用传入的关闭函数
    onTabClose(key);
  };

  // 处理标签切换
  const handleTabChange = (key: string) => {
    console.log(`【标签组件】手动切换到标签: ${key}`);
    onTabChange(key);

    // 分发标签激活事件
    if (typeof window !== 'undefined') {
      console.log(`【标签组件】分发标签激活事件: ${key}`);
      window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
        detail: { tabKey: key }
      }));
    }
  };

  // 使用useMemo进行标签去重和数据处理
  const uniqueTabs = useMemo(() => {
    // 使用Map按key去重
    const tabMap = new Map<string, TerminalTab>();

    // 遍历原始标签，保留每个key的最后一个标签
    tabs.forEach(tab => {
      if (tab.key) {
        tabMap.set(tab.key, tab);
      }
    });

    // 将Map转换回数组
    return Array.from(tabMap.values());
  }, [tabs]);

  // 构建标签项
  const items: TabsProps['items'] = uniqueTabs.map((tab) => ({
    key: tab.key,
    label: (
      <div className={styles.tabLabel || "tab-label"}>
        <span title={tab.title}>{tab.title}</span>
        <CloseOutlined
          className={styles.tabCloseButton || "tab-close-button"}
          onClick={(e) => handleCloseTab(e, tab.key)}
        />
      </div>
    ),
    closable: false, // 禁用内置的关闭按钮
  }));

  // 调试输出
  console.log('【TerminalTabs】渲染标签:', {
    原始标签数: tabs.length,
    去重后标签数: uniqueTabs.length,
    活动标签: activeKey,
    标签列表: uniqueTabs.map(t => t.key)
  });

  return (
    <div className={styles.terminalTabs}>
      <Tabs
        type="editable-card"
        hideAdd
        onChange={handleTabChange}
        activeKey={activeKey}
        onEdit={onTabEdit}
        items={items}
        addIcon={<span onClick={onAddTab}>+</span>}
        className={styles.customTabs}
      />
    </div>
  );
};

export default TerminalTabs;
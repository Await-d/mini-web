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

  // 处理关闭标签事件
  const handleCloseTab = (e: React.MouseEvent, key: string) => {
    e.stopPropagation(); // 阻止冒泡，避免触发Tab选中事件
    e.preventDefault(); // 防止默认行为
    console.log('【标签关闭】用户点击自定义关闭按钮', key);
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
    // 确保tabs有效，更详细的日志
    console.log('【TerminalTabs】收到的原始标签：', tabs ? (Array.isArray(tabs) ? `数组，长度${tabs.length}` : typeof tabs) : 'null');
    console.log('【TerminalTabs】标签数据详情：', tabs);

    // 检查tabs是否存在并且是数组
    if (!tabs || !Array.isArray(tabs)) {
      console.log('【TerminalTabs】没有有效的标签数据：tabs不是数组');
      return [];
    }

    if (tabs.length === 0) {
      console.log('【TerminalTabs】没有有效的标签数据：tabs是空数组');
      return [];
    }

    // 创建一个新的Map来保存去重后的标签
    const tabMap = new Map<string, TerminalTab>();

    // 遍历所有标签，按key去重
    tabs.forEach(tab => {
      if (tab && tab.key) {
        tabMap.set(tab.key, tab);
        console.log(`【TerminalTabs】添加标签到Map: ${tab.key}, 标题: ${tab.title}, 连接ID: ${tab.connectionId}`);
      } else {
        console.log('【TerminalTabs】跳过无效标签:', tab);
      }
    });

    // 将Map转换回数组
    const result = Array.from(tabMap.values());
    console.log(`【TerminalTabs】去重后的标签: ${result.length}个`, result.map(t => `${t.key}(${t.title})`));
    return result;
  }, [tabs]);

  // 构建标签项
  const items: TabsProps['items'] = uniqueTabs.map((tab) => ({
    key: tab.key,
    label: (
      <div className={styles.tabLabel}>
        <span title={tab.title}>{tab.title}</span>
        <CloseOutlined
          className={styles.tabCloseButton}
          onClick={(e) => handleCloseTab(e, tab.key)}
        />
      </div>
    ),
    closable: false, // 禁用内置的关闭按钮，使用自定义的关闭按钮
  }));

  // 调试输出
  console.log('【TerminalTabs】渲染标签:', {
    原始标签数: tabs.length,
    去重后标签数: uniqueTabs.length,
    活动标签: activeKey,
    标签列表: uniqueTabs.map(t => t.key)
  });

  // 如果没有标签，返回占位元素
  if (items.length === 0) {
    return <div className={styles.terminalTabs} style={{ minHeight: '40px' }}></div>;
  }

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
        size="small"
        tabPosition="top"
        animated={{ inkBar: true, tabPane: false }}
      />
    </div>
  );
};

export default TerminalTabs;
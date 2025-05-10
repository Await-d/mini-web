import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Tabs, Spin, Tooltip } from 'antd';
import {
  CloseOutlined,
  CodeOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ApiOutlined
} from '@ant-design/icons';
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
  onAddTab?: () => void;
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
  const [visualTabs, setVisualTabs] = useState<any[]>(tabs || []);

  // 监听标签变化，处理显示逻辑，并移除重复项
  useEffect(() => {
    if (!tabs || tabs.length === 0) {
      setVisualTabs([]);
      return;
    }

    // 使用Map进行去重，保留同一连接+会话下的最新标签
    const dedupMap = new Map<string, TerminalTab>();

    // 对标签进行排序，确保最新创建的标签在最前面
    const sortedTabs = [...tabs].sort((a, b) => {
      // 提取时间戳部分并转为数字进行比较
      const timeA = parseInt(a.key.split('-').pop() || '0', 10);
      const timeB = parseInt(b.key.split('-').pop() || '0', 10);
      return timeB - timeA; // 降序排列，最新的在前
    });

    // 遍历排序后的标签进行去重
    sortedTabs.forEach(tab => {
      // 使用连接ID和会话ID作为唯一标识
      const connectionKey = `${tab.connectionId}-${tab.sessionId}`;

      // 仅当Map中不存在该连接时添加，保证只保留最新的一个
      if (!dedupMap.has(connectionKey)) {
        dedupMap.set(connectionKey, tab);
      }
    });

    // 获取去重后的标签列表
    const uniqueTabs = Array.from(dedupMap.values());

    setVisualTabs(uniqueTabs);
  }, [tabs, activeKey]);

  // 记录上一次的活动标签，用于检测变化
  const prevActiveKeyRef = useRef<string>(activeKey);

  // 监听activeKey变化
  useEffect(() => {
    if (prevActiveKeyRef.current !== activeKey) {
      prevActiveKeyRef.current = activeKey;
    }
  }, [activeKey]);

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
    onTabChange(key);

    // 分发标签激活事件
    window.dispatchEvent(new CustomEvent('terminal-tab-activated', {
      detail: { tabKey: key, isNewTab: false }
    }));
    
    console.log('【标签点击】用户点击激活标签:', key);
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

  // 构建标签项目
  const items = tabs.map((tab) => ({
    key: tab.key,
    label: (
      <Tooltip title={tab.title} mouseEnterDelay={0.8}>
        <span className={styles.tabLabel}>
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
  }));

  return (
    <div className={styles.terminalTabsContainer}>
      <Tabs
        activeKey={activeKey}
        type="editable-card"
        hideAdd={true} /* 隐藏新建标签按钮 */
        onChange={handleTabChange}
        onEdit={onTabEdit}
        className={styles.terminalTabs}
        tabBarStyle={{ margin: 0, borderBottom: 0 }}
        items={items}
        size="middle"
        tabPosition="top"
        animated={{ inkBar: true, tabPane: false }}
        moreIcon={<span style={{ color: '#1677ff', fontSize: '16px' }}>···</span>}
      />
    </div>
  );
};

export default TerminalTabs;
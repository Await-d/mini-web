import React from 'react';
import { Tabs } from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons'; // 使用CloseCircleOutlined替代CloseOutlined
import type { TabsProps } from 'antd';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import styles from '../styles.module.css';
import GraphicalTerminal from '../../../components/GraphicalTerminal';

interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeTabKey: string;
  onTabChange: (key: string) => void;
  onTabEdit: (targetKey: React.MouseEvent<Element, MouseEvent> | React.KeyboardEvent<Element> | string, action: 'add' | 'remove') => void;
  onTabClose: (key: string) => void;
}

const TerminalTabs: React.FC<TerminalTabsProps> = ({
  tabs,
  activeTabKey,
  onTabChange,
  onTabEdit,
  onTabClose
}) => {
  const renderTabContent = (tab: TerminalTab) => {
    if (!tab) return null;

    // 根据标签是否为图形化终端决定渲染不同的组件
    if (tab.isGraphical) {
      // 渲染图形化终端（RDP/VNC）
      return (
        <div className={styles.terminalWrapper} ref={tab.terminalRef}>
          <GraphicalTerminal
            protocol={tab.connection?.protocol as 'rdp' | 'vnc'}
            webSocketRef={tab.webSocketRef}
            onResize={(width, height) => {
              // 发送调整大小的消息
              if (tab.webSocketRef.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                const resizeMessage = {
                  type: 'resize',
                  width,
                  height
                };
                tab.webSocketRef.current.send(JSON.stringify(resizeMessage));
              }
            }}
          />
        </div>
      );
    } else {
      // 渲染普通终端（SSH/Telnet）
      return (
        <div
          className={styles.terminalWrapper}
          ref={tab.terminalRef}
          style={{ position: 'relative', display: 'flex', flex: '1', height: '100%', zIndex: 5 }}
        />
      );
    }
  };

  // 构建标签项
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
    children: renderTabContent(tab),
  }));

  return (
    <Tabs
      type="card"
      activeKey={activeTabKey}
      onChange={onTabChange}
      onEdit={onTabEdit}
      className={styles.terminalTabs}
      items={items}
      destroyInactiveTabPane={false} // 防止不活动的标签页被销毁
      animated={false} // 禁用动画，避免渲染问题
      tabBarGutter={2} // 减少标签间距
      size="small" // 使用小尺寸标签页
      tabBarStyle={{ margin: 0, padding: '4px 4px 0' }} // 减少标签栏内边距
      style={{ width: '100%', height: '100%' }} // 确保Tabs组件填满容器
    />
  );
};

export default TerminalTabs;
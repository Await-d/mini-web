/*
 * @Author: Await
 * @Date: 2025-05-10 21:34:58
 * @LastEditors: Await
 * @LastEditTime: 2025-05-21 20:02:00
 * @Description: 终端页面组件
 */
import React, { useCallback, useEffect, createRef } from 'react';
import { Layout, message } from 'antd';
import { useTerminal } from '../../contexts/TerminalContext';
import TerminalTabs from './components/TerminalTabs';
import TerminalContainers from './components/TerminalContainers';
import TerminalConnectionWrapper from './components/TerminalConnectionWrapper';
import EmptyTerminalGuide from './components/EmptyTerminalGuide';
import TerminalEventManager from './components/TerminalEventManager';
import type { ConnectionChildProps } from './components/TerminalConnectionWrapper';
import { useNavigate, useLocation } from 'react-router-dom';
import { terminalStateRef } from '../../contexts/TerminalContext';
import { connectionAPI, sessionAPI } from '../../services/api';
import useTabFromUrl from './hooks/useTabFromUrl';
import styles from './styles.module.css';

const { Content } = Layout;

/**
 * 终端页面组件
 * 集成终端标签页和终端连接
 * 
 * 标签页命名规则：
 * 统一使用 conn-{connectionId}-session-{sessionId}-{timestamp} 格式
 * 避免使用其他格式，以防止创建重复标签
 * 
 * 标签页创建规则：
 * 1. 所有创建标签的操作都必须通过TerminalContext的openOrActivateTab方法
 * 2. 创建标签页唯一的方式是通过window.dispatchEvent分发open-terminal-tab事件
 * 3. 在TerminalContext中统一处理标签去重和标签格式转换
 */
const Terminal: React.FC = () => {
  // 使用导航和位置钩子
  const navigate = useNavigate();

  // 使用终端上下文
  const { tabs, activeTabKey, addTab, updateTab, closeTab, setActiveTab, clearTabs } = useTerminal();

  // 使用标签页URL参数处理
  // 这个hook会根据URL参数创建或激活标签页
  const urlParams = useTabFromUrl();

  // 标签页切换处理
  const handleTabChange = useCallback((activeKey: string) => {
    setActiveTab(activeKey);

    // 更新URL以反映当前标签
    const tab = tabs.find(t => t.key === activeKey);
    if (tab && tab.connectionId) {
      // 使用replace而不是push，避免在历史记录中创建多个条目
      navigate(
        `/terminal/${tab.connectionId}?session=${tab.sessionId || ''}&tabKey=${activeKey}`,
        { replace: true }
      );
    }
  }, [setActiveTab, tabs, navigate]);

  // 标签页关闭处理
  const handleTabClose = useCallback((tabKey: string) => {
    // 找到要关闭的标签
    const tabToClose = tabs.find(t => t.key === tabKey);
    if (!tabToClose) return;


    // 记录刚关闭的标签信息，防止自动重新创建
    localStorage.setItem('recently_closed_tab', tabKey);

    // 确保关闭标志设置，防止在导航过程中创建新标签
    const isLastTab = tabs.length === 1;
    if (isLastTab) {
      // 是最后一个标签，设置强制关闭标志
      localStorage.setItem('force_closing_last_tab', 'true');
      localStorage.setItem('all_tabs_closed', 'true');

      // 立即清理localStorage中的标签数据
      localStorage.removeItem('terminal_tabs');
      localStorage.removeItem('terminal_active_tab');

      // 先关闭标签，再导航
      closeTab(tabKey);

      // 延迟导航，确保标签关闭完成
      // 使用较长的延迟，确保关闭操作完成
      setTimeout(() => {
        // 导航到不带参数的/terminal路径前，再次检查标签是否已关闭
        if (terminalStateRef.current?.tabs.length === 0) {
          // 导航到不带参数的/terminal路径，使用replace防止返回循环
          navigate('/terminal', { replace: true });

          // 在导航后，设置一个延迟以防止立即创建新标签
          setTimeout(() => {
            // 保持关闭标志一段时间，防止立即创建新标签
            localStorage.setItem('force_closing_last_tab', 'true');
            localStorage.setItem('all_tabs_closed', 'true');
          }, 100);
        }
      }, 200);
      return;
    }

    // 如果关闭当前活动标签但不是最后一个
    if (tabKey === activeTabKey) {
      const remainingTabs = tabs.filter(t => t.key !== tabKey);
      if (remainingTabs.length > 0) {
        // 先激活另一个标签，再关闭当前标签
        const lastTab = remainingTabs[remainingTabs.length - 1];
        setActiveTab(lastTab.key);

        // 更新URL反映当前激活的标签
        if (lastTab.connectionId) {
          navigate(
            `/terminal/${lastTab.connectionId}?session=${lastTab.sessionId || ''}&tabKey=${lastTab.key}`,
            { replace: true }
          );
        }
      }
    }

    // 关闭标签
    closeTab(tabKey);
  }, [tabs, activeTabKey, closeTab, setActiveTab, navigate]);

  // 标签页编辑处理（关闭标签）
  const handleTabEdit = useCallback((targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') {
      handleTabClose(targetKey);
    }
  }, [handleTabClose]);

  // 处理刷新标签页
  const refreshTab = useCallback((tabKey: string) => {
    console.log(`刷新标签: ${tabKey}`);
    // 触发刷新标签事件
    window.dispatchEvent(new CustomEvent('terminal-tab-refresh', { detail: { tabKey } }));
  }, []);

  // 处理复制标签页
  const duplicateTab = useCallback((tabKey: string) => {
    console.log(`复制标签: ${tabKey}`);

    // 查找要复制的标签
    const sourceTab = tabs.find(tab => tab.key === tabKey);
    if (!sourceTab) {
      console.error(`无法找到要复制的标签: ${tabKey}`);
      message.error('无法找到要复制的标签');
      return;
    }

    // 复制标签的基本信息
    const { connectionId, connection, protocol, isGraphical } = sourceTab;

    // 创建会话并添加新标签
    if (connectionId) {
      sessionAPI.createSession(connectionId)
        .then(response => {
          if (response.data.code === 200) {
            const sessionData = response.data.data;
            const newSessionId = sessionData.id;

            // 生成新标签的key
            const newTabKey = `conn-${connectionId}-${newSessionId}-${Date.now()}`;

            // 准备新标签
            addTab({
              key: newTabKey,
              title: `${connection?.name} 会话${newSessionId}`,
              connectionId,
              sessionId: newSessionId,
              connection,
              protocol,
              isConnected: false,
              isGraphical,
              terminalRef: createRef<HTMLDivElement>(),
              webSocketRef: createRef<WebSocket>(),
              messageQueueRef: createRef<any[]>(),
            });

            message.success('已创建复制终端标签');
          } else {
            message.error(response.data.message || '创建会话失败');
          }
        })
        .catch(error => {
          console.error('创建会话出错:', error);
          message.error('创建会话出错');
        });
    }
  }, [tabs, addTab]);

  // 渲染组件
  return (
    <Layout className={styles.terminalLayout}>
      {/* 主内容区域 */}
      <Content className={styles.terminalContent}>
        <TerminalConnectionWrapper
          connectionParams={{
            connectionId: urlParams.connectionId ? Number(urlParams.connectionId) : undefined,
            sessionId: urlParams.sessionParam ? Number(urlParams.sessionParam) : undefined
          }}
        >
          {(connectionProps) => (
            <>
              {/* 标签页集合 */}
              <TerminalTabs
                tabs={connectionProps.tabs || []}
                activeTabKey={connectionProps.activeTabKey}
                onTabEdit={handleTabEdit}
                onTabChange={handleTabChange}
              />

              {/* 终端容器盒子 */}
              <div className={styles.terminalContainerBox}>
                {/* 终端事件管理器 */}
                <TerminalEventManager
                  tabs={connectionProps.tabs || []}
                  activeTabKey={connectionProps.activeTabKey}
                  setActiveTab={handleTabChange}
                  createWebSocketConnection={connectionProps.createWebSocketConnection}
                >
                  {/* 终端容器组件 */}
                  <TerminalContainers
                    tabs={connectionProps.tabs || []}
                    activeTabKey={connectionProps.activeTabKey}
                    isConnected={connectionProps.isConnected}
                    connection={connectionProps.connection}
                    createWebSocketConnection={connectionProps.createWebSocketConnection}
                  />
                </TerminalEventManager>
              </div>
            </>
          )}
        </TerminalConnectionWrapper>
      </Content>
    </Layout>
  );
};

export default Terminal;

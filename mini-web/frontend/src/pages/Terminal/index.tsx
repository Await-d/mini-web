/*
 * @Author: Await
 * @Date: 2025-05-10 21:34:58
 * @LastEditors: Await
 * @LastEditTime: 2025-05-19 19:46:25
 * @Description: 终端页面组件
 */
import React, { useCallback, useEffect } from 'react';
import { Layout, message } from 'antd';
import { useTerminal } from '../../contexts/TerminalContext';
import TerminalTabs from './components/TerminalTabs';
import TerminalContainers from './components/TerminalContainers';
import TerminalConnectionWrapper from './components/TerminalConnectionWrapper';
import TerminalEventManager from './components/TerminalEventManager';
import EmptyTerminalGuide from './components/EmptyTerminalGuide';
import type { ConnectionChildProps } from './components/TerminalConnectionWrapper';
import { useNavigate, useLocation } from 'react-router-dom';
import { terminalStateRef } from '../../contexts/TerminalContext';
import { connectionAPI, sessionAPI } from '../../services/api';
import useTabFromUrl from './hooks/useTabFromUrl';
import { useTerminalInitialization } from './hooks/useTerminalInitialization';
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
  const { state, setActiveTab, closeTab } = useTerminal();
  const { tabs, activeTabKey } = state;

  // 获取终端初始化函数
  const { initializeTerminal } = useTerminalInitialization();

  // 使用标签页URL参数处理
  // 这个hook会根据URL参数创建或激活标签页
  useTabFromUrl();

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

  // 刷新标签页
  const handleRefreshTab = useCallback((tabKey: string) => {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab) {
      message.error('找不到要刷新的标签页');
      return;
    }
    // 触发刷新事件
    window.dispatchEvent(new CustomEvent('terminal-tab-refresh', {
      detail: { tabKey }
    }));

    message.info(`正在刷新标签页: ${tab.title}`);
  }, [tabs]);

  // 复制标签页
  const handleDuplicateTab = useCallback((tabKey: string) => {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab || !tab.connectionId) {
      message.error('找不到要复制的标签页或连接信息不完整');
      return;
    }
    // 创建新会话
    sessionAPI.createSession(tab.connectionId)
      .then(response => {
        if (response.data && response.data.code === 200) {
          const sessionId = response.data.data.id;
          const timestamp = Date.now();
          // 使用统一的标签页键格式
          const newTabKey = `conn-${tab.connectionId}-session-${sessionId}-${timestamp}`;

          // 复制原有连接信息，但使用新的会话ID
          // 确保connectionId存在
          if (tab.connectionId) {
            connectionAPI.getConnection(tab.connectionId)
              .then(connResponse => {
                if (connResponse.data && connResponse.data.code === 200) {
                  const connData = connResponse.data.data;

                  // 移除所有关闭标志
                  localStorage.removeItem('all_tabs_closed');
                  localStorage.removeItem('force_closing_last_tab');
                  localStorage.removeItem('recently_closed_tab');

                  // 派发事件通知TerminalContext创建新标签页
                  window.dispatchEvent(new CustomEvent('open-terminal-tab', {
                    detail: {
                      connectionId: tab.connectionId,
                      sessionId: sessionId,
                      tabKey: newTabKey,
                      connectionName: connData.name,
                      connectionProtocol: connData.protocol,
                      host: connData.host,
                      port: connData.port,
                      username: connData.username,
                      timestamp: timestamp,
                      fromDuplicate: true
                    }
                  }));

                  // 导航到新标签
                  navigate(`/terminal/${tab.connectionId}?session=${sessionId}&tabKey=${newTabKey}`);
                }
              })
              .catch(error => {
                message.error('获取连接信息失败');
                console.error('获取连接信息失败:', error);
              });
          }
        } else {
          message.error(response.data?.message || '创建会话失败');
        }
      })
      .catch(error => {
        message.error('创建会话失败');
        console.error('创建会话失败:', error);
      });
  }, [tabs, navigate]);

  // 渲染组件
  return (
    <Layout className={styles.terminalLayout}>
      {/* 主内容区 */}
      <Content className={styles.terminalContent}>
        {/* 终端连接包装器 */}
        <TerminalConnectionWrapper>
          {(props: ConnectionChildProps) => (
            <>
              {/* 终端事件管理器 - 处理所有终端相关事件 */}
              <TerminalEventManager
                tabs={props.tabs}
                activeTabKey={props.activeTabKey}
                setActiveTab={setActiveTab}
                createWebSocketConnection={props.createWebSocketConnection}
                initTerminal={initializeTerminal}
              >
                {props.tabs && props.tabs.length > 0 ? (
                  <>
                    {/* 标签页 */}
                    <TerminalTabs
                      tabs={props.tabs}
                      activeKey={props.activeTabKey}
                      onTabChange={handleTabChange}
                      onTabEdit={handleTabEdit}
                      onTabClose={handleTabClose}
                      onRefreshTab={handleRefreshTab}
                      onDuplicateTab={handleDuplicateTab}
                      networkLatency={props.networkLatency}
                    />

                    {/* 终端容器 */}
                    <div className={styles.terminalContainerBox}>
                      <TerminalContainers
                        tabs={props.tabs}
                        activeTabKey={props.activeTabKey}
                      />
                    </div>
                  </>
                ) : (
                  /* 空状态指南组件 */
                  <EmptyTerminalGuide />
                )}
              </TerminalEventManager>
            </>
          )}
        </TerminalConnectionWrapper>
      </Content>
    </Layout>
  );
};

export default Terminal;

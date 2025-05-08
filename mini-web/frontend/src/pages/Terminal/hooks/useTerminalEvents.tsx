import { useCallback } from 'react';
import { Modal, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Terminal as XTerm } from 'xterm';
import { useTerminal } from '../../../contexts/TerminalContext';
import { sessionAPI } from '../../../services/api';
import { closeAllSessions } from '../utils';
import type { TerminalTab } from '../../../contexts/TerminalContext';

const { confirm } = Modal;

export const useTerminalEvents = () => {
  const navigate = useNavigate();
  const { state, closeTab, addTab, setActiveTab } = useTerminal();
  const { tabs, activeTabKey } = state;

  // 获取活动标签页
  const getActiveTab = useCallback((): TerminalTab | undefined => {
    return tabs.find(tab => tab.key === activeTabKey);
  }, [activeTabKey, tabs]);

  // 处理关闭所有会话
  const handleCloseSession = useCallback(() => {
    confirm({
      title: '确认关闭',
      icon: <ExclamationCircleOutlined />,
      content: '确定要关闭所有会话并返回连接列表吗？',
      okText: '关闭',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        // 关闭所有标签并返回连接列表
        const result = await closeAllSessions(tabs);
        if (result) {
          message.success('所有会话已关闭');
          navigate('/connections');
        } else {
          message.error('关闭会话失败，请稍后再试');
        }
      },
    });
  }, [navigate, tabs]);

  // 内容复制功能
  const handleCopyContent = useCallback(() => {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.xtermRef.current) {
      message.info('没有可复制的内容');
      return;
    }

    const selection = activeTab.xtermRef.current.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection)
        .then(() => message.success('复制成功'))
        .catch(() => message.error('复制失败'));
    } else {
      message.info('请先选择要复制的内容');
    }
  }, [getActiveTab]);

  // 下载日志功能
  const handleDownloadLog = useCallback(() => {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.xtermRef.current) {
      message.info('没有可下载的内容');
      return;
    }

    const term = activeTab.xtermRef.current;
    const lines = term.buffer.active.getLine(0);
    if (!lines) {
      message.info('没有可下载的内容');
      return;
    }

    const buffer = term.buffer.active;
    const lineCount = buffer.length;
    let logContent = '';

    for (let i = 0; i < lineCount; i++) {
      const line = buffer.getLine(i);
      if (line) {
        logContent += line.translateToString() + '\n';
      }
    }

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${activeTab.sessionId}_${new Date().toISOString().replace(/:/g, '-')}.log`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }, [getActiveTab]);

  // 添加新标签
  const handleAddNewTab = useCallback(() => {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.connection) {
      message.error('无法创建新标签：未找到当前连接信息');
      return;
    }

    const connection = activeTab.connection;

    // 使用当前连接创建新会话
    sessionAPI.createSession(connection.id)
      .then(response => {
        if (response.data && response.data.code === 200) {
          const session = response.data.data;
          // 使用上下文管理器添加标签
          addTab(connection.id, session.id, connection);
        } else {
          message.error('创建会话失败');
        }
      })
      .catch(error => {
        console.error('创建会话失败:', error);
        message.error('创建会话失败，请稍后再试');
      });
  }, [addTab, getActiveTab]);

  // 搜索终端内容
  const handleSearch = useCallback(() => {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.searchAddonRef.current) {
      message.error('搜索功能不可用');
      return;
    }

    const searchText = prompt('请输入搜索内容:');
    if (searchText) {
      activeTab.searchAddonRef.current.findNext(searchText);
    }
  }, [getActiveTab]);

  // 标签页变更处理
  const handleTabChange = useCallback((newActiveKey: string) => {
    setActiveTab(newActiveKey);

    // 确保更新本地存储的会话信息
    setTimeout(() => {
      const activeTab = tabs.find(tab => tab.key === newActiveKey);
      if (activeTab) {
        localStorage.setItem('current_terminal_session', JSON.stringify({
          connectionId: activeTab.connectionId,
          sessionId: activeTab.sessionId,
          tabKey: activeTab.key,
          connectionProtocol: activeTab.connection?.protocol,
          connectionName: activeTab.connection?.name,
          isConnected: activeTab.isConnected
        }));
      }
    }, 0);
  }, [setActiveTab, tabs]);

  // 标签编辑处理（添加/删除标签）
  const handleTabEdit = useCallback((
    targetKey: React.MouseEvent<Element, MouseEvent> | React.KeyboardEvent<Element> | string,
    action: 'add' | 'remove'
  ) => {
    if (action === 'add') {
      handleAddNewTab();
    } else if (action === 'remove') {
      // 确保targetKey是字符串
      const tabKey = typeof targetKey === 'string' ? targetKey : '';
      if (tabKey) {
        // 找到要关闭的标签页
        const tabToClose = tabs.find(tab => tab.key === tabKey);

        // 如果是最后一个标签且它是当前会话，清除localStorage中的会话信息
        if (tabs.length === 1 && tabToClose) {
          const savedSession = localStorage.getItem('current_terminal_session');
          if (savedSession) {
            try {
              const sessionInfo = JSON.parse(savedSession);
              if (sessionInfo.connectionId === tabToClose.connectionId &&
                sessionInfo.sessionId === tabToClose.sessionId) {
                // 清除保存的会话信息
                localStorage.removeItem('current_terminal_session');
              }
            } catch (e) {
              console.error('解析保存的会话信息失败:', e);
            }
          }
        }

        closeTab(tabKey);
      }
    }
  }, [closeTab, handleAddNewTab, tabs]);

  // 切换侧边栏
  const handleToggleSidebar = useCallback(() => {
    // 创建并分发自定义事件
    const event = new CustomEvent('toggle-operation-sidebar', {
      detail: {}
    });
    window.dispatchEvent(event);
  }, []);

  return {
    handleCloseSession,
    handleCopyContent,
    handleDownloadLog,
    handleAddNewTab,
    handleSearch,
    handleTabChange,
    handleTabEdit,
    handleToggleSidebar,
    getActiveTab
  };
};

export default useTerminalEvents;
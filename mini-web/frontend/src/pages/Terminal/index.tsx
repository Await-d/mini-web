import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Spin, Empty } from 'antd';
import { useTerminal } from '../../contexts/TerminalContext';

// 组件 - 静态导入基本组件
import TerminalHeader from './components/TerminalHeader';
import TerminalFooter from './components/TerminalFooter';
import TerminalTabs from './components/TerminalTabs';
import TerminalGuide from './components/TerminalGuide';

// 终端设置组件
import TerminalSettings from './TerminalSettings';
import type { TerminalSettings as TermSettings } from './TerminalSettings';

// 批量命令组件
import QuickCommands from '../../components/QuickCommands';
import BatchCommands from '../../components/BatchCommands';

// 自定义Hooks - 静态导入关键Hooks
import { useTerminalEvents } from './hooks/useTerminalEvents';

// 懒加载连接包装器组件
const TerminalConnectionWrapper = lazy(() =>
  import('./components/TerminalConnectionWrapper')
);

// 样式
import styles from './styles.module.css';
import './Terminal.css'; // 引入额外的终端样式

/**
 * 终端组件
 * 集成了SSH, Telnet, RDP, VNC等多种远程连接协议支持
 */
const Terminal: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quickCommandsVisible, setQuickCommandsVisible] = useState(false);
  const [batchCommandsVisible, setBatchCommandsVisible] = useState(false);

  // 使用状态存储连接参数
  const connectionParams = connectionId ? {
    connectionId: parseInt(connectionId, 10)
  } : undefined;

  // 终端事件处理
  const {
    handleCloseSession,
    handleCopyContent,
    handleDownloadLog,
    handleAddNewTab,
    handleTabChange,
    handleTabEdit,
    handleToggleSidebar,
    getActiveTab
  } = useTerminalEvents();

  const [sessionParams, setSessionParams] = useState({});
  const [hasConnection, setHasConnection] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // 从useTerminal中获取状态
  const { state: terminalState, closeTab, setActiveTab, updateTab } = useTerminal();

  const { tabs, activeTabKey } = terminalState;

  // 添加ref记录已处理的标签
  const initializedTabs = useRef<Set<string>>(new Set());

  // 监听标签变化，强制重新初始化DOM
  useEffect(() => {
    if (!activeTabKey || activeTabKey === 'no-tabs' || tabs.length === 0) return;

    // 强制重新验证所有标签的terminalRef
    tabs.forEach((tab: any) => {
      if (!tab.terminalRef?.current) {
        console.log(`【DOM初始化】检测到标签 ${tab.key} 的terminalRef未初始化，尝试触发DOM更新`);

        // 查找DOM元素并手动设置ref
        const element = document.querySelector(`.terminal-element-${tab.key}`);
        if (element && tab.terminalRef) {
          console.log(`【DOM初始化】手动设置标签 ${tab.key} 的terminalRef`);
          tab.terminalRef.current = element as HTMLDivElement;

          // 如果是当前激活的标签，尝试触发终端初始化
          if (tab.key === activeTabKey && !initializedTabs.current.has(tab.key)) {
            console.log(`【DOM初始化】尝试为激活标签 ${tab.key} 触发终端初始化`);
            initializedTabs.current.add(tab.key);

            // 派发一个全局事件，通知标签准备好了
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('terminal-ready', { detail: { tabKey: tab.key } }));
            }
          }
        }
      }
    });
  }, [tabs, activeTabKey]);

  // 模拟组件加载
  useEffect(() => {
    // 短暂延迟后设置加载完成，确保连接包装器已加载
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  /**
   * 应用终端设置
   */
  const handleApplySettings = (settings: TermSettings, activeTab: any, terminalInstance: any, fitAddon: any) => {
    if (terminalInstance) {
      try {
        // 应用外观设置 - 兼容不同版本的xterm.js API
        if (typeof terminalInstance.setOption === 'function') {
          // 使用setOption API (旧版方法)
          const currentTheme = terminalInstance.getOption?.('theme') || {};
          terminalInstance.setOption('theme', {
            ...currentTheme,
            background: settings.background,
            foreground: settings.foreground,
          });
          terminalInstance.setOption('fontSize', settings.fontSize);
          terminalInstance.setOption('fontFamily', settings.fontFamily);
          terminalInstance.setOption('cursorBlink', settings.cursorBlink);

          // 应用滚动行数设置
          if (settings.scrollback) {
            terminalInstance.setOption('scrollback', settings.scrollback);
          }
        }
        // 直接设置options对象 (新版方法)
        else if (terminalInstance.options) {
          terminalInstance.options.theme = {
            ...(terminalInstance.options.theme || {}),
            background: settings.background,
            foreground: settings.foreground,
          };
          terminalInstance.options.fontSize = settings.fontSize;
          terminalInstance.options.fontFamily = settings.fontFamily;
          terminalInstance.options.cursorBlink = settings.cursorBlink;

          // 应用滚动行数设置
          if (settings.scrollback) {
            terminalInstance.options.scrollback = settings.scrollback;
          }
        }

        console.log('成功应用终端设置:', {
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          background: settings.background,
          foreground: settings.foreground
        });
      } catch (e) {
        console.error('应用终端设置发生错误:', e);
      }

      // 调整终端大小
      if (fitAddon) {
        try {
          fitAddon.fit();
        } catch (e) {
          console.error('调整终端大小失败:', e);
        }
      }
    }
  };

  // 如果正在加载，显示加载指示器
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column'
      }}>
        <Spin size="large" />
        <div style={{ marginTop: '20px' }}>正在加载终端组件...</div>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    }>
      <TerminalConnectionWrapper connectionParams={connectionParams}>
        {({
          hasConnection,
          tabsCount,
          activeTabKey,
          isConnected,
          tabs = [],
          connection,
          fullscreen = false,
          terminalSize,
          networkLatency,
          terminalMode = 'normal',
          sidebarCollapsed = false,
          toggleFullscreen,
          sendDataToServer
        }) => {
          console.log('【主组件调试】终端连接组件就绪，接收到的属性:', {
            hasConnection, tabsCount, activeTabKey, isConnected
          });

          // 无连接ID时显示引导页面
          if (!connectionId && tabsCount === 0) {
            return (
              <TerminalGuide
                onToggleSidebar={handleToggleSidebar}
                sidebarCollapsed={sidebarCollapsed}
              />
            );
          }

          // 获取当前活动标签
          const activeTab = tabs.find((tab: any) => tab.key === activeTabKey);

          return (
            <div className={`${styles.terminalContainer} ${fullscreen ? styles.fullscreen : ''}`}>
              <TerminalHeader
                connection={connection}
                fullscreen={fullscreen}
                onToggleFullscreen={toggleFullscreen}
                onOpenSettings={() => setSettingsVisible(true)}
                onOpenQuickCommands={() => setQuickCommandsVisible(true)}
                onOpenBatchCommands={() => setBatchCommandsVisible(true)}
                terminalMode={terminalMode}
                networkLatency={networkLatency}
                isConnected={isConnected}
                onCopyContent={handleCopyContent}
                onDownloadLog={handleDownloadLog}
                onAddTab={handleAddNewTab}
                onCloseSession={handleCloseSession}
              />

              <div className={styles.terminalContent}>
                <TerminalTabs
                  tabs={tabs}
                  activeKey={activeTabKey}
                  onTabChange={handleTabChange}
                  onTabEdit={handleTabEdit}
                  onAddTab={handleAddNewTab}
                  onTabClose={(key) => handleTabEdit(key, 'remove')}
                />

                <div className={styles.terminalArea}>
                  {hasConnection && tabs.length > 0 ? (
                    tabs.map((tab: any) => {
                      // 添加调试信息
                      console.log(`【DOM调试】渲染标签 ${tab.key}, terminalRef存在: ${!!tab.terminalRef}`);

                      return (
                        <div
                          key={tab.key}
                          className={styles.terminalTabContent}
                          style={{
                            display: tab.key === activeTabKey ? 'flex' : 'none',
                            flex: 1,
                            height: '100%',
                            position: 'relative'
                          }}
                        >
                          <div
                            className={`${styles.terminalWrapper} terminal-element-${tab.key}`}
                            ref={(element) => {
                              // 更明确的ref绑定方式
                              if (element && tab.terminalRef) {
                                console.log(`【DOM调试】成功绑定terminalRef到DOM元素, 标签: ${tab.key}`);
                                // 直接设置current属性，确保引用被正确设置
                                tab.terminalRef.current = element;

                                // 派发一个DOM就绪事件，通知系统terminalRef已准备好
                                if (typeof window !== 'undefined' && !initializedTabs.current.has(tab.key)) {
                                  initializedTabs.current.add(tab.key);
                                  console.log(`【DOM初始化】触发终端准备事件，标签: ${tab.key}`);
                                  window.dispatchEvent(new CustomEvent('terminal-ready', {
                                    detail: { tabKey: tab.key }
                                  }));
                                }
                              }
                            }}
                            style={{
                              width: '100%',
                              height: '100%',
                              position: 'relative',
                              display: 'flex',
                              flex: '1'
                            }}
                          ></div>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.emptyTerminal}>
                      <Empty description="请选择或创建一个连接" />
                    </div>
                  )}
                </div>
              </div>

              <TerminalFooter
                isConnected={isConnected}
                terminalSize={terminalSize}
                networkLatency={networkLatency}
                terminalMode={terminalMode || 'normal'}
                activeConnection={connection}
                onCopyContent={handleCopyContent}
                onDownloadLog={handleDownloadLog}
                onCloseSession={handleCloseSession}
              />

              {/* 设置弹窗 */}
              <TerminalSettings
                visible={settingsVisible}
                onCancel={() => setSettingsVisible(false)}
                onApply={(settings) => {
                  if (activeTab?.xtermRef?.current) {
                    handleApplySettings(
                      settings,
                      activeTab,
                      activeTab.xtermRef.current,
                      activeTab.fitAddonRef?.current
                    );
                  }
                  setSettingsVisible(false);
                }}
              />

              {/* 快速命令面板 */}
              <QuickCommands
                visible={quickCommandsVisible}
                onClose={() => setQuickCommandsVisible(false)}
                onSendCommand={(command) => {
                  if (sendDataToServer && command) {
                    sendDataToServer(command + '\r\n');
                    setQuickCommandsVisible(false);
                  }
                }}
              />

              {/* 批量命令面板 */}
              <BatchCommands
                visible={batchCommandsVisible}
                onClose={() => setBatchCommandsVisible(false)}
                onSendCommands={(commands) => {
                  if (sendDataToServer && commands.length > 0) {
                    // 逐个发送命令，每个命令之间间隔500ms
                    commands.forEach((cmd, index) => {
                      setTimeout(() => {
                        sendDataToServer(cmd + '\r\n');
                      }, index * 500);
                    });
                    setBatchCommandsVisible(false);
                  }
                }}
              />
            </div>
          );
        }}
      </TerminalConnectionWrapper>
    </Suspense>
  );
};

export default Terminal;
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Spin } from 'antd';

// 组件 - 静态导入基本组件
import TerminalHeader from './components/TerminalHeader';
import TerminalFooter from './components/TerminalFooter';
import TerminalTabs from './components/TerminalTabs';
import TerminalGuide from './components/TerminalGuide';

// 懒加载连接包装器组件
const TerminalConnectionWrapper = lazy(() => 
  import('./components/TerminalConnectionWrapper')
);

// 自定义Hooks - 静态导入关键Hooks
import { useTerminalEvents } from './hooks/useTerminalEvents';

// 终端设置组件
import TerminalSettings from './TerminalSettings';
import type { TerminalSettings as TermSettings } from './TerminalSettings';

// 批量命令组件
import QuickCommands from '../../components/QuickCommands';
import BatchCommands from '../../components/BatchCommands';

// 样式
import styles from './styles.module.css';

/**
 * 终端组件
 * 集成了SSH, Telnet, RDP, VNC等多种远程连接协议支持
 */
const Terminal: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // 使用状态存储连接实例
  const [connectionProps, setConnectionProps] = useState<any>(null);
  
  // 处理连接组件就绪时的回调
  const handleConnectionReady = React.useCallback((props: any) => {
    console.log('【主组件调试】终端连接组件就绪，接收到的属性:', {
      hasConnection: !!props.connection,
      tabsCount: props.tabs?.length || 0,
      activeTabKey: props.activeTabKey,
      isConnected: props.isConnected
    });
    setConnectionProps(props);
    setLoading(false);
  }, []);

  // 解构连接实例中的属性
  const connection = connectionProps?.connection;
  const tabs = connectionProps?.tabs || [];
  const activeTabKey = connectionProps?.activeTabKey;
  const fullscreen = connectionProps?.fullscreen || false;
  const isConnected = connectionProps?.isConnected || false;
  const terminalSize = connectionProps?.terminalSize;
  const networkLatency = connectionProps?.networkLatency;
  const terminalMode = connectionProps?.terminalMode || 'normal';
  const sidebarCollapsed = connectionProps?.sidebarCollapsed || false;
  const toggleFullscreen = connectionProps?.toggleFullscreen;
  const sendDataToServer = connectionProps?.sendDataToServer;

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

  /**
   * 应用终端设置
   */
  const handleApplySettings = (settings: TermSettings) => {
    // 获取当前活动标签的终端引用
    const activeTab = tabs.find((tab: any) => tab.key === activeTabKey);
    const terminalInstance = activeTab?.xtermRef.current;
    const fitAddon = activeTab?.fitAddonRef.current;

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

  // 增强的终端全局键盘处理和焦点管理
  useEffect(() => {
    // 只有当存在活动标签页时才执行
    if (!activeTabKey || tabs.length === 0) return;
    
    const activeTab = tabs.find((tab: any) => tab.key === activeTabKey);
    if (!activeTab) return;
    
    console.log('设置终端全局键盘处理...');
    
    // 全局键盘事件处理
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 如果处于输入框中，不处理
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      
      // 检查终端引用
      if (!activeTab.xtermRef?.current) return;
      
      // 处理特殊键
      if (e.key === 'Enter') {
        console.log('全局捕获到Enter键');
        
        // 如果终端未获取焦点，先设置焦点再发送回车
        try {
          activeTab.xtermRef.current.focus();
          setTimeout(() => {
            console.log('模拟回车输入');
            sendDataToServer('\\r\\n');
          }, 50);
        } catch (err) {
          console.error('焦点设置或发送回车失败:', err);
        }
        
        // 阻止事件冒泡
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    // 定期检查并确保终端获得焦点
    const focusInterval = setInterval(() => {
      // 每10秒检查一次终端焦点
      if (activeTab.xtermRef?.current && isConnected) {
        try {
          // 尝试重新获取焦点
          activeTab.xtermRef.current.focus();
          console.log('自动重新获取终端焦点');
        } catch (e) {
          // 静默处理错误
        }
      }
    }, 10000);
    
    // 添加全局键盘事件监听
    window.addEventListener('keydown', handleGlobalKeyDown);
    
    // 组件卸载时清理
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      clearInterval(focusInterval);
    };
  }, [activeTabKey, tabs, isConnected, sendDataToServer]);

  // 如果正在加载，显示加载指示器，同时在后台加载连接组件
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
        
        {/* 在后台加载连接组件，但不显示 */}
        <div style={{ display: 'none' }}>
          <Suspense fallback={null}>
            <TerminalConnectionWrapper onConnectionReady={handleConnectionReady} />
          </Suspense>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`${styles.terminalContainer} ${fullscreen ? styles.fullscreen : ''}`}>
      {/* 无连接ID时显示引导页面，否则显示终端 */}
      {!connectionId && tabs.length === 0 ? (
        <TerminalGuide
          onToggleSidebar={handleToggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
      ) : (
        <>
          <TerminalHeader
            connection={connection}
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
            onOpenSettings={() => setSettingsVisible(true)}
            onCopyContent={handleCopyContent}
            onDownloadLog={handleDownloadLog}
            onAddTab={handleAddNewTab}
            onCloseSession={handleCloseSession}
          />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            <TerminalTabs
              tabs={tabs}
              activeTabKey={activeTabKey}
              onTabChange={handleTabChange}
              onTabEdit={handleTabEdit}
              onTabClose={(key) => handleTabEdit(key, 'remove')}
            />
          </div>
        </>
      )}

      <TerminalFooter
        isConnected={isConnected}
        terminalSize={terminalSize}
        networkLatency={networkLatency}
        terminalMode={terminalMode}
        activeConnection={getActiveTab()?.connection || connection}
      >
        {activeTabKey && tabs.length > 0 && isConnected && getActiveTab()?.connection?.protocol && (
          <>
            {/* 批量命令组件 - 仅在SSH或Telnet协议时显示 */}
            {['ssh', 'telnet'].includes(getActiveTab()?.connection?.protocol || '') && (
              <BatchCommands
                onSendCommand={sendDataToServer}
                protocol={getActiveTab()?.connection?.protocol as 'ssh' | 'telnet' | 'rdp' | 'vnc'}
              />
            )}

            {/* 快捷命令组件 - 仅在SSH或Telnet协议时显示 */}
            {['ssh', 'telnet'].includes(getActiveTab()?.connection?.protocol || '') && (
              <QuickCommands
                onSendCommand={sendDataToServer}
                protocol={getActiveTab()?.connection?.protocol as 'ssh' | 'telnet' | 'rdp' | 'vnc'}
              />
            )}
          </>
        )}
      </TerminalFooter>

      {/* 仅在对话框可见时才渲染终端设置 */}
      {settingsVisible && (
        <TerminalSettings
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          onApply={handleApplySettings}
        />
      )}
    </div>
  );
};

export default Terminal;
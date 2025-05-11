import { useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { initTerminal } from '../utils';

/**
 * 专门处理终端初始化的Hook
 */
export const useTerminalInitialization = () => {
  /**
   * 初始化终端实例
   */
  const initializeTerminal = useCallback((
    activeTab: TerminalTab,
    handleTerminalData: (data: string) => void
  ) => {
    if (!activeTab.terminalRef?.current) {
      console.error('终端容器不存在，无法初始化终端');

      // 分发初始化失败事件
      window.dispatchEvent(new CustomEvent('terminal-error', {
        detail: {
          tabKey: activeTab.key,
          error: '终端容器不存在，无法初始化终端'
        }
      }));

      return false;
    }

    try {
      // 使用新的增强版终端初始化函数
      const terminalInstance = initTerminal(
        activeTab.terminalRef.current,
        handleTerminalData
      );

      if (!terminalInstance) {
        console.error('终端初始化失败');

        // 分发初始化失败事件
        window.dispatchEvent(new CustomEvent('terminal-error', {
          detail: {
            tabKey: activeTab.key,
            error: '终端实例创建失败'
          }
        }));

        return false;
      }

      // 保存终端引用到window对象用于调试
      if (typeof window !== 'undefined') {
        (window as any).lastTerminalInstance = terminalInstance;
      }

      // 保存引用到Tab对象
      const { term, fitAddon, searchAddon } = terminalInstance;
      activeTab.xtermRef.current = term;
      activeTab.fitAddonRef.current = fitAddon;
      activeTab.searchAddonRef.current = searchAddon;

      // 确保messageQueueRef正确初始化
      if (!activeTab.messageQueueRef) {
        activeTab.messageQueueRef = { current: terminalInstance.messageQueue };
      } else {
        activeTab.messageQueueRef.current = terminalInstance.messageQueue;
      }

      // 添加终端就绪事件监听器
      const handleTerminalReady = (event: Event) => {
        const customEvent = event as CustomEvent;
        if (customEvent.detail?.terminalInstance === term) {
          // 终端已就绪，可以进行后续操作
          console.log('终端就绪事件触发，开始后续初始化操作');
          // 分发初始化成功事件
          window.dispatchEvent(new CustomEvent('terminal-initialized', {
            detail: {
              tabKey: activeTab.key,
              terminalInstance
            }
          }));

          // 清除事件监听器
          window.removeEventListener('terminal-ready', handleTerminalReady);
        }
      };

      // 监听终端就绪事件
      window.addEventListener('terminal-ready', handleTerminalReady);

      // 保存刷新间隔引用以便清理
      activeTab.cleanupRef = {
        current: () => {
          clearInterval(refreshInterval);
          window.removeEventListener('terminal-ready', handleTerminalReady);
        }
      };

      return true;
    } catch (error) {
      console.error('终端初始化过程出错:', error);

      // 分发初始化失败事件
      window.dispatchEvent(new CustomEvent('terminal-error', {
        detail: {
          tabKey: activeTab.key,
          error: `终端初始化错误: ${error instanceof Error ? error.message : String(error)}`
        }
      }));

      return false;
    }
  }, []);

  /**
   * 添加终端焦点事件
   */
  const attachTerminalFocusHandlers = useCallback((
    activeTab: TerminalTab
  ) => {
    if (!activeTab.terminalRef?.current) return;

    const handleTerminalFocus = () => {
      if (activeTab.xtermRef?.current) {
        console.log('设置终端焦点');

        try {
          activeTab.xtermRef.current.focus();

          // 发送一个回车确保终端响应
          if (activeTab.webSocketRef?.current &&
            activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
            setTimeout(() => {
              activeTab.webSocketRef.current?.send('\r');
            }, 100);
          }

          // 强制刷新终端显示
          forceTerminalRefresh(activeTab.xtermRef.current);
        } catch (e) {
          console.error('设置终端焦点失败:', e);
        }
      }
    };

    // 移除可能存在的旧事件监听器
    const clone = activeTab.terminalRef.current.cloneNode(true);
    if (activeTab.terminalRef.current.parentNode) {
      activeTab.terminalRef.current.parentNode.replaceChild(clone, activeTab.terminalRef.current);
      activeTab.terminalRef.current = clone as HTMLDivElement;
    }

    // 添加新的事件监听器
    activeTab.terminalRef.current.addEventListener('click', handleTerminalFocus);

    // 添加全局键盘事件处理
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 检查终端是否有焦点
      if (document.activeElement !== document.body &&
        !activeTab.terminalRef.current?.contains(document.activeElement)) {
        return;
      }

      // 确保终端有焦点
      if (activeTab.xtermRef?.current) {
        activeTab.xtermRef.current.focus();
      }
    };

    // 添加全局键盘事件
    document.addEventListener('keydown', handleGlobalKeyDown);

    // 返回清理函数
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      activeTab.terminalRef.current?.removeEventListener('click', handleTerminalFocus);
      // 清理定期刷新
      if (activeTab.cleanupRef?.current) {
        activeTab.cleanupRef.current();
      }
    };
  }, []);

  /**
   * 调整终端大小
   */
  const resizeTerminal = useCallback((
    activeTab: TerminalTab
  ) => {
    if (!activeTab.fitAddonRef?.current || !activeTab.xtermRef?.current) return;

    try {
      activeTab.fitAddonRef.current.fit();

      // 获取新的终端尺寸
      const newCols = activeTab.xtermRef.current.cols;
      const newRows = activeTab.xtermRef.current.rows;

      // 发送调整大小的消息到服务器
      if (activeTab.webSocketRef?.current &&
        activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
        try {
          // 创建调整大小消息
          const resizeMessage = JSON.stringify({
            type: 'resize',
            cols: newCols,
            rows: newRows,
            width: activeTab.terminalRef?.current?.clientWidth || 0,
            height: activeTab.terminalRef?.current?.clientHeight || 0
          });

          // 发送消息
          activeTab.webSocketRef.current.send(resizeMessage);
          console.log('已发送终端调整大小消息', { cols: newCols, rows: newRows });
        } catch (e) {
          console.error('发送终端调整大小消息失败:', e);
        }
      }

      // 刷新终端显示
      try {
        activeTab.xtermRef.current.refresh(0, activeTab.xtermRef.current.rows - 1);

        // 强制刷新终端，解决可能的黑屏问题
        setTimeout(() => {
          if (activeTab.xtermRef?.current) {
            forceTerminalRefresh(activeTab.xtermRef.current);
          }
        }, 100);
      } catch (e) {
        console.error('刷新终端显示失败:', e);
      }
    } catch (error) {
      console.error('调整终端大小失败:', error);
    }
  }, []);

  return {
    initializeTerminal,
    attachTerminalFocusHandlers,
    resizeTerminal
  };
};

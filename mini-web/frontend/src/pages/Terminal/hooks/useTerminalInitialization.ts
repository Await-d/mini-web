import { useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { initializeTerminal } from '../utils';

/**
 * 专门处理终端初始化的Hook
 */
export const useTerminalInitialization = () => {
  /**
   * 初始化终端实例
   */
  const initTerminal = useCallback((
    activeTab: TerminalTab,
    handleTerminalData: (data: string) => void
  ) => {
    if (!activeTab.terminalRef?.current) {
      console.error('【初始化调试】终端容器不存在，无法初始化终端');
      console.log('【初始化调试】终端标签页详情:', {
        key: activeTab.key,
        connectionId: activeTab.connectionId,
        sessionId: activeTab.sessionId,
        terminalRef: {
          exists: !!activeTab.terminalRef,
          hasCurrentValue: !!activeTab.terminalRef?.current
        },
        allRefs: {
          xtermRef: !!activeTab.xtermRef?.current,
          webSocketRef: !!activeTab.webSocketRef?.current,
          fitAddonRef: !!activeTab.fitAddonRef?.current
        }
      });
      return false;
    }

    console.log('【初始化调试】初始化终端实例...');
    
    // 设置关键样式确保终端容器正确显示
    activeTab.terminalRef.current.style.height = '100%';
    activeTab.terminalRef.current.style.width = '100%';
    activeTab.terminalRef.current.style.position = 'relative';
    activeTab.terminalRef.current.style.zIndex = '10';
    activeTab.terminalRef.current.style.overflow = 'hidden';
    activeTab.terminalRef.current.style.display = 'flex';
    activeTab.terminalRef.current.style.flex = '1';
    activeTab.terminalRef.current.style.backgroundColor = '#1e1e1e';
    
    // 清空终端容器内容以避免潜在干扰
    activeTab.terminalRef.current.innerHTML = '';

    // 初始化终端实例
    const terminalInstance = initializeTerminal(
      activeTab.terminalRef.current,
      handleTerminalData
    );

    if (!terminalInstance) {
      console.error('终端初始化失败');
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

    // 立即尝试调整终端大小
    try {
      fitAddon.fit();
    } catch (e) {
      console.error('初始化后调整终端大小失败:', e);
    }

    // 设置终端焦点
    try {
      term.focus();
    } catch (e) {
      console.error('设置终端焦点失败:', e);
    }

    return true;
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
        const resizeMessage = {
          type: 'resize',
          cols: newCols,
          rows: newRows
        };
        activeTab.webSocketRef.current.send(JSON.stringify(resizeMessage));
      }
    } catch (e) {
      console.error('调整终端大小失败:', e);
    }
  }, []);

  return {
    initTerminal,
    attachTerminalFocusHandlers,
    resizeTerminal
  };
};
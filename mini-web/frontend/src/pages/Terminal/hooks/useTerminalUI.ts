import { useCallback, useState } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * 处理终端UI相关逻辑的Hook
 * 从主Hook中分离出UI处理逻辑，简化代码结构
 */
export const useTerminalUI = () => {
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [terminalMode, setTerminalMode] = useState<string>("normal");
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);

  /**
   * 切换全屏模式
   */
  const toggleFullscreen = useCallback(() => {
    setFullscreen(prev => {
      const newValue = !prev;
      
      // 如果需要浏览器API支持全屏，可以在这里添加
      if (typeof document !== 'undefined') {
        try {
          if (newValue) {
            // 进入全屏
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) {
              docEl.requestFullscreen();
            } else if ((docEl as any).mozRequestFullScreen) {
              (docEl as any).mozRequestFullScreen();
            } else if ((docEl as any).webkitRequestFullscreen) {
              (docEl as any).webkitRequestFullscreen();
            } else if ((docEl as any).msRequestFullscreen) {
              (docEl as any).msRequestFullscreen();
            }
          } else {
            // 退出全屏
            if (document.exitFullscreen) {
              document.exitFullscreen();
            } else if ((document as any).mozCancelFullScreen) {
              (document as any).mozCancelFullScreen();
            } else if ((document as any).webkitExitFullscreen) {
              (document as any).webkitExitFullscreen();
            } else if ((document as any).msExitFullscreen) {
              (document as any).msExitFullscreen();
            }
          }
        } catch (e) {
          console.error('切换全屏模式失败:', e);
        }
      }
      
      return newValue;
    });
  }, []);

  /**
   * 调整终端大小
   */
  const resizeTerminal = useCallback((
    activeTab: TerminalTab,
    setTerminalSize: (size: { cols: number, rows: number }) => void,
    prevTerminalSize: { cols: number, rows: number }
  ) => {
    if (!activeTab || !activeTab.fitAddonRef.current || !activeTab.xtermRef.current) return;

    try {
      activeTab.fitAddonRef.current.fit();

      // 获取新尺寸
      const newSize = {
        cols: activeTab.xtermRef.current.cols,
        rows: activeTab.xtermRef.current.rows
      };

      // 发送尺寸调整消息到服务器
      if (activeTab.isConnected &&
        activeTab.webSocketRef.current &&
        activeTab.webSocketRef.current.readyState === WebSocket.OPEN &&
        (newSize.cols !== prevTerminalSize.cols || newSize.rows !== prevTerminalSize.rows)) {
        const resizeMessage = {
          type: 'resize',
          cols: newSize.cols,
          rows: newSize.rows
        };
        activeTab.webSocketRef.current.send(JSON.stringify(resizeMessage));

        // 更新状态
        setTerminalSize(newSize);
      }
    } catch (e) {
      console.error('调整终端大小失败', e);
    }
  }, []);

  /**
   * 创建复制按钮
   */
  const createCopyButton = useCallback((activeTab: TerminalTab) => {
    if (!activeTab.terminalRef.current) return;
    
    // 检查是否已经存在复制按钮
    if (activeTab.terminalRef.current.querySelector('#copy-button')) return;
    
    const copyButton = document.createElement('button');
    copyButton.id = 'copy-button';
    copyButton.innerHTML = '复制内容';
    copyButton.style.position = 'absolute';
    copyButton.style.top = '10px';
    copyButton.style.left = '10px';
    copyButton.style.zIndex = '100';
    copyButton.style.padding = '8px 16px';
    copyButton.style.backgroundColor = '#1677ff';
    copyButton.style.color = 'white';
    copyButton.style.border = 'none';
    copyButton.style.borderRadius = '4px';
    copyButton.style.cursor = 'pointer';
    
    copyButton.onclick = () => {
      // 获取终端内容
      if (activeTab.xtermRef?.current) {
        try {
          const content = activeTab.xtermRef.current.buffer.active.getLine(0)?.translateToString() || '';
          navigator.clipboard.writeText(content)
            .then(() => {
              // 添加复制成功提示
              const message = document.createElement('div');
              message.style.position = 'absolute';
              message.style.top = '50px';
              message.style.left = '10px';
              message.style.backgroundColor = 'rgba(0,0,0,0.7)';
              message.style.color = 'white';
              message.style.padding = '5px 10px';
              message.style.borderRadius = '4px';
              message.style.zIndex = '100';
              message.innerText = '复制成功';
              
              activeTab.terminalRef.current?.appendChild(message);
              
              // 2秒后移除提示
              setTimeout(() => {
                if (message.parentNode) {
                  message.parentNode.removeChild(message);
                }
              }, 2000);
            })
            .catch(err => {
              console.error('复制失败:', err);
            });
        } catch (e) {
          console.error('获取终端内容失败:', e);
        }
      }
    };
    
    activeTab.terminalRef.current.appendChild(copyButton);
  }, []);

  /**
   * 创建清屏按钮
   */
  const createClearButton = useCallback((activeTab: TerminalTab) => {
    if (!activeTab.terminalRef.current) return;
    
    // 检查是否已经存在清屏按钮
    if (activeTab.terminalRef.current.querySelector('#clear-button')) return;
    
    const clearButton = document.createElement('button');
    clearButton.id = 'clear-button';
    clearButton.innerHTML = '清屏';
    clearButton.style.position = 'absolute';
    clearButton.style.top = '10px';
    clearButton.style.left = '120px';
    clearButton.style.zIndex = '100';
    clearButton.style.padding = '8px 16px';
    clearButton.style.backgroundColor = '#1677ff';
    clearButton.style.color = 'white';
    clearButton.style.border = 'none';
    clearButton.style.borderRadius = '4px';
    clearButton.style.cursor = 'pointer';
    
    clearButton.onclick = () => {
      // 清空终端内容
      if (activeTab.xtermRef?.current) {
        try {
          activeTab.xtermRef.current.clear();
          
          // 添加清屏成功提示
          const message = document.createElement('div');
          message.style.position = 'absolute';
          message.style.top = '50px';
          message.style.left = '120px';
          message.style.backgroundColor = 'rgba(0,0,0,0.7)';
          message.style.color = 'white';
          message.style.padding = '5px 10px';
          message.style.borderRadius = '4px';
          message.style.zIndex = '100';
          message.innerText = '已清屏';
          
          activeTab.terminalRef.current?.appendChild(message);
          
          // 2秒后移除提示
          setTimeout(() => {
            if (message.parentNode) {
              message.parentNode.removeChild(message);
            }
          }, 2000);
        } catch (e) {
          console.error('清屏失败:', e);
        }
      }
    };
    
    activeTab.terminalRef.current.appendChild(clearButton);
  }, []);

  return {
    fullscreen,
    setFullscreen,
    sidebarCollapsed,
    setSidebarCollapsed,
    terminalMode,
    setTerminalMode,
    networkLatency,
    setNetworkLatency,
    toggleFullscreen,
    resizeTerminal,
    createCopyButton,
    createClearButton
  };
};
import { useState, useEffect, useCallback } from 'react';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import { handleWebSocketMessage, detectTerminalMode } from '../utils';

/**
 * 处理终端数据的Hook
 */
export const useTerminalData = () => {
  const [terminalMode, setTerminalMode] = useState<string>("normal");
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);

  /**
   * 测量网络延迟
   */
  const measureLatency = useCallback((ws: WebSocket, callback: (latency: number) => void) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    const start = Date.now();
    const latencyMessage = JSON.stringify({ type: 'ping', timestamp: start });
    
    // 创建一个事件处理器用于处理响应
    const handlePong = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong' && data.timestamp === start) {
          const latency = Date.now() - start;
          callback(latency);
          ws.removeEventListener('message', handlePong);
        }
      } catch (e) {
        // 忽略非JSON或不匹配的消息
      }
    };
    
    // 添加临时消息处理器
    ws.addEventListener('message', handlePong);
    
    // 发送ping消息
    try {
      ws.send(latencyMessage);
    } catch (e) {
      console.error('发送延迟测量消息失败:', e);
      ws.removeEventListener('message', handlePong);
    }
    
    // 设置超时以清理事件监听器
    setTimeout(() => {
      ws.removeEventListener('message', handlePong);
    }, 5000);
  }, []);

  /**
   * 检测终端模式
   */
  const detectMode = useCallback((activeTab: TerminalTab) => {
    if (!activeTab.xtermRef?.current) return;
    
    try {
      const mode = detectTerminalMode(activeTab.xtermRef.current);
      setTerminalMode(mode);
      activeTab.terminalMode = mode;
    } catch (e) {
      console.error('检测终端模式失败:', e);
    }
  }, []);

  /**
   * 设置定期检测终端模式
   */
  const setupModeDetection = useCallback((activeTab: TerminalTab) => {
    if (!activeTab.xtermRef?.current) return null;
    
    // 立即检测一次模式
    detectMode(activeTab);
    
    // 设置定期检测
    const interval = setInterval(() => {
      detectMode(activeTab);
    }, 5000);
    
    // 返回清理函数
    return () => {
      clearInterval(interval);
    };
  }, [detectMode]);

  /**
   * 设置定期测量网络延迟
   */
  const setupLatencyMeasurement = useCallback((activeTab: TerminalTab) => {
    if (!activeTab.xtermRef?.current) return null;
    
    // 设置定期测量
    const interval = setInterval(() => {
      if (!activeTab.isConnected || !activeTab.webSocketRef?.current) return;
      
      if (activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
        measureLatency(activeTab.webSocketRef.current, (latency) => {
          setNetworkLatency(latency);
          activeTab.networkLatency = latency;
        });
      }
    }, 10000);
    
    // 返回清理函数
    return () => {
      clearInterval(interval);
    };
  }, [measureLatency]);

  /**
   * 添加终端工具按钮
   */
  const createTerminalTools = useCallback((activeTab: TerminalTab) => {
    if (!activeTab.terminalRef?.current) return;
    
    // 创建复制按钮
    const createCopyButton = () => {
      // 检查是否已经存在复制按钮
      if (activeTab.terminalRef.current?.querySelector('#copy-button')) return;
      
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
        if (!activeTab.xtermRef?.current) return;
        
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
      };
      
      activeTab.terminalRef.current.appendChild(copyButton);
    };
    
    // 创建清屏按钮
    const createClearButton = () => {
      // 检查是否已经存在清屏按钮
      if (activeTab.terminalRef.current?.querySelector('#clear-button')) return;
      
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
        if (!activeTab.xtermRef?.current) return;
        
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
      };
      
      activeTab.terminalRef.current.appendChild(clearButton);
    };
    
    // 创建按钮
    createCopyButton();
    createClearButton();
  }, []);

  return {
    terminalMode,
    setTerminalMode,
    networkLatency, 
    setNetworkLatency,
    measureLatency,
    detectMode,
    setupModeDetection,
    setupLatencyMeasurement,
    createTerminalTools
  };
};
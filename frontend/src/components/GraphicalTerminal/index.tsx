import React, { useEffect, useRef, useState } from 'react';
import { Button, message, Space, Spin } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined, ReloadOutlined } from '@ant-design/icons';
import styles from './styles.module.css';

interface GraphicalTerminalProps {
  protocol: 'rdp' | 'vnc';
  webSocketRef: React.RefObject<WebSocket | null>;
  onResize?: (width: number, height: number) => void;
  onInput?: (data: any) => void;
}

const GraphicalTerminal: React.FC<GraphicalTerminalProps> = ({
  protocol,
  webSocketRef,
  onResize,
  onInput
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screenInfo, setScreenInfo] = useState({ width: 1024, height: 768 });
  const [isConnected, setIsConnected] = useState(false);
  
  // 用于记录鼠标和键盘状态
  const mouseStateRef = useRef({
    isDown: false,
    x: 0,
    y: 0,
    buttons: 0
  });
  
  // 初始化图形终端
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || !webSocketRef.current) return;
    
    setLoading(true);
    setError(null);
    
    // 调整canvas尺寸
    const resizeCanvas = () => {
      if (!containerRef.current || !canvasRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // 保持画布尺寸与容器一致
      canvasRef.current.width = containerWidth;
      canvasRef.current.height = containerHeight;
      
      // 通知尺寸变化
      if (onResize) {
        onResize(containerWidth, containerHeight);
      }
      
      // 发送尺寸调整消息到服务器
      if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
        const resizeMessage = {
          type: 'resize',
          width: containerWidth,
          height: containerHeight
        };
        
        webSocketRef.current.send(JSON.stringify(resizeMessage));
      }
    };
    
    // 调整Canvas尺寸
    resizeCanvas();
    
    // 监听窗口大小变化
    window.addEventListener('resize', resizeCanvas);
    
    // 处理WebSocket消息
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = event.data;
        
        // 记录接收到的消息类型（用于调试）
        console.log(`收到WebSocket消息: 类型=${typeof data}, 长度=${typeof data === 'string' ? data.length : (data instanceof ArrayBuffer ? data.byteLength : 'unknown')}`);
        
        // 检查是否是文本消息
        if (typeof data === 'string') {
          // 对于长消息截取部分显示
          const previewData = data.length > 100 ? data.substring(0, 100) + '...' : data;
          console.log('WebSocket文本消息内容预览:', previewData);
          
          // 检查是否是图形协议消息
          if (data.startsWith(protocol.toUpperCase() + '_')) {
            const parts = data.split(':');
            const messageType = parts[0];
            console.log('图形协议消息类型:', messageType);
            
            switch (messageType) {
              case 'RDP_CONNECTED':
              case 'VNC_CONNECT':
                console.log('连接成功消息');
                setIsConnected(true);
                setLoading(false);
                break;
                
              case 'RDP_INFO':
              case 'VNC_INFO':
                // 显示连接信息
                console.log('收到连接信息:', data);
                // 可以在UI中显示连接信息
                break;
                
              case 'RDP_SCREENSHOT':
              case 'VNC_SCREENSHOT':
                if (parts.length >= 4) {
                  const width = parseInt(parts[1]);
                  const height = parseInt(parts[2]);
                  const base64Image = parts.slice(3).join(':'); // 重新组合可能包含冒号的base64数据
                  
                  console.log(`收到屏幕截图: 宽度=${width}, 高度=${height}, 数据长度=${base64Image.length}`);
                  
                  // 更新屏幕信息
                  setScreenInfo({ width, height });
                  
                  // 绘制图像
                  drawScreenshot(base64Image, width, height);
                  
                  // 如果之前在加载中，现在停止加载
                  if (loading) {
                    setLoading(false);
                  }
                } else {
                  console.error('截图数据格式错误:', parts);
                }
                break;
                
              case 'RDP_ERROR':
              case 'VNC_ERROR':
                // 显示错误信息
                if (parts.length >= 2) {
                  const errorMessage = parts.slice(1).join(':');
                  console.error('远程连接错误:', errorMessage);
                  setError(errorMessage);
                  message.error(`远程连接错误: ${errorMessage}`);
                }
                break;
                
              case 'RDP_NOTICE':
              case 'VNC_NOTICE':
                // 显示通知信息
                if (parts.length >= 2) {
                  const noticeMessage = parts.slice(1).join(':');
                  console.log('远程连接通知:', noticeMessage);
                  message.info(noticeMessage);
                }
                break;
                
              case 'RDP_KEEP_ALIVE':
              case 'VNC_KEEP_ALIVE':
                console.log('收到保活消息');
                // 可以更新连接状态或响应保活
                break;
                
              // 其他消息类型处理
              default:
                console.log('收到未知图形协议消息:', data);
                break;
            }
          } else {
            // 非特定协议前缀的消息
            console.log('收到非协议格式文本消息:', data);
            try {
              // 尝试解析为JSON
              const jsonData = JSON.parse(data);
              console.log('解析为JSON:', jsonData);
              
              // 处理JSON格式的消息
              if (jsonData.type === 'error') {
                console.error('JSON错误消息:', jsonData.error || jsonData.message);
                setError(jsonData.error || jsonData.message || '未知错误');
                message.error(jsonData.error || jsonData.message || '未知错误');
              }
            } catch (e) {
              // 不是JSON格式
              console.log('不是JSON格式的消息');
            }
          }
        } else if (data instanceof ArrayBuffer) {
          // 二进制数据处理
          console.log('收到二进制数据:', data.byteLength, '字节');
          // 二进制数据处理逻辑待实现
        }
      } catch (err) {
        console.error('处理WebSocket消息出错:', err);
      }
    };
    
    // 绘制屏幕截图
    const drawScreenshot = (base64Image: string, width: number, height: number) => {
      if (!canvasRef.current) return;
      
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      // 创建新图像
      const img = new Image();
      img.onload = () => {
        // 清除画布
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        
        // 在canvas中居中显示图像
        const canvas = canvasRef.current!;
        const canvasRatio = canvas.width / canvas.height;
        const imageRatio = width / height;
        
        let drawWidth, drawHeight, offsetX, offsetY;
        
        if (canvasRatio > imageRatio) {
          // Canvas更宽，图像高度适应Canvas
          drawHeight = canvas.height;
          drawWidth = drawHeight * imageRatio;
          offsetX = (canvas.width - drawWidth) / 2;
          offsetY = 0;
        } else {
          // Canvas更高，图像宽度适应Canvas
          drawWidth = canvas.width;
          drawHeight = drawWidth / imageRatio;
          offsetX = 0;
          offsetY = (canvas.height - drawHeight) / 2;
        }
        
        // 绘制图像
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      };
      
      img.onerror = () => {
        console.error('加载图像失败');
        setError('加载远程屏幕图像失败');
      };
      
      // 设置图像源
      img.src = `data:image/png;base64,${base64Image}`;
    };
    
    // 添加WebSocket消息监听器
    if (webSocketRef.current) {
      webSocketRef.current.addEventListener('message', handleWebSocketMessage);
      
      // 请求初始屏幕截图
      if (webSocketRef.current.readyState === WebSocket.OPEN) {
        const requestMessage = { type: 'init', protocol };
        webSocketRef.current.send(JSON.stringify(requestMessage));
      }
    }
    
    // 清理函数
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (webSocketRef.current) {
        webSocketRef.current.removeEventListener('message', handleWebSocketMessage);
      }
    };
  }, [protocol, webSocketRef.current]);
  
  // 处理鼠标事件
  const handleMouseEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) return;
    
    // 获取canvas相对位置
    const rect = canvasRef.current.getBoundingClientRect();
    
    // 计算相对于canvas的坐标
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 计算相对于远程屏幕的坐标
    const relX = Math.floor((x / canvasRef.current.width) * screenInfo.width);
    const relY = Math.floor((y / canvasRef.current.height) * screenInfo.height);
    
    // 更新鼠标状态
    mouseStateRef.current = {
      ...mouseStateRef.current,
      x: relX,
      y: relY
    };
    
    // 发送鼠标移动消息
    const message = new Uint8Array(6);
    message[0] = 2; // 鼠标事件的类型标识
    message[1] = (relX >> 8) & 0xFF;
    message[2] = relX & 0xFF;
    message[3] = (relY >> 8) & 0xFF;
    message[4] = relY & 0xFF;
    message[5] = mouseStateRef.current.buttons;
    
    webSocketRef.current.send(message);
  };
  
  // 处理鼠标按下
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) return;
    
    // 更新按钮状态
    let buttonMask = 0;
    
    // 左键 = 1, 中键 = 2, 右键 = 4
    if (e.button === 0) buttonMask |= 1;
    else if (e.button === 1) buttonMask |= 2;
    else if (e.button === 2) buttonMask |= 4;
    
    mouseStateRef.current.buttons = buttonMask;
    mouseStateRef.current.isDown = true;
    
    // 处理鼠标事件以发送消息
    handleMouseEvent(e);
  };
  
  // 处理鼠标释放
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) return;
    
    // 更新按钮状态
    mouseStateRef.current.buttons = 0;
    mouseStateRef.current.isDown = false;
    
    // 处理鼠标事件以发送消息
    handleMouseEvent(e);
  };
  
  // 处理键盘事件
  const handleKeyEvent = (e: React.KeyboardEvent<HTMLCanvasElement>, isDown: boolean) => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) return;
    
    // 阻止默认行为
    e.preventDefault();
    
    // 获取键码
    const keyCode = e.keyCode || e.which;
    
    // 创建键盘事件消息
    const message = new Uint8Array(4);
    message[0] = 1; // 键盘事件的类型标识
    message[1] = isDown ? 1 : 0;
    message[2] = (keyCode >> 8) & 0xFF;
    message[3] = keyCode & 0xFF;
    
    webSocketRef.current.send(message);
  };
  
  // 请求屏幕刷新
  const requestScreenRefresh = () => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) return;
    
    // 发送屏幕刷新请求
    const message = new Uint8Array(1);
    message[0] = 3; // 屏幕刷新请求的类型标识
    
    webSocketRef.current.send(message);
    message.success('已请求刷新远程屏幕');
  };
  
  // 切换全屏模式
  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
    
    // 调整全屏后的canvas尺寸
    setTimeout(() => {
      if (containerRef.current && canvasRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        
        canvasRef.current.width = containerWidth;
        canvasRef.current.height = containerHeight;
        
        // 通知尺寸变化
        if (onResize) {
          onResize(containerWidth, containerHeight);
        }
        
        // 请求屏幕刷新
        requestScreenRefresh();
      }
    }, 100);
  };

  return (
    <div 
      ref={containerRef}
      className={`${styles.graphicalTerminal} ${fullscreen ? styles.fullscreen : ''}`}
      tabIndex={0} // 使div可以接收焦点和键盘事件
    >
      {loading ? (
        <div className={styles.loading}>
          <Spin size="large" />
          <div className={styles.loadingText}>正在连接到远程桌面...</div>
        </div>
      ) : error ? (
        <div className={styles.error}>
          <div className={styles.errorText}>{error}</div>
          <Button 
            type="primary" 
            onClick={requestScreenRefresh}
            icon={<ReloadOutlined />}
          >
            重试
          </Button>
        </div>
      ) : (
        <>
          <canvas 
            ref={canvasRef}
            className={styles.canvas}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseEvent}
            onKeyDown={(e) => handleKeyEvent(e, true)}
            onKeyUp={(e) => handleKeyEvent(e, false)}
            onContextMenu={(e) => e.preventDefault()} // 阻止右键菜单
            tabIndex={0} // 使canvas可以接收焦点和键盘事件
          />
          <div className={styles.controls}>
            <Space>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={requestScreenRefresh}
                title="刷新屏幕"
              />
              <Button 
                icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} 
                onClick={toggleFullscreen}
                title={fullscreen ? "退出全屏" : "全屏"}
              />
            </Space>
          </div>
        </>
      )}
    </div>
  );
};

export default GraphicalTerminal;
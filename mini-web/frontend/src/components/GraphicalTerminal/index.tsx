import React, { useEffect, useRef, useState } from 'react';
import { Button, message, Space, Spin } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined, ReloadOutlined } from '@ant-design/icons';
import styles from './styles.module.css';

interface GraphicalTerminalProps {
  connectionId: number;
  sessionId: string | number;
  webSocketRef: React.RefObject<WebSocket | null>;
  protocol: string;
  onResize?: (width: number, height: number) => void;
  visible?: boolean;
}

const GraphicalTerminal: React.FC<GraphicalTerminalProps> = ({
  connectionId,
  sessionId,
  webSocketRef,
  protocol = 'vnc',
  onResize,
  visible
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
    if (!containerRef.current || !canvasRef.current || !webSocketRef?.current) return;

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
      if (webSocketRef?.current && webSocketRef.current.readyState === WebSocket.OPEN) {
        const resizeMessage = {
          type: 'resize',
          width: containerWidth,
          height: containerHeight
        };

        console.log('发送尺寸调整消息:', resizeMessage);
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

        // 增强日志调试 - 打印所有消息内容
        console.log(`收到WebSocket消息: 类型=${typeof data}, 长度=${typeof data === 'string' ? data.length : (data instanceof Blob ? '二进制Blob' : (data instanceof ArrayBuffer ? data.byteLength : 'unknown'))}`);

        // 处理Blob数据
        if (data instanceof Blob) {
          console.log('收到Blob数据');
          // 转换Blob为文本或ArrayBuffer
          data.text().then(text => {
            try {
              // 尝试解析为JSON
              const jsonData = JSON.parse(text);
              console.log('Blob转换为JSON:', jsonData);

              // 处理JSON数据
              if (jsonData.type) {
                handleJsonMessage(jsonData);
              }
            } catch (e) {
              // 非JSON文本，可能是普通文本数据
              console.log('Blob数据不是JSON格式:', text);
              handleTextMessage(text);
            }
          }).catch(error => {
            console.error('读取Blob文本失败，尝试作为二进制数据处理:', error);
            // 如果文本读取失败，尝试作为二进制数据处理
            data.arrayBuffer().then(buffer => {
              console.log('转换Blob为ArrayBuffer:', buffer.byteLength, '字节');
              handleBinaryData(buffer);
            }).catch(err => {
              console.error('处理Blob数据失败:', err);
            });
          });
        }
        // 检查是否是文本消息
        else if (typeof data === 'string') {
          // 记录所有文本消息的完整内容
          console.log('WebSocket文本消息完整内容:', data);
          handleTextMessage(data);
        }
        // 处理二进制数据
        else if (data instanceof ArrayBuffer) {
          // 二进制数据处理
          console.log('收到ArrayBuffer二进制数据:', data.byteLength, '字节');
          handleBinaryData(data);
        }
      } catch (err) {
        console.error('处理WebSocket消息出错:', err);
      }
    };

    // 处理文本消息
    const handleTextMessage = (text: string) => {
      // 检查是否是图形协议消息
      if (text.startsWith(protocol.toUpperCase() + '_')) {
        const parts = text.split(':');
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
            console.log('收到连接信息:', text);
            // 可以在UI中显示连接信息
            break;

          case 'RDP_SCREENSHOT':
          case 'VNC_SCREENSHOT':
            console.log(`收到屏幕截图消息，分段数量: ${parts.length}`);

            // 确保消息格式正确
            if (parts.length >= 4) {
              try {
                const width = parseInt(parts[1]);
                const height = parseInt(parts[2]);
                const base64Image = parts.slice(3).join(':'); // 重新组合可能包含冒号的base64数据

                console.log(`解析屏幕截图消息: 宽度=${width}, 高度=${height}, 数据长度=${base64Image.length}`);

                // 确保base64数据有效
                if (base64Image.length > 0) {
                  // 更新屏幕信息
                  setScreenInfo({ width, height });

                  // 绘制图像
                  drawScreenshot(base64Image, width, height);

                  // 如果之前在加载中，现在停止加载
                  if (loading) {
                    console.log('屏幕截图加载成功，结束加载状态');
                    setLoading(false);
                  }
                } else {
                  console.error('屏幕截图base64数据为空');

                  // 更新屏幕信息
                  setScreenInfo({ width, height });

                  // 数据为空时，绘制测试图案
                  drawEmptyScreenshot(width, height);

                  if (loading) {
                    console.log('收到空屏幕数据，绘制测试图案');
                    setLoading(false);
                  }
                }
              } catch (error) {
                console.error('解析屏幕截图消息出错:', error);
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

          // 增加对其他可能的消息类型的处理  
          case 'RDP_KEY':
          case 'VNC_KEY':
            console.log('收到按键响应消息:', text);
            break;

          case 'RDP_MOUSE':
          case 'VNC_MOUSE':
            console.log('收到鼠标响应消息:', text);
            break;

          case 'RDP_RESIZE':
          case 'VNC_RESIZE':
            console.log('收到调整大小响应消息:', text);
            break;

          // 其他消息类型处理
          default:
            console.log('收到未知图形协议消息:', text);
            break;
        }
      } else {
        // 处理非特定协议前缀的消息
        console.log('收到非协议格式文本消息:', text);

        // 尝试解析为JSON
        try {
          const jsonData = JSON.parse(text);
          console.log('解析为JSON:', jsonData);
          handleJsonMessage(jsonData);
        } catch (e) {
          // 不是JSON格式
          console.log('不是JSON格式的消息:', e);

          // 检查消息是否包含base64编码的图像数据
          if (text.includes('data:image')) {
            console.log('检测到内联图像数据');
            try {
              // 尝试直接从内联数据中提取图像
              const img = new Image();
              img.onload = () => {
                if (canvasRef.current) {
                  const ctx = canvasRef.current.getContext('2d');
                  if (ctx) {
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
                  }
                  setLoading(false);
                }
              };
              img.src = text;
            } catch (imgErr) {
              console.error('处理内联图像数据失败:', imgErr);
            }
          }
        }
      }
    };

    // 处理JSON消息
    const handleJsonMessage = (jsonData: any) => {
      // 处理JSON格式的消息
      if (jsonData.type) {
        console.log('JSON消息类型:', jsonData.type);

        switch (jsonData.type) {
          case 'init':
            console.log('收到初始化消息:', jsonData);
            break;

          case 'error':
            console.error('JSON错误消息:', jsonData.error || jsonData.message);
            setError(jsonData.error || jsonData.message || '未知错误');
            message.error(jsonData.error || jsonData.message || '未知错误');
            break;

          case 'screenshot':
            console.log('收到JSON格式屏幕截图消息');
            if (jsonData.data && jsonData.width && jsonData.height) {
              drawScreenshot(jsonData.data, jsonData.width, jsonData.height);
              setLoading(false);
            }
            break;
        }
      }
    };

    // 处理二进制数据
    const handleBinaryData = (buffer: ArrayBuffer) => {
      // 这里可以处理二进制协议数据
      // 例如：解码二进制协议格式的屏幕截图、处理音频数据等
      console.log('处理二进制数据:', buffer.byteLength, '字节');

      // 示例：检查是否为图像数据，根据头部信息
      const headerView = new Uint8Array(buffer, 0, 4);
      if (headerView[0] === 0x89 && headerView[1] === 0x50 && headerView[2] === 0x4E && headerView[3] === 0x47) {
        console.log('检测到PNG图像数据');
        // 处理PNG图像...
      }
      // 其他二进制数据处理...
    };

    // 绘制屏幕截图
    const drawScreenshot = (base64Image: string, width: number, height: number) => {
      if (!canvasRef.current) {
        console.error('Canvas引用不存在，无法绘制屏幕截图');
        return;
      }

      console.log(`尝试绘制屏幕截图，图像数据长度: ${base64Image.length}, 图像数据前缀: ${base64Image.substring(0, 50)}`);
      console.log(`Canvas状态: 宽度=${canvasRef.current.width}, 高度=${canvasRef.current.height}`);

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) {
        console.error('无法获取Canvas 2D上下文，请检查浏览器支持');
        setError('无法绘制远程屏幕，浏览器可能不支持Canvas 2D');
        return;
      }

      // 创建新图像
      const img = new Image();

      // 设置加载超时
      const timeoutId = setTimeout(() => {
        console.error('图像加载超时');
        setError('加载远程屏幕图像超时，请尝试刷新');
      }, 10000);

      img.onload = () => {
        clearTimeout(timeoutId);
        console.log(`图像加载成功，实际尺寸: ${img.width}x${img.height}`);

        try {
          if (canvasRef.current) {
            // 更新画布尺寸以匹配图像
            if (canvasRef.current.width !== width || canvasRef.current.height !== height) {
              console.log(`调整Canvas尺寸: ${canvasRef.current.width}x${canvasRef.current.height} -> ${width}x${height}`);
              canvasRef.current.width = width;
              canvasRef.current.height = height;
            }

            // 清除画布
            ctx.clearRect(0, 0, width, height);

            console.log('开始绘制图像到Canvas');
            ctx.drawImage(img, 0, 0, width, height);
            console.log('图像绘制完成');

            // 验证绘制结果
            try {
              const pixelData = ctx.getImageData(width / 2, height / 2, 1, 1).data;
              console.log(`Canvas中心点像素值: RGBA(${pixelData[0]},${pixelData[1]},${pixelData[2]},${pixelData[3]})`);
            } catch (pixelError) {
              console.error('无法读取Canvas像素数据:', pixelError);
            }

            // 清除任何可能存在的错误状态
            if (error) {
              setError(null);
            }

            // 确保加载状态已更新
            if (loading) {
              setLoading(false);
            }
          }
        } catch (drawError) {
          console.error('绘制图像时出错:', drawError);
          setError('绘制远程屏幕时出错，请刷新重试');
        }
      };

      img.onerror = (errorEvent) => {
        clearTimeout(timeoutId);
        console.error('加载图像失败:', errorEvent);
        setError('加载远程屏幕图像失败，请检查连接或刷新重试');

        // 记录更详细的错误信息以便调试
        console.error('图像加载错误详情:', {
          imgSrcLength: base64Image.length,
          imgSrcPrefix: base64Image.substring(0, 100) + '...',
          width,
          height,
          canvasWidth: canvasRef.current?.width,
          canvasHeight: canvasRef.current?.height,
          errorEvent
        });
      };

      // 检查base64数据格式
      let imgSrc = '';
      try {
        if (base64Image.startsWith('data:image')) {
          // 已经是完整的Data URL
          imgSrc = base64Image;
        } else {
          // 需要添加Data URL前缀
          imgSrc = `data:image/png;base64,${base64Image}`;
        }

        // 验证base64数据有效性
        if (base64Image.length < 100) {
          console.warn('base64图像数据过短，可能无效:', base64Image);
        }

        // 设置图像源
        console.log(`设置图像源，长度: ${imgSrc.length}`);
        img.src = imgSrc;
      } catch (encodeError) {
        console.error('处理图像数据时出错:', encodeError);
        setError('处理远程屏幕数据时出错，请刷新重试');
      }
    };

    // 绘制空屏幕的测试图案
    const drawEmptyScreenshot = (width: number, height: number) => {
      if (!canvasRef.current) {
        console.error('Canvas引用不存在，无法绘制测试图案');
        return;
      }

      console.log(`绘制测试图案，尺寸: ${width}x${height}`);

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) {
        console.error('无法获取Canvas 2D上下文');
        return;
      }

      // 设置画布尺寸
      canvasRef.current.width = width;
      canvasRef.current.height = height;

      // 清除画布
      ctx.clearRect(0, 0, width, height);

      // 绘制测试图案
      ctx.fillStyle = '#0057a8';
      ctx.fillRect(0, 0, width, height);

      // 绘制网格
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;

      // 绘制水平线
      for (let y = 0; y < height; y += 50) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }

      // 绘制垂直线
      for (let x = 0; x < width; x += 50) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();

      // 绘制中心文字
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RDP屏幕数据为空 - 测试图案', width / 2, height / 2 - 20);
      ctx.fillText(`分辨率: ${width} x ${height}`, width / 2, height / 2 + 20);
      ctx.fillText('请检查服务器端截图功能', width / 2, height / 2 + 60);

      console.log('测试图案绘制完成');
    };

    // 添加WebSocket消息监听器
    if (webSocketRef?.current) {
      webSocketRef.current.addEventListener('message', handleWebSocketMessage);

      // 请求初始屏幕截图
      if (webSocketRef.current.readyState === WebSocket.OPEN) {
        // 发送详细的初始化消息
        const requestMessage = {
          type: 'init',
          protocol,
          width: canvasRef.current.width,
          height: canvasRef.current.height,
          options: {
            colorDepth: 16,
            compression: true
          }
        };
        console.log('发送图形终端初始化消息:', requestMessage);

        // 尝试使用二进制协议发送，否则回退到传统方式
        (async () => {
          try {
            // 检查是否有全局的tab信息
            const tabDetail = window.localStorage.getItem('current-terminal-tab');
            if (tabDetail) {
              const tabInfo = JSON.parse(tabDetail);
              const { default: webSocketService } = await import('../../pages/Terminal/services/WebSocketService');
              await webSocketService.sendJsonData(tabInfo, requestMessage);
              console.log('使用二进制协议发送初始化消息成功');
            } else {
              throw new Error('没有找到tab信息');
            }
          } catch (error) {
            console.warn('二进制协议发送失败，使用传统方式:', error);
            webSocketRef.current?.send(JSON.stringify(requestMessage));
          }
        })();

        // 延迟1秒后，如果还在加载状态，发送屏幕截图请求
        setTimeout(() => {
          if (loading && webSocketRef.current?.readyState === WebSocket.OPEN) {
            console.log('发送屏幕截图请求');
            const screenshotRequest = {
              type: 'screenshot',
              timestamp: new Date().getTime()
            };
            webSocketRef.current.send(JSON.stringify(screenshotRequest));
          }
        }, 1000);
      }
    }

    // 清理函数
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (webSocketRef?.current) {
        webSocketRef.current.removeEventListener('message', handleWebSocketMessage);
      }
    };
  }, [containerRef, canvasRef, webSocketRef, protocol]);

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

  // 更新请求刷新函数
  const requestScreenRefresh = () => {
    if (!webSocketRef?.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
      message.error('WebSocket连接未建立，无法请求刷新');
      return;
    }

    console.log('请求刷新屏幕');
    try {
      // 发送刷新请求
      const refreshMessage = {
        type: 'refresh',
        time: Date.now()
      };

      webSocketRef.current.send(JSON.stringify(refreshMessage));
      message.info('已发送屏幕刷新请求');
    } catch (error) {
      console.error('发送刷新请求失败:', error);
      message.error('发送刷新请求失败');
    }
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
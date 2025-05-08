// WebSocket连接与消息处理工具

import { Terminal as XTerm } from 'xterm';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { TerminalMessage } from './terminalConfig';

/**
 * 连接WebSocket
 */
export const connectWebSocket = async (
  sessionId: number, 
  connection: any, 
  term: XTerm | null, 
  tab?: TerminalTab,
  onConnected?: (ws: WebSocket) => void,
  reconnectAttempts: number = 0
): Promise<WebSocket | null> => {
  // 调试信息
  console.log('**********************************************************');
  console.log('**** connectWebSocket函数被调用 ****');
  console.log('**** 详细信息:', {
    时间: new Date().toISOString(),
    会话ID: sessionId,
    连接对象存在: !!connection,
    连接协议: connection?.protocol,
    连接主机: connection?.host,
    连接端口: connection?.port,
    终端对象存在: !!term,
    标签页对象存在: !!tab,
    重连次数: reconnectAttempts
  });
  console.log('**********************************************************');
  
  if (!connection) {
    console.error('connectWebSocket: connection参数为空');
    if (term) term.writeln('\r\n\x1b[31mconnection参数为空\x1b[0m');
    return null;
  }

  const protocol = connection.protocol;
  const token = localStorage.getItem('token') || '';
  
  // 详细的连接日志
  console.log('connectWebSocket函数被调用:', {
    sessionId,
    protocol: connection.protocol,
    host: connection.host, 
    port: connection.port,
    reconnectAttempts
  });
  
  // 获取后端配置
  const savedSettings = localStorage.getItem('terminal_settings');
  let backendUrl = window.location.hostname;
  let backendPort = 8080;

  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);
      backendUrl = settings.backendUrl || backendUrl;
      backendPort = settings.backendPort || backendPort;
      console.log('使用终端设置:', { backendUrl, backendPort });
    } catch (e) {
      console.error('读取终端设置失败:', e);
    }
  } else {
    console.log('使用默认终端设置:', { backendUrl, backendPort });
  }
  
  // 如果尝试次数超过限制，停止重连
  if (reconnectAttempts >= 3) {
    if (term) {
      term.writeln('\r\n\x1b[31m连接失败，已达到最大重试次数\x1b[0m');
      term.writeln('\r\n\x1b[33m可能原因：\x1b[0m');
      term.writeln('\r\n\x1b[33m1. 后端服务未启动或WebSocket端点不可用\x1b[0m');
      term.writeln('\r\n\x1b[33m2. 协议处理程序尚未完全实现\x1b[0m');
      term.writeln('\r\n\x1b[33m3. 会话ID无效或已过期\x1b[0m');
      term.writeln('\r\n\x1b[33m请检查后端服务状态或联系管理员\x1b[0m');
    }
    return null;
  }

  let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let wsUrl = `${wsProtocol}//${backendUrl}:${backendPort}/ws/${protocol}/${sessionId}`;
  if (term) {
    term.writeln(`\r\n\x1b[33m使用WebSocket端点: ${wsUrl}\x1b[0m`);
    term.writeln(`\r\n\x1b[33m尝试连接到 ${wsUrl} (尝试 ${reconnectAttempts + 1}/3)\x1b[0m`);
  }

  // 检查WebSocket是否已存在且处于连接状态
  if (tab?.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
    console.log('WebSocket已连接，无需重新连接');
    return tab.webSocketRef.current;
  }

  // 如果存在旧的WebSocket连接，先关闭
  if (tab?.webSocketRef?.current) {
    try {
      tab.webSocketRef.current.close();
    } catch (e) {
      console.error('关闭旧WebSocket连接失败:', e);
    }
  }

  // 添加短暂延迟，确保后端处理完会话创建
  if (term) term.writeln('\r\n\x1b[33m准备连接WebSocket...\x1b[0m');
  await new Promise(resolve => setTimeout(resolve, 500));

  // 在URL中添加认证令牌
  wsUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;
  if (term) term.writeln(`\r\n\x1b[33m最终WebSocket连接地址: ${wsUrl}\x1b[0m`);

  // 创建WebSocket连接
  let ws: WebSocket;
  try {
    console.log("开始创建WebSocket实例:", wsUrl);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('last_ws_url', wsUrl); // 保存URL便于调试
    }
    
    // 创建WebSocket
    ws = new WebSocket(wsUrl);
    
    // 记录成功信息
    console.log("WebSocket实例创建成功，等待连接...");
    if (term) {
      term.writeln("\r\n\x1b[33mWebSocket实例创建成功，等待连接...\x1b[0m");
      term.writeln(`\r\n\x1b[33m连接到 ${wsUrl}\x1b[0m`);
    }
    
    // 附加调试信息到window对象
    if (typeof window !== 'undefined') {
      (window as any).lastWebSocket = ws;
      (window as any).terminalInfo = { sessionId, protocol: connection.protocol };
    }
    
    // 设置错误处理
    ws.onerror = (error) => {
      console.error("WebSocket连接错误:", error);
      if (term) term.writeln(`\r\n\x1b[31mWebSocket连接错误\x1b[0m`);
    };
  } catch (error) {
    console.error("创建WebSocket实例失败:", error);
    if (term) {
      term.writeln(`\r\n\x1b[31m创建WebSocket实例失败: ${error}\x1b[0m`);
      
      // 提供更详细的错误信息和排查建议
      term.writeln(`\r\n\x1b[33m可能的解决方法:\x1b[0m`);
      term.writeln(`\r\n\x1b[33m1. 检查后端服务是否启动 (端口 ${backendPort})\x1b[0m`);
      term.writeln(`\r\n\x1b[33m2. 检查WebSocket URL是否正确 (${wsUrl})\x1b[0m`);
      term.writeln(`\r\n\x1b[33m3. 检查会话ID是否有效 (${sessionId})\x1b[0m`);
      term.writeln(`\r\n\x1b[33m4. 刷新页面重试\x1b[0m`);
    }
    
    return null;
  }

  // 设置连接超时
  const connectionTimeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      if (term) term.writeln('\r\n\x1b[31m连接超时\x1b[0m');
      ws.close();
    }
  }, 5000);

  // 连接成功时
  ws.onopen = (event) => {
    console.log('WebSocket连接已打开，会话ID:', sessionId);
    clearTimeout(connectionTimeout);

    // 发送认证消息
    try {
      const authMessage = JSON.stringify({
        type: 'auth',
        token: token,
        connectionInfo: {
          protocol: protocol,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          sessionId: sessionId
        }
      });

      ws.send(authMessage);
      if (term) {
        term.writeln('\r\n\x1b[32m发送认证信息成功\x1b[0m');
      }
    } catch (e) {
      if (term) {
        term.writeln('\r\n\x1b[31m发送认证信息失败\x1b[0m');
      }
      console.error('发送认证信息失败:', e);
    }

    // 连接成功消息
    if (term) {
      term.writeln('\r\n\x1b[32m连接成功!\x1b[0m');
      
      // 尝试发送初始数据，确保终端显示正常
      setTimeout(() => {
        try {
          // 清屏并发送欢迎消息
          term.write('\x1bc');
          term.writeln('\r\n\x1b[36m=== 欢迎使用 Mini Web 远程终端 ===\x1b[0m');
          term.writeln('\r\n\x1b[36m正在准备终端环境...\x1b[0m');
          
          // 发送明确的命令确保终端显示提示符
          console.log('发送初始命令以激活终端...');
          ws.send('\r\n');
          // 多尝试几次确保成功
          setTimeout(() => ws.send('\r\n'), 200);
          setTimeout(() => ws.send('echo $SHELL\r\n'), 500);
          setTimeout(() => ws.send('pwd\r\n'), 800);
        } catch (e) {
          console.error('发送初始数据失败:', e);
          term.writeln('\r\n\x1b[31m发送初始数据失败\x1b[0m');
        }
      }, 500);
    }

    // 如果是RDP协议，发送特殊的初始化指令
    if (protocol === 'rdp' && term) {
      try {
        const rdpInitMessage = JSON.stringify({
          type: 'init',
          protocol: 'rdp',
          width: window.innerWidth * 0.9,
          height: window.innerHeight * 0.8
        });
        ws.send(rdpInitMessage);
        term.writeln('\r\n\x1b[36m正在初始化RDP连接...\x1b[0m');
      } catch (e) {
        console.error('发送RDP初始化消息失败:', e);
      }
    }

    // 回调函数
    if (onConnected) {
      onConnected(ws);
    }
  };

  return ws;
};

/**
 * 处理WebSocket消息
 */
export const handleWebSocketMessage = (
  event: MessageEvent, 
  term: XTerm | null, 
  isGraphical: boolean = false
) => {
  if (!term) return;

  // 使用requestAnimationFrame优化渲染性能
  window.requestAnimationFrame(() => {
    try {
      // 记录收到的消息内容，帮助调试
      console.log(`收到WebSocket消息 类型:${typeof event.data}`, 
        typeof event.data === 'string' ? 
          (event.data.length > 100 ? event.data.substring(0, 100) + '...' : event.data) : 
          '二进制数据');
      
      // 记录最后活动时间到window对象，便于调试
      if (typeof window !== 'undefined') {
        (window as any).lastTerminalActivity = Date.now();
      }
      
      if (typeof event.data === 'string') {
        // 只过滤明确的系统消息，减少过滤，确保更多消息显示
        // 注意：因为有的终端回显包含在系统消息内，不能过滤太多
        if (isSystemMessage(event.data) && 
            (event.data === '{"type":"ping"}' || 
             event.data === '{"type":"pong"}')) {
          console.debug('过滤纯系统消息');
          return;
        }
        
        // 尝试解析JSON
        try {
          const message = JSON.parse(event.data) as TerminalMessage;
          
          // 处理不同类型的消息
          if (message.type === 'error') {
            term.writeln(`\r\n\x1b[31m错误: ${message.error || '未知错误'}\x1b[0m`);
            return;
          }
          
          if (message.type === 'ping') {
            console.debug('收到ping消息');
            return;
          }
          
          if (message.type === 'data' && message.data) {
            console.debug('收到data类型消息');
            term.write(message.data);
            return;
          }
          
          if (message.type === 'pong') {
            console.debug('收到pong消息');
            return;
          }
          
          // 未知类型但合法的JSON，直接显示
          console.log('未知类型的JSON消息:', message);
          term.write(event.data);
        } catch (e) {
          // 不是JSON，作为纯文本处理
          console.debug('非JSON格式消息，直接写入终端');
          term.write(event.data);
        }
      } else if (event.data instanceof ArrayBuffer) {
        // 二进制数据处理
        if (isGraphical) {
          console.log('收到二进制数据，长度:', event.data.byteLength);
        } else {
          console.log('非图形模式下收到二进制数据，忽略');
        }
      } else if (event.data instanceof Blob) {
        // 增强的Blob数据处理
        console.log(`处理Blob数据，大小: ${event.data.size} 字节`);
        
        // 使用两种方法处理Blob，确保数据不丢失
        
        // 1. 优先作为文本处理
        const textReader = new FileReader();
        textReader.onload = () => {
          const content = textReader.result as string;
          
          // 检查是否为有效文本内容
          const hasTextContent = content && content.length > 0 && 
                                (content.match(/[\x20-\x7E\r\n\t]/) !== null);
                                
          if (hasTextContent) {
            if (!isSystemMessage(content)) {
              console.log('将Blob处理为文本并写入终端，内容预览:', 
                content.length > 50 ? content.substring(0, 50) + '...' : content);
              term.write(content);
            } else {
              console.log('过滤Blob系统消息');
            }
          } else {
            console.log('Blob文本内容为空或无效，尝试二进制处理');
            // 文本内容无效，尝试二进制处理
            processAsBinary();
          }
        };
        
        // 2. 备用的二进制处理方法
        const processAsBinary = () => {
          const binaryReader = new FileReader();
          binaryReader.onload = () => {
            const arrayBuffer = binaryReader.result as ArrayBuffer;
            if (arrayBuffer) {
              try {
                // 处理二进制数据
                const uint8Array = new Uint8Array(arrayBuffer);
                console.log(`二进制数据大小: ${uint8Array.length} 字节`);
                
                // 检查数据是否包含可打印字符
                let hasPrintable = false;
                for (let i = 0; i < Math.min(uint8Array.length, 100); i++) {
                  if (uint8Array[i] >= 32 && uint8Array[i] <= 126) {
                    hasPrintable = true;
                    break;
                  }
                }
                
                if (hasPrintable || uint8Array.length > 10) {
                  // 尝试以UTF-8解码并写入
                  const decoder = new TextDecoder('utf-8', { fatal: false });
                  const text = decoder.decode(uint8Array);
                  console.log('二进制数据解码为UTF-8，写入终端');
                  term.write(text);
                } else {
                  console.log('二进制数据不包含可打印字符，不写入终端');
                }
              } catch (e) {
                console.error('处理二进制Blob数据失败:', e);
              }
            }
          };
          binaryReader.readAsArrayBuffer(event.data);
        };
        
        // 首先尝试文本处理
        textReader.readAsText(event.data);
      }
    } catch (error) {
      console.error('处理WebSocket消息失败:', error);
      term.writeln(`\r\n\x1b[31m处理消息失败: ${error}\x1b[0m`);
    }
  });
};

/**
 * 判断是否为系统消息
 * 优化过滤逻辑，确保只过滤真正的系统消息
 */
function isSystemMessage(message: string): boolean {
  if (!message) return false;
  
  // 消息长度很短，可能是回车符等，不过滤
  if (message.length <= 2) return false;
  
  // 检查是否为JSON格式的系统消息（仅过滤纯系统消息，不过滤可能包含终端输出的消息）
  const isJsonSystemMsg = (
    message === '{"type":"ping"}' || 
    message === '{"type":"pong"}' || 
    message === '{"type":"system"}' || 
    message.includes('"type":"latency"')
  );
  
  // 特定的系统消息模式
  const isSystemPattern = (
    message.includes('{"camp":') || 
    message.includes('await@Await_Nas')
  );
  
  // 如果消息很长且包含有用内容，不过滤
  if (message.length > 10 && 
      !isJsonSystemMsg && 
      !isSystemPattern) {
    return false;
  }
  
  // 检查是否仅包含ANSI控制字符
  const ansiControlSeqOnly = (
    message.length < 5 && 
    message.includes('\u001b[') && 
    !message.match(/[a-zA-Z0-9\s]{2,}/)
  );
  
  // 更严格的系统消息检测，减少过滤
  return (isJsonSystemMsg && message.length < 30) || 
         (isSystemPattern && message.length < 20) || 
         ansiControlSeqOnly;
}

// 全局导出函数，便于调试
if (typeof window !== 'undefined') {
  setTimeout(() => {
    console.log('**** 将connectWebSocket函数导出到window对象用于调试 ****');
    (window as any).connectWebSocketDebug = connectWebSocket;
    
    // 创建一个简化版的连接助手函数
    (window as any).tryConnect = async (sessionId: number, protocol?: string, host?: string, port?: number, username?: string) => {
      console.log('**** 正在使用简化助手函数尝试连接... ****');
      try {
        // 构建简单的连接对象
        const connection = {
          protocol: protocol || 'ssh', 
          host: host || 'localhost',
          port: port || 22,
          username: username || 'root'
        };
        
        // 使用document.body创建一个临时终端容器
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'fixed';
        tempContainer.style.bottom = '20px';
        tempContainer.style.right = '20px';
        tempContainer.style.width = '400px';
        tempContainer.style.height = '300px';
        tempContainer.style.backgroundColor = '#000';
        tempContainer.style.color = '#fff';
        tempContainer.style.zIndex = '9999';
        tempContainer.style.padding = '10px';
        tempContainer.style.overflow = 'auto';
        tempContainer.style.fontFamily = 'monospace';
        document.body.appendChild(tempContainer);
        
        // 创建一个简单的终端模拟
        const termObj = {
          writeln: (text: string) => {
            const line = document.createElement('div');
            line.textContent = text;
            tempContainer.appendChild(line);
            tempContainer.scrollTop = tempContainer.scrollHeight;
          }
        };
        
        // 尝试WebSocket连接
        tempContainer.textContent = `正在尝试连接: ${protocol}://${host}:${port} (${username})`;
        const ws = await connectWebSocket(
          sessionId,
          connection,
          termObj as any,
          undefined,
          (ws) => {
            tempContainer.textContent += '\n连接成功!';
          },
          0
        );
        
        return ws;
      } catch (error) {
        console.error('**** 简化助手连接失败:', error, ' ****');
        return null;
      }
    };
    
    console.log('**** 调试助手函数已导出，可在控制台使用window.tryConnect(sessionId, protocol, host, port, username)尝试连接 ****');
  }, 1000);
}
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
          // 清屏
          term.write('\x1bc');

          // 发送回车键激活终端
          console.log('发送初始命令激活终端');
          ws.send('\r\n');
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
        // 增强对Shell错误消息的检测
        if (event.data.includes('-sh:') &&
          (event.data.includes('command not found') ||
            event.data.includes('type:') ||
            event.data.includes('not found') ||
            event.data.includes('errno'))) {
          console.debug('过滤Shell错误消息:', event.data);
          return;
        }

        // 检查是否为系统消息
        if (isSystemMessage(event.data)) {
          console.debug('过滤系统消息:', event.data.substring(0, 30) + (event.data.length > 30 ? '...' : ''));
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

          if (message.type === 'ping' || message.type === 'pong') {
            console.debug(`收到${message.type}消息`);
            return;
          }

          if (message.type === 'auth') {
            console.debug('收到认证消息，不显示到终端');
            return;
          }

          if (message.type === 'data' && message.data) {
            console.debug('收到data类型消息');
            term.write(message.data);
            return;
          }

          // 对于其他系统类型消息，不要直接显示
          if (message.type && ['system', 'control', 'latency', 'resize', 'config'].includes(message.type)) {
            console.debug(`收到系统消息类型: ${message.type}`);
            return;
          }

          // 未知类型的JSON，记录但不显示在终端上
          console.log('未知类型的JSON消息:', message);
          // 不再直接写入未知类型的JSON到终端
          return;
        } catch (e) {
          // 不是JSON，但再次检查是否为系统消息
          if (event.data.includes('-sh:') &&
            (event.data.includes('type:') ||
              event.data.includes('command not found') ||
              event.data.includes('not found'))) {
            console.debug('过滤shell错误消息:', event.data);
            return;
          }

          // 检查是否包含常见的系统消息部分
          if (event.data.includes('type:') ||
            event.data.includes('ping') ||
            event.data.includes('auth') ||
            event.data.includes('token') ||
            event.data.includes('{"') ||
            event.data.includes('timestamp')) {
            console.debug('过滤疑似系统消息:', event.data);
            return;
          }

          // 正常的文本消息，直接写入终端
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
            // 增强对Shell错误消息的检测
            if (content.includes('-sh:') &&
              (content.includes('command not found') ||
                content.includes('type:') ||
                content.includes('not found') ||
                content.includes('errno'))) {
              console.log('过滤Shell错误消息 (Blob)');
              return;
            }

            // 检查是否为系统消息或JSON格式
            if (isSystemMessage(content)) {
              console.log('过滤Blob系统消息');
              return;
            }

            // 额外检查是否为JSON格式的系统消息
            try {
              const jsonData = JSON.parse(content);
              if (jsonData.type && ['auth', 'ping', 'pong', 'system', 'control', 'latency', 'resize', 'config'].includes(jsonData.type)) {
                console.log(`过滤JSON系统消息类型: ${jsonData.type}`);
                return;
              }
            } catch (e) {
              // 不是JSON或者解析错误，继续检查是否包含系统消息特征
              if (content.includes('-sh:') &&
                (content.includes('type:') ||
                  content.includes('command not found') ||
                  content.includes('not found'))) {
                console.log('过滤shell错误消息 (Blob)');
                return;
              }

              if (content.includes('type:') ||
                content.includes('ping') ||
                content.includes('auth') ||
                content.includes('token') ||
                content.includes('{"') ||
                content.includes('timestamp')) {
                console.log('过滤疑似系统消息 (Blob)');
                return;
              }
            }

            console.log('将Blob处理为文本并写入终端，内容预览:',
              content.length > 50 ? content.substring(0, 50) + '...' : content);
            term.write(content);
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
 * 优化过滤逻辑，增强对系统消息的识别
 */
function isSystemMessage(message: string): boolean {
  if (!message) return false;

  // 消息长度很短，可能是回车符等，不过滤
  if (message.length <= 2) return false;

  // 检查是否为shell命令错误消息
  if (message.includes('-sh:') &&
    (message.includes('command not found') ||
      message.includes('type:') ||
      message.includes('{"type":'))) {
    return true;
  }

  // 检查JSON格式的系统消息
  if (message.startsWith('{"type":')) {
    try {
      const json = JSON.parse(message);
      if (json.type && ['auth', 'ping', 'pong', 'system', 'control', 'latency', 'resize', 'config'].includes(json.type)) {
        return true;
      }
    } catch (e) {
      // 即使解析失败，也检查是否包含系统消息特征
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('type') &&
        (lowerMessage.includes('auth') ||
          lowerMessage.includes('ping') ||
          lowerMessage.includes('pong') ||
          lowerMessage.includes('system'))) {
        return true;
      }
    }
  }

  // 特定的系统消息模式 - 增强版
  const systemPatterns = [
    '{"camp":',
    'await@await_nas',
    'await@await-nas',
    'await@await_nas',
    '"type":"auth"',
    '"type":"ping"',
    '"type":"pong"',
    '"type":"system"',
    '"type":"latency"',
    '"type":"resize"',
    '"type":"config"',
    '"type":',
    'type:auth',
    'type:ping',
    'type:pong',
    'type:system',
    'type:latency',
    'timesttamp',  // 捕获拼写错误的字段
    'timesstamp',  // 捕获拼写错误的字段
    'timestamp',
    '"token":',
    'command not found'  // 捕获shell错误消息
  ];

  // 匹配任一系统消息模式
  const isSystemPattern = systemPatterns.some(pattern =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );

  // 如果消息很长且不包含系统消息模式，不过滤
  if (message.length > 15 && !isSystemPattern) {
    return false;
  }

  // 检查是否仅包含ANSI控制字符
  const ansiControlSeqOnly = (
    message.length < 5 &&
    message.includes('\u001b[') &&
    !message.match(/[a-zA-Z0-9\s]{2,}/)
  );

  return isSystemPattern || ansiControlSeqOnly;
}

// 移除全局导出函数和调试代码
if (typeof window !== 'undefined') {
  setTimeout(() => {
    console.log('WebSocket准备就绪');
  }, 100);
}
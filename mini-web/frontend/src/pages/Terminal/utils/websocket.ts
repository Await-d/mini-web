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
export function handleWebSocketMessage(event: MessageEvent, term: XTerm, isGraphical?: boolean) {
  console.log('🌐 收到WebSocket消息 类型:' + typeof event.data, '是否图形模式:', isGraphical, '时间:', new Date().toISOString());

  // 特别处理RDP相关消息
  if (typeof event.data === 'string' && event.data.startsWith('RDP_')) {
    console.log('🖼️ 检测到RDP消息:', event.data.substring(0, Math.min(100, event.data.length)) +
      (event.data.length > 100 ? '...' : ''));

    // 进一步检查是否为截图消息
    if (event.data.startsWith('RDP_SCREENSHOT:')) {
      console.log('📷 检测到RDP截图消息:',
        '长度:', event.data.length,
        '分段数:', event.data.split(':').length,
        '头部:', event.data.substring(0, 30) + '...');
    }
  }

  if (!term) {
    console.error('❌ 终端实例不存在，无法处理WebSocket消息');
    return;
  }

  // 处理二进制数据
  if (event.data instanceof Blob) {
    const blobSize = event.data.size;
    console.log('🌐 处理Blob数据，大小:', blobSize, '字节');

    // 小于5KB的Blob尝试转换为文本
    if (blobSize < 5120) {
      const textReader = new FileReader();

      textReader.onload = () => {
        const content = textReader.result as string;
        console.log('🌐 Blob已转换为文本，长度:', content?.length || 0);

        if (content && content.length > 0) {
          try {
            // 记录部分内容以便调试
            const previewContent = content.length > 50 ?
              content.substring(0, 20) + '...' + content.substring(content.length - 20) :
              content;
            const contentChars = Array.from(previewContent.substring(0, 10)).map(c => c.charCodeAt(0));
            console.log('🌐 Blob文本内容预览:', previewContent, '字符码:', contentChars);

            // 检查是否为系统消息
            if (isSystemMessage(content)) {
              console.log('🌐 过滤Blob系统消息');
            } else {
              // 显示内容到终端
              console.log('🌐 将Blob内容显示到终端');
              processTerminalText(content, term);
            }
          } catch (e) {
            console.error('❌ 处理Blob文本内容失败:', e);
          }
        } else {
          console.warn('⚠️ Blob转换为文本内容为空');
        }
      };

      textReader.onerror = (error) => {
        console.error('❌ 读取Blob为文本失败:', error);
      };

      textReader.readAsText(event.data);
    } else {
      console.log('🌐 Blob数据过大，长度:', blobSize, '以二进制处理');
      // 大型二进制数据处理...
    }
    return;
  }

  // 处理文本数据
  if (typeof event.data === 'string') {
    const data = event.data;
    console.log('🌐 收到WebSocket文本消息，长度:', data.length);

    try {
      // 尝试解析为JSON
      if (data.startsWith('{') && data.endsWith('}')) {
        try {
          const jsonData = JSON.parse(data);
          console.log('🌐 解析为JSON成功:', jsonData.type || '未知类型');

          // 根据消息类型进行处理...
          if (jsonData.type) {
            console.log('🌐 处理JSON消息类型:', jsonData.type);
            // 处理不同类型的JSON消息...
          }

          // 如果存在data字段，将其显示在终端
          if (jsonData.data && typeof jsonData.data === 'string') {
            console.log('🌐 在终端中显示JSON中的data字段');
            processTerminalText(jsonData.data, term);
          }

          return;
        } catch (e) {
          console.warn('⚠️ 尝试解析为JSON失败，当作普通文本处理:', e);
        }
      }

      // 不是有效的JSON或未包含type字段，作为普通文本处理
      console.log('🌐 处理为普通文本，内容预览:',
        data.length > 50 ? data.substring(0, 20) + '...' + data.substring(data.length - 20) : data);

      // 检查是否为系统消息
      if (isSystemMessage(data)) {
        console.log('🌐 过滤普通文本系统消息');
      } else {
        processTerminalText(data, term);
      }
    } catch (e) {
      console.error('❌ 处理WebSocket文本消息失败:', e);
    }
    return;
  }

  // 处理其他类型的数据
  console.warn('⚠️ 未知的WebSocket数据类型:', typeof event.data);
}

/**
 * 判断是否为系统消息
 * 优化过滤逻辑，增强对系统消息的识别
 */
function isSystemMessage(message: string): boolean {
  if (!message) return false;

  // 消息长度很短，可能是回车符等，不过滤
  if (message.length <= 2) return false;

  // 重要：确保RDP_SCREENSHOT和VNC_SCREENSHOT消息不被过滤
  if (message.startsWith('RDP_SCREENSHOT:') || message.startsWith('VNC_SCREENSHOT:')) {
    console.log('❗ 检测到重要的屏幕截图消息，不过滤:',
      message.substring(0, Math.min(50, message.length)) + '...');
    console.log('❗ 截图消息详情: 总长度=' + message.length +
      ', 分段数=' + message.split(':').length +
      ', 分段[0]=' + message.split(':')[0] +
      ', 分段[1]=' + message.split(':')[1] +
      ', 分段[2]=' + message.split(':')[2] +
      ', 分段[3+]长度=' + (message.split(':').slice(3).join(':').length));
    return false;
  }

  // 打印调试信息，查看需要过滤的消息
  console.log('🔎 检查是否为系统消息:', message.length > 50 ?
    message.substring(0, 25) + '...' + message.substring(message.length - 25) : message);

  // 检查消息是否包含命令输出 - 如果是，不过滤
  if (message.includes('\n') && message.length > 10) {
    // 检查是否是合法的命令输出（包含终端输出但不是系统消息）
    // 如果文本包含多行且不是纯JSON格式，很可能是合法的命令输出
    if (!message.startsWith('{"') && !message.endsWith('"}')) {
      console.log('🔍 检测到多行命令输出，不过滤');
      return false;
    }
  }

  // 确保命令提示符不被过滤 - 通常包含用户名@主机名和路径
  // 添加更多的模式匹配以避免命令提示符被错误过滤
  if (message.match(/[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+/) || // 匹配任何用户名@主机名格式
    message.match(/\$\s*$/) || // 以$结尾
    message.match(/\#\s*$/) || // 以#结尾
    message.match(/\>\s*$/) || // 以>结尾
    message.match(/[a-zA-Z0-9]+:[\/~][a-zA-Z0-9\/\.]+/) || // 典型的路径格式
    message.match(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+:/) ||  // 如 user@host:path
    message.match(/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+[\s\$\#]/) || // 如 user@host $
    message.match(/[\r\n][a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+:/) || // 包含换行的提示符
    message.match(/[\r\n][a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+[\s\$\#]/)) {
    console.log('🔍 检测到命令提示符或路径，不过滤');
    return false;
  }

  // 检查是否为常见命令输出，如ls、ps等的表格格式输出
  if (message.match(/^\s*[a-zA-Z0-9\-]+\s+[a-zA-Z0-9]+/) &&
    message.includes(' ') &&
    message.split(' ').filter(Boolean).length > 3) {
    console.log('🔍 检测到表格式命令输出，不过滤');
    return false;
  }

  // 命令输出通常包含以下格式，不应被过滤
  if (message.match(/^\w+.*[@#].*[\$#]\s/) ||
    message.match(/^\w+:\/\//) || // URL格式
    message.match(/^[a-zA-Z0-9\/\._-]+$/)) { // 文件路径格式
    console.log('🔍 检测到命令输出或路径格式，不过滤');
    return false; // Unix类型命令提示符或路径，不应被过滤
  }

  // 检查是否为命令结果（通常包含多行文本）
  if ((message.includes('\r\n') || message.includes('\n')) &&
    message.length > 20 &&
    !message.includes('{"')) {
    console.log('🔍 检测到多行命令输出，不过滤');
    return false; // 很可能是命令输出，不应被过滤
  }

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

/**
 * 处理终端文本，确保行正确显示，防止堆叠问题
 * @param text 原始文本
 * @param term xterm终端实例
 */
function processTerminalText(text: string, term: XTerm): void {
  if (!text || !term) {
    console.warn('⚠️ 无法处理文本：文本为空或终端不存在');
    return;
  }

  console.log('🌐 处理终端文本，长度:', text.length);

  // 如果是用户输入的命令（不是从服务器返回的），跳过特殊处理直接写入
  if (text.length < 10 && text.match(/^[a-zA-Z0-9\s]+$/)) {
    console.log('🌐 检测到简单命令输入，直接写入');
    term.write(text);
    return;
  }

  // 特殊处理：检测是否为命令前缀(PS1)，如常见的用户名@主机名:路径$ 格式
  if (text.match(/^[\w-]+@[\w-]+:/) || text.match(/[\r\n][\w-]+@[\w-]+:/)) {
    console.log('🌐 检测到命令提示符，确保正确显示');
    term.write(text);
    return;
  }

  // 系统消息跳过特殊处理，直接写入
  if (isSystemMessage(text)) {
    console.log('🌐 检测到系统消息，直接写入');
    term.writeln(text);
    return;
  }

  // 特殊处理常见命令的输出，如ls、ps等
  if (text.includes('\n') && text.length > 20 && !text.includes('{"type":')) {
    console.log('🌐 检测到可能是命令输出，确保正确显示');
    term.write(text);
    return;
  }

  try {
    // 对于命令提示符特别处理
    if (text.match(/^[\w-]+@[\w-]+:[\~\w\/]+[$#]\s$/)) {
      console.log('🌐 检测到命令提示符，确保正确显示');
      // 确保命令提示符前有换行
      if (!text.startsWith('\r\n') && !text.startsWith('\n')) {
        term.write('\r\n');
      }
      term.write(text);
      return;
    }

    // 对于包含转义序列的文本进行处理
    if (text.includes('\x1b[')) {
      console.log('🌐 检测到ANSI转义序列，保持原样写入');
      term.write(text);
      return;
    }

    // 对于普通多行文本，确保行分隔符处理正确
    if (text.includes('\n') || text.includes('\r\n')) {
      console.log('🌐 处理多行文本，确保换行正确');

      // 分割行并逐行写入
      const lines = text.split(/\r\n|\r|\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i > 0) {
          term.write('\r\n'); // 确保每行前有回车换行
        }
        if (line.length > 0) {
          term.write(line);
        }
      }
      return;
    }

    // 其他情况：直接写入文本
    console.log('🌐 直接写入文本到终端');
    term.write(text);
    console.log('🌐 文本已成功写入终端');
  } catch (e) {
    console.error('❌ 将文本写入终端失败:', e);
  }
}

/**
 * 创建并返回WebSocket连接的助手函数
 */
export function createWebSocketConnection(url: string): WebSocket {
  console.log('🌐 正在创建WebSocket连接:', url);

  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('🌐 WebSocket连接已打开:', url);

    // 发送初始消息以测试连接
    try {
      const testMessage = JSON.stringify({ type: 'connection_test', timestamp: Date.now() });
      ws.send(testMessage);
      console.log('🌐 已发送WebSocket测试消息');
    } catch (e) {
      console.error('🌐 发送WebSocket测试消息失败:', e);
    }
  };

  ws.onclose = (event) => {
    console.log(`🌐 WebSocket连接已关闭:`, {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean
    });
  };

  ws.onerror = (error) => {
    console.error('🌐 WebSocket连接错误:', error);
  };

  return ws;
}

/**
 * 返回WebSocket状态的文字描述
 */
export function getWebSocketStateText(readyState: number): string {
  switch (readyState) {
    case WebSocket.CONNECTING:
      return '正在连接';
    case WebSocket.OPEN:
      return '已连接';
    case WebSocket.CLOSING:
      return '正在关闭';
    case WebSocket.CLOSED:
      return '已关闭';
    default:
      return '未知状态';
  }
}

// 移除全局导出函数和调试代码
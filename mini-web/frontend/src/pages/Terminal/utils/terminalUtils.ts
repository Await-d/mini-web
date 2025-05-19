import { Terminal as XTerm } from 'xterm';

/**
 * 检测终端模式
 * 分析终端输出内容，检测其是否处于某种特殊模式（如vim、less等）
 */
export const detectTerminalMode = (term: XTerm): string => {
  if (!term || !term.buffer) return 'normal';

  // 采样终端的最后几行
  const activeBuffer = term.buffer.active;
  const lastRow = activeBuffer.baseY + activeBuffer.cursorY;

  // 收集最后5行内容进行分析
  const lines: string[] = [];
  for (let i = Math.max(0, lastRow - 5); i <= lastRow; i++) {
    const line = activeBuffer.getLine(i);
    if (line) {
      lines.push(line.translateToString());
    }
  }

  const content = lines.join('\n');

  // 检测是否处于vi/vim编辑模式
  if (content.includes('-- INSERT --') ||
    content.includes('-- VISUAL --') ||
    content.includes('-- NORMAL --') ||
    content.includes('-- REPLACE --') ||
    (content.match(/\d+\s+\d+.*\d+%/) && content.includes("/"))) {
    return 'vim';
  }

  // 检测是否处于less/more查看器
  if (content.includes(':') &&
    (content.includes('(END)') ||
      content.includes('lines') && content.match(/\d+%/))) {
    return 'pager';
  }

  // 检测是否处于htop等进程监控
  if (content.includes('CPU') && content.includes('MEM') &&
    content.includes('PID') && content.includes('USER')) {
    return 'process_monitor';
  }

  // 检测是否处于man手册页
  if ((content.includes('Manual page') || content.includes('SYNOPSIS')) &&
    content.match(/\(\d\)/)) {
    return 'man';
  }

  // 检测是否处于nano编辑器
  if (content.includes('^G Get Help') || content.includes('^X Exit') ||
    content.includes('^O WriteOut')) {
    return 'nano';
  }

  // 检测是否处于MySQL或类似数据库客户端
  if (content.includes('mysql>') || content.includes('postgres=#') ||
    content.includes('sqlite>')) {
    return 'database';
  }

  // 检测是否处于特殊应用程序
  if (content.includes('top - ') && content.includes('load average:')) {
    return 'top';
  }

  // 检测是否处于Git交互式界面
  if (content.includes('CONFLICT') ||
    (content.includes('git') && content.includes('rebase'))) {
    return 'git';
  }

  // 检测是否处于mc文件管理器
  if (content.includes('F1Help') && content.includes('F2Menu') &&
    content.includes('F10Quit')) {
    return 'mc';
  }

  // 默认模式
  return 'normal';
};

/**
 * 向终端写入彩色文本
 * @param term 终端实例
 * @param text 文本内容
 * @param color 文本颜色
 * @param style 文本样式，可以是bold, italic, underline, blink或它们的组合
 */
export const writeColorText = (term: XTerm | null, text: string, color: string = 'white', style?: string) => {
  if (!term) return;

  let colorCode = '37'; // 默认白色

  switch (color.toLowerCase()) {
    case 'red':
      colorCode = '31';
      break;
    case 'green':
      colorCode = '32';
      break;
    case 'yellow':
      colorCode = '33';
      break;
    case 'blue':
      colorCode = '34';
      break;
    case 'magenta':
      colorCode = '35';
      break;
    case 'cyan':
      colorCode = '36';
      break;
    case 'white':
      colorCode = '37';
      break;
    case 'black':
      colorCode = '30';
      break;
    case 'brightred':
      colorCode = '91';
      break;
    case 'brightgreen':
      colorCode = '92';
      break;
    case 'brightyellow':
      colorCode = '93';
      break;
    case 'brightblue':
      colorCode = '94';
      break;
    case 'brightmagenta':
      colorCode = '95';
      break;
    case 'brightcyan':
      colorCode = '96';
      break;
    case 'brightwhite':
      colorCode = '97';
      break;
  }

  // 处理样式
  let styleCode = '';
  if (style) {
    if (style.includes('bold')) styleCode += '1;';
    if (style.includes('italic')) styleCode += '3;';
    if (style.includes('underline')) styleCode += '4;';
    if (style.includes('blink')) styleCode += '5;';
  }

  // 写入带样式的文本
  term.write(`\x1b[${styleCode}${colorCode}m${text}\x1b[0m`);
};

/**
 * 检测终端是否空闲
 * 通过分析终端内容和光标位置判断终端是否处于等待输入状态
 */
export const isTerminalIdle = (term: XTerm): boolean => {
  if (!term || !term.buffer) return true;

  const activeBuffer = term.buffer.active;
  const lastRow = activeBuffer.baseY + activeBuffer.cursorY;

  // 获取光标所在行
  const cursorLine = activeBuffer.getLine(lastRow);
  if (!cursorLine) return true;

  const lineContent = cursorLine.translateToString();

  // 检查光标是否在提示符后面等待输入
  const promptRegex = /[$#>%]\s*$/; // 常见提示符: $, #, >, %
  return promptRegex.test(lineContent);
};

/**
 * 清理终端内容
 * 从终端内容中清除不需要的系统消息和控制序列
 */
export const cleanTerminalContent = (content: string): string => {
  // 删除ANSI转义序列
  let cleaned = content.replace(/\x1b\[[0-9;]*[mK]/g, '');

  // 删除常见的系统消息
  cleaned = cleaned.replace(/{"type":"(ping|pong|system|latency)".*?}/g, '');

  // 删除空行
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');

  return cleaned.trim();
};

/**
 * 生成漂亮的欢迎横幅
 * @param term 终端实例
 * @param title 横幅标题
 * @param protocol 连接协议
 * @param features 特性列表
 */
export const writeWelcomeBanner = (term: XTerm | null, title: string, protocol: string = 'SSH', features: string[] = []) => {
  if (!term) return;

  // 默认特性列表
  if (features.length === 0) {
    features = [
      '支持多种协议：SSH、RDP、VNC、Telnet',
      '多标签页管理，支持会话保存',
      '文件传输，命令批处理',
      '高性能、低延迟的远程操作体验'
    ];
  }

  // 计算横幅宽度 (基于最长特性的长度)
  const maxLength = Math.max(...features.map(f => f.length)) + 10;
  const horizontalBorder = '─'.repeat(maxLength);

  // 写入顶部边框
  writeColorText(term, `┌${horizontalBorder}┐\r\n`, 'yellow');

  // 写入协议信息
  writeColorText(term, `│ `, 'yellow');
  writeColorText(term, `当前协议: ${protocol}`, 'brightgreen', 'bold');
  writeColorText(term, ' '.repeat(maxLength - 11 - protocol.length) + ' │\r\n', 'yellow');
  writeColorText(term, `│${horizontalBorder.replace(/─/g, '─')}│\r\n`, 'yellow');
  features.forEach(feature => {
    writeColorText(term, `│ `, 'yellow');
    writeColorText(term, `✓ `, 'brightgreen', 'bold');
    writeColorText(term, feature, 'white');
    writeColorText(term, ' '.repeat(maxLength - feature.length - 2) + ' │\r\n', 'yellow');
  });

  // 写入底部边框
  writeColorText(term, `└${horizontalBorder}┘\r\n\r\n`, 'yellow');
};
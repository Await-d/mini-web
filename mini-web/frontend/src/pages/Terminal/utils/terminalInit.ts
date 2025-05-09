// 终端初始化函数

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebglAddon } from 'xterm-addon-webgl';
import { SearchAddon } from 'xterm-addon-search';
import { applyTerminalSelectionFixes } from './terminalSelectionManager';
import { createTerminalMessageQueue } from './messageQueue';

// 直接定义常量，避免导入不存在的模块
const TERMINAL_FONT_SIZE = 14;
const TERMINAL_BG_COLOR = '#1e1e1e';
const TERMINAL_FG_COLOR = '#f0f0f0';
const TERMINAL_CURSOR_COLOR = '#ffffff';

// 声明全局window的xterm扩展
declare global {
  interface Window {
    xterm: {
      Terminal: typeof Terminal;
      fit: {
        FitAddon: typeof FitAddon;
      };
      webLinks: {
        WebLinksAddon: typeof WebLinksAddon;
      };
      search: {
        SearchAddon: typeof SearchAddon;
      };
    }
  }
}

/**
 * 创建并初始化xterm终端
 */
export const initializeTerminal = (
  containerRef: HTMLDivElement,
  onData: (data: string) => void
) => {
  try {
    if (!containerRef) {
      console.error('【终端初始化】容器引用为空');
      return null;
    }

    console.log('【终端初始化】开始初始化终端');

    // 使用最新的xterm依赖和插件
    const { Terminal } = window.xterm;
    const { FitAddon } = window.xterm.fit;
    const { WebLinksAddon } = window.xterm.webLinks;
    const { SearchAddon } = window.xterm.search;

    // 确保容器是干净的
    while (containerRef.firstChild) {
      containerRef.removeChild(containerRef.firstChild);
    }

    // 创建终端实例
    const term = new Terminal({
      cursorBlink: true,
      fontSize: TERMINAL_FONT_SIZE,
      fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
      theme: {
        background: TERMINAL_BG_COLOR,
        foreground: TERMINAL_FG_COLOR,
        cursor: TERMINAL_CURSOR_COLOR,
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      allowTransparency: false,
      rows: 30,
      disableStdin: false
    });

    // 创建fit插件
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // 创建搜索插件
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    // 添加网页链接支持
    term.loadAddon(new WebLinksAddon());

    // 打开终端并挂载到DOM
    term.open(containerRef);
    term.focus();

    // 创建消息队列
    const messageQueue: string[] = [];

    // 数据输入事件
    term.onData((data: string) => {
      console.log(`【终端输入】发送数据: ${data.length} 字节`);
      if (onData) {
        onData(data);
      }
    });

    // 设置终端元素样式
    if (term.element) {
      console.log('【终端初始化】设置终端元素样式');

      // 确保终端元素样式
      term.element.style.width = '100%';
      term.element.style.height = '100%';
      term.element.style.position = 'relative';
      term.element.style.overflow = 'hidden';
      term.element.style.backgroundColor = TERMINAL_BG_COLOR;
      term.element.style.zIndex = '2';
    }

    // 尝试调整终端大小
    try {
      console.log('【终端初始化】调整终端尺寸');
      fitAddon.fit();
    } catch (error) {
      console.error('【终端初始化】调整终端尺寸失败:', error);
    }

    return {
      term,
      fitAddon,
      searchAddon,
      messageQueue
    };
  } catch (error) {
    console.error('【终端初始化】发生错误:', error);
    return null;
  }
};
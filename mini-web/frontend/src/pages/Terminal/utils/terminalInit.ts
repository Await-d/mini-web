// 终端初始化函数

import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebglAddon } from 'xterm-addon-webgl';
import { SearchAddon } from 'xterm-addon-search';
import { 
  TERMINAL_FONT_SIZE, 
  TERMINAL_BG_COLOR, 
  TERMINAL_FG_COLOR, 
  TERMINAL_CURSOR_COLOR 
} from './terminalConfig';
import { applyTerminalSelectionFixes } from './terminalSelectionManager';
import { createTerminalMessageQueue } from './messageQueue';

/**
 * 创建并初始化xterm终端
 */
export const initializeTerminal = (
  containerRef: HTMLDivElement | null, 
  onData: (data: string) => void
): { term: XTerm, fitAddon: FitAddon, searchAddon: SearchAddon, messageQueue: any } | null => {
  if (!containerRef) return null;
  
  // 创建XTerm实例并添加调试支持
  const term = new XTerm({
    fontSize: TERMINAL_FONT_SIZE,
    theme: {
      background: TERMINAL_BG_COLOR,
      foreground: TERMINAL_FG_COLOR,
      cursor: TERMINAL_CURSOR_COLOR,
    },
    cursorBlink: true,
    scrollback: 1000,
    // rendererType已弃用，使用默认渲染器
    allowTransparency: false, // 禁用透明度
    disableStdin: false, // 确保不禁用输入
    convertEol: true, // 转换行尾
    screenReaderMode: false, // 禁用屏幕阅读器模式
    rightClickSelectsWord: true, // 右键点击选择单词
    // disableSelectionHelpers: false, // 已弃用的选项
    cursorStyle: 'block', // 使用块状光标，增强可见性
    macOptionIsMeta: true, // 提高键盘兼容性
    altClickMovesCursor: false, // 防止Alt+点击移动光标
    logLevel: 'info' as 'info', // 提高日志级别
    // windowOptions: {
    //   setWinSizeChars: true // 已弃用的选项
    // },
    // windowsMode: true, // 已弃用的选项
  });
  
  // 添加终端调试支持
  console.log('添加终端调试支持...');
  (window as any).debugTerm = term;
  
  // 添加调试按钮到页面
  if (!document.getElementById('term-debug-btn')) {
    const debugBtn = document.createElement('button');
    debugBtn.id = 'term-debug-btn';
    debugBtn.innerText = '调试终端';
    debugBtn.style.position = 'fixed';
    debugBtn.style.bottom = '10px';
    debugBtn.style.right = '10px';
    debugBtn.style.zIndex = '9999';
    debugBtn.style.padding = '5px';
    debugBtn.style.display = 'none'; // 默认隐藏
    
    debugBtn.onclick = () => {
      try {
        console.log('终端对象:', term);
        if (term && term.element) {
          term.write('\r\n\x1b[33m终端调试激活\x1b[0m\r\n');
          term.write('\r\necho "测试命令"\r\n');
        }
      } catch (e) {
        console.error('终端调试失败:', e);
      }
    };
    
    document.body.appendChild(debugBtn);
  }
  
  // 创建FitAddon实例用于调整终端大小
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  
  // 暂时禁用WebLinks插件，因为它可能导致显示问题
  // const webLinksAddon = new WebLinksAddon();
  // term.loadAddon(webLinksAddon);
  console.log('已禁用WebLinksAddon以解决显示问题');
  
  // 创建WebGL插件用于GPU加速
  try {
    const webglAddon = new WebglAddon();
    term.loadAddon(webglAddon);
  } catch (e) {
    console.warn('WebGL加载失败，使用Canvas渲染', e);
  }
  
  // 创建搜索插件
  const searchAddon = new SearchAddon();
  term.loadAddon(searchAddon);
  
  // 在打开终端前设置DOM修复函数
  // 旧版渲染器钩子已移除，改用MutationObserver监控DOM变化
  // 在终端渲染完成后修复DOM层
  setTimeout(() => {
    console.log('渲染后自动修复层级');
    // 隐藏链接层
    const linkLayers = document.querySelectorAll('.xterm-link-layer');
    linkLayers.forEach(layer => {
      if (layer instanceof HTMLElement) {
        layer.style.display = 'none';
        layer.style.visibility = 'hidden';
      }
    });
    
    // 确保选择层正确配置
    const selectionLayers = document.querySelectorAll('.xterm-selection-layer');
    selectionLayers.forEach(layer => {
      if (layer instanceof HTMLElement) {
        layer.style.zIndex = '15'; // 确保选择层在正确的位置
        layer.style.pointerEvents = 'none'; // 不干扰鼠标事件
      }
    });
  }, 100);
  
  // 打开终端
  term.open(containerRef);
  
  // 加载终端优化样式表 - 使用绝对路径确保样式正确加载
  const linkElement = document.createElement('link');
  linkElement.rel = 'stylesheet';
  linkElement.href = '/src/pages/Terminal/styles/terminal-optimize.css';
  document.head.appendChild(linkElement);
  
  // 添加API兼容性封装，统一不同版本xterm.js的API差异
  // 为Term对象添加兼容层
  try {
    // 创建直接访问options的兼容函数
    // 而不是尝试添加可能不存在的方法
    const getTermOption = (key: string): any => {
      // 从options对象安全获取值
      if (term.options && key in term.options) {
        return (term.options as Record<string, any>)[key];
      }
      // 针对常用选项提供默认值
      switch(key) {
        case 'fontSize': return TERMINAL_FONT_SIZE;
        case 'fontFamily': return 'monospace';
        case 'theme': return {
          background: TERMINAL_BG_COLOR,
          foreground: TERMINAL_FG_COLOR,
          cursor: TERMINAL_CURSOR_COLOR
        };
        case 'cursorBlink': return true;
        case 'scrollback': return 1000;
        default: return undefined;
      }
    };
    
    const setTermOption = (key: string, value: any): void => {
      // 安全地设置options对象
      if (term.options) {
        // 使用类型断言确保类型安全
        (term.options as Record<string, any>)[key] = value;
      }
    };
    
    // 将兼容函数存储在window对象上，以便于后续使用
    (window as any).termHelpers = {
      getTermOption,
      setTermOption
    };
    
    console.log('添加终端选项兼容函数到window.termHelpers');
  } catch (e) {
    console.warn('添加API兼容层失败', e);
  }
  
  // 创建全局样式表覆盖系统消息样式
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    .xterm-helper-textarea {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      z-index: -1 !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      pointer-events: auto !important;
    }
    .xterm-helpers {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      z-index: -10 !important;
      width: 0 !important;
      height: 0 !important;
      overflow: visible !important;
      pointer-events: none !important;
    }
    
    /* 系统消息样式 - 使其不可见 */
    .xterm-rows div:has-text("await@Await_Nas") {
      opacity: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
      visibility: hidden !important;
    }
    .xterm-rows div:has-text("\"type\":\"ping\"") {
      opacity: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
      visibility: hidden !important;
    }
    .xterm-rows div:has-text("{\"camp\":") {
      opacity: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
      visibility: hidden !important;
    }
  `;
  document.head.appendChild(styleSheet);
  
  // 打开后立即检查并隐藏链接层
  const linkLayer = containerRef.querySelector('.xterm-link-layer');
  if (linkLayer instanceof HTMLElement) {
    console.log('立即隐藏链接层');
    linkLayer.style.display = 'none';
    linkLayer.style.visibility = 'hidden';
  }
  
  // 设置终端元素样式，使其填充整个容器
  if (term.element) {
    term.element.style.width = '100%';
    term.element.style.height = '100%';
    term.element.style.overflow = 'hidden';
    term.element.style.position = 'relative';
    term.element.style.zIndex = '10'; // 提高z-index值，确保终端在最顶层
    
    // 确保父容器显示正确
    if (containerRef.parentElement) {
      containerRef.parentElement.style.height = '100%';
      containerRef.parentElement.style.position = 'relative';
      containerRef.parentElement.style.display = 'flex';
      containerRef.parentElement.style.flex = '1'; // 确保填充可用空间
      containerRef.parentElement.style.overflow = 'hidden'; // 防止溢出
    }
    
    // 确保containerRef样式正确
    containerRef.style.width = '100%';
    containerRef.style.height = '100%';
    containerRef.style.position = 'relative';
    containerRef.style.overflow = 'hidden';
    
    // 修复：正确配置helper-textarea - 解决选择问题
    const helperTextarea = term.element.querySelector('.xterm-helper-textarea');
    if (helperTextarea instanceof HTMLElement) {
      console.log('配置helper-textarea');
      // 确保textarea样式正确，并修复选择功能
      helperTextarea.style.position = 'absolute'; // 改为absolute而不是fixed，解决选择问题
      helperTextarea.style.opacity = '0';
      helperTextarea.style.width = '100%'; // 使其覆盖整个终端区域，确保能正确捕获选择
      helperTextarea.style.height = '100%'; // 使其覆盖整个终端区域，确保能正确捕获选择
      helperTextarea.style.padding = '0';
      helperTextarea.style.margin = '0';
      helperTextarea.style.border = '0';
      helperTextarea.style.outline = 'none';
      helperTextarea.style.zIndex = '1'; // 提高z-index，确保可以接收事件
      helperTextarea.style.pointerEvents = 'none'; // 允许鼠标事件穿透到下层
      helperTextarea.style.top = '0';
      helperTextarea.style.left = '0';
      helperTextarea.style.background = 'transparent';
      
      // 修复helpers容器
      const helpersContainer = term.element.querySelector('.xterm-helpers');
      if (helpersContainer instanceof HTMLElement) {
        console.log('配置helpers容器');
        helpersContainer.style.position = 'absolute';
        helpersContainer.style.top = '0';
        helpersContainer.style.left = '0';
        helpersContainer.style.zIndex = '2'; // 提高z-index确保正确层叠
        helpersContainer.style.width = '100%'; // 覆盖整个终端区域
        helpersContainer.style.height = '100%'; // 覆盖整个终端区域
        helpersContainer.style.overflow = 'hidden';
        helpersContainer.style.pointerEvents = 'none';
      }
    }
    
    // 使用优化后的方法修复终端层级问题
    const fixTerminalLayers = () => {
      // 立即尝试修复一次
      fixAllLayers();
      
      // 设置MutationObserver监控DOM变化，但限制执行频率
      if (term.element) {
        console.log('设置优化的MutationObserver监控终端DOM变化');
        
        // 使用节流来限制处理频率，防止过多调用
        let isProcessing = false;
        const throttleTime = 500; // 500ms内不重复执行
        
        const observer = new MutationObserver((mutations) => {
          if (!isProcessing) {
            isProcessing = true;
            
            // 只有关键变化才处理，减少不必要的处理
            const needsFixing = mutations.some(m => 
              m.type === 'childList' || 
              (m.type === 'attributes' && 
               (m.attributeName === 'style' || m.attributeName === 'class'))
            );
            
            if (needsFixing) {
              console.log('检测到关键DOM变化，修复终端层级');
              fixAllLayers();
            }
            
            // 设置冷却时间，防止频繁触发
            setTimeout(() => {
              isProcessing = false;
            }, throttleTime);
          }
        });
        
        // 只观察必要的变化
        observer.observe(term.element, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class'],
          characterData: false
        });
        
        // 清理函数 - 使用正确的dispose方法
        // 将清理逻辑添加到window对象供手动调用
        (window as any).disconnectTermObserver = () => {
          observer.disconnect();
          console.log('终端DOM观察器已断开');
        };
        
        // dispose是正确的方法名
        if (typeof term.dispose === 'function') {
          const originalDispose = term.dispose;
          // @ts-ignore - 重写dispose方法
          term.dispose = function() {
            observer.disconnect();
            console.log('终端DOM观察器已断开');
            return originalDispose.apply(this);
          };
        }
      }
    };
    
    // 改进的层级修复函数，减少日志和优化性能
    const fixAllLayers = () => {
      // 获取所有需要修复的层
      const linkLayers = document.querySelectorAll('.xterm-link-layer');
      const textLayers = document.querySelectorAll('.xterm-text-layer');
      const cursorLayers = document.querySelectorAll('.xterm-cursor-layer');
      
      // 只在第一次或数量变化时记录详细日志
      const logDetailed = window.sessionStorage.getItem('term_layers_fixed') !== 'true';
      
      // 处理link-layer - 完全禁用它们
      if (linkLayers.length > 0) {
        if (logDetailed) console.log(`处理${linkLayers.length}个xterm-link-layer`);
        
        // 添加全局样式，一次性禁用所有link-layer，而不是逐个设置
        if (!document.getElementById('disable-link-layers')) {
          const styleEl = document.createElement('style');
          styleEl.id = 'disable-link-layers';
          styleEl.innerHTML = `
            .xterm-link-layer {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              pointer-events: none !important;
              z-index: -1 !important;
            }
          `;
          document.head.appendChild(styleEl);
        }
      }
      
      // 确保文本层可见
      if (textLayers.length > 0 && logDetailed) {
        console.log(`确保${textLayers.length}个xterm-text-layer可见`);
        textLayers.forEach(layer => {
          if (layer instanceof HTMLElement) {
            layer.style.opacity = '1';
            layer.style.visibility = 'visible';
            layer.style.zIndex = '30';
          }
        });
      }
      
      // 确保光标层可见
      if (cursorLayers.length > 0 && logDetailed) {
        console.log(`确保${cursorLayers.length}个xterm-cursor-layer可见`);
        cursorLayers.forEach(layer => {
          if (layer instanceof HTMLElement) {
            layer.style.opacity = '1';
            layer.style.visibility = 'visible';
            layer.style.zIndex = '31';
          }
        });
      }
      
      // 标记已经修复过，减少日志输出
      if (logDetailed) {
        window.sessionStorage.setItem('term_layers_fixed', 'true');
      }
    };
    
    // 立即执行一次
    fixTerminalLayers();
    
    // 设置多次延迟尝试，确保在DOM完成渲染后也能修复
    [100, 500, 1000, 2000].forEach(delay => {
      setTimeout(fixAllLayers, delay);
    });
  }
  
  // 测试终端渲染
  term.writeln('\r\n\x1b[33m终端初始化中...\x1b[0m');
  term.writeln('\r\n\x1b[32m终端已准备就绪\x1b[0m');
  
  // 增强的键盘输入处理
  console.log('设置增强的键盘输入处理...');
  
  // 原始数据处理
  term.onData(data => {
    console.log('终端捕获原始输入:', data.length > 10 ? data.substring(0, 10) + '...' : data);
    
    // 特殊键处理
    if (data === '\r') {
      // 回车键 - 发送\r\n组合以确保正确处理
      console.log('转换回车为CRLF');
      onData('\r\n');
    } else if (data.charCodeAt(0) === 127) {
      // 退格键 - 确保正确处理
      console.log('处理退格键');
      onData(data);
    } else {
      // 正常数据直接传递
      onData(data);
    }
  });
  
  // 应用选择修复
  console.log('应用终端选择修复...');
  applyTerminalSelectionFixes(term);
  
  // 设置输入焦点
  console.log('强制设置终端输入焦点...');
  setTimeout(() => {
    try {
      term.focus();
      console.log('终端焦点已设置');
    } catch (e) {
      console.error('设置终端焦点失败:', e);
    }
  }, 300);
  
  // 创建消息队列，优化渲染性能
  console.log('创建终端消息队列...');
  const messageQueue = createTerminalMessageQueue((messages: string[]) => {
    if (messages.length > 0) {
      // 合并消息并一次性写入，减少重绘次数
      const combinedMessage = messages.join('');
      term.write(combinedMessage);
    }
  }, {
    maxBatchSize: 30, // 最大批处理消息数量
    processingInterval: 16 // 约60fps的处理间隔
  });
  
  // 立即尝试一次调整大小
  try {
    console.log('尝试立即调整终端大小...');
    fitAddon.fit();
  } catch (e) {
    console.warn('初始调整终端大小失败，将在DOM渲染后重试', e);
  }
  
  // 设置多次调整，确保在不同时机都能正确适应大小
  setTimeout(() => {
    try {
      console.log('100ms后尝试调整终端大小...');
      fitAddon.fit();
      term.writeln('\r\n\x1b[32m终端大小已调整\x1b[0m');
    } catch (e) {
      console.error('调整终端大小失败', e);
    }
  }, 100);
  
  // 额外的调整尝试，确保在DOM完全加载后适配
  setTimeout(() => {
    try {
      console.log('500ms后尝试调整终端大小...');
      // 修复终端布局
      if (term.element) {
        term.element.style.width = '100%';
        term.element.style.height = '100%';
        containerRef.style.width = '100%';
        containerRef.style.height = '100%';
      }
      
      // 调整终端大小
      fitAddon.fit();
      console.log('终端大小再次调整完成');
      
      // 尝试聚焦终端
      term.focus();
    } catch (e) {
      console.error('后续调整终端大小失败', e);
    }
  }, 500);
  
  // 添加更多延迟尝试，确保在不同渲染阶段都有机会调整
  setTimeout(() => {
    try {
      console.log('1000ms后尝试调整终端大小...');
      
      // 强制设置xterm-screen的尺寸
      const screen = containerRef.querySelector('.xterm-screen');
      if (screen instanceof HTMLElement) {
        screen.style.width = '100%';
        screen.style.height = '100%';
      }
      
      // 调整终端行和列数以适应容器
      const { clientWidth, clientHeight } = containerRef;
      
      // API兼容性修复：安全地获取字体大小
      let fontSize = TERMINAL_FONT_SIZE;
      try {
        // 直接使用options属性
        if (term.options && 'fontSize' in term.options) {
          fontSize = (term.options as Record<string, any>)['fontSize'] || TERMINAL_FONT_SIZE;
        } 
        // 或者使用前面定义的辅助函数
        else if ((window as any).termHelpers && typeof (window as any).termHelpers.getTermOption === 'function') {
          fontSize = (window as any).termHelpers.getTermOption('fontSize') || TERMINAL_FONT_SIZE;
        }
      } catch (err) {
        console.warn('获取终端字体大小失败，使用默认值', err);
      }
      
      // 计算并调整终端大小
      const cols = Math.floor(clientWidth / fontSize);
      const rows = Math.floor(clientHeight / fontSize / 1.5);
      
      if (cols > 10 && rows > 5) {
        term.resize(cols, rows);
        console.log(`手动调整终端大小: ${cols}x${rows}`);
      }
      
      // 调整终端大小
      fitAddon.fit();
      console.log('终端大小最终调整完成');
      
      // 再次尝试聚焦终端，确保获得焦点
      term.focus();
      console.log('设置终端焦点');
      
      // 模拟用户输入，确保终端响应
      term.write('\r');
    } catch (e) {
      console.error('最终调整终端大小失败', e);
    }
  }, 1000);
  
  return { term, fitAddon, searchAddon, messageQueue };
};
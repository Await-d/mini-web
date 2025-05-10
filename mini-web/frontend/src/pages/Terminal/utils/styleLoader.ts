/**
 * 终端样式加载器
 * 用于加载和管理终端相关的样式表
 */

/**
 * 加载终端修复样式表
 * 确保在应用启动时尽早加载样式，以防止滚动区域高度问题
 */
export const loadTerminalFixStyles = (): HTMLLinkElement | null => {
  try {
    // 检查样式是否已加载
    if (document.getElementById('terminal-fix-styles')) {
      console.log('终端修复样式已加载，跳过');
      return null;
    }
    
    // 创建链接元素
    const linkElement = document.createElement('link');
    linkElement.id = 'terminal-fix-styles';
    linkElement.rel = 'stylesheet';
    linkElement.type = 'text/css';
    
    // 设置样式表路径 - 使用相对路径
    const styleUrl = '/src/pages/Terminal/styles/terminal-fix.css';
    linkElement.href = styleUrl;
    
    // 添加到文档头部
    document.head.appendChild(linkElement);
    
    console.log('成功加载终端修复样式表');
    return linkElement;
  } catch (error) {
    console.error('加载终端修复样式表失败:', error);
    
    // 尝试备用方法：内联样式
    try {
      const styleElement = document.createElement('style');
      styleElement.id = 'terminal-fix-styles-inline';
      styleElement.textContent = `
        /* 全局强制覆盖 xterm-scroll-area 高度 */
        .xterm-scroll-area {
          height: 720px !important;
          max-height: 720px !important;
          overflow: hidden !important;
          position: absolute !important;
          z-index: 2 !important;
        }
      `;
      document.head.appendChild(styleElement);
      console.log('使用内联样式作为备用修复');
    } catch (inlineError) {
      console.error('添加内联样式失败:', inlineError);
    }
    
    return null;
  }
};

/**
 * 在应用启动时自动加载样式
 */
export const autoloadStyles = (): void => {
  // 在DOM加载完成后加载样式
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadTerminalFixStyles();
    });
  } else {
    // DOM已加载，直接执行
    loadTerminalFixStyles();
  }
};

// 自动加载样式
autoloadStyles();

// 导出到window对象
if (typeof window !== 'undefined') {
  (window as any).loadTerminalFixStyles = loadTerminalFixStyles;
}
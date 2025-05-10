/**
 * 终端高度修复脚本
 * 该脚本在全局范围内运行，持续监控并修复xterm-scroll-area高度问题
 */

// 在启动时立即执行修复
(function() {
  console.log('[终端修复] 全局修复脚本已加载');
  
  // 添加全局样式
  const styleElement = document.createElement('style');
  styleElement.id = 'global-terminal-fix';
  styleElement.textContent = `
    /* 强制控制滚动区域元素 */
    .xterm-scroll-area {
      height: 720px !important;
      max-height: 720px !important;
      overflow: hidden !important;
      position: absolute !important;
      z-index: 2 !important;
      top: 0 !important;
      left: 0 !important;
      width: auto !important;
      max-width: 100% !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(styleElement);

  // 创建监视器监控DOM变化
  const observer = new MutationObserver(function(mutations) {
    // 查找所有滚动区域
    const scrollAreas = document.querySelectorAll('.xterm-scroll-area');
    
    if (scrollAreas.length > 0) {
      scrollAreas.forEach(function(area) {
        const element = area;
        
        // 设置数据属性来标记已处理
        element.setAttribute('data-fixed-by-global', 'true');
        element.setAttribute('data-fixed-time', Date.now().toString());
        
        // 强制设置高度属性
        element.style.height = '720px';
        element.style.maxHeight = '720px';
      });
    }
  });
  
  // 启动观察器
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
  
  // 定期扫描并修复所有滚动区域
  setInterval(function() {
    const scrollAreas = document.querySelectorAll('.xterm-scroll-area');
    let fixedCount = 0;
    
    scrollAreas.forEach(function(area) {
      const element = area;
      const height = element.style.height;
      
      if (height && height !== '720px') {
        element.style.height = '720px';
        element.style.maxHeight = '720px';
        element.setAttribute('data-fixed-by-interval', Date.now().toString());
        fixedCount++;
      }
    });
    
    if (fixedCount > 0) {
      console.log(`[终端修复] 定期扫描修复了 ${fixedCount} 个滚动区域`);
    }
  }, 2000);

  // 向window对象添加手动修复函数
  window.fixTerminalScrollAreas = function() {
    const scrollAreas = document.querySelectorAll('.xterm-scroll-area');
    let fixedCount = 0;
    
    scrollAreas.forEach(function(area) {
      const element = area;
      element.style.height = '720px';
      element.style.maxHeight = '720px';
      element.setAttribute('data-fixed-manually', Date.now().toString());
      fixedCount++;
    });
    
    console.log(`[终端修复] 手动修复了 ${fixedCount} 个滚动区域`);
    return fixedCount;
  };

  // 替换滚动区域函数
  window.replaceScrollArea = function() {
    const scrollAreas = document.querySelectorAll('.xterm-scroll-area');
    let replacedCount = 0;
    
    scrollAreas.forEach(function(area) {
      try {
        const originalElement = area;
        const parent = originalElement.parentElement;
        
        if (!parent) return;
        
        // 创建替代元素
        const replacement = document.createElement('div');
        replacement.className = originalElement.className;
        
        // 复制原始属性
        Array.from(originalElement.attributes).forEach(function(attr) {
          replacement.setAttribute(attr.name, attr.value);
        });
        
        // 设置固定高度
        replacement.style.height = '720px';
        replacement.style.maxHeight = '720px';
        replacement.setAttribute('data-replaced', 'true');
        
        // 替换元素
        parent.replaceChild(replacement, originalElement);
        replacedCount++;
      } catch (e) {
        console.error('[终端修复] 替换滚动区域失败:', e);
      }
    });
    
    console.log(`[终端修复] 替换了 ${replacedCount} 个滚动区域`);
    return replacedCount;
  };
  
  console.log('[终端修复] 全局修复系统已激活');
})();
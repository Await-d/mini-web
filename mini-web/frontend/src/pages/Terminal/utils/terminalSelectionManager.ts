// 终端选择管理器

import { Terminal as XTerm } from 'xterm';

/**
 * 终端选择管理器
 * 用于修复和增强终端文本选择功能
 */
export class TerminalSelectionManager {
  private term: XTerm;
  private container: HTMLElement | null;
  
  constructor(term: XTerm) {
    this.term = term;
    this.container = term.element || null;
    this.applySelectionFixes();
  }
  
  /**
   * 应用选择修复
   */
  private applySelectionFixes() {
    if (!this.container) return;
    
    // 修复选择层级
    this.fixSelectionLayerStyles();
    
    // 监听选择事件
    this.setupSelectionListeners();
    
    // 使用MutationObserver持续监视DOM变化
    this.observeSelectionLayerChanges();
  }
  
  /**
   * 修复选择层样式
   */
  private fixSelectionLayerStyles() {
    if (!this.container) return;
    
    // 立即应用样式
    this.applySelectionLayerStyles();
    
    // 延迟多次尝试应用样式，确保在DOM完成渲染后也能修复
    [100, 300, 500, 1000].forEach(delay => {
      setTimeout(() => this.applySelectionLayerStyles(), delay);
    });
  }
  
  /**
   * 应用选择层样式
   */
  private applySelectionLayerStyles() {
    if (!this.container) return;
    
    // 修复选择层
    const selectionLayer = this.container.querySelector('.xterm-selection-layer');
    if (selectionLayer instanceof HTMLElement) {
      selectionLayer.style.zIndex = '15';
      selectionLayer.style.pointerEvents = 'none';
      selectionLayer.style.position = 'absolute';
      selectionLayer.style.top = '0';
      selectionLayer.style.left = '0';
      selectionLayer.style.width = '100%';
      selectionLayer.style.height = '100%';
    }
    
    // 修复选择项
    const selections = this.container.querySelectorAll('.xterm-selection');
    selections.forEach(selection => {
      if (selection instanceof HTMLElement) {
        selection.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
      }
    });
  }
  
  /**
   * 设置选择相关的事件监听器
   */
  private setupSelectionListeners() {
    if (!this.container) return;
    
    // 监听选择开始事件
    this.container.addEventListener('mousedown', (e) => {
      // 在选择开始时记录初始坐标
      if (e.button === 0) { // 左键
        this.onSelectionStart(e);
      }
    });
    
    // 监听选择结束事件
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) { // 左键
        this.onSelectionEnd(e);
      }
    });
  }
  
  /**
   * 选择开始处理
   */
  private onSelectionStart(e: MouseEvent) {
    // 可以在这里实现自定义选择开始逻辑
    console.log('终端选择开始');
    
    // 修复：确保helper-textarea正确定位以支持选择功能
    if (this.container) {
      const helperTextarea = this.container.querySelector('.xterm-helper-textarea');
      if (helperTextarea instanceof HTMLElement) {
        // 设置为absolute并覆盖整个终端区域
        helperTextarea.style.position = 'absolute';
        helperTextarea.style.top = '0';
        helperTextarea.style.left = '0';
        helperTextarea.style.width = '100%';
        helperTextarea.style.height = '100%';
        helperTextarea.style.opacity = '0';
        helperTextarea.style.zIndex = '5'; // 提高z-index以确保能够接收事件
        helperTextarea.style.pointerEvents = 'none'; // 允许点击事件穿透
      }
      
      // 修复helpers容器
      const helpersContainer = this.container.querySelector('.xterm-helpers');
      if (helpersContainer instanceof HTMLElement) {
        helpersContainer.style.position = 'absolute';
        helpersContainer.style.top = '0';
        helpersContainer.style.left = '0';
        helpersContainer.style.zIndex = '5';
        helpersContainer.style.width = '100%';
        helpersContainer.style.height = '100%';
        helpersContainer.style.pointerEvents = 'none';
      }
      
      // 确保选择层在合适的位置
      const selectionLayer = this.container.querySelector('.xterm-selection-layer');
      if (selectionLayer instanceof HTMLElement) {
        selectionLayer.style.zIndex = '15';
        selectionLayer.style.pointerEvents = 'none';
      }
    }
    
    // 尝试聚焦textarea，确保能捕获键盘输入
    if (this.container) {
      const textarea = this.container.querySelector('.xterm-helper-textarea');
      if (textarea instanceof HTMLElement) {
        // 延迟聚焦，确保在mousedown事件处理完成后进行
        setTimeout(() => {
          textarea.focus({preventScroll: true});
        }, 0);
      }
    }
  }
  
  /**
   * 选择结束处理
   */
  private onSelectionEnd(e: MouseEvent) {
    // 获取选择的文本
    const selection = this.term.getSelection();
    if (selection) {
      console.log('终端选择结束', selection.length + '字符');
      
      // 如果选择为空，重新聚焦终端
      if (selection.length === 0) {
        this.term.focus();
      }
    }
    
    // 确保选择显示正确
    this.applySelectionLayerStyles();
    
    // 修复：确保选择后helper-textarea保持正确状态
    if (this.container) {
      const helperTextarea = this.container.querySelector('.xterm-helper-textarea');
      if (helperTextarea instanceof HTMLElement) {
        // 保持覆盖整个终端区域，但仍然允许事件穿透
        helperTextarea.style.position = 'absolute';
        helperTextarea.style.top = '0';
        helperTextarea.style.left = '0';
        helperTextarea.style.width = '100%';
        helperTextarea.style.height = '100%';
        helperTextarea.style.opacity = '0';
        helperTextarea.style.zIndex = '5';
        helperTextarea.style.pointerEvents = 'none';
      }
      
      // 确保选择层在正确的位置
      const selectionLayer = this.container.querySelector('.xterm-selection-layer');
      if (selectionLayer instanceof HTMLElement) {
        selectionLayer.style.zIndex = '15';
        selectionLayer.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
      }
    }
  }
  
  /**
   * 使用MutationObserver观察DOM变化
   */
  private observeSelectionLayerChanges() {
    if (!this.container) return;
    
    const observer = new MutationObserver((mutations) => {
      // DOM发生变化时修复选择层
      this.applySelectionLayerStyles();
    });
    
    // 观察子树和属性变化
    observer.observe(this.container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }
}

/**
 * 创建并应用终端选择管理器
 */
export const applyTerminalSelectionFixes = (term: XTerm): TerminalSelectionManager => {
  return new TerminalSelectionManager(term);
};
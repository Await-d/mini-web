/**
 * 终端修复工具
 * 用于解决终端使用过程中可能遇到的各种问题
 */
import { Terminal } from 'xterm';

/**
 * 修复终端中文输入法问题
 * @param terminal XTerm.Terminal实例
 * @param container 终端容器元素
 */
export const fixInputMethodIssues = (terminal: Terminal, container: HTMLElement) => {
    if (!terminal || !container) return;

    try {
        // 1. 找到辅助输入框
        const textarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
        if (!textarea) return;

        // 2. 设置属性以减少输入法问题
        textarea.setAttribute('autocomplete', 'off');
        textarea.setAttribute('autocorrect', 'off');
        textarea.setAttribute('autocapitalize', 'off');
        textarea.setAttribute('spellcheck', 'false');

        // 3. 处理合成事件
        const handleComposition = (e: CompositionEvent) => {
            // 阻止默认行为
            e.preventDefault();
            e.stopPropagation();

            // 如果是合成结束，直接将文本发送到终端
            if (e.type === 'compositionend' && e.data) {
                // 发送文本到终端
                terminal.write(e.data);

                // 清空输入框
                textarea.value = '';
            }
        };

        // 4. 监听compositionend事件
        textarea.addEventListener('compositionend', handleComposition);

        // 5. 隐藏合成视图
        const style = document.createElement('style');
        style.innerHTML = `
            .composition-view {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                position: absolute !important;
                z-index: -999 !important;
            }
        `;
        document.head.appendChild(style);

        // 6. 修复textarea的定位
        textarea.style.position = 'absolute';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '1px';
        textarea.style.height = '1px';
        textarea.style.opacity = '0.01';
        textarea.style.resize = 'none';

        console.log('已应用中文输入法修复');
    } catch (error) {
        console.error('应用中文输入法修复失败:', error);
    }
};





/**
 * 监听并修复动态添加的终端元素
 */
export const monitorAndFixTerminalElements = (container: HTMLElement) => {
    if (!container) return;

    // 创建突变观察器
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                // 检查新添加的节点
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as HTMLElement;

                        // 修复文本层
                        if (element.classList.contains('xterm-text-layer')) {
                            element.style.visibility = 'visible';
                            element.style.display = 'block';
                            element.style.opacity = '1';
                        }

                        // 修复行
                        if (element.classList.contains('xterm-rows')) {
                            element.style.visibility = 'visible';
                            element.style.display = 'block';
                            element.style.opacity = '1';
                        }

                        // 递归修复子元素
                        element.querySelectorAll('span').forEach(span => {
                            span.style.visibility = 'visible';
                            span.style.opacity = '1';
                            span.style.display = 'inline-block';
                        });
                    }
                });
            }
        });
    });

    // 配置观察选项
    observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });

    return observer;
};

/**
 * 处理可能导致行堆叠的特殊情况
 * @param term xterm.js终端实例
 */
export const fixLineStacking = (term: any): void => {
    // 获取终端DOM
    if (!term || !term.element) return;

    const now = Date.now();
    // 使用时间戳限制频率，防止频繁刷新
    if (term._lastLineStackingFix && now - term._lastLineStackingFix < 2000) {
        return; // 如果距离上次修复不到2秒，则跳过
    }

    term._lastLineStackingFix = now;

    // 1. 修复终端容器布局
    if (term.element.style) {
        term.element.style.display = 'block';
        term.element.style.width = '100%';
        term.element.style.height = '100%';
        term.element.style.overflow = 'hidden';
        term.element.style.position = 'relative';
        term.element.style.visibility = 'visible';
        term.element.style.opacity = '1';
    }

    // 2. 修复屏幕元素
    const screen = term.element.querySelector('.xterm-screen');
    if (screen) {
        screen.style.display = 'block';
        screen.style.position = 'relative';
        screen.style.width = '100%';
        screen.style.height = '100%';
        screen.style.visibility = 'visible';
        screen.style.overflow = 'hidden';
    }

    // 3. 找到终端行容器并应用修复
    const rowsElement = term.element.querySelector('.xterm-rows');
    if (rowsElement) {
        rowsElement.style.visibility = 'visible';
        rowsElement.style.display = 'block';
        rowsElement.style.position = 'absolute';
        rowsElement.style.top = '0';
        rowsElement.style.left = '0';
        rowsElement.style.width = '100%';
        rowsElement.style.height = '100%';
        rowsElement.style.zIndex = '20';
        rowsElement.style.overflow = 'visible';
        rowsElement.style.opacity = '1';

        // 4. 修复每一行的显示
        const terminalRows = rowsElement.querySelectorAll('div');
        if (terminalRows && terminalRows.length > 0) {
            terminalRows.forEach((row: HTMLDivElement) => {
                // 确保每行都有明确的高度和换行设置
                row.style.height = '1.2em';  // 固定行高
                row.style.lineHeight = '1.2';
                row.style.whiteSpace = 'pre';
                row.style.display = 'block';
                row.style.overflow = 'visible';
                row.style.margin = '0';
                row.style.opacity = '1';
                row.style.visibility = 'visible';
                row.style.position = 'relative';
                row.style.paddingRight = '10px'; // 添加右侧填充，防止文本挤压

                // 设置最小行高，确保即使内容很少也能正常显示
                row.style.minHeight = '1.2em';

                // 特别设置white-space，确保行能正常换行和折叠
                row.style.whiteSpace = 'pre-wrap';

                // 如果行内有大量内容，确保可以换行显示
                if (row.textContent && row.textContent.length > 80) {
                    row.style.wordBreak = 'break-word';
                    row.style.overflowWrap = 'break-word';
                }

                // 强制所有span元素可见
                const spans = row.querySelectorAll('span');
                spans.forEach((span: HTMLSpanElement) => {
                    span.style.display = 'inline-block';
                    span.style.visibility = 'visible';
                    span.style.opacity = '1';
                    span.style.position = 'relative';

                    // 禁用transform，可能导致渲染问题
                    span.style.transform = 'none';

                    // 确保文本颜色正确
                    if (!span.style.color || span.style.color === 'transparent') {
                        span.style.color = 'inherit';
                    }
                });
            });
        }
    }

    // 5. 修复终端内容的显示设置
    const xtermViewport = term.element.querySelector('.xterm-viewport');
    if (xtermViewport) {
        xtermViewport.style.overflowY = 'auto';
        xtermViewport.style.overflowX = 'hidden';
        xtermViewport.style.position = 'absolute';
        xtermViewport.style.height = '100%';
        xtermViewport.style.width = '100%';
        xtermViewport.style.visibility = 'visible';
        xtermViewport.style.opacity = '1';

        // 设置滚动条样式
        xtermViewport.style.scrollbarWidth = 'thin';
        xtermViewport.style.scrollbarColor = '#666 #333';
    }

    // 6. 修复文本层样式
    const textLayer = term.element.querySelector('.xterm-text-layer');
    if (textLayer) {
        textLayer.style.visibility = 'visible';
        textLayer.style.display = 'block';
        textLayer.style.opacity = '1';
        textLayer.style.zIndex = '25';
        textLayer.style.position = 'absolute';
        textLayer.style.overflow = 'visible';
        textLayer.style.top = '0';
        textLayer.style.left = '0';
        textLayer.style.width = '100%';
        textLayer.style.height = '100%';
        textLayer.style.color = 'inherit';

        // 防止事件劫持
        textLayer.style.pointerEvents = 'none';
    }

    // 7. 确保光标可见
    const cursor = term.element.querySelector('.xterm-cursor');
    if (cursor) {
        cursor.style.visibility = 'visible';
        cursor.style.display = 'block';
        cursor.style.opacity = '1';
        cursor.style.zIndex = '30';
        cursor.style.position = 'relative';
    }

    // 8. 应用全局样式以确保行不会堆叠
    const styleId = 'xterm-fix-line-stacking-style';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;

    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }

    styleElement.textContent = `
        .xterm-rows > div {
            position: relative !important;
            overflow: visible !important;
            white-space: pre-wrap !important;
            height: 1.2em !important;
            min-height: 1.2em !important;
            line-height: 1.2 !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            margin: 0 !important;
            padding-right: 10px !important;
        }
        
        .xterm-rows > div > span {
            display: inline-block !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: relative !important;
            transform: none !important;
        }
        
        .xterm-viewport {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            scrollbar-width: thin !important;
            scrollbar-color: #666 #333 !important;
        }
        
        .xterm-text-layer {
            z-index: 25 !important;
            visibility: visible !important;
            opacity: 1 !important;
        }
    `;

    // 9. 尝试刷新终端 - 全部行，但避免频繁刷新
    try {
        if (typeof term.refresh === 'function' && (!term._lastRefresh || now - term._lastRefresh > 1000)) {
            term.refresh(0, term.rows - 1);
            term._lastRefresh = now;
        }
    } catch (e) {
        // 忽略刷新错误
    }
};

/**
 * 定期刷新终端显示，解决堆叠问题
 * @param term xterm.js终端实例
 */
export const setupLineStackingFix = (term: any): number => {
    if (!term) return 0;

    // 初始化时间戳以防止频繁刷新
    term._lastLineStackingFix = 0;
    term._lastRefresh = 0;

    // 立即应用一次修复
    fixLineStacking(term);

    // 刷新终端内容
    if (typeof term.refresh === 'function') {
        try {
            term.refresh(0, term.rows - 1);
            term._lastRefresh = Date.now();
        } catch (e) {
            console.error('刷新终端内容失败:', e);
        }
    }

    // 设置定期修复 - 降低频率到5秒一次
    return window.setInterval(() => {
        fixLineStacking(term);

        // 尝试刷新终端，但控制频率
        const now = Date.now();
        if (typeof term.refresh === 'function' && (!term._lastRefresh || now - term._lastRefresh > 5000)) {
            try {
                term.refresh(0, term.rows - 1);
                term._lastRefresh = now;
            } catch (e) {
                // 忽略错误
            }
        }
    }, 5000); // 增加间隔到5秒
};

/**
 * 应用中文输入法修复
 * @param term 终端实例
 */
export const applyChineseInputMethodFix = (term: any): void => {
    console.log('应用中文输入法修复...');
    try {
        // 当终端获得焦点时触发
        term.element.addEventListener('focus', () => {
            fixInputMethodIssues(term, term.element);
        });

        // 立即应用一次修复
        fixInputMethodIssues(term, term.element);
        console.log('已应用中文输入法修复');
    } catch (error) {
        console.error('应用中文输入法修复失败:', error);
    }
};

/**
 * 应用滚动修复
 * @param term 终端实例
 * @param behavior 滚动行为
 */
export const applyScrollFix = (term: any, behavior: ScrollBehavior = 'auto'): void => {
    try {
        // 获取滚动容器
        const viewport = term.element.querySelector('.xterm-viewport');
        if (viewport) {
            // 设置滚动行为
            viewport.style.scrollBehavior = behavior;

            // 添加事件监听器以确保正确滚动
            term.onData(() => {
                setTimeout(() => {
                    viewport.scrollTop = viewport.scrollHeight;
                }, 0);
            });

            console.log('已应用终端滚动修复');
        }
    } catch (error) {
        console.error('应用滚动修复失败:', error);
    }
};

/**
 * 应用渲染修复
 * @param term 终端实例
 */
export const applyRenderFix = (term: any): void => {
    try {
        // 确保DOM元素可见
        if (term.element) {
            // 获取所有需要设置样式的元素
            const elements = [
                term.element,
                term.element.querySelector('.xterm-viewport'),
                term.element.querySelector('.xterm-screen'),
                term.element.querySelector('.xterm-rows'),
                term.element.querySelector('.xterm-text-layer'),
                term.element.querySelector('.xterm-cursor-layer'),
            ].filter(Boolean);

            // 为所有元素应用可见性样式
            elements.forEach(el => {
                if (el) {
                    (el as HTMLElement).style.visibility = 'visible';
                    (el as HTMLElement).style.display = el === term.element ? 'flex' : 'block';
                    (el as HTMLElement).style.opacity = '1';
                }
            });

            // 应用特殊样式
            const textLayer = term.element.querySelector('.xterm-text-layer');
            if (textLayer) {
                (textLayer as HTMLElement).style.zIndex = '10';
            }

            // 设置z-index解决可能的覆盖问题
            const rowElements = term.element.querySelectorAll('.xterm-rows > div');
            if (rowElements && rowElements.length > 0) {
                rowElements.forEach((row: HTMLElement) => {
                    row.style.zIndex = '15';
                    row.style.visibility = 'visible';
                    row.style.display = 'block';
                });
            }

            console.log('终端渲染修复已应用');
        }
    } catch (error) {
        console.error('应用渲染修复失败:', error);
    }
};


/**
 * 修复终端DOM元素样式
 * @param containerEl 终端容器元素
 */
export const fixTerminalDomStyles = (containerEl: HTMLElement): void => {
    if (!containerEl) return;

    try {
        // 设置容器样式
        containerEl.style.visibility = 'visible';
        containerEl.style.display = 'block';
        containerEl.style.opacity = '1';

        // 修复xterm元素样式
        const xtermElement = containerEl.querySelector('.xterm');
        if (xtermElement) {
            (xtermElement as HTMLElement).style.visibility = 'visible';
            (xtermElement as HTMLElement).style.display = 'block';
            (xtermElement as HTMLElement).style.opacity = '1';

            // 修复screen元素
            const screen = xtermElement.querySelector('.xterm-screen');
            if (screen) {
                (screen as HTMLElement).style.visibility = 'visible';
                (screen as HTMLElement).style.display = 'block';
                (screen as HTMLElement).style.opacity = '1';
            }

            // 修复viewport元素
            const viewport = xtermElement.querySelector('.xterm-viewport');
            if (viewport) {
                (viewport as HTMLElement).style.visibility = 'visible';
                (viewport as HTMLElement).style.display = 'block';
                (viewport as HTMLElement).style.opacity = '1';
                (viewport as HTMLElement).style.overflow = 'auto';
            }

            // 修复text-layer元素
            const textLayer = xtermElement.querySelector('.xterm-text-layer');
            if (textLayer) {
                (textLayer as HTMLElement).style.visibility = 'visible';
                (textLayer as HTMLElement).style.display = 'block';
                (textLayer as HTMLElement).style.opacity = '1';
                (textLayer as HTMLElement).style.zIndex = '10';
            }

            // 修复rows元素
            const rows = xtermElement.querySelector('.xterm-rows');
            if (rows) {
                (rows as HTMLElement).style.visibility = 'visible';
                (rows as HTMLElement).style.display = 'block';
                (rows as HTMLElement).style.opacity = '1';

                // 修复行元素
                const rowElements = rows.querySelectorAll('div');
                rowElements.forEach((row: HTMLElement) => {
                    row.style.visibility = 'visible';
                    row.style.display = 'block';
                    row.style.opacity = '1';
                });
            }
        }
    } catch (error) {
        console.error('修复终端DOM样式失败:', error);
    }
};

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


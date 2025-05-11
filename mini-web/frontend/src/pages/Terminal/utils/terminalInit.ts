// 终端初始化函数

import {Terminal} from 'xterm';
import {FitAddon} from 'xterm-addon-fit';
import {WebLinksAddon} from 'xterm-addon-web-links';
import {SearchAddon} from 'xterm-addon-search';
import {createTerminalMessageQueue} from './messageQueue';
import {monitorAndFixTerminalElements, setupLineStackingFix, fixLineStacking} from './terminalFixes';
import '../styles/terminal-fixes.css'; // 确保样式加载

// 直接定义常量，避免导入不存在的模块
const TERMINAL_FONT_SIZE = 16;
const TERMINAL_BG_COLOR = '#1e1e1e';
const TERMINAL_FG_COLOR = '#b0b0b0';
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
 * 修复DOM元素样式，确保终端元素可见
 */
function fixTerminalDomStyles(containerRef: HTMLElement) {
    if (!containerRef) return;

    // 添加终端容器样式
    containerRef.style.backgroundColor = TERMINAL_BG_COLOR;
    containerRef.style.color = TERMINAL_FG_COLOR;
    containerRef.style.position = 'relative';
    containerRef.style.width = '100%';
    containerRef.style.height = '100%';
    containerRef.classList.add('xterm-container-fixed');

    // 等待DOM渲染完成后修复所有xterm元素
    setTimeout(() => {
        console.log('开始修复DOM元素样式...');

        // 强制修复xterm元素
        const xtermElements = document.querySelectorAll('.xterm');
        xtermElements.forEach(element => {
            const el = element as HTMLElement;
            el.style.visibility = 'visible';
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.position = 'relative';
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.zIndex = '5';
            el.style.backgroundColor = TERMINAL_BG_COLOR;
            el.style.color = TERMINAL_FG_COLOR;
        });

        // 强制修复文本层
        const textLayers = document.querySelectorAll('.xterm-text-layer');
        textLayers.forEach(layer => {
            const el = layer as HTMLElement;
            el.style.visibility = 'visible';
            el.style.display = 'block';
            el.style.position = 'absolute';
            el.style.opacity = '1';
            el.style.zIndex = '25';
            el.style.color = TERMINAL_FG_COLOR;
            el.style.pointerEvents = 'none';
            el.style.overflow = 'visible';

            // 修复所有文本span
            const spans = el.querySelectorAll('span');
            spans.forEach(span => {
                span.style.visibility = 'visible';
                span.style.display = 'inline-block';
                span.style.opacity = '1';
            });
        });

        // 强制修复行容器
        const rowsElements = document.querySelectorAll('.xterm-rows');
        rowsElements.forEach(rows => {
            const el = rows as HTMLElement;
            el.style.visibility = 'visible';
            el.style.display = 'block';
            el.style.position = 'absolute';
            el.style.opacity = '1';
            el.style.zIndex = '20';
            el.style.color = TERMINAL_FG_COLOR;
            el.style.overflow = 'visible';

            // 修复所有行
            const rowDivs = el.querySelectorAll('div');
            rowDivs.forEach(row => {
                const rowEl = row as HTMLElement;
                rowEl.style.visibility = 'visible';
                rowEl.style.display = 'block';
                rowEl.style.opacity = '1';

                // 修复行内所有span
                const spans = rowEl.querySelectorAll('span');
                spans.forEach(span => {
                    span.style.visibility = 'visible';
                    span.style.display = 'inline-block';
                    span.style.opacity = '1';
                });
            });
        });

        console.log('DOM元素样式修复完成');
    }, 200);
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
            console.error('容器引用为空');
            return null;
        }

        // 应用容器级别的样式修复
        containerRef.classList.add('xterm-container');
        containerRef.style.backgroundColor = TERMINAL_BG_COLOR;
        containerRef.style.color = TERMINAL_FG_COLOR;
        containerRef.style.overflow = 'hidden';
        containerRef.style.position = 'relative';
        containerRef.style.width = '100%';
        containerRef.style.height = '100%';
        containerRef.style.zIndex = '5';
        containerRef.style.visibility = 'visible';
        containerRef.style.display = 'block';
        containerRef.style.opacity = '1';

        // 检查XTerm是否直接可用
        let term: Terminal;
        let fitAddon: FitAddon;
        let searchAddon: SearchAddon;
        let webLinksAddon: WebLinksAddon;

        try {
            // 优先使用直接导入的XTerm
            term = new Terminal({
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
                cols: 100,
                disableStdin: false,
                scrollback: 5000,
                convertEol: true,    // 确保回车符正确转换
                lineHeight: 1.3,     // 增加行高，减少堆叠问题
                rendererType: 'dom', // 强制使用DOM渲染器而非WebGL，解决某些堆叠问题
                drawBoldTextInBrightColors: true, // 提高文本清晰度
            } as any);

            fitAddon = new FitAddon();
            searchAddon = new SearchAddon();
            webLinksAddon = new WebLinksAddon();

            console.log('成功使用直接导入的XTerm创建终端实例');
        } catch (directError) {
            console.warn('直接创建终端失败，尝试使用window.xterm:', directError);

            // 回退到window.xterm
            if (!window.xterm || !window.xterm.Terminal) {
                console.error('XTerm未在window对象上加载，终端初始化失败');
                throw new Error('XTerm依赖未加载');
            }

            term = new window.xterm.Terminal({
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
                cols: 100,
                disableStdin: false,
                scrollback: 5000,
                convertEol: true,
                lineHeight: 1.3,     // 增加行高，减少堆叠问题
                drawBoldTextInBrightColors: true, // 提高文本清晰度
            } as any);

            fitAddon = new window.xterm.fit.FitAddon();
            searchAddon = new window.xterm.search.SearchAddon();
            webLinksAddon = new window.xterm.webLinks.WebLinksAddon();

            console.log('成功使用window.xterm创建终端实例');
        }

        // 确保容器是干净的
        while (containerRef.firstChild) {
            containerRef.removeChild(containerRef.firstChild);
        }

        // 加载插件
        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        term.loadAddon(webLinksAddon);

        // 尝试加载WebGL插件提高性能 - 禁用以避免可能的渲染问题
        /*
        try {
          // 直接创建WebGL插件实例，避免使用window.xterm.webgl
          const webglAddon = new WebglAddon();
          term.loadAddon(webglAddon);
          console.log('成功加载WebGL插件');
        } catch (webglError) {
          console.warn('WebGL插件加载失败，将使用Canvas渲染器:', webglError);
        }
        */

        // 打开终端并挂载到DOM
        term.open(containerRef);

        // 显式设置终端字体大小
        term.options.fontSize = TERMINAL_FONT_SIZE;

        // 创建消息队列
        const messageQueue = createTerminalMessageQueue(term);

        // 数据输入事件
        term.onData((data: string) => {
            if (onData) {
                onData(data);
            }
        });

        // 设置终端元素样式 - 增强样式修复
        if (term.element) {
            // 确保终端元素样式
            term.element.style.width = '100%';
            term.element.style.height = '100%';
            term.element.style.position = 'relative';
            term.element.style.overflow = 'hidden';
            term.element.style.backgroundColor = TERMINAL_BG_COLOR;
            term.element.style.color = TERMINAL_FG_COLOR;
            term.element.style.zIndex = '2';
            term.element.style.opacity = '1';
            term.element.style.visibility = 'visible';
            term.element.style.display = 'block';
        }

        // 修复DOM元素样式
        fixTerminalDomStyles(containerRef);


        // 确保终端样式被正确应用
        ensureTerminalStyles(term);

        // 启动行监控器，防止行堆叠
        const lineMonitor = setupLineMonitor(term);

        // 添加滚动监听器，确保数据可见
        term.onScroll(() => {
            const scrollback = term.options.scrollback || 1000;
            if (term.buffer.active.baseY >= scrollback - 10) {
                // 接近滚动极限，清除一些旧的行
                console.log('清理终端缓冲区，避免性能问题');
                term.clear();
            }
        });

        // 尝试调整终端大小
        try {
            fitAddon.fit();

            // 添加一个初始命令，确保终端有内容显示
            term.writeln('\x1b[31m终端初始化成功，等待连接...\x1b[0m');
            term.writeln(`\x1b[34m尺寸: ${term.cols} x ${term.rows}\x1b[0m`);
            term.writeln('\x1b[33m' + '-'.repeat(term.cols > 80 ? 80 : term.cols) + '\x1b[0m');

            // 确保终端获得焦点
            term.focus();
        } catch (fitError) {
            console.error('调整终端尺寸失败:', fitError);
            term.writeln('\x1b[31m警告: 终端尺寸调整失败，可能影响显示效果\x1b[0m');
        }

        const observer = monitorAndFixTerminalElements(containerRef);

        // 应用行堆叠修复 - 降低频率，避免过度刷新
        const lineStackingInterval = setupLineStackingFix(term as any);
        // 设置一个节流器，记录上次修复时间，避免过于频繁地应用修复
        const lastFixTimestamp = Date.now();
        (term as any)._lastFixTimestamp = lastFixTimestamp;

        // 只在必要时手动应用一次行堆叠修复
        setTimeout(() => {
            // 确保没有在短时间内重复调用
            if (Date.now() - (term as any)._lastFixTimestamp > 3000) {
                fixLineStacking(term as any);
                (term as any)._lastFixTimestamp = Date.now();
            }
        }, 2000);

        // 成功初始化的日志
        console.log('终端初始化成功', {
            cols: term.cols,
            rows: term.rows,
            容器ID: containerRef.id,
            终端DOM: term.element ? '已创建' : '未创建'
        });

        // 保存间隔ID到终端实例，以便后续清理
        (term as any)._intervals = {
            lineStacking: lineStackingInterval
        };

        return {
            term,
            fitAddon,
            searchAddon,
            messageQueue,
            observer, // 返回观察器用于后续清理
            lineMonitor, // 返回行监控器
            cleanup: () => {
                // 清理所有间隔和计时器
                if ((term as any)._intervals && (term as any)._intervals.lineStacking) {
                    clearInterval((term as any)._intervals.lineStacking);
                }

                // 清除任何可能存在的刷新定时器
                if ((term as any)._refreshTimer) {
                    clearTimeout((term as any)._refreshTimer);
                }

                // 如果有其他定时器或间隔，清除它们
                if ((term as any)._autoRefreshInterval) {
                    clearInterval((term as any)._autoRefreshInterval);
                }

                // 取消所有挂起的requestAnimationFrame
                if ((term as any)._animationFrameId) {
                    cancelAnimationFrame((term as any)._animationFrameId);
                }

                // 断开观察器
                if (observer) observer.disconnect();
                // 断开行监控器
                if (lineMonitor) lineMonitor.disconnect();
            }
        };
    } catch (error) {
        console.error('【终端初始化】发生错误:', error);
        return null;
    }
};

// 确保样式被应用到终端
const ensureTerminalStyles = (terminal: Terminal | null) => {
    if (!terminal || !terminal.element) return;

    // 确保添加自定义CSS类
    terminal.element.classList.add('fixed-terminal');

    // 强制触发重新布局
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                try {
                    terminal.refresh(0, terminal.rows - 1);
                    console.log('DOMContentLoaded后刷新终端');

                    // 再次应用样式修复
                    fixLineStacking(terminal as any);
                } catch (e) {
                    console.error('DOMContentLoaded后刷新终端失败:', e);
                }
            }, 100);
        });
    } else {
        // 如果DOM已加载完成，直接刷新
        setTimeout(() => {
            try {
                terminal.refresh(0, terminal.rows - 1);
                console.log('直接刷新终端');

                // 再次应用样式修复
                fixLineStacking(terminal as any);
            } catch (e) {
                console.error('直接刷新终端失败:', e);
            }
        }, 100);
    }

    // 添加样式加载完成后的处理
    const addStyleLoadHandler = () => {
        const terminalFixesCss = document.querySelector('link[href*="terminal-fixes.css"]');
        if (terminalFixesCss) {
            (terminalFixesCss as HTMLLinkElement).addEventListener('load', () => {
                console.log('terminal-fixes.css 加载完成，刷新终端');
                setTimeout(() => {
                    try {
                        terminal.refresh(0, terminal.rows - 1);
                        // 再次应用样式修复
                        fixLineStacking(terminal as any);
                    } catch (e) {
                        console.error('CSS加载后刷新终端失败:', e);
                    }
                }, 100);
            });
        }
    };

    // 添加样式加载处理
    addStyleLoadHandler();
};

// 添加行动态监控器，解决行堆叠问题
const setupLineMonitor = (term: Terminal | null) => {
    if (!term || !term.element) return null;

    // 创建MutationObserver实例
    const observer = new MutationObserver((mutations) => {
        let needsRefresh = false;

        mutations.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // 检查是否添加了新的行
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 如果是行元素（div），应用样式修复
                        if ((node as HTMLElement).parentElement?.classList.contains('xterm-rows')) {
                            const rowElement = node as HTMLElement;

                            // 应用行样式修复
                            rowElement.style.height = '1.2em';
                            rowElement.style.lineHeight = '1.2';
                            rowElement.style.whiteSpace = 'pre-wrap';
                            rowElement.style.display = 'block';
                            rowElement.style.visibility = 'visible';
                            rowElement.style.position = 'relative';
                            rowElement.style.overflow = 'visible';
                            rowElement.style.margin = '0';
                            rowElement.style.opacity = '1';

                            // 如果行内有大量内容，确保可以换行显示
                            if (rowElement.textContent && rowElement.textContent.length > 80) {
                                rowElement.style.wordBreak = 'break-word';
                                rowElement.style.overflowWrap = 'break-word';
                            }

                            needsRefresh = true;
                        }

                        // 检查和修复span元素
                        if ((node as HTMLElement).tagName === 'SPAN') {
                            const spanElement = node as HTMLElement;
                            spanElement.style.visibility = 'visible';
                            spanElement.style.display = 'inline-block';
                            spanElement.style.opacity = '1';

                            needsRefresh = true;
                        }
                    }
                });
            }
        });

        // 如果有新增元素，刷新终端
        if (needsRefresh) {
            try {
                // 延迟刷新以确保DOM更新完成
                setTimeout(() => {
                    term.refresh(0, term.rows - 1);
                }, 10);
            } catch (e) {
                // 忽略刷新错误
            }
        }
    });

    // 配置观察选项
    const config = {
        childList: true,  // 观察直接子节点变化
        subtree: true,    // 观察所有后代节点
        attributes: true, // 观察属性变化
        attributeFilter: ['style', 'class'] // 只关注样式和类变化
    };

    // 开始观察
    if (term.element) {
        observer.observe(term.element, config);
        console.log('终端行监控器已启动');
    }

    return observer;
};

/**
 * 增强的终端初始化工具
 * 提供更稳定的XTerm.js终端初始化和修复功能
 */
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';
// 导入终端修复CSS
import '../styles/terminal-fixes.css';

/**
 * 初始化终端实例
 * @param container 终端容器元素
 * @param dataHandler 数据处理函数
 * @returns 初始化的终端、插件和消息队列
 */
export const initTerminal = (
    container: HTMLElement,
    dataHandler: (data: string) => void
) => {
    if (!container) {
        console.error('终端容器不存在，无法初始化终端');
        return null;
    }

    try {
        console.log('开始初始化终端...', container);

        // 准备容器
        prepareContainer(container);

        // 创建新的终端实例
        const term = new Terminal({
            fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
            fontSize: 14,
            lineHeight: 1.2,
            cursorBlink: true,
            cursorStyle: 'block',
            theme: {
                background: '#1e1e1e',
                foreground: '#f0f0f0',
                cursor: '#ffffff',
            },
            allowTransparency: true,
            scrollback: 10000,
            disableStdin: false,
            screenReaderMode: false,
            cols: 80,
            rows: 24,
            allowProposedApi: true,
            convertEol: true,           // 确保回车换行正确处理
            rendererType: 'dom',        // 使用DOM渲染器提高兼容性
        });

        // 创建并加载fit插件以自动调整大小
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        // 创建并加载搜索插件
        const searchAddon = new SearchAddon();
        term.loadAddon(searchAddon);

        // 创建并加载web链接插件
        try {
            const webLinksAddon = new WebLinksAddon();
            term.loadAddon(webLinksAddon);
        } catch (e) {
            console.warn('加载web链接插件失败:', e);
        }

        // 创建消息队列存储待发送数据
        const messageQueue: string[] = [];

        // 打开终端前添加日志
        console.log('准备打开终端...', {
            container: container.id,
            size: { width: container.clientWidth, height: container.clientHeight },
            visible: window.getComputedStyle(container).visibility
        });

        // 确保容器可见
        container.style.display = 'block';
        container.style.visibility = 'visible';

        // 设置为空字符串
        container.innerHTML = '';

        // 打开终端
        try {
            console.log('正在调用term.open...');
            term.open(container);
            console.log('终端已打开');

            // 立即刷新终端
            term.refresh(0, term.rows - 1);
            console.log('终端已刷新');
        } catch (e) {
            console.error('打开终端失败:', e);

            // 尝试恢复
            setTimeout(() => {
                try {
                    console.log('重试打开终端...');
                    container.innerHTML = '';
                    term.open(container);
                    console.log('终端重试打开成功');
                    term.refresh(0, term.rows - 1);
                } catch (retryError) {
                    console.error('重试打开终端失败:', retryError);
                }
            }, 100);
        }

        // 检查终端元素是否正确创建
        const xtermTerminal = container.querySelector('.terminal') as HTMLElement;
        if (xtermTerminal) {
            console.log('终端DOM元素已创建:', xtermTerminal);

            // 强制设置终端元素的样式
            xtermTerminal.style.visibility = 'visible';
            xtermTerminal.style.opacity = '1';
            xtermTerminal.style.display = 'block';
            xtermTerminal.style.width = '100%';
            xtermTerminal.style.height = '100%';

            // 检查并修复各个层
            const layers = ['xterm-text-layer', 'xterm-cursor-layer', 'xterm-link-layer', 'xterm-selection-layer'];
            layers.forEach(layerClass => {
                const layer = container.querySelector(`.${layerClass}`);
                if (layer) {
                    (layer as HTMLElement).style.visibility = 'visible';
                    (layer as HTMLElement).style.opacity = '1';
                    (layer as HTMLElement).style.display = 'block';
                    console.log(`${layerClass} 已修复`);
                } else {
                    console.warn(`找不到 ${layerClass}`);
                }
            });

            // 检查xterm-viewport
            const viewport = container.querySelector('.xterm-viewport');
            if (viewport) {
                (viewport as HTMLElement).style.visibility = 'visible';
                (viewport as HTMLElement).style.opacity = '1';
                console.log('viewport 已修复');
            }

            // 检查xterm-screen
            const screen = container.querySelector('.xterm-screen');
            if (screen) {
                (screen as HTMLElement).style.visibility = 'visible';
                (screen as HTMLElement).style.opacity = '1';
                (screen as HTMLElement).style.width = '100%';
                (screen as HTMLElement).style.height = '100%';
                console.log('screen 已修复');
            }
        } else {
            console.warn('找不到终端DOM元素');
        }

        // 添加数据处理器
        term.onData((data) => {
            console.log('⭐ 终端接收到用户输入:', data, '长度:', data.length, '字符码:', Array.from(data).map(c => c.charCodeAt(0)));

            // 检查dataHandler是否存在且是函数
            if (typeof dataHandler === 'function') {
                console.log('⭐ 准备调用dataHandler函数处理输入');
                try {
                    // 将数据发送到处理函数
                    const result = dataHandler(data);
                    console.log('⭐ dataHandler调用结果:', result);

                    // 本地回显（如果服务器不提供回显）
                    // term.write(data);
                } catch (e) {
                    console.error('⭐ 调用dataHandler失败:', e);
                    // 确保本地回显
                    term.write(data);
                }
            } else {
                console.error('❌ dataHandler不存在或不是函数:', dataHandler);
                // 如果没有数据处理器，也确保添加本地回显
                term.write(data);
            }
        });

        // 添加终端输出监听器
        const originalWrite = term.write;
        term.write = function (data: string | Uint8Array) {
            console.log('📥 终端收到输出数据', typeof data === 'string' ?
                (data.length > 50 ? data.substring(0, 50) + '...' : data) : '[二进制数据]');

            try {
                return originalWrite.apply(this, [data]);
            } catch (e) {
                console.error('📥 终端写入数据失败:', e);
                return this;
            }
        };

        // 设置焦点并写入欢迎消息
        setTimeout(() => {
            try {
                // 确保终端处于可见状态
                container.style.visibility = 'visible';
                container.style.display = 'block';
                container.style.opacity = '1';

                term.focus();
                console.log('终端已获取焦点');

                // 写入欢迎消息
                term.write('\r\n\x1b[32m终端已成功初始化!\x1b[0m\r\n');
                term.write('等待建立连接...\r\n\r\n');

                // 立即刷新以确保显示
                term.refresh(0, term.rows - 1);

                // 触发终端就绪事件
                const readyEvent = new CustomEvent('terminal-ready', {
                    detail: {
                        terminalInstance: term,
                        containerElement: container
                    }
                });
                window.dispatchEvent(readyEvent);
                console.log('已分发terminal-ready事件');
            } catch (e) {
                console.error('设置终端焦点失败:', e);
            }
        }, 100);

        // 调整大小
        try {
            console.log('调整终端大小...');
            setTimeout(() => {
                try {
                    fitAddon.fit();
                    console.log('终端大小已调整为:', term.cols, term.rows);

                    // 触发大小调整事件
                    const sizeEvent = new CustomEvent('terminal-size-changed', {
                        detail: {
                            cols: term.cols,
                            rows: term.rows,
                            terminalInstance: term
                        }
                    });
                    window.dispatchEvent(sizeEvent);
                    console.log('已分发terminal-size-changed事件');
                } catch (sizeError) {
                    console.error('调整终端大小失败:', sizeError);
                }
            }, 300);
        } catch (e) {
            console.error('首次调整终端大小失败:', e);
        }

        // 处理窗口尺寸变化
        const resizeHandler = () => {
            try {
                fitAddon.fit();
                console.log('窗口调整后终端大小:', term.cols, term.rows);
            } catch (e) {
                console.error('调整终端大小失败:', e);
            }
        };
        window.addEventListener('resize', resizeHandler);

        // 保存终端实例到全局对象以便调试
        if (typeof window !== 'undefined') {
            (window as any).lastTerminal = term;
        }

        // 返回终端和插件实例以及清理函数
        console.log('终端初始化完成，可以使用');
        return {
            term,
            fitAddon,
            searchAddon,
            messageQueue,
            cleanup: () => {
                window.removeEventListener('resize', resizeHandler);
                try {
                    term.dispose();
                } catch (e) {
                    console.warn('终端处置失败:', e);
                }
            }
        };
    } catch (error) {
        console.error('初始化终端失败:', error);
        return null;
    }
};

/**
 * 准备终端容器
 * @param container 终端容器元素
 */
function prepareContainer(container: HTMLElement) {
    // 清空容器
    container.innerHTML = '';

    // 设置容器样式
    container.style.height = '100%';
    container.style.width = '100%';
    container.style.position = 'relative';
    container.style.zIndex = '10';
    container.style.overflow = 'hidden';
    container.style.display = 'flex';
    container.style.flex = '1';
    container.style.backgroundColor = '#1e1e1e';
    container.style.visibility = 'visible';
    container.style.opacity = '1';

    // 添加额外的类用于样式选择器
    container.classList.add('xterm-container');

    // 确保修复样式已加载，手动注入一个样式标签作为备份
    const styleId = 'terminal-fixes-inline';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* 内联终端修复样式 */
            .xterm-text-layer {
                z-index: 25 !important;
                visibility: visible !important;
                display: block !important;
                opacity: 1 !important;
                color: #f0f0f0 !important;
            }
            .xterm-text-layer span {
                visibility: visible !important;
                display: inline-block !important;
                color: inherit !important;
            }
            .xterm-cursor-layer {
                z-index: 30 !important;
                visibility: visible !important;
            }
            .xterm-rows {
                visibility: visible !important;
                display: block !important;
                z-index: 20 !important;
            }
            .terminal {
                visibility: visible !important;
                display: block !important;
                opacity: 1 !important;
            }
            .terminal-wrapper {
                height: 100% !important;
                width: 100% !important;
                visibility: visible !important;
                display: block !important;
            }
        `;
        document.head.appendChild(style);
    }

    console.log('终端容器已准备完毕');
}

/**
 * 刷新终端，强制重绘
 * @param term 终端实例
 */
export const refreshTerminal = (term: Terminal) => {
    if (!term) return;

    try {
        // 刷新所有行
        term.refresh(0, term.rows - 1);

        // 设置焦点
        term.focus();

        console.log('终端已刷新');
    } catch (error) {
        console.error('刷新终端失败:', error);
    }
};

/**
 * 清理终端显示和缓冲区
 * @param term 终端实例
 */
export const clearTerminal = (term: Terminal) => {
    if (!term) return;

    try {
        // 清除屏幕上的所有内容
        term.clear();

        // 重置终端状态
        term.reset();

        console.log('终端已清理');
    } catch (error) {
        console.error('清理终端失败:', error);
    }
};

/**
 * 写入欢迎消息到终端
 * @param term 终端实例
 * @param message 消息内容
 */
export const writeWelcomeMessage = (term: Terminal, message?: string) => {
    if (!term) return;

    try {
        // 默认欢迎消息
        const welcomeMessage = message || 'Welcome to Mini-Web Terminal\r\n';

        // 清除当前内容
        term.clear();

        // 写入欢迎消息
        term.writeln('\x1b[1;34m' + welcomeMessage + '\x1b[0m');
        term.writeln('');

        console.log('欢迎消息已写入');
    } catch (error) {
        console.error('写入欢迎消息失败:', error);
    }
};

/**
 * 重新绑定终端的数据处理器
 * @param term 终端实例
 * @param dataHandler 数据处理函数
 */
export const rebindDataHandler = (term: Terminal, dataHandler: (data: string) => void) => {
    if (!term) return;

    try {
        // 移除所有现有的数据监听器
        const anyTerm = term as any;
        if (anyTerm._core && anyTerm._core._events && anyTerm._core._events.data) {
            anyTerm._core._events.data = [];
        }

        // 添加新的数据处理器
        term.onData(dataHandler);

        console.log('终端数据处理器已重新绑定');
    } catch (error) {
        console.error('重新绑定数据处理器失败:', error);
    }
};

/**
 * 导出所有终端初始化和管理函数
 */
export default {
    initTerminal,
    refreshTerminal,
    clearTerminal,
    writeWelcomeMessage,
    rebindDataHandler
};

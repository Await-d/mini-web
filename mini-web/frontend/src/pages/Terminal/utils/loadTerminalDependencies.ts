/**
 * 加载终端依赖模块
 * 在终端组件挂载前加载所需的xterm及其插件
 */

import {Terminal} from 'xterm';
import {FitAddon} from 'xterm-addon-fit';
import {WebLinksAddon} from 'xterm-addon-web-links';
import {WebglAddon} from 'xterm-addon-webgl';
import {SearchAddon} from 'xterm-addon-search';
import 'xterm/css/xterm.css'; // 确保加载xterm CSS
import '../styles/terminal-fixes.css'; // 确保加载修复CSS

/**
 * 为TypeScript声明全局window上的xterm属性
 */
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
            webgl: {
                WebglAddon: typeof WebglAddon;
            };
        };
        xtermStatus: {
            initialized: boolean;
            error: string | null;
        };
    }
}

/**
 * 添加CSS到文档头部
 */
function addStylesheetToHead(href: string, id?: string): void {
    // 检查是否已存在此ID的样式表
    if (id && document.getElementById(id)) {
        return;
    }

    // 检查是否已存在包含此href的样式表
    const existingLinks = document.querySelectorAll(`link[href*="${href}"]`);
    if (existingLinks.length > 0) {
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    if (id) {
        link.id = id;
    }
    document.head.appendChild(link);
}

/**
 * 检查终端依赖是否已加载
 */
export function isTerminalInitialized(): boolean {
    // 设置全局状态对象
    if (!window.xtermStatus) {
        window.xtermStatus = {
            initialized: false,
            error: null
        };
    }

    // 检查Terminal类是否已加载到window.xterm
    return window.xtermStatus.initialized &&
        !!window.xterm &&
        !!window.xterm.Terminal;
}

/**
 * 加载终端依赖并添加到window对象
 */
export function loadTerminalDependencies(): Promise<void> {
    // 加载所需的样式表
    addStylesheetToHead('https://cdn.jsdelivr.net/npm/xterm@5.1.0/css/xterm.css', 'xterm-core-css');

    // 加载本地样式表
    try {
        addStylesheetToHead('/src/pages/Terminal/styles/terminal-fixes.css', 'terminal-fixes-css');
    } catch (e) {
        console.warn('加载本地样式表失败，将使用内联样式代替:', e);

        // 添加内联样式作为备用
        const style = document.createElement('style');
        style.id = 'terminal-fixes-inline';
        style.textContent = `
        /* 终端修复内联样式 */
        .xterm-container, .xterm {
            width: 100% !important;
            height: 100% !important;
            position: relative !important;
            visibility: visible !important;
            display: block !important;
            opacity: 1 !important;
            z-index: 5 !important;
            background-color: #1e1e1e !important;
        }
        
        .xterm-text-layer {
            z-index: 25 !important;
            visibility: visible !important;
            display: block !important;
            position: absolute !important;
            opacity: 1 !important;
            color: #f0f0f0 !important;
        }
        
        .xterm-text-layer span, .xterm-rows span {
            visibility: visible !important;
            display: inline-block !important;
            opacity: 1 !important;
        }
        `;
        document.head.appendChild(style);
    }

    // 如果已经加载，直接返回成功
    if (isTerminalInitialized()) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        try {
            // 确保window.xterm对象存在
            if (!window.xterm) {
                window.xterm = {
                    Terminal,
                    fit: {FitAddon},
                    webLinks: {WebLinksAddon},
                    search: {SearchAddon},
                    webgl: {WebglAddon}
                };
            } else {
                // 添加Terminal类到window.xterm
                window.xterm.Terminal = Terminal;

                // 添加FitAddon
                if (!window.xterm.fit) {
                    window.xterm.fit = {FitAddon};
                } else {
                    window.xterm.fit.FitAddon = FitAddon;
                }

                // 添加WebLinksAddon
                if (!window.xterm.webLinks) {
                    window.xterm.webLinks = {WebLinksAddon};
                } else {
                    window.xterm.webLinks.WebLinksAddon = WebLinksAddon;
                }

                // 添加SearchAddon
                if (!window.xterm.search) {
                    window.xterm.search = {SearchAddon};
                } else {
                    window.xterm.search.SearchAddon = SearchAddon;
                }

                // 加载WebglAddon
                if (!window.xterm.webgl) {
                    window.xterm.webgl = {WebglAddon};
                } else {
                    window.xterm.webgl.WebglAddon = WebglAddon;
                }
            }

            // 设置初始化状态
            window.xtermStatus = {
                initialized: true,
                error: null
            };

            resolve();
        } catch (error) {
            console.error('加载xterm依赖失败:', error);

            // 设置错误状态
            window.xtermStatus = {
                initialized: false,
                error: error instanceof Error ? error.message : String(error)
            };

            reject(error);
        }
    });
}

// 在模块加载时尝试初始化
if (typeof window !== 'undefined') {
    loadTerminalDependencies().catch(error => {
        console.error('自动加载终端依赖失败:', error);
    });
}

export default loadTerminalDependencies;

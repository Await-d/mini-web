/**
 * 加载终端依赖模块
 * 在终端组件挂载前加载所需的xterm及其插件
 */

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebglAddon } from 'xterm-addon-webgl';
import { SearchAddon } from 'xterm-addon-search';

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
            [key: string]: any;
        };
    }
}

/**
 * 加载终端依赖并添加到window对象
 */
export function loadTerminalDependencies(): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            // 确保window.xterm对象存在
            if (!window.xterm) {
                window.xterm = {} as Window['xterm'];
            }

            // 添加Terminal类到window.xterm
            window.xterm.Terminal = Terminal;

            // 添加FitAddon
            if (!window.xterm.fit) {
                window.xterm.fit = {} as Window['xterm']['fit'];
            }
            window.xterm.fit.FitAddon = FitAddon;

            // 添加WebLinksAddon
            if (!window.xterm.webLinks) {
                window.xterm.webLinks = {} as Window['xterm']['webLinks'];
            }
            window.xterm.webLinks.WebLinksAddon = WebLinksAddon;

            // 添加SearchAddon
            if (!window.xterm.search) {
                window.xterm.search = {} as Window['xterm']['search'];
            }
            window.xterm.search.SearchAddon = SearchAddon;

            // 加载WebglAddon (可选)
            if (!window.xterm.webgl) {
                window.xterm.webgl = {} as Window['xterm']['webgl'];
            }
            window.xterm.webgl.WebglAddon = WebglAddon;

            resolve();
        } catch (error) {
            console.error('加载xterm依赖失败:', error);
            reject(error);
        }
    });
}

export default loadTerminalDependencies;

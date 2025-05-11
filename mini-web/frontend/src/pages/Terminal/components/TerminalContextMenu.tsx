import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import './TerminalContextMenu.css';

// 定义全局变量和ID
let activeMenu: HTMLElement | null = null;
let activeOverlay: HTMLElement | null = null;
const MENU_ID = 'terminal-context-menu';
const OVERLAY_ID = 'terminal-context-menu-overlay';

interface TerminalContextMenuProps {
    terminal: XTerm | null;
    terminalRef: React.RefObject<HTMLDivElement | null>;
    onClearScreen?: () => void;
    onPaste?: (text: string) => void;
}

/**
 * 终端右键菜单组件 - 全新实现
 */
const TerminalContextMenu: React.FC<TerminalContextMenuProps> = ({
    terminal,
    terminalRef,
    onClearScreen,
    onPaste
}) => {
    // 仅使用引用来跟踪组件挂载状态
    const mountedRef = useRef(false);

    // 全局共享的关闭菜单函数
    const removeMenuAndOverlay = () => {
        console.log('【右键菜单】执行全局关闭菜单函数');

        try {
            // 移除菜单元素
            if (activeMenu && document.body.contains(activeMenu)) {
                document.body.removeChild(activeMenu);
                console.log('【右键菜单】成功移除菜单元素');
            }

            // 移除覆盖层
            if (activeOverlay && document.body.contains(activeOverlay)) {
                document.body.removeChild(activeOverlay);
                console.log('【右键菜单】成功移除覆盖层');
            }

            // 重置全局引用
            activeMenu = null;
            activeOverlay = null;
        } catch (error) {
            console.error('【右键菜单】移除菜单失败:', error);
        }
    };

    // 显示右键菜单
    const showContextMenu = (x: number, y: number) => {
        console.log('【右键菜单】显示菜单', { x, y });

        // 先移除任何现有菜单
        removeMenuAndOverlay();

        try {
            // 创建覆盖层 - 先添加覆盖层以确保它在菜单下方
            const overlay = document.createElement('div');
            overlay.id = OVERLAY_ID;
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.backgroundColor = 'transparent';
            overlay.style.zIndex = '999999';

            // 点击覆盖层关闭菜单
            overlay.addEventListener('click', (e) => {
                console.log('【右键菜单】点击覆盖层，关闭菜单');
                e.preventDefault();
                e.stopPropagation();
                removeMenuAndOverlay();
            });

            document.body.appendChild(overlay);
            activeOverlay = overlay;

            // 创建菜单容器
            const menu = document.createElement('div');
            menu.id = MENU_ID;
            menu.className = 'terminal-context-menu';
            menu.style.position = 'fixed';
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
            menu.style.zIndex = '1000000';

            // 创建菜单列表
            const menuList = document.createElement('ul');
            menuList.className = 'ant-menu';

            // 定义菜单项
            const menuItems = [
                {
                    text: '复制',
                    action: () => {
                        console.log('【右键菜单】执行复制操作');
                        if (terminal) {
                            const selection = terminal.getSelection();
                            if (selection) {
                                navigator.clipboard.writeText(selection)
                                    .then(() => console.log('文本已复制到剪贴板'))
                                    .catch(err => console.error('复制到剪贴板失败', err));
                            }
                        }
                    },
                    disabled: !terminal || !terminal.hasSelection()
                },
                {
                    text: '粘贴',
                    action: () => {
                        console.log('【右键菜单】执行粘贴操作');
                        navigator.clipboard.readText()
                            .then(text => {
                                if (text && onPaste) {
                                    onPaste(text);
                                    console.log('文本已粘贴到终端');
                                }
                            })
                            .catch(err => console.error('读取剪贴板失败', err));
                    }
                },
                {
                    text: '清空屏幕',
                    action: () => {
                        console.log('【右键菜单】执行清空屏幕');
                        if (onClearScreen) {
                            onClearScreen();
                            console.log('终端已清空');
                        }
                    }
                }
            ];

            // 创建菜单项
            menuItems.forEach((item, index) => {
                const menuItem = document.createElement('li');
                menuItem.className = 'ant-menu-item';
                menuItem.textContent = item.text;
                menuItem.style.padding = '8px 16px';
                menuItem.style.cursor = item.disabled ? 'default' : 'pointer';
                menuItem.style.opacity = item.disabled ? '0.5' : '1';

                if (!item.disabled) {
                    // 添加菜单项点击事件
                    menuItem.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log(`【右键菜单】点击菜单项: ${item.text}`);

                        // 先移除菜单，然后执行操作
                        removeMenuAndOverlay();

                        // 延迟执行操作，确保菜单已关闭
                        setTimeout(() => {
                            try {
                                item.action();
                            } catch (error) {
                                console.error(`【右键菜单】执行操作失败: ${item.text}`, error);
                            }
                        }, 10);
                    });

                    // 添加鼠标悬停效果
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.backgroundColor = '#f5f5f5';
                    });

                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.backgroundColor = '';
                    });
                }

                // 添加分隔线
                if (index > 0) {
                    const divider = document.createElement('div');
                    divider.style.height = '1px';
                    divider.style.backgroundColor = '#f0f0f0';
                    divider.style.margin = '4px 0';
                    menuList.appendChild(divider);
                }

                menuList.appendChild(menuItem);
            });

            // 将菜单列表添加到容器
            menu.appendChild(menuList);

            // 添加到文档
            document.body.appendChild(menu);
            activeMenu = menu;

            console.log('【右键菜单】成功创建菜单');

            // 设置自动关闭定时器，防止菜单永久显示
            setTimeout(() => {
                if (activeMenu === menu) {
                    console.log('【右键菜单】自动关闭（10秒超时）');
                    removeMenuAndOverlay();
                }
            }, 10000);

            return true;
        } catch (error) {
            console.error('【右键菜单】创建菜单失败:', error);
            return false;
        }
    };

    // 为终端元素添加右键事件
    useEffect(() => {
        console.log('【右键菜单】组件挂载，初始化事件监听');
        mountedRef.current = true;

        // 在每次组件挂载时清理所有可能存在的菜单
        removeMenuAndOverlay();

        // 添加ESC键关闭菜单
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && (activeMenu || activeOverlay)) {
                console.log('【右键菜单】按下ESC键，关闭菜单');
                removeMenuAndOverlay();
            }
        };

        // 添加全局点击处理，确保点击其他地方时关闭菜单
        const handleGlobalClick = (e: MouseEvent) => {
            // 检查是否点击了菜单或菜单内的元素
            if (activeMenu && !activeMenu.contains(e.target as Node) &&
                activeOverlay && !activeOverlay.contains(e.target as Node)) {
                console.log('【右键菜单】点击了菜单外部，关闭菜单');
                removeMenuAndOverlay();
            }
        };

        // 处理自定义右键菜单事件
        const handleCustomContextMenu = (e: CustomEvent) => {
            console.log('【右键菜单】接收到自定义terminal-contextmenu事件', e.detail);
            if (e.detail && typeof e.detail.x === 'number' && typeof e.detail.y === 'number') {
                // 显示菜单
                showContextMenu(e.detail.x, e.detail.y);
            }
        };

        // 为终端元素添加右键菜单事件
        const addContextMenuEvent = () => {
            const terminalEl = terminalRef.current;
            if (!terminalEl) {
                console.log('【右键菜单】终端元素不存在，无法添加右键菜单');
                return null;
            }

            console.log('【右键菜单】为终端元素添加右键事件');

            // 定义右键菜单处理函数
            const handleContextMenu = (e: MouseEvent) => {
                console.log('【右键菜单】捕获到右键点击', {
                    x: e.clientX,
                    y: e.clientY,
                    target: e.target
                });

                // 阻止默认右键菜单
                e.preventDefault();
                e.stopPropagation();

                // 显示自定义菜单
                showContextMenu(e.clientX, e.clientY);
                return false;
            };

            // 使用捕获阶段和冒泡阶段都添加事件监听，确保能捕获到事件
            terminalEl.addEventListener('contextmenu', handleContextMenu, true);
            terminalEl.addEventListener('contextmenu', handleContextMenu, false);

            // 为确保能阻止右键菜单，添加mousedown事件监听
            terminalEl.addEventListener('mousedown', (e: MouseEvent) => {
                if (e.button === 2) { // 右键
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, true);

            // 返回清理函数
            return () => {
                terminalEl.removeEventListener('contextmenu', handleContextMenu, true);
                terminalEl.removeEventListener('contextmenu', handleContextMenu, false);
            };
        };

        // 添加事件监听
        const cleanup = addContextMenuEvent();
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('click', handleGlobalClick, true);

        // 添加自定义事件监听
        window.addEventListener('terminal-contextmenu', handleCustomContextMenu as EventListener);

        // 定期检查并清理可能的悬挂菜单
        const menuCheckInterval = setInterval(() => {
            // 检查DOM中是否存在菜单元素，但全局变量中没有引用
            const menuInDOM = document.getElementById(MENU_ID);
            const overlayInDOM = document.getElementById(OVERLAY_ID);

            if ((menuInDOM && !activeMenu) || (overlayInDOM && !activeOverlay)) {
                console.log('【右键菜单】发现悬挂菜单，进行清理');

                if (menuInDOM && document.body.contains(menuInDOM)) {
                    document.body.removeChild(menuInDOM);
                }

                if (overlayInDOM && document.body.contains(overlayInDOM)) {
                    document.body.removeChild(overlayInDOM);
                }

                // 重置全局变量
                activeMenu = null;
                activeOverlay = null;
            }
        }, 5000);

        // 返回清理函数
        return () => {
            console.log('【右键菜单】组件卸载，清理事件监听');
            mountedRef.current = false;

            // 清理所有事件监听
            if (cleanup) cleanup();
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('click', handleGlobalClick, true);
            window.removeEventListener('terminal-contextmenu', handleCustomContextMenu as EventListener);

            // 清理定时器
            clearInterval(menuCheckInterval);

            // 移除菜单
            removeMenuAndOverlay();
        };
    }, [terminal, terminalRef, onClearScreen, onPaste]);

    // 为全局提供删除菜单的方法
    // @ts-ignore
    window.removeTerminalContextMenu = removeMenuAndOverlay;

    // 不返回任何JSX，因为菜单是通过DOM API直接创建的
    return null;
};

export default TerminalContextMenu; 
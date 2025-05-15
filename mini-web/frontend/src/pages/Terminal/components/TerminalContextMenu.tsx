import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import './TerminalContextMenu.css';
import { message } from 'antd';

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
 * 终端右键菜单组件 - 实现菜单事件处理
 */
const TerminalContextMenu: React.FC<TerminalContextMenuProps> = ({
    terminal,
    terminalRef,
    onClearScreen,
    onPaste
}) => {
    // 使用引用跟踪组件挂载状态
    const mountedRef = useRef(false);
    // 添加状态来跟踪菜单是否可见
    const [isMenuVisible, setIsMenuVisible] = useState(false);

    // 关闭菜单函数
    const removeMenuAndOverlay = () => {
        console.log('【右键菜单】执行关闭菜单');

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
            setIsMenuVisible(false);
        } catch (error) {
            console.error('【右键菜单】移除菜单失败:', error);
        }
    };

    // 执行复制操作
    const handleCopy = () => {
        console.log('【右键菜单】执行复制操作');
        if (terminal) {
            const selection = terminal.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection)
                    .then(() => {
                        console.log('文本已复制到剪贴板');
                        message.success('复制成功');
                    })
                    .catch(err => {
                        console.error('复制到剪贴板失败', err);
                        message.error('复制失败');
                    });
            } else {
                message.info('没有选择文本');
            }
        }
    };

    // 执行粘贴操作
    const handlePaste = () => {
        console.log('【右键菜单】执行粘贴操作');
        navigator.clipboard.readText()
            .then(text => {
                if (text && onPaste) {
                    onPaste(text);
                    console.log('文本已粘贴到终端');
                    message.success('粘贴成功');
                } else {
                    message.info('剪贴板为空或粘贴功能不可用');
                }
            })
            .catch(err => {
                console.error('读取剪贴板失败', err);
                message.error('粘贴失败');
            });
    };

    // 执行清屏操作
    const handleClear = () => {
        console.log('【右键菜单】执行清空屏幕');
        if (onClearScreen) {
            onClearScreen();
            console.log('终端已清空');
            message.success('终端已清空');
        } else {
            message.error('清屏功能不可用');
        }
    };

    // 执行全选操作
    const handleSelectAll = () => {
        console.log('【右键菜单】执行全选操作');
        if (terminal) {
            try {
                terminal.selectAll();
                message.success('已全选');
            } catch (error) {
                console.error('全选失败:', error);
                message.error('全选失败');
            }
        } else {
            message.error('终端不可用');
        }
    };

    // 显示右键菜单
    const showContextMenu = (x: number, y: number) => {
        console.log('【右键菜单】显示菜单', { x, y });

        // 如果菜单已显示，先移除
        removeMenuAndOverlay();

        try {
            // 创建覆盖层
            const overlay = document.createElement('div');
            overlay.id = OVERLAY_ID;
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.backgroundColor = 'transparent';
            overlay.style.zIndex = '999999';
            overlay.style.cursor = 'default';

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
            menu.style.backgroundColor = '#fff';
            menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            menu.style.border = '1px solid #d9d9d9';
            menu.style.borderRadius = '4px';
            menu.style.overflow = 'hidden';
            menu.style.minWidth = '180px';

            // 创建菜单列表
            const menuList = document.createElement('ul');
            menuList.className = 'ant-menu';
            menuList.style.margin = '0';
            menuList.style.padding = '4px 0';
            menuList.style.listStyle = 'none';

            // 定义菜单项
            const menuItems = [
                {
                    text: '复制',
                    action: handleCopy,
                    disabled: !terminal || !terminal.hasSelection()
                },
                {
                    text: '粘贴',
                    action: handlePaste,
                    disabled: false
                },
                {
                    text: '全选',
                    action: handleSelectAll,
                    disabled: !terminal
                },
                {
                    text: '清空屏幕',
                    action: handleClear,
                    disabled: !onClearScreen
                }
            ];

            // 创建菜单项
            menuItems.forEach((item, index) => {
                // 添加分隔线(除了第一个项目)
                if (index > 0) {
                    const divider = document.createElement('li');
                    divider.className = 'menu-divider';
                    divider.style.height = '1px';
                    divider.style.margin = '4px 0';
                    divider.style.backgroundColor = '#f0f0f0';
                    menuList.appendChild(divider);
                }

                const menuItem = document.createElement('li');
                menuItem.className = 'ant-menu-item';
                menuItem.textContent = item.text;
                menuItem.style.padding = '8px 16px';
                menuItem.style.cursor = item.disabled ? 'not-allowed' : 'pointer';
                menuItem.style.color = item.disabled ? '#ccc' : '#333';
                menuItem.style.fontSize = '14px';
                menuItem.style.lineHeight = '22px';
                menuItem.style.transition = 'all 0.3s';

                if (!item.disabled) {
                    // 添加菜单项点击事件
                    menuItem.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        console.log(`【右键菜单】点击菜单项: ${item.text}`);

                        // 先关闭菜单
                        removeMenuAndOverlay();

                        // 延迟执行操作，确保菜单已关闭
                        setTimeout(() => {
                            try {
                                item.action();
                            } catch (error) {
                                console.error(`【右键菜单】执行操作失败: ${item.text}`, error);
                                message.error(`执行${item.text}操作失败`);
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

                menuList.appendChild(menuItem);
            });

            // 将菜单列表添加到容器
            menu.appendChild(menuList);

            // 添加到文档
            document.body.appendChild(menu);
            activeMenu = menu;
            setIsMenuVisible(true);

            console.log('【右键菜单】成功创建并显示菜单');

            // 调整菜单位置，确保不超出视口
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.right > window.innerWidth) {
                menu.style.left = `${window.innerWidth - menuRect.width - 5}px`;
            }
            if (menuRect.bottom > window.innerHeight) {
                menu.style.top = `${window.innerHeight - menuRect.height - 5}px`;
            }

            // 设置自动关闭定时器，防止菜单永久显示
            setTimeout(() => {
                if (activeMenu === menu) {
                    console.log('【右键菜单】自动关闭（5秒超时）');
                    removeMenuAndOverlay();
                }
            }, 5000);

            return true;
        } catch (error) {
            console.error('【右键菜单】创建菜单失败:', error);
            return false;
        }
    };

    // 处理右键菜单自定义事件
    const handleContextMenuEvent = (e: CustomEvent) => {
        console.log('【右键菜单】接收到自定义事件', e.detail);
        if (e.detail && typeof e.detail.x === 'number' && typeof e.detail.y === 'number') {
            showContextMenu(e.detail.x, e.detail.y);
        }
    };

    // 初始化和清理
    useEffect(() => {
        console.log('【右键菜单】组件挂载，初始化事件监听');
        mountedRef.current = true;

        // 清理已存在的菜单
        removeMenuAndOverlay();

        // 添加事件监听器
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isMenuVisible) {
                console.log('【右键菜单】检测到ESC键，关闭菜单');
                removeMenuAndOverlay();
            }
        };

        // 监听原生上下文菜单事件
        const handleNativeContextMenu = (e: MouseEvent) => {
            // 检查点击是否在当前终端区域内
            if (terminalRef.current && terminalRef.current.contains(e.target as Node)) {
                console.log('【右键菜单】接收到原生右键点击事件');
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e.clientX, e.clientY);
            }
        };

        // 监听自定义上下文菜单事件
        window.addEventListener('terminal-contextmenu', handleContextMenuEvent as EventListener);

        // 添加全局键盘事件
        document.addEventListener('keydown', handleKeyDown);

        // 添加全局点击事件
        document.addEventListener('click', (e) => {
            // 如果菜单不可见，不做处理
            if (!isMenuVisible) return;

            // 检查点击是否在菜单内
            if (activeMenu && !activeMenu.contains(e.target as Node)) {
                console.log('【右键菜单】点击菜单外部，关闭菜单');
                removeMenuAndOverlay();
            }
        });

        // 返回清理函数
        return () => {
            mountedRef.current = false;
            window.removeEventListener('terminal-contextmenu', handleContextMenuEvent as EventListener);
            document.removeEventListener('keydown', handleKeyDown);

            // 移除菜单
            removeMenuAndOverlay();
        };
    }, [isMenuVisible, terminalRef]);

    // 将移除菜单函数绑定到全局，以便其他组件可以调用
    useEffect(() => {
        // @ts-ignore
        window.removeTerminalContextMenu = removeMenuAndOverlay;

        return () => {
            // @ts-ignore
            delete window.removeTerminalContextMenu;
        };
    }, []);

    // 不返回任何JSX，因为菜单是通过DOM API直接创建
    return null;
};

export default TerminalContextMenu; 
/*
 * @Author: Await
 * @Date: 2025-05-15 20:08:18
 * @LastEditors: Await
 * @LastEditTime: 2025-05-15 22:01:01
 * @Description: 请填写简介
 */
import React, { useEffect, useRef } from 'react';
import './TerminalContextMenu.css';
import { message } from 'antd';

interface TerminalContextMenuProps {
    targetRef: React.RefObject<HTMLDivElement | null>;
    onCopy: () => void;
    onClear: () => void;
}

/**
 * 终端右键菜单组件 - 简化版
 */
const TerminalContextMenu: React.FC<TerminalContextMenuProps> = ({
    targetRef,
    onCopy,
    onClear
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // 处理右键菜单显示
    useEffect(() => {
        const target = targetRef.current;
        if (!target) return;

        const handleContextMenu = (event: MouseEvent) => {
            event.preventDefault();

            if (menuRef.current) {
                // 显示菜单
                menuRef.current.style.display = 'block';
                menuRef.current.style.left = `${event.clientX}px`;
                menuRef.current.style.top = `${event.clientY}px`;

                // 创建点击外部关闭菜单的处理
                const handleClickOutside = () => {
                    if (menuRef.current) {
                        menuRef.current.style.display = 'none';
                    }
                    document.removeEventListener('click', handleClickOutside);
                };

                document.addEventListener('click', handleClickOutside);
            }
        };

        target.addEventListener('contextmenu', handleContextMenu);

        return () => {
            target.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [targetRef]);

    return (
        <div ref={menuRef} className="terminal-context-menu" style={{ display: 'none', position: 'fixed', zIndex: 1000 }}>
            <ul className="menu-list">
                <li onClick={onCopy}>复制</li>
                <li onClick={onClear}>清屏</li>
            </ul>
        </div>
    );
};

export default TerminalContextMenu; 
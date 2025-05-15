/*
 * @Author: Await
 * @Date: 2025-05-10 22:19:37
 * @LastEditors: Await
 * @LastEditTime: 2025-05-10 22:24:17
 * @Description: 请填写简介
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import type { TerminalTab } from '../../../contexts/TerminalContext';
import GraphicalTerminal from '../../../components/GraphicalTerminal';
import RdpTerminal from '../../../components/RdpTerminal';
import { getTabProtocol, isGraphicalProtocol } from '../utils/protocolHandler';
import styles from '../styles.module.css';

interface TerminalContainersProps {
    tabs: TerminalTab[];
    activeTabKey: string;
}

/**
 * 终端容器管理组件
 * 负责管理多个终端容器的渲染和事件分发
 */
const TerminalContainers: React.FC<TerminalContainersProps> = ({
    tabs,
    activeTabKey
}) => {
    const renderedContainersRef = useRef<Set<string>>(new Set());
    const lastActiveTabKeyRef = useRef<string | null>(null);
    const domCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 记录终端渲染信息的函数
    const logTerminalRender = (tabKey: string, protocol: string | undefined, isGraphical: boolean) => {
        console.log(`【终端容器渲染】标签 ${tabKey} - 协议: ${protocol || '未知'}, 图形终端: ${isGraphical}`);
        return true;
    };

    // DOM检查和修复函数
    const checkAndFixDomStructure = useCallback(() => {
        // 检查是否有活动标签
        const activeTab = tabs.find(tab => tab.key === activeTabKey);
        if (!activeTab) return;

        // 检测协议类型
        const protocol = getTabProtocol(activeTab);
        const isGraphical = protocol ? isGraphicalProtocol(protocol) : false;
        const isRdp = protocol === 'rdp';

        // 获取相关DOM元素
        const rdpContainers = document.querySelectorAll('.rdp-container');
        const xtermContainers = document.querySelectorAll('.xterm-container');
        const terminalContainers = document.querySelectorAll('.terminal-container');

        console.log(`【DOM检查】标签 ${activeTabKey} - 协议: ${protocol || '未知'}, RDP容器: ${rdpContainers.length}, xterm容器: ${xtermContainers.length}`);

        // 如果是RDP协议但没有RDP容器，或者有xterm容器显示
        if (isRdp) {
            if (rdpContainers.length === 0 || (xtermContainers.length > 0 && Array.from(xtermContainers).some(container =>
                (container as HTMLElement).style.display !== 'none'))) {
                console.log('【DOM修复】检测到RDP协议但DOM结构不正确，进行修复');

                // 隐藏所有xterm容器
                xtermContainers.forEach(container => {
                    (container as HTMLElement).style.display = 'none';
                });

                // 如果没有RDP容器，创建一个
                if (rdpContainers.length === 0 && terminalContainers.length > 0) {
                    const terminalContainer = terminalContainers[0];
                    const newRdpContainer = document.createElement('div');
                    newRdpContainer.className = 'rdp-container';
                    newRdpContainer.id = `rdp-container-${activeTabKey}`;
                    newRdpContainer.style.width = '100%';
                    newRdpContainer.style.height = '100%';
                    newRdpContainer.style.position = 'absolute';
                    newRdpContainer.style.top = '0';
                    newRdpContainer.style.left = '0';
                    newRdpContainer.style.zIndex = '1000';
                    terminalContainer.appendChild(newRdpContainer);

                    console.log('【DOM修复】已创建RDP容器', newRdpContainer);

                    // 触发自定义事件，通知RDP组件重新渲染
                    window.dispatchEvent(new CustomEvent('rdp-container-created', {
                        detail: { containerId: newRdpContainer.id, tabKey: activeTabKey }
                    }));
                }
            }
        } else if (!isGraphical) {
            // 如果不是图形协议，确保所有RDP容器隐藏，xterm容器显示
            rdpContainers.forEach(container => {
                (container as HTMLElement).style.display = 'none';
            });
            xtermContainers.forEach(container => {
                (container as HTMLElement).style.display = 'block';
            });
        }
    }, [tabs, activeTabKey]);

    // 监听标签切换
    useEffect(() => {
        if (activeTabKey !== lastActiveTabKeyRef.current) {
            console.log(`【标签切换】从 ${lastActiveTabKeyRef.current} 切换到 ${activeTabKey}`);
            lastActiveTabKeyRef.current = activeTabKey;

            // 标签切换时立即检查和修复DOM
            setTimeout(checkAndFixDomStructure, 50);

            // 再次延迟检查，确保所有组件都已完成渲染
            setTimeout(checkAndFixDomStructure, 500);
        }
    }, [activeTabKey, checkAndFixDomStructure]);

    // 监控DOM结构
    useEffect(() => {
        // 创建DOM结构观察者
        const observer = new MutationObserver((mutations) => {
            let needsCheck = false;

            mutations.forEach(mutation => {
                if (mutation.type === 'childList' ||
                    (mutation.type === 'attributes' &&
                        mutation.attributeName === 'style')) {
                    needsCheck = true;
                }
            });

            if (needsCheck) {
                checkAndFixDomStructure();
            }
        });

        // 开始观察
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });

        // 设置定期检查定时器
        domCheckTimerRef.current = setInterval(checkAndFixDomStructure, 2000);

        return () => {
            observer.disconnect();
            if (domCheckTimerRef.current) {
                clearInterval(domCheckTimerRef.current);
            }
        };
    }, [checkAndFixDomStructure]);

    // 设置全局调试函数
    useEffect(() => {
        (window as any).debugTerminalContainers = () => {
            const activeTab = tabs.find(tab => tab.key === activeTabKey);
            const protocol = activeTab ? getTabProtocol(activeTab) : undefined;
            const isGraphical = protocol ? isGraphicalProtocol(protocol) : false;

            console.log(`【容器调试】
                活动标签: ${activeTabKey}
                协议: ${protocol || '未知'}
                图形终端: ${isGraphical}
                WebSocket状态: ${activeTab?.webSocketRef?.current ?
                    ['连接中', '已连接', '正在关闭', '已关闭'][activeTab.webSocketRef.current.readyState] :
                    '未初始化'}
            `);

            checkAndFixDomStructure();

            return {
                activeTab,
                protocol,
                isGraphical,
                webSocketState: activeTab?.webSocketRef?.current?.readyState
            };
        };

        (window as any).forceRdpDisplay = () => {
            const activeTab = tabs.find(tab => tab.key === activeTabKey);
            if (!activeTab) return false;

            // 获取所有容器
            const xtermContainers = document.querySelectorAll('.xterm-container');
            xtermContainers.forEach(container => {
                (container as HTMLElement).style.display = 'none';
            });

            // 查找或创建RDP容器
            let rdpContainer = document.querySelector('.rdp-container') as HTMLElement;
            if (!rdpContainer) {
                const terminalContainer = document.querySelector('.terminal-container');
                if (terminalContainer) {
                    rdpContainer = document.createElement('div');
                    rdpContainer.className = 'rdp-container forced';
                    rdpContainer.style.width = '100%';
                    rdpContainer.style.height = '100%';
                    rdpContainer.style.position = 'absolute';
                    rdpContainer.style.top = '0';
                    rdpContainer.style.left = '0';
                    rdpContainer.style.zIndex = '1000';
                    terminalContainer.appendChild(rdpContainer);
                }
            } else {
                rdpContainer.style.display = 'block';
            }

            message.success('已强制显示RDP终端界面');
            return true;
        };

        return () => {
            delete (window as any).debugTerminalContainers;
            delete (window as any).forceRdpDisplay;
        };
    }, [tabs, activeTabKey, checkAndFixDomStructure]);

    return (
        <div className={styles.terminalContainers}>
            {tabs.map(tab => {
                // 获取标签协议
                const protocol = getTabProtocol(tab);
                const isGraphical = protocol ? isGraphicalProtocol(protocol) : false;
                const isRdp = protocol === 'rdp';

                // 记录渲染
                logTerminalRender(tab.key, protocol, isGraphical);

                // 标记已渲染
                renderedContainersRef.current.add(tab.key);

                // 确定可见性
                const isVisible = tab.key === activeTabKey;

                // 渲染终端容器
                return (
                    <div
                        key={tab.key}
                        className={`${styles.terminalContainer} terminal-container ${isVisible ? styles.visible : styles.hidden}`}
                        data-key={tab.key}
                        data-protocol={protocol || 'unknown'}
                        data-graphical={isGraphical ? 'true' : 'false'}
                    >
                        {isRdp ? (
                            // RDP终端
                            <div
                                className={`${styles.rdpContainer} rdp-container`}
                                style={{
                                    display: isVisible ? 'block' : 'none',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    zIndex: 100
                                }}
                            >
                                <RdpTerminal
                                    webSocketRef={tab.webSocketRef}
                                    onResize={(width, height) => {
                                        console.log(`【RDP终端】调整大小: ${width}x${height}`);
                                        if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                                            try {
                                                // 发送调整大小消息
                                                const resizeCommand = JSON.stringify({
                                                    type: 'resize',
                                                    width,
                                                    height
                                                });
                                                tab.webSocketRef.current.send(resizeCommand);
                                            } catch (error) {
                                                console.error('发送RDP大小调整命令失败:', error);
                                            }
                                        }
                                    }}
                                    onInput={(data) => {
                                        if (tab.webSocketRef?.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                                            tab.webSocketRef.current.send(data);
                                        }
                                    }}
                                />
                            </div>
                        ) : isGraphical ? (
                            // 其他图形终端
                            <GraphicalTerminal
                                protocol={protocol || 'unknown'}
                                visible={isVisible}
                                webSocketRef={tab.webSocketRef}
                            />
                        ) : (
                            // 非图形终端(xterm)将由终端初始化脚本处理
                            <div className="xterm-placeholder" />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TerminalContainers; 
import React from 'react';
import type { TerminalSettings } from '../TerminalSettings';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import type { TerminalTab } from '../../../contexts/TerminalContext';

interface TerminalSettingsApplierProps {
    children?: React.ReactNode;
}

/**
 * 终端设置应用组件
 * 负责将设置应用到终端实例
 */
const TerminalSettingsApplier: React.FC<TerminalSettingsApplierProps> = ({ children }) => {
    /**
     * 应用终端设置
     * @param settings 终端设置
     * @param activeTab 当前活动标签
     * @param terminalInstance 终端实例
     * @param fitAddon 自适应插件
     */
    const applySettings = (
        settings: TerminalSettings,
        activeTab: TerminalTab,
        terminalInstance: Terminal,
        fitAddon: FitAddon
    ) => {
        if (terminalInstance) {
            try {
                // 应用外观设置 - 兼容不同版本的xterm.js API
                if (typeof terminalInstance.setOption === 'function') {
                    // 使用setOption API (旧版方法)
                    const currentTheme = terminalInstance.getOption?.('theme') || {};
                    terminalInstance.setOption('theme', {
                        ...currentTheme,
                        background: settings.background,
                        foreground: settings.foreground,
                    });
                    terminalInstance.setOption('fontSize', settings.fontSize);
                    terminalInstance.setOption('fontFamily', settings.fontFamily);
                    terminalInstance.setOption('cursorBlink', settings.cursorBlink);

                    // 应用滚动行数设置
                    if (settings.scrollback) {
                        terminalInstance.setOption('scrollback', settings.scrollback);
                    }
                }
                // 直接设置options对象 (新版方法)
                else if (terminalInstance.options) {
                    terminalInstance.options.theme = {
                        ...(terminalInstance.options.theme || {}),
                        background: settings.background,
                        foreground: settings.foreground,
                    };
                    terminalInstance.options.fontSize = settings.fontSize;
                    terminalInstance.options.fontFamily = settings.fontFamily;
                    terminalInstance.options.cursorBlink = settings.cursorBlink;

                    // 应用滚动行数设置
                    if (settings.scrollback) {
                        terminalInstance.options.scrollback = settings.scrollback;
                    }
                }

                console.log('成功应用终端设置:', {
                    fontSize: settings.fontSize,
                    fontFamily: settings.fontFamily,
                    background: settings.background,
                    foreground: settings.foreground
                });
            } catch (e) {
                console.error('应用终端设置发生错误:', e);
            }

            // 调整终端大小
            if (fitAddon) {
                try {
                    fitAddon.fit();
                } catch (e) {
                    console.error('调整终端大小失败:', e);
                }
            }
        }
    };

    // 暴露接口给外部使用
    React.useEffect(() => {
        // 使用自定义事件提供applySettings方法的访问
        const handleApplySettingsEvent = (event: CustomEvent) => {
            const { settings, activeTab, terminalInstance, fitAddon } = event.detail;
            applySettings(settings, activeTab, terminalInstance, fitAddon);
        };

        // 注册事件监听器
        window.addEventListener('apply-terminal-settings', handleApplySettingsEvent as EventListener);

        // 清理函数
        return () => {
            window.removeEventListener('apply-terminal-settings', handleApplySettingsEvent as EventListener);
        };
    }, []);

    // 在window对象上暴露applySettings方法
    React.useEffect(() => {
        (window as any).applyTerminalSettings = applySettings;

        return () => {
            delete (window as any).applyTerminalSettings;
        };
    }, []);

    return <>{children}</>;
};

export default TerminalSettingsApplier;

// 导出一个辅助函数，方便外部调用而不需要创建自定义事件
export const applyTerminalSettings = (
    settings: TerminalSettings,
    activeTab: TerminalTab,
    terminalInstance: Terminal,
    fitAddon: FitAddon
) => {
    // 如果window上有方法则直接调用
    if (typeof (window as any).applyTerminalSettings === 'function') {
        return (window as any).applyTerminalSettings(settings, activeTab, terminalInstance, fitAddon);
    }

    // 否则通过事件调用
    const event = new CustomEvent('apply-terminal-settings', {
        detail: { settings, activeTab, terminalInstance, fitAddon }
    });
    window.dispatchEvent(event);
}; 
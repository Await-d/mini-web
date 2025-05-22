/*
 * @Author: Await
 * @Date: 2025-05-22 15:30:15
 * @LastEditors: Await
 * @LastEditTime: 2025-05-23 08:05:11
 * @Description: 终端协议相关工具函数
 */
import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * 图形化协议列表
 */
const GRAPHICAL_PROTOCOLS = ['rdp', 'vnc', 'spice'];

/**
 * 命令行协议列表
 */
const COMMAND_LINE_PROTOCOLS = ['ssh', 'telnet', 'serial', 'cmd', 'powershell'];

/**
 * 检查协议是否为图形化协议
 * @param protocol 协议名称
 * @returns 是否为图形化协议
 */
export const isGraphicalProtocol = (protocol: string): boolean => {
    return GRAPHICAL_PROTOCOLS.includes(protocol.toLowerCase());
};

/**
 * 检查协议是否为命令行协议
 * @param protocol 协议名称
 * @returns 是否为命令行协议
 */
export const isCommandLineProtocol = (protocol: string): boolean => {
    return COMMAND_LINE_PROTOCOLS.includes(protocol.toLowerCase());
};

/**
 * 获取标签页的协议类型
 * @param tab 标签页对象
 * @returns 协议类型，如果没有则返回默认值'ssh'
 */
export const getTabProtocol = (tab: TerminalTab): string => {
    // 优先使用标签自身的协议设置
    if (tab.protocol) {
        return tab.protocol.toLowerCase();
    }

    // 其次使用连接对象中的协议设置
    if (tab.connection && tab.connection.protocol) {
        return tab.connection.protocol.toLowerCase();
    }

    // 尝试从标签键中解析协议
    if (tab.key) {
        const protocolMatch = tab.key.match(/protocol-([\w-]+)/);
        if (protocolMatch && protocolMatch[1]) {
            return protocolMatch[1].toLowerCase();
        }
    }

    // 默认返回SSH协议
    return 'ssh';
};

/**
 * 获取协议显示名称
 * @param protocol 协议名称
 * @returns 协议的显示名称
 */
export const getProtocolDisplayName = (protocol: string): string => {
    switch (protocol.toLowerCase()) {
        case 'rdp':
            return 'RDP (远程桌面)';
        case 'vnc':
            return 'VNC (虚拟网络计算)';
        case 'ssh':
            return 'SSH (安全外壳)';
        case 'telnet':
            return 'Telnet';
        case 'serial':
            return '串口';
        case 'spice':
            return 'SPICE';
        case 'cmd':
            return 'CMD (命令提示符)';
        case 'powershell':
            return 'PowerShell';
        default:
            return protocol.toUpperCase();
    }
};

/**
 * 获取协议默认端口
 * @param protocol 协议名称
 * @returns 协议的默认端口
 */
export const getProtocolDefaultPort = (protocol: string): number => {
    switch (protocol.toLowerCase()) {
        case 'rdp':
            return 3389;
        case 'vnc':
            return 5900;
        case 'ssh':
            return 22;
        case 'telnet':
            return 23;
        case 'spice':
            return 5900;
        default:
            return 0; // 表示没有默认端口
    }
};

/**
 * 获取协议的默认连接超时时间（毫秒）
 * @param protocol 协议名称
 * @returns 协议的默认连接超时时间
 */
export const getProtocolDefaultTimeout = (protocol: string): number => {
    switch (protocol.toLowerCase()) {
        case 'rdp':
        case 'vnc':
        case 'spice':
            return 20000; // 图形协议默认20秒
        case 'ssh':
        case 'telnet':
        default:
            return 10000; // 命令行协议默认10秒
    }
}; 
import type { TerminalTab } from '../../../contexts/TerminalContext';
import type { ProtocolType } from '../Terminal.d';

/**
 * 判断当前标签页使用的协议类型
 * @param tab 终端标签对象
 * @returns 协议类型或undefined
 */
export const getTabProtocol = (tab: TerminalTab): ProtocolType | undefined => {
    // 增加日志记录
    console.log(`【协议检测】检测标签 ${tab.key} 的协议类型:`, {
        tabProtocol: tab.protocol,
        connectionProtocol: tab.connection?.protocol,
        port: tab.port || tab.connection?.port,
        name: tab.connection?.name,
        host: tab.connection?.host
    });

    // 增强协议识别：检查连接名称或主机名中是否包含rdp字样
    const connectionName = tab.connection?.name?.toLowerCase() || '';
    const connectionHost = tab.connection?.host?.toLowerCase() || '';

    if (connectionName.includes('rdp') || connectionHost.includes('rdp')) {
        console.log(`【协议检测】通过名称/主机发现 RDP 连接: ${connectionName || connectionHost}`);
        return 'rdp';
    }

    // 首先检查显式设置的protocol属性
    if (tab.protocol) {
        const protocol = tab.protocol.toLowerCase();
        if (['ssh', 'telnet', 'rdp', 'vnc'].includes(protocol)) {
            console.log(`【协议检测】标签显式协议: ${protocol}`);
            return protocol as ProtocolType;
        }
    }

    // 然后检查connection对象的protocol属性
    if (tab.connection?.protocol) {
        const connProtocol = tab.connection.protocol.toLowerCase();
        if (['ssh', 'telnet', 'rdp', 'vnc'].includes(connProtocol)) {
            console.log(`【协议检测】连接对象协议: ${connProtocol}`);
            return connProtocol as ProtocolType;
        }
    }

    // 如果没有明确的协议设置，尝试通过端口推断
    const port = tab.port || tab.connection?.port;
    if (port) {
        // 根据常见端口推断
        let portProtocol: ProtocolType | undefined;
        switch (port) {
            case 22:
                portProtocol = 'ssh';
                break;
            case 23:
                portProtocol = 'telnet';
                break;
            case 3389:
                portProtocol = 'rdp';
                break;
            case 5900:
            case 5901:
            case 5902:
            case 5903:
                portProtocol = 'vnc';
                break;
        }

        if (portProtocol) {
            console.log(`【协议检测】端口 ${port} 对应协议: ${portProtocol}`);
            return portProtocol;
        }
    }

    // 无法确定协议类型
    console.log(`【协议检测】无法确定协议类型，默认为SSH`);
    return 'ssh'; // 默认返回ssh而不是undefined，避免渲染问题
};

/**
 * 判断是否为图形化协议
 * @param protocol 协议类型
 * @returns 是否为图形化协议
 */
export const isGraphicalProtocol = (protocol?: string): boolean => {
    if (!protocol) return false;
    const isGraphical = ['rdp', 'vnc'].includes(protocol.toLowerCase());
    console.log(`【图形协议检测】${protocol} 是否为图形协议: ${isGraphical}`);
    return isGraphical;
};

/**
 * 获取协议的友好名称
 * @param protocol 协议类型
 * @returns 协议的友好名称
 */
export const getProtocolName = (protocol?: string): string => {
    if (!protocol) return '未知协议';

    switch (protocol.toLowerCase()) {
        case 'ssh':
            return 'SSH';
        case 'telnet':
            return 'Telnet';
        case 'rdp':
            return 'RDP远程桌面';
        case 'vnc':
            return 'VNC远程桌面';
        default:
            return protocol;
    }
};

/**
 * 获取协议的默认端口
 * @param protocol 协议类型
 * @returns 默认端口号
 */
export const getDefaultPort = (protocol?: string): number => {
    if (!protocol) return 22; // 默认SSH端口

    switch (protocol.toLowerCase()) {
        case 'ssh':
            return 22;
        case 'telnet':
            return 23;
        case 'rdp':
            return 3389;
        case 'vnc':
            return 5900;
        default:
            return 22;
    }
};

/**
 * 获取协议图标名称
 * @param protocol 协议类型
 * @returns 图标名称
 */
export const getProtocolIcon = (protocol?: string): string => {
    if (!protocol) return 'api';

    switch (protocol.toLowerCase()) {
        case 'ssh':
            return 'code';
        case 'telnet':
            return 'console';
        case 'rdp':
            return 'windows';
        case 'vnc':
            return 'desktop';
        default:
            return 'api';
    }
}; 
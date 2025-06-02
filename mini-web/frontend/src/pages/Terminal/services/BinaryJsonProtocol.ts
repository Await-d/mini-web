/*
 * @Author: Await
 * @Date: 2025-01-27 10:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-02 08:03:01
 * @Description: 二进制流+JSON协议处理器，提供高效的WebSocket通信
 */

// 协议常量
export const PROTOCOL_CONSTANTS = {
    MAGIC_NUMBER: 0x4D574542, // "MWEB"
    HEADER_SIZE: 16,
    MESSAGE_TYPES: {
        JSON_ONLY: 0x01,
        BINARY_ONLY: 0x02,
        MIXED: 0x03,
        HEARTBEAT: 0x04,
        PROTOCOL_NEGOTIATION: 0x05
    },
    COMPRESSION_TYPES: {
        NONE: 0x00,
        GZIP: 0x01,
        LZ4: 0x02
    }
} as const;

// 消息头结构
export interface MessageHeader {
    magicNumber: number;    // 4字节 - 魔数
    messageType: number;    // 1字节 - 消息类型
    compressionFlag: number; // 1字节 - 压缩标志
    jsonLength: number;     // 4字节 - JSON部分长度
    binaryLength: number;   // 4字节 - 二进制部分长度
    reserved: number;       // 2字节 - 保留字段
}

// 协议消息接口
export interface ProtocolMessage {
    header: MessageHeader;
    jsonData?: any;
    binaryData?: ArrayBuffer;
}

// 协议协商消息
export interface ProtocolNegotiation {
    version: string;
    supportedCompressions: number[];
    maxMessageSize: number;
    features: string[];
}

/**
 * 二进制+JSON协议处理器
 */
export class BinaryJsonProtocol {
    private compressionSupported: boolean = false;
    private maxMessageSize: number = 10 * 1024 * 1024; // 10MB
    private protocolVersion: string = "1.0";

    constructor() {
        this.initializeCompression();
    }

    /**
     * 初始化压缩支持检测
     */
    private initializeCompression(): void {
        try {
            // 检测浏览器是否支持压缩
            if (typeof CompressionStream !== 'undefined') {
                this.compressionSupported = true;
                console.log('BinaryJsonProtocol: 压缩支持已启用');
            } else {
                console.log('BinaryJsonProtocol: 浏览器不支持压缩，使用无压缩模式');
            }
        } catch (error) {
            console.warn('BinaryJsonProtocol: 压缩初始化失败:', error);
        }
    }

    /**
     * 编码消息为二进制格式
     */
    async encodeMessage(
        jsonData?: any,
        binaryData?: ArrayBuffer,
        compression: number = PROTOCOL_CONSTANTS.COMPRESSION_TYPES.NONE
    ): Promise<ArrayBuffer> {
        // 确定消息类型
        let messageType: number;
        if (jsonData && binaryData) {
            messageType = PROTOCOL_CONSTANTS.MESSAGE_TYPES.MIXED;
        } else if (jsonData) {
            messageType = PROTOCOL_CONSTANTS.MESSAGE_TYPES.JSON_ONLY;
        } else if (binaryData) {
            messageType = PROTOCOL_CONSTANTS.MESSAGE_TYPES.BINARY_ONLY;
        } else {
            throw new Error('至少需要提供JSON数据或二进制数据');
        }

        // 序列化JSON数据
        let jsonBuffer = new ArrayBuffer(0);
        if (jsonData) {
            const jsonString = JSON.stringify(jsonData);
            const encoder = new TextEncoder();
            const jsonBytes = encoder.encode(jsonString);

            // 创建新的ArrayBuffer并复制数据
            jsonBuffer = new ArrayBuffer(jsonBytes.length);
            new Uint8Array(jsonBuffer).set(jsonBytes);
        }

        // 准备二进制数据
        const binaryBuffer = binaryData || new ArrayBuffer(0);

        // 创建消息头
        const header: MessageHeader = {
            magicNumber: PROTOCOL_CONSTANTS.MAGIC_NUMBER,
            messageType,
            compressionFlag: compression,
            jsonLength: jsonBuffer.byteLength,
            binaryLength: binaryBuffer.byteLength,
            reserved: 0
        };

        // 编码头部
        const headerBuffer = this.encodeHeader(header);

        // 组合完整消息
        const totalLength = headerBuffer.byteLength + jsonBuffer.byteLength + binaryBuffer.byteLength;
        const result = new ArrayBuffer(totalLength);
        const resultView = new Uint8Array(result);

        let offset = 0;

        // 复制头部
        resultView.set(new Uint8Array(headerBuffer), offset);
        offset += headerBuffer.byteLength;

        // 复制JSON数据
        if (jsonBuffer.byteLength > 0) {
            resultView.set(new Uint8Array(jsonBuffer), offset);
            offset += jsonBuffer.byteLength;
        }

        // 复制二进制数据
        if (binaryBuffer.byteLength > 0) {
            resultView.set(new Uint8Array(binaryBuffer), offset);
        }

        return result;
    }

    /**
     * 解码二进制消息
     */
    async decodeMessage(data: ArrayBuffer): Promise<ProtocolMessage> {
        if (data.byteLength < PROTOCOL_CONSTANTS.HEADER_SIZE) {
            throw new Error('消息长度不足，无法解析头部');
        }

        // 解析头部
        const header = this.decodeHeader(data);

        // 验证魔数
        if (header.magicNumber !== PROTOCOL_CONSTANTS.MAGIC_NUMBER) {
            throw new Error(`无效的魔数: 0x${header.magicNumber.toString(16)}`);
        }

        // 验证消息长度
        const expectedLength = PROTOCOL_CONSTANTS.HEADER_SIZE + header.jsonLength + header.binaryLength;
        if (data.byteLength !== expectedLength) {
            throw new Error(`消息长度不匹配: 期望${expectedLength}, 实际${data.byteLength}`);
        }

        let offset = PROTOCOL_CONSTANTS.HEADER_SIZE;
        let jsonData: any = undefined;
        let binaryData: ArrayBuffer | undefined = undefined;

        // 解析JSON数据
        if (header.jsonLength > 0) {
            const jsonBuffer = data.slice(offset, offset + header.jsonLength);
            offset += header.jsonLength;

            const decoder = new TextDecoder();
            const jsonString = decoder.decode(jsonBuffer);
            jsonData = JSON.parse(jsonString);
        }

        // 解析二进制数据
        if (header.binaryLength > 0) {
            binaryData = data.slice(offset, offset + header.binaryLength);
        }

        return {
            header,
            jsonData,
            binaryData
        };
    }

    /**
     * 编码消息头
     */
    private encodeHeader(header: MessageHeader): ArrayBuffer {
        const buffer = new ArrayBuffer(PROTOCOL_CONSTANTS.HEADER_SIZE);
        const view = new DataView(buffer);

        view.setUint32(0, header.magicNumber, false); // 大端序
        view.setUint8(4, header.messageType);
        view.setUint8(5, header.compressionFlag);
        view.setUint32(6, header.jsonLength, false);
        view.setUint32(10, header.binaryLength, false);
        view.setUint16(14, header.reserved, false);

        return buffer;
    }

    /**
     * 解码消息头
     */
    private decodeHeader(data: ArrayBuffer): MessageHeader {
        const view = new DataView(data, 0, PROTOCOL_CONSTANTS.HEADER_SIZE);

        return {
            magicNumber: view.getUint32(0, false),
            messageType: view.getUint8(4),
            compressionFlag: view.getUint8(5),
            jsonLength: view.getUint32(6, false),
            binaryLength: view.getUint32(10, false),
            reserved: view.getUint16(14, false)
        };
    }

    /**
     * 创建协议协商消息
     */
    createNegotiationMessage(): ProtocolNegotiation {
        const supportedCompressions: number[] = [PROTOCOL_CONSTANTS.COMPRESSION_TYPES.NONE];

        if (this.compressionSupported) {
            supportedCompressions.push(PROTOCOL_CONSTANTS.COMPRESSION_TYPES.GZIP);
        }

        return {
            version: this.protocolVersion,
            supportedCompressions,
            maxMessageSize: this.maxMessageSize,
            features: ['file-transfer', 'terminal-output', 'command-execution']
        };
    }

    /**
     * 创建心跳消息
     */
    async createHeartbeatMessage(): Promise<ArrayBuffer> {
        const buffer = new ArrayBuffer(PROTOCOL_CONSTANTS.HEADER_SIZE);
        const view = new DataView(buffer);

        view.setUint32(0, PROTOCOL_CONSTANTS.MAGIC_NUMBER, false);
        view.setUint8(4, PROTOCOL_CONSTANTS.MESSAGE_TYPES.HEARTBEAT);
        view.setUint8(5, PROTOCOL_CONSTANTS.COMPRESSION_TYPES.NONE);
        view.setUint32(6, 0, false); // 心跳消息无JSON数据
        view.setUint32(10, 0, false); // 心跳消息无二进制数据
        view.setUint16(14, 0, false);

        return buffer;
    }

    /**
     * 生成客户端ID
     */
    private generateClientId(): string {
        return `client_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * 检查是否为协议消息
     */
    isProtocolMessage(data: ArrayBuffer): boolean {
        if (data.byteLength < 4) {
            return false;
        }

        const view = new DataView(data, 0, 4);
        const magicNumber = view.getUint32(0, false);
        return magicNumber === PROTOCOL_CONSTANTS.MAGIC_NUMBER;
    }

    /**
     * 检查是否为旧格式JSON消息
     */
    isLegacyJsonMessage(data: string | ArrayBuffer): boolean {
        if (typeof data === 'string') {
            try {
                JSON.parse(data);
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }

    /**
     * 将旧格式JSON转换为新协议格式
     */
    async convertLegacyMessage(jsonString: string): Promise<ArrayBuffer> {
        try {
            const jsonData = JSON.parse(jsonString);
            return await this.encodeMessage(jsonData);
        } catch (error) {
            throw new Error(`转换旧格式消息失败: ${error}`);
        }
    }

    /**
     * 获取协议统计信息
     */
    getStats() {
        return {
            protocolVersion: this.protocolVersion,
            compressionSupported: this.compressionSupported,
            maxMessageSize: this.maxMessageSize,
            headerSize: PROTOCOL_CONSTANTS.HEADER_SIZE
        };
    }
}

// 创建单例实例
const binaryJsonProtocol = new BinaryJsonProtocol();

export default binaryJsonProtocol; 
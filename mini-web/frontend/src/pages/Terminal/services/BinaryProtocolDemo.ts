/*
 * @Author: Await
 * @Date: 2025-01-27 15:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-02 08:24:09
 * @Description: 二进制协议使用演示
 */

import binaryJsonProtocol, { PROTOCOL_CONSTANTS } from './BinaryJsonProtocol';

/**
 * 二进制协议演示类
 */
export class BinaryProtocolDemo {
    /**
     * 演示发送JSON数据
     */
    static async demoSendJsonData(): Promise<ArrayBuffer> {
        const jsonData = {
            type: 'command',
            action: 'list_files',
            path: '/home/user',
            timestamp: new Date().toISOString()
        };

        console.log('演示：发送JSON数据', jsonData);

        const encodedData = await binaryJsonProtocol.encodeMessage(jsonData);
        console.log('编码后的数据大小:', encodedData.byteLength, '字节');

        return encodedData;
    }

    /**
     * 演示发送二进制数据
     */
    static async demoSendBinaryData(): Promise<ArrayBuffer> {
        // 创建一些示例二进制数据（模拟文件内容）
        const binaryData = new ArrayBuffer(1024);
        const view = new Uint8Array(binaryData);
        for (let i = 0; i < view.length; i++) {
            view[i] = i % 256; // 填充示例数据
        }

        console.log('演示：发送二进制数据，大小:', binaryData.byteLength, '字节');

        const encodedData = await binaryJsonProtocol.encodeMessage(undefined, binaryData);
        console.log('编码后的数据大小:', encodedData.byteLength, '字节');

        return encodedData;
    }

    /**
     * 演示发送混合数据（JSON + 二进制）
     */
    static async demoSendMixedData(): Promise<ArrayBuffer> {
        const jsonData = {
            type: 'file_transfer',
            filename: 'example.bin',
            size: 512,
            checksum: 'abc123'
        };

        const binaryData = new ArrayBuffer(512);
        const view = new Uint8Array(binaryData);
        for (let i = 0; i < view.length; i++) {
            view[i] = Math.floor(Math.random() * 256);
        }

        console.log('演示：发送混合数据', {
            json: jsonData,
            binarySize: binaryData.byteLength
        });

        const encodedData = await binaryJsonProtocol.encodeMessage(jsonData, binaryData);
        console.log('编码后的数据大小:', encodedData.byteLength, '字节');

        return encodedData;
    }

    /**
     * 演示解析接收到的数据
     */
    static async demoParseBinaryData(data: ArrayBuffer): Promise<void> {
        console.log('演示：解析接收到的数据，大小:', data.byteLength, '字节');

        try {
            // 检查是否为协议消息
            if (binaryJsonProtocol.isProtocolMessage(data)) {
                console.log('✓ 检测到二进制协议消息');

                // 解码消息
                const protocolMessage = await binaryJsonProtocol.decodeMessage(data);

                console.log('解码成功:', {
                    messageType: protocolMessage.header.messageType,
                    compressionFlag: protocolMessage.header.compressionFlag,
                    jsonLength: protocolMessage.header.jsonLength,
                    binaryLength: protocolMessage.header.binaryLength,
                    hasJsonData: !!protocolMessage.jsonData,
                    hasBinaryData: !!protocolMessage.binaryData
                });

                // 处理不同消息类型
                switch (protocolMessage.header.messageType) {
                    case PROTOCOL_CONSTANTS.MESSAGE_TYPES.JSON_ONLY:
                        console.log('JSON数据:', protocolMessage.jsonData);
                        break;
                    case PROTOCOL_CONSTANTS.MESSAGE_TYPES.BINARY_ONLY:
                        console.log('二进制数据大小:', protocolMessage.binaryData?.byteLength, '字节');
                        break;
                    case PROTOCOL_CONSTANTS.MESSAGE_TYPES.MIXED:
                        console.log('混合数据:');
                        console.log('- JSON:', protocolMessage.jsonData);
                        console.log('- 二进制大小:', protocolMessage.binaryData?.byteLength, '字节');
                        break;
                    case PROTOCOL_CONSTANTS.MESSAGE_TYPES.HEARTBEAT:
                        console.log('心跳消息');
                        break;
                    case PROTOCOL_CONSTANTS.MESSAGE_TYPES.PROTOCOL_NEGOTIATION:
                        console.log('协议协商消息:', protocolMessage.jsonData);
                        break;
                }
            } else {
                console.log('× 不是二进制协议消息，可能是旧格式');
            }
        } catch (error) {
            console.error('解析消息失败:', error);
        }
    }

    /**
     * 演示心跳消息
     */
    static async demoHeartbeat(): Promise<ArrayBuffer> {
        console.log('演示：创建心跳消息');

        const heartbeatData = await binaryJsonProtocol.createHeartbeatMessage();
        console.log('心跳消息大小:', heartbeatData.byteLength, '字节');

        return heartbeatData;
    }

    /**
     * 演示协议协商
     */
    static demoNegotiation(): any {
        console.log('演示：创建协议协商消息');

        const negotiation = binaryJsonProtocol.createNegotiationMessage();
        console.log('协议协商数据:', negotiation);

        return negotiation;
    }

    /**
     * 演示性能对比
     */
    static async demoPerformanceComparison(): Promise<void> {
        console.log('演示：性能对比测试');

        const testData = {
            type: 'performance_test',
            users: Array.from({ length: 100 }, (_, i) => ({
                id: i,
                name: `用户${i}`,
                email: `user${i}@example.com`,
                roles: ['user', 'viewer'],
                lastLogin: new Date().toISOString()
            })),
            metadata: {
                totalCount: 100,
                timestamp: new Date().toISOString(),
                version: '1.0'
            }
        };

        // 测试JSON序列化
        const jsonStart = performance.now();
        const jsonString = JSON.stringify(testData);
        const jsonEnd = performance.now();
        const jsonSize = new TextEncoder().encode(jsonString).length;

        // 测试二进制协议
        const binaryStart = performance.now();
        const binaryData = await binaryJsonProtocol.encodeMessage(testData);
        const binaryEnd = performance.now();

        console.log('性能对比结果:');
        console.log('- JSON序列化: 时间', (jsonEnd - jsonStart).toFixed(2), 'ms, 大小', jsonSize, '字节');
        console.log('- 二进制协议: 时间', (binaryEnd - binaryStart).toFixed(2), 'ms, 大小', binaryData.byteLength, '字节');
        console.log('- 大小差异:', (binaryData.byteLength - jsonSize), '字节 (' + ((binaryData.byteLength / jsonSize * 100).toFixed(2)) + '%)');
    }

    /**
     * 运行完整演示
     */
    static async runFullDemo(): Promise<void> {
        console.log('🚀 开始二进制协议完整演示');
        console.log('========================================');

        try {
            // 1. 演示协议信息
            console.log('1. 协议信息:');
            console.log(binaryJsonProtocol.getStats());
            console.log('');

            // 2. 演示协议协商
            console.log('2. 协议协商:');
            this.demoNegotiation();
            console.log('');

            // 3. 演示发送不同类型的数据
            console.log('3. 发送JSON数据:');
            const jsonData = await this.demoSendJsonData();
            await this.demoParseBinaryData(jsonData);
            console.log('');

            console.log('4. 发送二进制数据:');
            const binaryData = await this.demoSendBinaryData();
            await this.demoParseBinaryData(binaryData);
            console.log('');

            console.log('5. 发送混合数据:');
            const mixedData = await this.demoSendMixedData();
            await this.demoParseBinaryData(mixedData);
            console.log('');

            console.log('6. 心跳消息:');
            const heartbeatData = await this.demoHeartbeat();
            await this.demoParseBinaryData(heartbeatData);
            console.log('');

            // 7. 性能对比
            console.log('7. 性能对比:');
            await this.demoPerformanceComparison();
            console.log('');

            console.log('✅ 二进制协议演示完成');
        } catch (error) {
            console.error('❌ 演示过程中发生错误:', error);
        }
    }
}

// 导出演示类
export default BinaryProtocolDemo;

// 在开发环境下自动运行演示
if (process.env.NODE_ENV === 'development') {
    // 延迟运行，避免在模块加载时立即执行
    setTimeout(() => {
        console.log('🔧 开发模式：可通过 BinaryProtocolDemo.runFullDemo() 运行完整演示');
    }, 1000);
} 
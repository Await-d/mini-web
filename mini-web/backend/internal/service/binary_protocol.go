/*
 * @Author: Await
 * @Date: 2025-06-02 08:09:23
 * @LastEditors: Await
 * @LastEditTime: 2025-06-02 18:08:41
 * @Description: 请填写简介
 */
package service

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"time"
)

// 协议常量
const (
	MagicNumber = 0x4D574542 // "MWEB"
	HeaderSize  = 16

	// 消息类型
	MessageTypeJSONOnly            = 0x01
	MessageTypeBinaryOnly          = 0x02
	MessageTypeMixed               = 0x03
	MessageTypeHeartbeat           = 0x04
	MessageTypeProtocolNegotiation = 0x05

	// 压缩类型
	CompressionNone = 0x00
	CompressionGzip = 0x01
	CompressionLZ4  = 0x02
)

// MessageHeader 消息头结构
type MessageHeader struct {
	MagicNumber     uint32 // 4字节 - 魔数
	MessageType     uint8  // 1字节 - 消息类型
	CompressionFlag uint8  // 1字节 - 压缩标志
	JSONLength      uint32 // 4字节 - JSON部分长度
	BinaryLength    uint32 // 4字节 - 二进制部分长度
	Reserved        uint16 // 2字节 - 保留字段
}

// ProtocolMessage 协议消息
type ProtocolMessage struct {
	Header     MessageHeader `json:"header"`
	JSONData   interface{}   `json:"jsonData,omitempty"`
	BinaryData []byte        `json:"binaryData,omitempty"`
}

// ProtocolNegotiation 协议协商消息
type ProtocolNegotiation struct {
	Version               string   `json:"version"`
	SupportedCompressions []uint8  `json:"supportedCompressions"`
	MaxMessageSize        uint32   `json:"maxMessageSize"`
	Features              []string `json:"features"`
}

// BinaryProtocolHandler 二进制协议处理器
type BinaryProtocolHandler struct {
	compressionSupported bool
	maxMessageSize       uint32
	protocolVersion      string
}

// NewBinaryProtocolHandler 创建新的二进制协议处理器
func NewBinaryProtocolHandler() *BinaryProtocolHandler {
	return &BinaryProtocolHandler{
		compressionSupported: true,             // 启用压缩支持
		maxMessageSize:       10 * 1024 * 1024, // 10MB
		protocolVersion:      "1.0",
	}
}

// EncodeMessage 编码消息为二进制格式
func (h *BinaryProtocolHandler) EncodeMessage(jsonData interface{}, binaryData []byte, compression uint8) ([]byte, error) {
	// 确定消息类型
	var messageType uint8
	if jsonData != nil && binaryData != nil {
		messageType = MessageTypeMixed
	} else if jsonData != nil {
		messageType = MessageTypeJSONOnly
	} else if binaryData != nil {
		messageType = MessageTypeBinaryOnly
	} else {
		return nil, fmt.Errorf("至少需要提供JSON数据或二进制数据")
	}

	// 序列化JSON数据
	var jsonBytes []byte
	if jsonData != nil {
		var err error
		jsonBytes, err = json.Marshal(jsonData)
		if err != nil {
			return nil, fmt.Errorf("序列化JSON数据失败: %w", err)
		}
	}

	// 准备二进制数据
	if binaryData == nil {
		binaryData = []byte{}
	}

	// 智能压缩策略：数据总大小 >= 1KB 时才压缩
	totalDataSize := len(jsonBytes) + len(binaryData)
	shouldCompress := h.compressionSupported && compression == CompressionGzip && totalDataSize >= 1024

	var finalJSONBytes []byte
	var finalBinaryData []byte
	var actualCompression uint8 = CompressionNone

	if shouldCompress {
		// 合并数据后压缩
		combinedData := make([]byte, 0, totalDataSize)
		combinedData = append(combinedData, jsonBytes...)
		combinedData = append(combinedData, binaryData...)

		compressed, err := h.compressData(combinedData)
		if err != nil {
			log.Printf("压缩失败，使用未压缩数据: %v", err)
			finalJSONBytes = jsonBytes
			finalBinaryData = binaryData
		} else {
			// 压缩成功，将压缩后的数据作为二进制数据
			finalJSONBytes = []byte{} // 压缩后JSON部分为空
			finalBinaryData = compressed
			actualCompression = CompressionGzip
			log.Printf("数据压缩: %d bytes -> %d bytes (%.1f%%)",
				totalDataSize, len(compressed), float64(len(compressed))*100/float64(totalDataSize))
		}
	} else {
		finalJSONBytes = jsonBytes
		finalBinaryData = binaryData
	}

	// 创建消息头
	header := MessageHeader{
		MagicNumber:     MagicNumber,
		MessageType:     messageType,
		CompressionFlag: actualCompression,
		JSONLength:      uint32(len(finalJSONBytes)),
		BinaryLength:    uint32(len(finalBinaryData)),
		Reserved:        0,
	}

	// 编码头部
	headerBytes := h.encodeHeader(header)

	// 组合完整消息
	totalLength := HeaderSize + len(finalJSONBytes) + len(finalBinaryData)
	result := make([]byte, totalLength)

	offset := 0

	// 复制头部
	copy(result[offset:], headerBytes)
	offset += HeaderSize

	// 复制JSON数据
	if len(finalJSONBytes) > 0 {
		copy(result[offset:], finalJSONBytes)
		offset += len(finalJSONBytes)
	}

	// 复制二进制数据
	if len(finalBinaryData) > 0 {
		copy(result[offset:], finalBinaryData)
	}

	return result, nil
}

// DecodeMessage 解码二进制消息
func (h *BinaryProtocolHandler) DecodeMessage(data []byte) (*ProtocolMessage, error) {
	if len(data) < HeaderSize {
		return nil, fmt.Errorf("消息长度不足，无法解析头部")
	}

	// 解析头部
	header, err := h.decodeHeader(data)
	if err != nil {
		return nil, fmt.Errorf("解析头部失败: %w", err)
	}

	// 验证魔数
	if header.MagicNumber != MagicNumber {
		return nil, fmt.Errorf("无效的魔数: 0x%x", header.MagicNumber)
	}

	// 验证消息长度
	expectedLength := HeaderSize + int(header.JSONLength) + int(header.BinaryLength)
	if len(data) != expectedLength {
		return nil, fmt.Errorf("消息长度不匹配: 期望%d, 实际%d", expectedLength, len(data))
	}

	offset := HeaderSize
	var jsonData interface{}
	var binaryData []byte

	// 如果数据被压缩，先解压
	if header.CompressionFlag == CompressionGzip {
		// 压缩数据在二进制部分
		compressedData := data[offset : offset+int(header.BinaryLength)]
		decompressed, err := h.decompressData(compressedData)
		if err != nil {
			return nil, fmt.Errorf("解压缩数据失败: %w", err)
		}

		log.Printf("数据解压: %d bytes -> %d bytes", len(compressedData), len(decompressed))

		// 尝试解析JSON（如果原始消息类型包含JSON）
		if header.MessageType == MessageTypeJSONOnly || header.MessageType == MessageTypeMixed {
			if err := json.Unmarshal(decompressed, &jsonData); err != nil {
				// 如果不是纯JSON，可能是混合数据，暂时将解压后的数据作为二进制数据
				binaryData = decompressed
			}
		} else {
			binaryData = decompressed
		}
	} else {
		// 未压缩数据，按常规方式解析

		// 解析JSON数据
		if header.JSONLength > 0 {
			jsonBytes := data[offset : offset+int(header.JSONLength)]
			offset += int(header.JSONLength)

			if err := json.Unmarshal(jsonBytes, &jsonData); err != nil {
				return nil, fmt.Errorf("解析JSON数据失败: %w", err)
			}
		}

		// 解析二进制数据
		if header.BinaryLength > 0 {
			binaryData = make([]byte, header.BinaryLength)
			copy(binaryData, data[offset:offset+int(header.BinaryLength)])
		}
	}

	return &ProtocolMessage{
		Header:     *header,
		JSONData:   jsonData,
		BinaryData: binaryData,
	}, nil
}

// encodeHeader 编码消息头
func (h *BinaryProtocolHandler) encodeHeader(header MessageHeader) []byte {
	headerBytes := make([]byte, HeaderSize)

	binary.BigEndian.PutUint32(headerBytes[0:4], header.MagicNumber)
	headerBytes[4] = header.MessageType
	headerBytes[5] = header.CompressionFlag
	binary.BigEndian.PutUint32(headerBytes[6:10], header.JSONLength)
	binary.BigEndian.PutUint32(headerBytes[10:14], header.BinaryLength)
	binary.BigEndian.PutUint16(headerBytes[14:16], header.Reserved)

	return headerBytes
}

// decodeHeader 解码消息头
func (h *BinaryProtocolHandler) decodeHeader(data []byte) (*MessageHeader, error) {
	if len(data) < HeaderSize {
		return nil, fmt.Errorf("数据长度不足")
	}

	header := &MessageHeader{
		MagicNumber:     binary.BigEndian.Uint32(data[0:4]),
		MessageType:     data[4],
		CompressionFlag: data[5],
		JSONLength:      binary.BigEndian.Uint32(data[6:10]),
		BinaryLength:    binary.BigEndian.Uint32(data[10:14]),
		Reserved:        binary.BigEndian.Uint16(data[14:16]),
	}

	return header, nil
}

// CreateNegotiationMessage 创建协议协商消息
func (h *BinaryProtocolHandler) CreateNegotiationMessage() *ProtocolNegotiation {
	supportedCompressions := []uint8{CompressionNone}

	if h.compressionSupported {
		supportedCompressions = append(supportedCompressions, CompressionGzip)
	}

	return &ProtocolNegotiation{
		Version:               h.protocolVersion,
		SupportedCompressions: supportedCompressions,
		MaxMessageSize:        h.maxMessageSize,
		Features:              []string{"file-transfer", "terminal-output", "command-execution"},
	}
}

// CreateHeartbeatMessage 创建心跳消息
func (h *BinaryProtocolHandler) CreateHeartbeatMessage() ([]byte, error) {
	header := MessageHeader{
		MagicNumber:     MagicNumber,
		MessageType:     MessageTypeHeartbeat,
		CompressionFlag: CompressionNone,
		JSONLength:      0,
		BinaryLength:    0,
		Reserved:        0,
	}

	return h.encodeHeader(header), nil
}

// IsProtocolMessage 检查是否为协议消息
func (h *BinaryProtocolHandler) IsProtocolMessage(data []byte) bool {
	if len(data) < 4 {
		return false
	}

	magicNumber := binary.BigEndian.Uint32(data[0:4])
	return magicNumber == MagicNumber
}

// IsLegacyJSONMessage 检查是否为旧格式JSON消息
func (h *BinaryProtocolHandler) IsLegacyJSONMessage(data []byte) bool {
	// 简单检查是否以 '{' 开头
	if len(data) > 0 && data[0] == '{' {
		var jsonData interface{}
		return json.Unmarshal(data, &jsonData) == nil
	}
	return false
}

// ConvertLegacyMessage 将旧格式JSON转换为新协议格式
func (h *BinaryProtocolHandler) ConvertLegacyMessage(jsonBytes []byte) ([]byte, error) {
	var jsonData interface{}
	if err := json.Unmarshal(jsonBytes, &jsonData); err != nil {
		return nil, fmt.Errorf("解析旧格式JSON失败: %w", err)
	}

	return h.EncodeMessage(jsonData, nil, CompressionNone)
}

// GetStats 获取协议统计信息
func (h *BinaryProtocolHandler) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"protocolVersion":      h.protocolVersion,
		"compressionSupported": h.compressionSupported,
		"maxMessageSize":       h.maxMessageSize,
		"headerSize":           HeaderSize,
	}
}

// HandleProtocolNegotiation 处理协议协商
func (h *BinaryProtocolHandler) HandleProtocolNegotiation(clientNegotiation *ProtocolNegotiation) (*ProtocolNegotiation, error) {
	log.Printf("收到客户端协议协商: version=%s, features=%v",
		clientNegotiation.Version, clientNegotiation.Features)

	// 创建服务端协商响应
	serverNegotiation := h.CreateNegotiationMessage()

	// 可以根据客户端支持的功能调整服务端响应
	// 这里简单返回服务端支持的所有功能

	log.Printf("发送服务端协议协商响应: version=%s, features=%v",
		serverNegotiation.Version, serverNegotiation.Features)

	return serverNegotiation, nil
}

// compressData 使用gzip压缩数据
func (h *BinaryProtocolHandler) compressData(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	writer := gzip.NewWriter(&buf)
	writer.Name = "" // 不设置文件名以节省空间
	writer.ModTime = time.Time{} // 使用零值时间

	if _, err := writer.Write(data); err != nil {
		writer.Close()
		return nil, fmt.Errorf("写入压缩数据失败: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("关闭压缩器失败: %w", err)
	}

	return buf.Bytes(), nil
}

// decompressData 使用gzip解压数据
func (h *BinaryProtocolHandler) decompressData(data []byte) ([]byte, error) {
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("创建解压器失败: %w", err)
	}
	defer reader.Close()

	decompressed, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("读取解压数据失败: %w", err)
	}

	return decompressed, nil
}

package service

import "time"

// RDPServerConfig RDP服务器配置
type RDPServerConfig struct {
	ServerType          RDPServerType
	Name                string
	SupportsTLS         bool
	RequiresComplexAuth bool
	DefaultTimeout      time.Duration
	MCSFlowSimplified   bool
	ProtocolIdentifiers []string
	Description         string
}

// GetRDPServerConfigs 获取预定义的RDP服务器配置
func GetRDPServerConfigs() map[RDPServerType]*RDPServerConfig {
	return map[RDPServerType]*RDPServerConfig{
		ServerTypeXRDP: {
			ServerType:          ServerTypeXRDP,
			Name:                "Linux XRDP",
			SupportsTLS:         false,
			RequiresComplexAuth: false,
			DefaultTimeout:      15 * time.Second,
			MCSFlowSimplified:   true,
			ProtocolIdentifiers: []string{
				"05000000", // 最常见的XRDP协议标识（优先级最高）
				"00000001", // 标准RDP模式
				"00000000", // 基础模式
			},
			Description: "Linux XRDP服务器，使用简化的握手流程",
		},
		ServerTypeFreeRDP: {
			ServerType:          ServerTypeFreeRDP,
			Name:                "FreeRDP Server",
			SupportsTLS:         true,
			RequiresComplexAuth: true,
			DefaultTimeout:      20 * time.Second,
			MCSFlowSimplified:   true,
			ProtocolIdentifiers: []string{
				"01000000", // FreeRDP标准
				"03000000", // FreeRDP with TLS
				"02000000", // FreeRDP with NLA
			},
			Description: "FreeRDP服务器实现",
		},
		ServerTypeWindows: {
			ServerType:          ServerTypeWindows,
			Name:                "Windows RDP",
			SupportsTLS:         true,
			RequiresComplexAuth: true,
			DefaultTimeout:      30 * time.Second,
			MCSFlowSimplified:   false,
			ProtocolIdentifiers: []string{
				"01000002", // Windows RDP with TLS
				"01000001", // Windows RDP with NLA
				"00000002", // Windows基础TLS
				"11000000", // Windows高级模式
			},
			Description: "标准Windows RDP服务器",
		},
	}
}

// GetConfigForServerType 根据服务器类型获取配置
func GetConfigForServerType(serverType RDPServerType) *RDPServerConfig {
	configs := GetRDPServerConfigs()
	if config, exists := configs[serverType]; exists {
		return config
	}
	// 默认返回XRDP配置
	return configs[ServerTypeXRDP]
}

// IdentifyServerTypeByProtocol 根据协议标识识别服务器类型
func IdentifyServerTypeByProtocol(protocolID string) RDPServerType {
	configs := GetRDPServerConfigs()

	for serverType, config := range configs {
		for _, identifier := range config.ProtocolIdentifiers {
			if identifier == protocolID {
				return serverType
			}
		}
	}

	// 默认返回XRDP（因为目标系统是Ubuntu）
	return ServerTypeXRDP
}

package service

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"net"
	"strings"
	"time"

	"gitee.com/await29/mini-web/internal/model/sqlite"
)

// SSLService SSL证书管理服务
type SSLService struct{}

// NewSSLService 创建SSL服务实例
func NewSSLService() *SSLService {
	return &SSLService{}
}

// ParseCertificate 解析证书内容
func (s *SSLService) ParseCertificate(certContent string) (*sqlite.SSLCertInfo, error) {
	// 解码PEM格式证书
	block, _ := pem.Decode([]byte(certContent))
	if block == nil {
		return nil, fmt.Errorf("无法解码PEM格式证书")
	}
	
	// 解析X.509证书
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("解析X.509证书失败: %w", err)
	}
	
	// 计算距离过期的天数
	daysUntilExpiry := int(time.Until(cert.NotAfter).Hours() / 24)
	
	// 检查证书是否有效
	isValid := time.Now().After(cert.NotBefore) && time.Now().Before(cert.NotAfter)
	
	return &sqlite.SSLCertInfo{
		Subject:         cert.Subject.String(),
		Issuer:          cert.Issuer.String(),
		NotBefore:       cert.NotBefore,
		NotAfter:        cert.NotAfter,
		DNSNames:        cert.DNSNames,
		SerialNumber:    cert.SerialNumber.String(),
		IsValid:         isValid,
		DaysUntilExpiry: daysUntilExpiry,
	}, nil
}

// ValidateCertificateAndKey 验证证书和私钥是否匹配
func (s *SSLService) ValidateCertificateAndKey(certContent, keyContent string) error {
	// 解析证书
	certBlock, _ := pem.Decode([]byte(certContent))
	if certBlock == nil {
		return fmt.Errorf("无法解码证书PEM格式")
	}
	
	cert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return fmt.Errorf("解析证书失败: %w", err)
	}
	
	// 解析私钥
	keyBlock, _ := pem.Decode([]byte(keyContent))
	if keyBlock == nil {
		return fmt.Errorf("无法解码私钥PEM格式")
	}
	
	// 尝试加载TLS证书对
	_, err = tls.X509KeyPair([]byte(certContent), []byte(keyContent))
	if err != nil {
		return fmt.Errorf("证书和私钥不匹配: %w", err)
	}
	
	// 检查证书是否已过期
	if time.Now().After(cert.NotAfter) {
		return fmt.Errorf("证书已于 %s 过期", cert.NotAfter.Format("2006-01-02 15:04:05"))
	}
	
	// 检查证书是否还未生效
	if time.Now().Before(cert.NotBefore) {
		return fmt.Errorf("证书将于 %s 生效", cert.NotBefore.Format("2006-01-02 15:04:05"))
	}
	
	return nil
}

// ReadCertificateFile 读取证书文件
func (s *SSLService) ReadCertificateFile(certPath, keyPath string) (string, string, error) {
	// 读取证书文件
	certContent, err := ioutil.ReadFile(certPath)
	if err != nil {
		return "", "", fmt.Errorf("读取证书文件失败: %w", err)
	}
	
	// 读取私钥文件
	keyContent, err := ioutil.ReadFile(keyPath)
	if err != nil {
		return "", "", fmt.Errorf("读取私钥文件失败: %w", err)
	}
	
	return string(certContent), string(keyContent), nil
}

// TestSSLConnection 测试SSL连接
func (s *SSLService) TestSSLConnection(host string, port int, certContent, keyContent string) error {
	// 验证证书和私钥
	if err := s.ValidateCertificateAndKey(certContent, keyContent); err != nil {
		return fmt.Errorf("证书验证失败: %w", err)
	}
	
	// 加载证书对
	cert, err := tls.X509KeyPair([]byte(certContent), []byte(keyContent))
	if err != nil {
		return fmt.Errorf("加载证书对失败: %w", err)
	}
	
	// 创建TLS配置
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		ServerName:   host,
	}
	
	// 测试连接
	address := fmt.Sprintf("%s:%d", host, port)
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", address, tlsConfig)
	if err != nil {
		return fmt.Errorf("SSL连接测试失败: %w", err)
	}
	defer conn.Close()
	
	// 验证连接状态
	state := conn.ConnectionState()
	if !state.HandshakeComplete {
		return fmt.Errorf("SSL握手未完成")
	}
	
	return nil
}

// GenerateSelfSignedCertificate 生成自签名证书
func (s *SSLService) GenerateSelfSignedCertificate(domain string, validDays int) (string, string, error) {
	// 这里可以实现自签名证书生成逻辑
	// 为了简化，这里返回示例
	return "", "", fmt.Errorf("自签名证书生成功能暂未实现")
}

// CheckCertificateExpiry 检查证书过期状态
func (s *SSLService) CheckCertificateExpiry() ([]sqlite.SSLConfig, error) {
	// 获取即将过期的证书
	expiring, err := sqlite.GetExpiringSSLConfigs()
	if err != nil {
		return nil, fmt.Errorf("获取即将过期的证书失败: %w", err)
	}
	
	return expiring, nil
}

// GetDomainFromCertificate 从证书中提取域名
func (s *SSLService) GetDomainFromCertificate(certContent string) ([]string, error) {
	// 解析证书
	certInfo, err := s.ParseCertificate(certContent)
	if err != nil {
		return nil, err
	}
	
	domains := certInfo.DNSNames
	
	// 如果没有DNS名称，尝试从Subject中提取CN
	if len(domains) == 0 {
		// 从Subject字符串中提取CN
		subject := certInfo.Subject
		if strings.Contains(subject, "CN=") {
			parts := strings.Split(subject, ",")
			for _, part := range parts {
				part = strings.TrimSpace(part)
				if strings.HasPrefix(part, "CN=") {
					cn := strings.TrimPrefix(part, "CN=")
					domains = append(domains, cn)
					break
				}
			}
		}
	}
	
	return domains, nil
}

// ValidateDomainCertificate 验证域名与证书是否匹配
func (s *SSLService) ValidateDomainCertificate(domain, certContent string) error {
	// 获取证书中的域名列表
	domains, err := s.GetDomainFromCertificate(certContent)
	if err != nil {
		return fmt.Errorf("从证书中提取域名失败: %w", err)
	}
	
	// 检查域名是否匹配
	for _, certDomain := range domains {
		if certDomain == domain || s.matchWildcard(certDomain, domain) {
			return nil
		}
	}
	
	return fmt.Errorf("域名 %s 与证书中的域名不匹配，证书支持的域名: %s", domain, strings.Join(domains, ", "))
}

// matchWildcard 检查通配符域名匹配
func (s *SSLService) matchWildcard(pattern, domain string) bool {
	if !strings.HasPrefix(pattern, "*.") {
		return false
	}
	
	suffix := strings.TrimPrefix(pattern, "*")
	return strings.HasSuffix(domain, suffix)
}

// BackupSSLConfig 备份SSL配置
func (s *SSLService) BackupSSLConfig(id int) (map[string]interface{}, error) {
	config, err := sqlite.GetSSLConfigByID(id)
	if err != nil {
		return nil, err
	}
	
	backup := map[string]interface{}{
		"name":         config.Name,
		"domain":       config.Domain,
		"cert_content": config.CertContent,
		"key_content":  config.KeyContent,
		"issuer":       config.Issuer,
		"subject":      config.Subject,
		"not_before":   config.NotBefore,
		"not_after":    config.NotAfter,
		"created_at":   config.CreatedAt,
	}
	
	return backup, nil
}

// RestoreSSLConfig 恢复SSL配置
func (s *SSLService) RestoreSSLConfig(backup map[string]interface{}) error {
	config := &sqlite.SSLConfig{
		Name:        backup["name"].(string),
		Domain:      backup["domain"].(string),
		CertContent: backup["cert_content"].(string),
		KeyContent:  backup["key_content"].(string),
		Issuer:      backup["issuer"].(string),
		Subject:     backup["subject"].(string),
		NotBefore:   backup["not_before"].(string),
		NotAfter:    backup["not_after"].(string),
		IsEnabled:   false, // 恢复时默认不启用
		IsDefault:   false, // 恢复时默认不设为默认
	}
	
	// 验证证书
	if err := s.ValidateCertificateAndKey(config.CertContent, config.KeyContent); err != nil {
		return fmt.Errorf("恢复的证书验证失败: %w", err)
	}
	
	return sqlite.CreateSSLConfig(config)
}

// GetSSLConfigsStatus 获取SSL配置状态统计
func (s *SSLService) GetSSLConfigsStatus() (map[string]interface{}, error) {
	configs, err := sqlite.GetSSLConfigs()
	if err != nil {
		return nil, err
	}
	
	status := map[string]interface{}{
		"total":          len(configs),
		"enabled":        0,
		"disabled":       0,
		"expired":        0,
		"expiring_soon":  0,
		"default_config": nil,
	}
	
	now := time.Now()
	for _, config := range configs {
		if config.IsEnabled {
			status["enabled"] = status["enabled"].(int) + 1
		} else {
			status["disabled"] = status["disabled"].(int) + 1
		}
		
		if config.IsDefault {
			status["default_config"] = config.Name
		}
		
		// 解析过期时间
		if notAfter, err := time.Parse("2006-01-02 15:04:05", config.NotAfter); err == nil {
			if now.After(notAfter) {
				status["expired"] = status["expired"].(int) + 1
			} else if now.Add(30 * 24 * time.Hour).After(notAfter) {
				status["expiring_soon"] = status["expiring_soon"].(int) + 1
			}
		}
	}
	
	return status, nil
}
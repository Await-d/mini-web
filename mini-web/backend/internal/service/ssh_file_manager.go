/*
 * @Author: Await
 * @Date: 2025-10-02
 * @Description: SSH文件管理服务 - 实现SFTP文件操作
 */
package service

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/pkg/sftp"
)

// SSHFileManager SSH文件管理器
type SSHFileManager struct {
	session    *SSHTerminalSession
	sftpClient *sftp.Client
	mu         sync.Mutex
}

// NewSSHFileManager 创建SSH文件管理器
func NewSSHFileManager(session *SSHTerminalSession) (*SSHFileManager, error) {
	if session == nil {
		return nil, fmt.Errorf("SSH会话不能为空")
	}

	return &SSHFileManager{
		session: session,
	}, nil
}

// GetSFTPClient 获取或创建SFTP客户端
func (m *SSHFileManager) GetSFTPClient() (*sftp.Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 如果已有客户端，直接返回
	if m.sftpClient != nil {
		return m.sftpClient, nil
	}

	// 创建新的SFTP客户端
	client, err := sftp.NewClient(m.session.client)
	if err != nil {
		return nil, fmt.Errorf("创建SFTP客户端失败: %w", err)
	}

	m.sftpClient = client
	log.Printf("SFTP客户端创建成功")
	return m.sftpClient, nil
}

// DownloadFile 下载文件
func (m *SSHFileManager) DownloadFile(remotePath string) ([]byte, string, error) {
	// 安全检查：防止路径遍历攻击
	if strings.Contains(remotePath, "..") {
		return nil, "", fmt.Errorf("非法路径：包含'..'")
	}

	sftpClient, err := m.GetSFTPClient()
	if err != nil {
		return nil, "", fmt.Errorf("获取SFTP客户端失败: %w", err)
	}

	// 打开远程文件
	remoteFile, err := sftpClient.Open(remotePath)
	if err != nil {
		return nil, "", fmt.Errorf("打开远程文件失败: %w", err)
	}
	defer remoteFile.Close()

	// 获取文件信息
	fileInfo, err := remoteFile.Stat()
	if err != nil {
		return nil, "", fmt.Errorf("获取文件信息失败: %w", err)
	}

	// 检查文件大小
	const maxFileSize = 100 * 1024 * 1024 // 100MB 限制
	if fileInfo.Size() > maxFileSize {
		return nil, "", fmt.Errorf("文件过大（超过100MB），请使用流式下载")
	}

	// 读取文件内容
	data, err := io.ReadAll(remoteFile)
	if err != nil {
		return nil, "", fmt.Errorf("读取文件内容失败: %w", err)
	}

	// 获取文件名
	fileName := filepath.Base(remotePath)

	log.Printf("文件下载成功: %s (大小: %d bytes)", remotePath, len(data))
	return data, fileName, nil
}

// DownloadFileStream 流式下载大文件
func (m *SSHFileManager) DownloadFileStream(remotePath string, writer io.Writer) (string, int64, error) {
	// 安全检查
	if strings.Contains(remotePath, "..") {
		return "", 0, fmt.Errorf("非法路径：包含'..'")
	}

	sftpClient, err := m.GetSFTPClient()
	if err != nil {
		return "", 0, fmt.Errorf("获取SFTP客户端失败: %w", err)
	}

	// 打开远程文件
	remoteFile, err := sftpClient.Open(remotePath)
	if err != nil {
		return "", 0, fmt.Errorf("打开远程文件失败: %w", err)
	}
	defer remoteFile.Close()

	// 获取文件信息（用于验证文件可读）
	_, err = remoteFile.Stat()
	if err != nil {
		return "", 0, fmt.Errorf("获取文件信息失败: %w", err)
	}

	// 流式复制
	written, err := io.Copy(writer, remoteFile)
	if err != nil {
		return "", 0, fmt.Errorf("下载文件失败: %w", err)
	}

	fileName := filepath.Base(remotePath)
	log.Printf("流式下载文件成功: %s (大小: %d bytes)", remotePath, written)
	return fileName, written, nil
}

// DeleteFile 删除单个文件
func (m *SSHFileManager) DeleteFile(remotePath string) error {
	// 安全检查
	if strings.Contains(remotePath, "..") {
		return fmt.Errorf("非法路径：包含'..'")
	}

	// 防止删除重要目录
	dangerousPaths := []string{"/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/proc", "/root", "/sbin", "/sys", "/usr", "/var"}
	for _, dangerous := range dangerousPaths {
		if remotePath == dangerous || strings.HasPrefix(remotePath, dangerous+"/") {
			return fmt.Errorf("不允许删除系统目录: %s", remotePath)
		}
	}

	sftpClient, err := m.GetSFTPClient()
	if err != nil {
		return fmt.Errorf("获取SFTP客户端失败: %w", err)
	}

	// 检查路径是文件还是目录
	fileInfo, err := sftpClient.Stat(remotePath)
	if err != nil {
		return fmt.Errorf("获取文件信息失败: %w", err)
	}

	if fileInfo.IsDir() {
		// 递归删除目录
		return m.removeDirectory(sftpClient, remotePath)
	} else {
		// 删除文件
		if err := sftpClient.Remove(remotePath); err != nil {
			return fmt.Errorf("删除文件失败: %w", err)
		}
	}

	log.Printf("删除成功: %s", remotePath)
	return nil
}

// DeleteFiles 批量删除文件/目录
func (m *SSHFileManager) DeleteFiles(remotePaths []string) error {
	if len(remotePaths) == 0 {
		return fmt.Errorf("没有要删除的文件")
	}

	var errors []string
	for _, path := range remotePaths {
		if err := m.DeleteFile(path); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", path, err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("批量删除失败:\n%s", strings.Join(errors, "\n"))
	}

	log.Printf("批量删除成功，共 %d 个项目", len(remotePaths))
	return nil
}

// removeDirectory 递归删除目录
func (m *SSHFileManager) removeDirectory(client *sftp.Client, dir string) error {
	// 列出目录内容
	entries, err := client.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("读取目录失败: %w", err)
	}

	// 删除目录中的所有内容
	for _, entry := range entries {
		path := filepath.Join(dir, entry.Name())
		if entry.IsDir() {
			// 递归删除子目录
			if err := m.removeDirectory(client, path); err != nil {
				return err
			}
		} else {
			// 删除文件
			if err := client.Remove(path); err != nil {
				return fmt.Errorf("删除文件失败 %s: %w", path, err)
			}
		}
	}

	// 删除空目录
	if err := client.RemoveDirectory(dir); err != nil {
		return fmt.Errorf("删除目录失败 %s: %w", dir, err)
	}

	return nil
}

// UploadFile 上传文件
func (m *SSHFileManager) UploadFile(remotePath string, content []byte) error {
	// 安全检查
	if strings.Contains(remotePath, "..") {
		return fmt.Errorf("非法路径：包含'..'")
	}

	sftpClient, err := m.GetSFTPClient()
	if err != nil {
		return fmt.Errorf("获取SFTP客户端失败: %w", err)
	}

	// 确保目录存在
	remoteDir := filepath.Dir(remotePath)
	if err := m.ensureDirectory(sftpClient, remoteDir); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}

	// 创建远程文件
	remoteFile, err := sftpClient.Create(remotePath)
	if err != nil {
		return fmt.Errorf("创建远程文件失败: %w", err)
	}
	defer remoteFile.Close()

	// 写入内容
	if _, err := remoteFile.Write(content); err != nil {
		return fmt.Errorf("写入文件内容失败: %w", err)
	}

	log.Printf("文件上传成功: %s (大小: %d bytes)", remotePath, len(content))
	return nil
}

// UploadFileStream 流式上传大文件
func (m *SSHFileManager) UploadFileStream(remotePath string, reader io.Reader, size int64) error {
	// 安全检查
	if strings.Contains(remotePath, "..") {
		return fmt.Errorf("非法路径：包含'..'")
	}

	sftpClient, err := m.GetSFTPClient()
	if err != nil {
		return fmt.Errorf("获取SFTP客户端失败: %w", err)
	}

	// 确保目录存在
	remoteDir := filepath.Dir(remotePath)
	if err := m.ensureDirectory(sftpClient, remoteDir); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}

	// 创建远程文件
	remoteFile, err := sftpClient.Create(remotePath)
	if err != nil {
		return fmt.Errorf("创建远程文件失败: %w", err)
	}
	defer remoteFile.Close()

	// 流式复制
	written, err := io.Copy(remoteFile, reader)
	if err != nil {
		return fmt.Errorf("上传文件失败: %w", err)
	}

	log.Printf("流式上传文件成功: %s (大小: %d bytes)", remotePath, written)
	return nil
}

// EditFile 编辑文件（保存文本内容）
func (m *SSHFileManager) EditFile(remotePath string, content string) error {
	// 安全检查
	if strings.Contains(remotePath, "..") {
		return fmt.Errorf("非法路径：包含'..'")
	}

	// 转换为字节数组上传
	return m.UploadFile(remotePath, []byte(content))
}

// ensureDirectory 确保目录存在
func (m *SSHFileManager) ensureDirectory(client *sftp.Client, dir string) error {
	// 检查目录是否存在
	if _, err := client.Stat(dir); err == nil {
		return nil
	}

	// 创建父目录
	parentDir := filepath.Dir(dir)
	if parentDir != "/" && parentDir != "." {
		if err := m.ensureDirectory(client, parentDir); err != nil {
			return err
		}
	}

	// 创建目录
	if err := client.Mkdir(dir); err != nil {
		// 如果目录已存在，忽略错误
		if !os.IsExist(err) {
			return fmt.Errorf("创建目录失败 %s: %w", dir, err)
		}
	}

	return nil
}

// Close 关闭文件管理器
func (m *SSHFileManager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.sftpClient != nil {
		if err := m.sftpClient.Close(); err != nil {
			log.Printf("关闭SFTP客户端失败: %v", err)
			return err
		}
		m.sftpClient = nil
		log.Printf("SFTP客户端已关闭")
	}

	return nil
}

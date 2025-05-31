/*
 * @Author: Await
 * @Date: 2025-01-02 10:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-31 19:50:30
 * @Description: 文件查看器组件
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal,
    Spin,
    message,
    Button,
    Space,
    Typography,
    Image,
    Tabs,
    Card,
    Tooltip,
    Tag,
    Divider,
    App
} from 'antd';
import {
    DownloadOutlined,
    EditOutlined,
    CopyOutlined,
    FileTextOutlined,
    PictureOutlined,
    FileOutlined,
    CloseOutlined,
    FullscreenOutlined,
    ZoomInOutlined,
    ZoomOutOutlined
} from '@ant-design/icons';
import './FileViewer.css';

const { Text, Paragraph } = Typography;
const { TabPane } = Tabs;

interface FileViewerProps {
    visible: boolean;
    onClose: () => void;
    fileName: string;
    filePath: string;
    fileSize: number;
    webSocketRef: React.RefObject<WebSocket | null>;
    connectionId?: string | number;
    sessionId?: string | number;
}

interface FileContent {
    type: 'text' | 'image' | 'binary' | 'error';
    content: string;
    encoding?: string;
    mimeType?: string;
    error?: string;
}

const FileViewer: React.FC<FileViewerProps> = ({
    visible,
    onClose,
    fileName,
    filePath,
    fileSize,
    webSocketRef,
    connectionId,
    sessionId
}) => {
    const { message } = App.useApp();

    const [loading, setLoading] = useState(false);
    const [fileContent, setFileContent] = useState<FileContent | null>(null);
    const [activeTab, setActiveTab] = useState('content');
    const [imageScale, setImageScale] = useState(1);
    const [fullscreen, setFullscreen] = useState(false);

    // 获取文件扩展名
    const getFileExtension = useCallback((filename: string): string => {
        return filename.toLowerCase().split('.').pop() || '';
    }, []);

    // 判断文件类型
    const getFileType = useCallback((filename: string): 'text' | 'image' | 'binary' => {
        const extension = getFileExtension(filename);

        // 文本文件扩展名
        const textExtensions = [
            'txt', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx',
            'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift',
            'yml', 'yaml', 'toml', 'ini', 'conf', 'config', 'log', 'sql', 'sh', 'bash',
            'dockerfile', 'gitignore', 'env', 'properties', 'csv', 'tsv'
        ];

        // 图片文件扩展名
        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif'
        ];

        if (textExtensions.includes(extension)) {
            return 'text';
        } else if (imageExtensions.includes(extension)) {
            return 'image';
        } else {
            return 'binary';
        }
    }, [getFileExtension]);

    // 获取语法高亮语言
    const getSyntaxLanguage = useCallback((filename: string): string => {
        const extension = getFileExtension(filename);
        const languageMap: { [key: string]: string } = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'swift': 'swift',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'json': 'json',
            'xml': 'xml',
            'yml': 'yaml',
            'yaml': 'yaml',
            'sql': 'sql',
            'sh': 'bash',
            'bash': 'bash',
            'dockerfile': 'dockerfile',
            'md': 'markdown'
        };
        return languageMap[extension] || 'text';
    }, [getFileExtension]);

    // 格式化文件大小
    const formatFileSize = useCallback((bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    // 加载文件内容
    const loadFileContent = useCallback(async () => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        setLoading(true);
        setFileContent(null);

        try {
            const fileType = getFileType(fileName);
            const requestId = `file_view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // 发送文件查看请求
            const fileViewRequest = {
                type: 'file_view',
                data: {
                    path: filePath,
                    requestId: requestId,
                    fileType: fileType,
                    maxSize: 10 * 1024 * 1024 // 10MB限制
                }
            };

            console.log('发送文件查看请求:', fileViewRequest);
            webSocketRef.current.send(JSON.stringify(fileViewRequest));

            // 设置超时
            const timeout = setTimeout(() => {
                setLoading(false);
                message.error('文件加载超时');
            }, 30000);

            // 监听响应
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'file_view_response' && data.data.requestId === requestId) {
                        clearTimeout(timeout);
                        setLoading(false);

                        if (data.data.error) {
                            setFileContent({
                                type: 'error',
                                content: '',
                                error: data.data.error
                            });
                            message.error(`文件加载失败: ${data.data.error}`);
                        } else {
                            setFileContent({
                                type: data.data.fileType || fileType,
                                content: data.data.content || '',
                                encoding: data.data.encoding,
                                mimeType: data.data.mimeType
                            });
                        }

                        webSocketRef.current?.removeEventListener('message', handleMessage);
                    }
                } catch (error) {
                    console.error('解析文件查看响应失败:', error);
                }
            };

            webSocketRef.current.addEventListener('message', handleMessage);

        } catch (error) {
            setLoading(false);
            console.error('发送文件查看请求失败:', error);
            message.error('发送文件查看请求失败');
        }
    }, [webSocketRef, fileName, filePath, getFileType]);

    // 复制文件内容
    const copyContent = useCallback(() => {
        if (fileContent && fileContent.type === 'text') {
            navigator.clipboard.writeText(fileContent.content).then(() => {
                message.success('内容已复制到剪贴板');
            }).catch(() => {
                message.error('复制失败');
            });
        }
    }, [fileContent]);

    // 下载文件
    const downloadFile = useCallback(() => {
        if (fileContent) {
            const blob = new Blob([fileContent.content], {
                type: fileContent.mimeType || 'application/octet-stream'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            message.success('文件下载开始');
        }
    }, [fileContent, fileName]);

    // 图片缩放控制
    const handleImageScale = useCallback((scale: number) => {
        setImageScale(Math.max(0.1, Math.min(5, scale)));
    }, []);

    // 组件挂载时加载文件内容
    useEffect(() => {
        if (visible && fileName && filePath) {
            loadFileContent();
        }
    }, [visible, fileName, filePath, loadFileContent]);

    // 重置状态
    useEffect(() => {
        if (!visible) {
            setFileContent(null);
            setActiveTab('content');
            setImageScale(1);
            setFullscreen(false);
        }
    }, [visible]);

    // 渲染文件内容
    const renderFileContent = () => {
        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16 }}>正在加载文件内容...</div>
                </div>
            );
        }

        if (!fileContent) {
            return (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <FileOutlined style={{ fontSize: 48, color: '#ccc' }} />
                    <div style={{ marginTop: 16 }}>暂无内容</div>
                </div>
            );
        }

        if (fileContent.type === 'error') {
            return (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <Text type="danger">加载失败: {fileContent.error}</Text>
                </div>
            );
        }

        if (fileContent.type === 'text') {
            return (
                <div className="file-text-content">
                    <pre style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: '60vh',
                        overflow: 'auto',
                        padding: '16px',
                        backgroundColor: '#f5f5f5',
                        border: '1px solid #d9d9d9',
                        borderRadius: '6px'
                    }}>
                        {fileContent.content}
                    </pre>
                </div>
            );
        }

        if (fileContent.type === 'image') {
            return (
                <div className="file-image-content" style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: 16 }}>
                        <Space>
                            <Button
                                icon={<ZoomOutOutlined />}
                                onClick={() => handleImageScale(imageScale - 0.2)}
                                disabled={imageScale <= 0.2}
                            >
                                缩小
                            </Button>
                            <Text>{Math.round(imageScale * 100)}%</Text>
                            <Button
                                icon={<ZoomInOutlined />}
                                onClick={() => handleImageScale(imageScale + 0.2)}
                                disabled={imageScale >= 5}
                            >
                                放大
                            </Button>
                            <Button
                                icon={<FullscreenOutlined />}
                                onClick={() => setFullscreen(true)}
                            >
                                全屏
                            </Button>
                        </Space>
                    </div>
                    <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
                        <Image
                            src={`data:${fileContent.mimeType || 'image/png'};base64,${fileContent.content}`}
                            alt={fileName}
                            style={{
                                transform: `scale(${imageScale})`,
                                transformOrigin: 'center',
                                maxWidth: 'none'
                            }}
                            preview={{
                                visible: fullscreen,
                                onVisibleChange: setFullscreen,
                                mask: false
                            }}
                        />
                    </div>
                </div>
            );
        }

        return (
            <div style={{ textAlign: 'center', padding: '50px' }}>
                <Text type="secondary">不支持预览此类型的文件</Text>
            </div>
        );
    };

    // 渲染文件信息
    const renderFileInfo = () => {
        return (
            <Card size="small">
                <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                        <Text strong>文件名: </Text>
                        <Text>{fileName}</Text>
                    </div>
                    <div>
                        <Text strong>文件路径: </Text>
                        <Text code>{filePath}</Text>
                    </div>
                    <div>
                        <Text strong>文件大小: </Text>
                        <Text>{formatFileSize(fileSize)}</Text>
                    </div>
                    <div>
                        <Text strong>文件类型: </Text>
                        <Tag color={
                            getFileType(fileName) === 'text' ? 'green' :
                                getFileType(fileName) === 'image' ? 'blue' : 'default'
                        }>
                            {getFileType(fileName) === 'text' ? '文本文件' :
                                getFileType(fileName) === 'image' ? '图片文件' : '二进制文件'}
                        </Tag>
                    </div>
                    {fileContent && fileContent.encoding && (
                        <div>
                            <Text strong>编码: </Text>
                            <Text>{fileContent.encoding}</Text>
                        </div>
                    )}
                    {fileContent && fileContent.mimeType && (
                        <div>
                            <Text strong>MIME类型: </Text>
                            <Text>{fileContent.mimeType}</Text>
                        </div>
                    )}
                </Space>
            </Card>
        );
    };

    return (
        <Modal
            title={
                <Space>
                    {getFileType(fileName) === 'text' ? <FileTextOutlined /> :
                        getFileType(fileName) === 'image' ? <PictureOutlined /> : <FileOutlined />}
                    文件查看器 - {fileName}
                </Space>
            }
            open={visible}
            onCancel={onClose}
            width="80%"
            style={{ top: 20 }}
            footer={
                <Space>
                    <Button onClick={onClose}>
                        关闭
                    </Button>
                    {fileContent && fileContent.type === 'text' && (
                        <Button icon={<CopyOutlined />} onClick={copyContent}>
                            复制内容
                        </Button>
                    )}
                    <Button icon={<DownloadOutlined />} onClick={downloadFile} type="primary">
                        下载文件
                    </Button>
                </Space>
            }
        >
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
                <TabPane tab="文件内容" key="content">
                    {renderFileContent()}
                </TabPane>
                <TabPane tab="文件信息" key="info">
                    {renderFileInfo()}
                </TabPane>
            </Tabs>
        </Modal>
    );
};

export default FileViewer; 
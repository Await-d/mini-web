/*
 * @Author: Await
 * @Date: 2025-01-02 10:30:00
 * @LastEditors: Await
 * @LastEditTime: 2025-01-02 10:30:00
 * @Description: 压缩包管理组件
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
    Modal,
    Button,
    Space,
    List,
    Progress,
    Typography,
    Input,
    Form,
    Select,
    Checkbox,
    Card,
    Tag,
    Divider,
    Alert,
    App
} from 'antd';
import {
    FileZipOutlined,
    FolderOpenOutlined,
    DownloadOutlined,
    UploadOutlined,
    DeleteOutlined,
    FileOutlined,
    FolderOutlined,
    ExclamationCircleOutlined,
    CheckCircleOutlined,
    LoadingOutlined,
    UnorderedListOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Option } = Select;

interface ArchiveManagerProps {
    visible: boolean;
    onClose: () => void;
    fileName: string;
    filePath: string;
    fileSize: number;
    webSocketRef: React.RefObject<WebSocket | null>;
    connectionId?: string | number;
    sessionId?: string | number;
    onRefresh?: () => void; // 刷新文件列表的回调
}

interface ArchiveEntry {
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    compressed: number;
    method: string;
    crc: string;
    modified: string;
}

interface ArchiveInfo {
    totalFiles: number;
    totalDirectories: number;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    archiveType: string;
    entries: ArchiveEntry[];
}

const ArchiveManager: React.FC<ArchiveManagerProps> = ({
    visible,
    onClose,
    fileName,
    filePath,
    fileSize,
    webSocketRef,
    connectionId,
    sessionId,
    onRefresh
}) => {
    const { message } = App.useApp();

    const [loading, setLoading] = useState(false);
    const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
    const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
    const [extractPath, setExtractPath] = useState('');
    const [extracting, setExtracting] = useState(false);
    const [extractProgress, setExtractProgress] = useState(0);
    const [operation, setOperation] = useState<'list' | 'extract' | 'create'>('list');
    const [compressionLevel, setCompressionLevel] = useState(6);
    const [archiveFormat, setArchiveFormat] = useState('zip');

    // 获取文件扩展名
    const getFileExtension = useCallback((filename: string): string => {
        return filename.toLowerCase().split('.').pop() || '';
    }, []);

    // 判断是否是支持的压缩包格式
    const getSupportedArchiveTypes = useCallback(() => {
        return ['zip', 'tar', 'gz', 'tgz', 'tar.gz', 'rar', '7z', 'bz2', 'xz'];
    }, []);

    const isArchiveFile = useCallback((filename: string): boolean => {
        const extension = getFileExtension(filename);
        const supportedTypes = getSupportedArchiveTypes();
        return supportedTypes.includes(extension) || filename.toLowerCase().includes('.tar.');
    }, [getFileExtension, getSupportedArchiveTypes]);

    // 格式化文件大小
    const formatFileSize = useCallback((bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    // 加载压缩包信息
    const loadArchiveInfo = useCallback(async () => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        setLoading(true);
        setArchiveInfo(null);

        try {
            const requestId = `archive_list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // 发送压缩包列表请求
            const archiveListRequest = {
                type: 'archive_list',
                data: {
                    path: filePath,
                    requestId: requestId
                }
            };

            console.log('发送压缩包列表请求:', archiveListRequest);
            webSocketRef.current.send(JSON.stringify(archiveListRequest));

            // 设置超时
            const timeout = setTimeout(() => {
                setLoading(false);
                message.error('压缩包信息加载超时');
            }, 30000);

            // 监听响应
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'archive_list_response' && data.data.requestId === requestId) {
                        clearTimeout(timeout);
                        setLoading(false);

                        if (data.data.error) {
                            message.error(`压缩包信息加载失败: ${data.data.error}`);
                        } else {
                            setArchiveInfo(data.data.archiveInfo);
                        }

                        webSocketRef.current?.removeEventListener('message', handleMessage);
                    }
                } catch (error) {
                    console.error('解析压缩包列表响应失败:', error);
                }
            };

            webSocketRef.current.addEventListener('message', handleMessage);

        } catch (error) {
            setLoading(false);
            console.error('发送压缩包列表请求失败:', error);
            message.error('发送压缩包列表请求失败');
        }
    }, [webSocketRef, filePath]);

    // 解压文件
    const extractArchive = useCallback(async () => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        if (!extractPath.trim()) {
            message.error('请输入解压路径');
            return;
        }

        setExtracting(true);
        setExtractProgress(0);

        try {
            const requestId = `archive_extract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // 发送解压请求
            const extractRequest = {
                type: 'archive_extract',
                data: {
                    archivePath: filePath,
                    extractPath: extractPath,
                    selectedEntries: selectedEntries.length > 0 ? selectedEntries : undefined,
                    requestId: requestId
                }
            };

            console.log('发送解压请求:', extractRequest);
            webSocketRef.current.send(JSON.stringify(extractRequest));

            // 监听响应
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.data.requestId === requestId) {
                        if (data.type === 'archive_extract_progress') {
                            setExtractProgress(data.data.progress || 0);
                        } else if (data.type === 'archive_extract_response') {
                            setExtracting(false);

                            if (data.data.error) {
                                message.error(`解压失败: ${data.data.error}`);
                            } else {
                                message.success('解压完成');
                                if (onRefresh) {
                                    onRefresh();
                                }
                                setOperation('list');
                            }

                            webSocketRef.current?.removeEventListener('message', handleMessage);
                        }
                    }
                } catch (error) {
                    console.error('解析解压响应失败:', error);
                }
            };

            webSocketRef.current.addEventListener('message', handleMessage);

        } catch (error) {
            setExtracting(false);
            console.error('发送解压请求失败:', error);
            message.error('发送解压请求失败');
        }
    }, [webSocketRef, filePath, extractPath, selectedEntries, onRefresh]);

    // 创建压缩包
    const createArchive = useCallback(async (sourceFiles: string[], targetPath: string) => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        setLoading(true);

        try {
            const requestId = `archive_create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // 发送创建压缩包请求
            const createRequest = {
                type: 'archive_create',
                data: {
                    sourceFiles: sourceFiles,
                    targetPath: targetPath,
                    format: archiveFormat,
                    compressionLevel: compressionLevel,
                    requestId: requestId
                }
            };

            console.log('发送创建压缩包请求:', createRequest);
            webSocketRef.current.send(JSON.stringify(createRequest));

            // 监听响应
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'archive_create_response' && data.data.requestId === requestId) {
                        setLoading(false);

                        if (data.data.error) {
                            message.error(`创建压缩包失败: ${data.data.error}`);
                        } else {
                            message.success('压缩包创建完成');
                            if (onRefresh) {
                                onRefresh();
                            }
                        }

                        webSocketRef.current?.removeEventListener('message', handleMessage);
                    }
                } catch (error) {
                    console.error('解析创建压缩包响应失败:', error);
                }
            };

            webSocketRef.current.addEventListener('message', handleMessage);

        } catch (error) {
            setLoading(false);
            console.error('发送创建压缩包请求失败:', error);
            message.error('发送创建压缩包请求失败');
        }
    }, [webSocketRef, archiveFormat, compressionLevel, onRefresh]);

    // 组件挂载时加载压缩包信息
    useEffect(() => {
        if (visible && fileName && filePath && isArchiveFile(fileName)) {
            loadArchiveInfo();
        }
    }, [visible, fileName, filePath, loadArchiveInfo, isArchiveFile]);

    // 重置状态
    useEffect(() => {
        if (!visible) {
            setArchiveInfo(null);
            setSelectedEntries([]);
            setExtractPath('');
            setExtracting(false);
            setExtractProgress(0);
            setOperation('list');
        }
    }, [visible]);

    // 渲染压缩包列表
    const renderArchiveList = () => {
        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <LoadingOutlined style={{ fontSize: 24 }} spin />
                    <div style={{ marginTop: 16 }}>正在加载压缩包信息...</div>
                </div>
            );
        }

        if (!archiveInfo) {
            return (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <FileZipOutlined style={{ fontSize: 48, color: '#ccc' }} />
                    <div style={{ marginTop: 16 }}>无法加载压缩包信息</div>
                </div>
            );
        }

        return (
            <div>
                {/* 压缩包信息摘要 */}
                <Card size="small" style={{ marginBottom: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <div>
                            <Text strong>压缩包类型: </Text>
                            <Tag color="blue">{archiveInfo.archiveType.toUpperCase()}</Tag>
                        </div>
                        <div>
                            <Text strong>文件数量: </Text>
                            <Text>{archiveInfo.totalFiles} 个文件, {archiveInfo.totalDirectories} 个文件夹</Text>
                        </div>
                        <div>
                            <Text strong>原始大小: </Text>
                            <Text>{formatFileSize(archiveInfo.originalSize)}</Text>
                        </div>
                        <div>
                            <Text strong>压缩大小: </Text>
                            <Text>{formatFileSize(archiveInfo.compressedSize)}</Text>
                        </div>
                        <div>
                            <Text strong>压缩率: </Text>
                            <Text>{archiveInfo.compressionRatio.toFixed(1)}%</Text>
                        </div>
                    </Space>
                </Card>

                {/* 文件列表 */}
                <List
                    size="small"
                    header={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text strong>压缩包内容 ({archiveInfo.entries.length} 项)</Text>
                            <Space>
                                <Checkbox
                                    checked={selectedEntries.length === archiveInfo.entries.length}
                                    indeterminate={selectedEntries.length > 0 && selectedEntries.length < archiveInfo.entries.length}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedEntries(archiveInfo.entries.map(entry => entry.path));
                                        } else {
                                            setSelectedEntries([]);
                                        }
                                    }}
                                >
                                    全选
                                </Checkbox>
                                <Text type="secondary">
                                    已选择 {selectedEntries.length} 项
                                </Text>
                            </Space>
                        </div>
                    }
                    bordered
                    dataSource={archiveInfo.entries}
                    style={{ maxHeight: '300px', overflow: 'auto' }}
                    renderItem={(entry) => (
                        <List.Item>
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                <Checkbox
                                    checked={selectedEntries.includes(entry.path)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedEntries(prev => [...prev, entry.path]);
                                        } else {
                                            setSelectedEntries(prev => prev.filter(path => path !== entry.path));
                                        }
                                    }}
                                    style={{ marginRight: 8 }}
                                />
                                {entry.isDirectory ? (
                                    <FolderOutlined style={{ color: '#faad14', marginRight: 8 }} />
                                ) : (
                                    <FileOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                                )}
                                <div style={{ flex: 1 }}>
                                    <div>
                                        <Text strong>{entry.name}</Text>
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                            {entry.path} - {formatFileSize(entry.size)}
                                            {entry.method && ` - ${entry.method}`}
                                        </Text>
                                    </div>
                                </div>
                            </div>
                        </List.Item>
                    )}
                />
            </div>
        );
    };

    // 渲染解压界面
    const renderExtractInterface = () => {
        return (
            <div>
                <Alert
                    message="解压设置"
                    description={selectedEntries.length > 0 ?
                        `将解压选中的 ${selectedEntries.length} 个项目` :
                        "将解压整个压缩包"
                    }
                    type="info"
                    style={{ marginBottom: 16 }}
                />

                <Form layout="vertical">
                    <Form.Item label="解压路径" required>
                        <Input
                            value={extractPath}
                            onChange={(e) => setExtractPath(e.target.value)}
                            placeholder="输入解压目标路径，如: /home/user/extracted"
                            addonBefore={<FolderOpenOutlined />}
                        />
                    </Form.Item>
                </Form>

                {extracting && (
                    <div style={{ marginTop: 16 }}>
                        <Text>解压进度:</Text>
                        <Progress percent={extractProgress} status="active" />
                    </div>
                )}
            </div>
        );
    };

    return (
        <Modal
            title={
                <Space>
                    <FileZipOutlined />
                    压缩包管理器 - {fileName}
                </Space>
            }
            open={visible}
            onCancel={onClose}
            width="70%"
            style={{ top: 20 }}
            footer={
                <Space>
                    {operation === 'list' && (
                        <>
                            <Button onClick={onClose}>
                                关闭
                            </Button>
                            <Button
                                icon={<UnorderedListOutlined />}
                                onClick={loadArchiveInfo}
                                loading={loading}
                            >
                                刷新列表
                            </Button>
                            <Button
                                type="primary"
                                icon={<FolderOpenOutlined />}
                                onClick={() => setOperation('extract')}
                                disabled={!archiveInfo}
                            >
                                解压文件
                            </Button>
                        </>
                    )}
                    {operation === 'extract' && (
                        <>
                            <Button onClick={() => setOperation('list')}>
                                返回
                            </Button>
                            <Button
                                type="primary"
                                icon={<FolderOpenOutlined />}
                                onClick={extractArchive}
                                loading={extracting}
                                disabled={!extractPath.trim()}
                            >
                                开始解压
                            </Button>
                        </>
                    )}
                </Space>
            }
        >
            {!isArchiveFile(fileName) ? (
                <Alert
                    message="不支持的文件格式"
                    description={`${fileName} 不是支持的压缩包格式。支持的格式: ${getSupportedArchiveTypes().join(', ')}`}
                    type="warning"
                    showIcon
                />
            ) : (
                <>
                    {operation === 'list' && renderArchiveList()}
                    {operation === 'extract' && renderExtractInterface()}
                </>
            )}
        </Modal>
    );
};

export default ArchiveManager; 
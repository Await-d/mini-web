/*
 * @Author: Await
 * @Date: 2025-01-02 10:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-04 21:04:30
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
    VideoCameraOutlined,
    FileOutlined,
    CloseOutlined,
    FullscreenOutlined,
    ZoomInOutlined,
    ZoomOutOutlined
} from '@ant-design/icons';
import './FileViewer.css';

const { Text, Paragraph } = Typography;

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
    type: 'text' | 'image' | 'video' | 'binary' | 'error';
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
    const [editMode, setEditMode] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);
    const [cancelling, setCancelling] = useState(false);

    // 获取文件扩展名
    const getFileExtension = useCallback((filename: string): string => {
        return filename.toLowerCase().split('.').pop() || '';
    }, []);

    // 判断文件类型
    const getFileType = useCallback((filename: string): 'text' | 'image' | 'video' | 'binary' => {
        const extension = getFileExtension(filename);

        // 文本文件扩展名
        const textExtensions = [
            'txt', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx',
            'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift',
            'yml', 'yaml', 'toml', 'ini', 'conf', 'config', 'log', 'sql', 'sh', 'bash',
            'dockerfile', 'gitignore', 'env', 'properties', 'csv', 'tsv', 'readme', 'nfo'
        ];

        // 图片文件扩展名  
        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif'
        ];

        // 视频文件扩展名
        const videoExtensions = [
            'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', 'rm', 'rmvb'
        ];

        if (textExtensions.includes(extension)) {
            return 'text';
        } else if (imageExtensions.includes(extension)) {
            return 'image';
        } else if (videoExtensions.includes(extension)) {
            return 'video';
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
    const loadFileContent = useCallback(() => {
        console.log('📄 loadFileContent 开始 - 参数:', {
            fileName,
            filePath,
            fileSize,
            webSocketExists: !!webSocketRef.current,
            webSocketState: webSocketRef.current?.readyState,
            connectionId,
            sessionId
        });

        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            console.error('📄 WebSocket连接未建立或已断开:', {
                exists: !!webSocketRef.current,
                readyState: webSocketRef.current?.readyState,
                CONNECTING: WebSocket.CONNECTING,
                OPEN: WebSocket.OPEN,
                CLOSING: WebSocket.CLOSING,
                CLOSED: WebSocket.CLOSED
            });
            message.error('WebSocket连接未建立');
            return;
        }

        setLoading(true);
        setFileContent(null);
        setLoadingProgress(null);
        setCancelling(false);

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

            console.log('📄 准备发送文件查看请求:', fileViewRequest);

            // 检查文件大小限制（视频文件不请求内容）
            if (fileType === 'video') {
                console.log('📄 视频文件类型，跳过内容加载');
                setFileContent({
                    type: 'video',
                    content: '',
                    error: undefined
                });
                setLoading(false);
                return;
            }

            console.log('📄 发送WebSocket消息...');
            webSocketRef.current.send(JSON.stringify(fileViewRequest));
            console.log('📄 WebSocket消息已发送');

            // 动态超时管理
            let timeoutId: NodeJS.Timeout;
            let lastActivity = Date.now();

            const resetTimeout = () => {
                if (timeoutId) clearTimeout(timeoutId);
                lastActivity = Date.now();

                // 根据文件大小动态设置超时时间：基础30秒 + 每MB增加10秒，最大5分钟
                const baseTimeout = 30000; // 30秒
                const sizeTimeoutBonus = Math.min(fileSize / (1024 * 1024) * 10000, 300000 - baseTimeout); // 最大5分钟
                const totalTimeout = baseTimeout + sizeTimeoutBonus;

                console.log(`📄 设置动态超时: ${Math.round(totalTimeout / 1000)}秒 (文件大小: ${formatFileSize(fileSize)})`);

                timeoutId = setTimeout(() => {
                    console.log('📄 文件加载超时，超时时间:', totalTimeout / 1000, '秒');
                    setLoading(false);
                    setLoadingProgress(null);
                    setCancelling(false);
                    message.error(`文件加载超时 (${Math.round(totalTimeout / 1000)}秒)`);
                    webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                }, totalTimeout);
            };

            // 初始设置超时
            resetTimeout();

            // 分段数据存储
            const segmentData = new Map<string, { segments: Map<number, string>, totalSegments: number }>();

            // 监听响应的处理函数
            const handleFileViewResponse = (event: MessageEvent) => {
                try {
                    // 检查数据类型
                    console.log('📄 FileViewer收到消息，数据类型:', typeof event.data, event.data?.constructor?.name);

                    // 如果是Blob类型，说明后端返回的是二进制数据而不是JSON
                    if (event.data instanceof Blob) {
                        console.error('📄 收到Blob数据，后端可能没有实现JSON格式的file_view API');
                        clearTimeout(timeoutId);
                        setLoading(false);
                        setLoadingProgress(null);
                        setCancelling(false);
                        setFileContent({
                            type: 'error',
                            content: '',
                            error: '后端未实现JSON格式的文件查看API，请检查后端实现'
                        });
                        message.error('后端API格式不正确，请联系管理员');
                        webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                        return;
                    }

                    // 检查是否是字符串
                    if (typeof event.data !== 'string') {
                        console.error('📄 收到非字符串数据:', typeof event.data, event.data);
                        clearTimeout(timeoutId);
                        setLoading(false);
                        setLoadingProgress(null);
                        setCancelling(false);
                        setFileContent({
                            type: 'error',
                            content: '',
                            error: '收到非文本格式的响应数据'
                        });
                        message.error('响应数据格式错误');
                        webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                        return;
                    }

                    // 检查是否是"[object Blob]"这样的字符串
                    if (event.data === '[object Blob]' || event.data.startsWith('[object ')) {
                        console.error('📄 收到对象字符串表示，可能是后端序列化错误:', event.data);
                        clearTimeout(timeoutId);
                        setLoading(false);
                        setLoadingProgress(null);
                        setCancelling(false);
                        setFileContent({
                            type: 'error',
                            content: '',
                            error: '后端返回了对象字符串而不是JSON数据'
                        });
                        message.error('后端数据序列化错误');
                        webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                        return;
                    }

                    const data = JSON.parse(event.data);
                    console.log('📄 FileViewer收到消息:', data.type, data.data?.requestId);

                    if (data.type === 'file_view_response' && data.data.requestId === requestId) {
                        console.log('📄 处理文件查看响应');
                        clearTimeout(timeoutId);
                        setLoading(false);
                        setLoadingProgress(null);
                        setCancelling(false);

                        if (data.data.error) {
                            console.error('📄 文件查看错误:', data.data.error);
                            setFileContent({
                                type: 'error',
                                content: '',
                                error: data.data.error
                            });
                            message.error(`文件加载失败: ${data.data.error}`);
                        } else {
                            console.log('📄 文件查看成功:', data.data.fileType, data.data.content?.length);
                            setFileContent({
                                type: data.data.fileType || fileType,
                                content: data.data.content || '',
                                encoding: data.data.encoding,
                                mimeType: data.data.mimeType
                            });
                        }

                        // 移除监听器
                        webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                    } else if (data.type === 'file_view_segment' && data.data.requestId === requestId) {
                        console.log('📄 处理文件查看分段响应:', data.data.segmentId, '/', data.data.totalSegments);

                        // 重置超时计时器，表示还在接收数据
                        resetTimeout();

                        // 初始化分段数据
                        if (!segmentData.has(requestId)) {
                            segmentData.set(requestId, {
                                segments: new Map(),
                                totalSegments: data.data.totalSegments
                            });
                        }

                        const segmentInfo = segmentData.get(requestId)!;
                        segmentInfo.segments.set(data.data.segmentId, data.data.data);

                        // 更新进度显示
                        setLoadingProgress({
                            current: segmentInfo.segments.size,
                            total: segmentInfo.totalSegments
                        });

                        // 检查是否接收完所有分段
                        if (segmentInfo.segments.size === segmentInfo.totalSegments) {
                            console.log('📄 接收完所有分段，开始合并');

                            // 按顺序合并分段
                            let completeData = '';
                            for (let i = 0; i < segmentInfo.totalSegments; i++) {
                                completeData += segmentInfo.segments.get(i) || '';
                            }

                            try {
                                // 解析完整的JSON数据
                                const completeJsonData = JSON.parse(completeData);
                                console.log('📄 分段数据合并成功，处理最终响应');

                                clearTimeout(timeoutId);
                                setLoading(false);
                                setLoadingProgress(null);
                                setCancelling(false);

                                if (completeJsonData.data.error) {
                                    console.error('📄 文件查看错误:', completeJsonData.data.error);
                                    setFileContent({
                                        type: 'error',
                                        content: '',
                                        error: completeJsonData.data.error
                                    });
                                    message.error(`文件加载失败: ${completeJsonData.data.error}`);
                                } else {
                                    console.log('📄 文件查看成功:', completeJsonData.data.fileType, completeJsonData.data.content?.length);
                                    setFileContent({
                                        type: completeJsonData.data.fileType || fileType,
                                        content: completeJsonData.data.content || '',
                                        encoding: completeJsonData.data.encoding,
                                        mimeType: completeJsonData.data.mimeType
                                    });
                                }

                                // 清理分段数据
                                segmentData.delete(requestId);

                                // 移除监听器
                                webSocketRef.current?.removeEventListener('message', handleFileViewResponse);

                            } catch (parseError) {
                                console.error('📄 解析合并后的分段数据失败:', parseError);
                                clearTimeout(timeoutId);
                                setLoading(false);
                                setLoadingProgress(null);
                                setCancelling(false);
                                setFileContent({
                                    type: 'error',
                                    content: '',
                                    error: '分段数据解析失败'
                                });
                                message.error('分段数据解析失败');
                                webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                            }
                        }
                    }
                } catch (error) {
                    console.error('📄 解析文件查看响应失败:', error);
                    console.error('📄 原始数据:', event.data);
                    console.error('📄 数据长度:', event.data?.length);
                    console.error('📄 数据前100字符:', typeof event.data === 'string' ? event.data.substring(0, 100) : 'N/A');

                    clearTimeout(timeoutId);
                    setLoading(false);
                    setLoadingProgress(null);
                    setCancelling(false);
                    setFileContent({
                        type: 'error',
                        content: '',
                        error: `解析响应失败: ${error instanceof Error ? error.message : String(error)}`
                    });
                    message.error(`解析响应失败: ${error instanceof Error ? error.message : String(error)}`);
                    webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                }
            };

            // 添加监听器
            webSocketRef.current.addEventListener('message', handleFileViewResponse);
            console.log('📄 已添加WebSocket消息监听器');

        } catch (error) {
            setLoading(false);
            console.error('📄 发送文件查看请求失败:', error);
            message.error('发送文件查看请求失败');
        }
    }, [webSocketRef, fileName, filePath, getFileType, connectionId, sessionId, fileSize, formatFileSize]);

    // 取消文件加载
    const cancelFileLoading = useCallback(() => {
        console.log('📄 用户取消文件加载');
        setCancelling(true);
        setLoading(false);
        setLoadingProgress(null);
        setFileContent({
            type: 'error',
            content: '',
            error: '用户取消了文件加载'
        });
        message.info('已取消文件加载');
    }, []);

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

    // 进入编辑模式
    const handleEdit = useCallback(() => {
        if (fileContent && fileContent.type === 'text') {
            setEditContent(fileContent.content);
            setEditMode(true);
        }
    }, [fileContent]);

    // 取消编辑
    const handleCancelEdit = useCallback(() => {
        setEditMode(false);
        setEditContent('');
    }, []);

    // 保存文件
    const handleSaveFile = useCallback(() => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        setSaving(true);

        try {
            const requestId = `file_save_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // 发送文件保存请求
            const fileSaveRequest = {
                type: 'file_save',
                data: {
                    path: filePath,
                    content: editContent,
                    requestId: requestId,
                    encoding: 'utf-8'
                }
            };

            console.log('📝 发送文件保存请求:', fileSaveRequest);
            webSocketRef.current.send(JSON.stringify(fileSaveRequest));

            // 设置超时
            const timeout = setTimeout(() => {
                console.log('📝 文件保存超时');
                setSaving(false);
                message.error('文件保存超时');
            }, 30000);

            // 监听响应
            const handleFileSaveResponse = (event: MessageEvent) => {
                try {
                    if (typeof event.data !== 'string') {
                        return;
                    }

                    const data = JSON.parse(event.data);
                    console.log('📝 收到保存响应:', data.type, data.data?.requestId);

                    if (data.type === 'file_save_response' && data.data.requestId === requestId) {
                        clearTimeout(timeout);
                        setSaving(false);

                        if (data.data.error) {
                            console.error('📝 文件保存错误:', data.data.error);
                            message.error(`文件保存失败: ${data.data.error}`);
                        } else {
                            console.log('📝 文件保存成功');
                            message.success('文件保存成功');

                            // 更新文件内容
                            setFileContent(prev => prev ? {
                                ...prev,
                                content: editContent
                            } : null);

                            // 退出编辑模式
                            setEditMode(false);
                        }

                        // 移除监听器
                        webSocketRef.current?.removeEventListener('message', handleFileSaveResponse);
                    }
                } catch (error) {
                    console.error('📝 解析保存响应失败:', error);
                    clearTimeout(timeout);
                    setSaving(false);
                    message.error(`解析响应失败: ${error instanceof Error ? error.message : String(error)}`);
                    webSocketRef.current?.removeEventListener('message', handleFileSaveResponse);
                }
            };

            // 添加监听器
            webSocketRef.current.addEventListener('message', handleFileSaveResponse);

        } catch (error) {
            setSaving(false);
            console.error('📝 发送文件保存请求失败:', error);
            message.error('发送文件保存请求失败');
        }
    }, [webSocketRef, filePath, editContent]);

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
            setEditMode(false);
            setEditContent('');
            setSaving(false);
        }
    }, [visible]);

    // 渲染文件内容
    const renderFileContent = () => {
        if (loading) {
            return (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <Space direction="vertical" size="large">
                        <Spin size="large" />
                        <div>正在加载文件内容...</div>

                        {loadingProgress && (
                            <div>
                                <div style={{ marginBottom: 8 }}>
                                    <Text type="secondary">
                                        正在接收分段数据：{loadingProgress.current} / {loadingProgress.total}
                                    </Text>
                                </div>
                                <div style={{ width: 300, margin: '0 auto' }}>
                                    <div style={{
                                        width: '100%',
                                        height: 6,
                                        backgroundColor: '#f0f0f0',
                                        borderRadius: 3,
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            width: `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                                            height: '100%',
                                            backgroundColor: '#1677ff',
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </div>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {Math.round((loadingProgress.current / loadingProgress.total) * 100)}%
                                    </Text>
                                </div>
                            </div>
                        )}

                        <Button
                            onClick={cancelFileLoading}
                            disabled={cancelling}
                            danger
                            type="text"
                        >
                            {cancelling ? '正在取消...' : '取消加载'}
                        </Button>
                    </Space>
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
                    <Text type="danger">❌ 加载失败: {fileContent.error || '未知错误'}</Text>
                    <div style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
                        请检查后端是否正确实现了 file_view API
                    </div>
                </div>
            );
        }

        if (fileContent.type === 'text') {
            const language = getSyntaxLanguage(fileName);
            const isLargeFile = fileContent.content.length > 100000; // 100KB
            const displayContent = editMode ? editContent : fileContent.content;

            return (
                <div className="file-text-content">
                    <div style={{ marginBottom: 8, fontSize: '12px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space>
                            <Tag style={{ fontSize: '11px', padding: '0 4px' }}>{language.toUpperCase()}</Tag>
                            <span>共 {displayContent.split('\n').length} 行</span>
                            <span>大小: {formatFileSize(new Blob([displayContent]).size)}</span>
                            {isLargeFile && (
                                <Tag color="warning" style={{ fontSize: '11px', padding: '0 4px' }}>大文件</Tag>
                            )}
                            {editMode && (
                                <Tag color="orange" style={{ fontSize: '11px', padding: '0 4px' }}>编辑模式</Tag>
                            )}
                        </Space>

                        {!editMode ? (
                            <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={handleEdit}
                                type="text"
                            >
                                编辑
                            </Button>
                        ) : (
                            <Space>
                                <Button
                                    size="small"
                                    onClick={handleCancelEdit}
                                    disabled={saving}
                                >
                                    取消
                                </Button>
                                <Button
                                    size="small"
                                    type="primary"
                                    loading={saving}
                                    onClick={handleSaveFile}
                                >
                                    保存
                                </Button>
                            </Space>
                        )}
                    </div>

                    {editMode ? (
                        <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            style={{
                                width: '100%',
                                height: '60vh',
                                padding: '16px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #d9d9d9',
                                borderRadius: '6px',
                                fontSize: '14px',
                                lineHeight: '1.6',
                                fontFamily: "'Fira Code', 'Monaco', 'Consolas', 'Courier New', monospace",
                                color: '#262626',
                                resize: 'vertical',
                                outline: 'none',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                transition: 'border-color 0.3s, box-shadow 0.3s'
                            }}
                            placeholder="编辑文件内容..."
                            disabled={saving}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#1890ff';
                                e.target.style.boxShadow = '0 0 0 2px rgba(24, 144, 255, 0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#d9d9d9';
                                e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                            }}
                        />
                    ) : (
                        <pre style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: '60vh',
                            overflow: 'auto',
                            padding: '16px',
                            backgroundColor: '#fafafa',
                            border: '1px solid #e8e8e8',
                            borderRadius: '6px',
                            fontSize: '13px',
                            lineHeight: '1.5',
                            fontFamily: "'Fira Code', 'Monaco', 'Consolas', 'Courier New', monospace"
                        }}>
                            {fileContent.content}
                        </pre>
                    )}
                </div>
            );
        }

        if (fileContent.type === 'image') {
            const imageUrl = `data:${fileContent.mimeType || 'image/png'};base64,${fileContent.content}`;

            return (
                <div className="file-image-content" style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: 16 }}>
                        <Space>
                            <Button
                                icon={<ZoomOutOutlined />}
                                onClick={() => handleImageScale(imageScale - 0.2)}
                                disabled={imageScale <= 0.2}
                                size="small"
                            >
                                缩小
                            </Button>
                            <Tag style={{ fontSize: '12px' }}>{Math.round(imageScale * 100)}%</Tag>
                            <Button
                                icon={<ZoomInOutlined />}
                                onClick={() => handleImageScale(imageScale + 0.2)}
                                disabled={imageScale >= 5}
                                size="small"
                            >
                                放大
                            </Button>
                            <Button
                                icon={<FullscreenOutlined />}
                                onClick={() => setFullscreen(true)}
                                size="small"
                            >
                                全屏预览
                            </Button>
                        </Space>
                    </div>
                    <div style={{
                        overflow: 'auto',
                        maxHeight: '60vh',
                        border: '1px solid #e8e8e8',
                        borderRadius: '6px',
                        padding: '16px',
                        backgroundColor: '#fafafa'
                    }}>
                        <Image
                            src={imageUrl}
                            alt={fileName}
                            style={{
                                transform: `scale(${imageScale})`,
                                transformOrigin: 'center',
                                maxWidth: 'none',
                                display: 'block',
                                margin: '0 auto'
                            }}
                            preview={{
                                visible: fullscreen,
                                onVisibleChange: setFullscreen,
                                mask: false,
                                src: imageUrl
                            }}
                            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
                        />
                    </div>
                    <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                        <Space>
                            <span>类型: {fileContent.mimeType || '未知'}</span>
                            <span>文件名: {fileName}</span>
                        </Space>
                    </div>
                </div>
            );
        }

        if (fileContent.type === 'video') {
            return (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <div style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }}>
                        📹
                    </div>
                    <Text type="secondary">视频文件不支持在线预览</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                        请下载文件到本地播放
                    </Text>
                </div>
            );
        }

        return (
            <div style={{ textAlign: 'center', padding: '50px' }}>
                <Text type="secondary">不支持预览此类型的文件</Text>
                <br />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                    请下载文件查看内容
                </Text>
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
                                getFileType(fileName) === 'image' ? 'blue' :
                                    getFileType(fileName) === 'video' ? 'purple' : 'default'
                        }>
                            {getFileType(fileName) === 'text' ? '文本文件' :
                                getFileType(fileName) === 'image' ? '图片文件' :
                                    getFileType(fileName) === 'video' ? '视频文件' : '二进制文件'}
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
                        getFileType(fileName) === 'image' ? <PictureOutlined /> :
                            getFileType(fileName) === 'video' ? <VideoCameraOutlined /> : <FileOutlined />}
                    文件查看器 - {fileName}
                </Space>
            }
            open={visible}
            onCancel={onClose}
            width="80%"
            style={{ top: 20 }}
            footer={
                <Space>
                    <Button onClick={onClose} disabled={saving}>
                        关闭
                    </Button>
                    {fileContent && fileContent.type === 'text' && !editMode && (
                        <>
                            <Button icon={<CopyOutlined />} onClick={copyContent}>
                                复制内容
                            </Button>
                            <Button icon={<EditOutlined />} onClick={handleEdit}>
                                编辑文件
                            </Button>
                        </>
                    )}
                    {editMode && (
                        <>
                            <Button onClick={handleCancelEdit} disabled={saving}>
                                取消编辑
                            </Button>
                            <Button
                                type="primary"
                                loading={saving}
                                onClick={handleSaveFile}
                                icon={<EditOutlined />}
                            >
                                保存文件
                            </Button>
                        </>
                    )}
                    {!editMode && (
                        <Button icon={<DownloadOutlined />} onClick={downloadFile} type="primary">
                            下载文件
                        </Button>
                    )}
                </Space>
            }
        >
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: 'content',
                        label: '文件内容',
                        children: renderFileContent()
                    },
                    {
                        key: 'info',
                        label: '文件信息',
                        children: renderFileInfo()
                    }
                ]}
            />
        </Modal>
    );
};

export default FileViewer; 
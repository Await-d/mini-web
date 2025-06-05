/*
 * @Author: Await
 * @Date: 2025-01-02 10:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-05 21:41:03
 * @Description: 文件查看器组件
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
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

    // 添加分段数据管理
    const segmentDataRef = useRef<Map<string, { segments: Map<number, string>, totalSegments: number }>>(new Map());
    const currentRequestRef = useRef<string | null>(null);
    const requestTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);

    // 清理分段数据的函数
    const clearSegmentData = useCallback((requestId?: string) => {
        if (requestId) {
            segmentDataRef.current.delete(requestId);
            console.log('📄 清理特定请求的分段数据:', requestId);
        } else {
            segmentDataRef.current.clear();
            console.log('📄 清理所有分段数据');
        }
    }, []);

    // 清理超时定时器
    const clearRequestTimeout = useCallback(() => {
        if (requestTimeoutRef.current) {
            clearTimeout(requestTimeoutRef.current);
            requestTimeoutRef.current = null;
        }
    }, []);

    // 清理消息监听器
    const clearMessageHandler = useCallback(() => {
        if (messageHandlerRef.current && webSocketRef.current) {
            console.log('📄 清理消息监听器');
            webSocketRef.current.removeEventListener('message', messageHandlerRef.current);
            messageHandlerRef.current = null;
        }
    }, [webSocketRef]);

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            clearSegmentData();
            clearRequestTimeout();
            currentRequestRef.current = null;
        };
    }, [clearSegmentData, clearRequestTimeout]);

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

    // 通知后端停止传输的函数
    const notifyBackendStopTransmission = useCallback((requestId: string, reason: string) => {
        console.log('📄 开始通知后端停止传输 - requestId:', requestId, 'reason:', reason);
        console.log('📄 WebSocket存在:', !!webSocketRef.current, 'readyState:', webSocketRef.current?.readyState);

        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
            try {
                const stopRequest = {
                    type: 'file_view_cancel',
                    data: {
                        requestId: requestId,
                        reason: reason
                    }
                };
                console.log('📄 发送停止传输请求:', stopRequest);
                webSocketRef.current.send(JSON.stringify(stopRequest));
                console.log('📄 停止传输请求已发送');
            } catch (error) {
                console.error('📄 发送停止传输请求失败:', error);
            }
        } else {
            console.warn('📄 WebSocket连接不可用，无法发送停止传输请求');
        }
    }, [webSocketRef]);

    // 完整的错误清理函数 - 不包含移除事件监听器，因为那需要在调用点处理
    const handleTransmissionError = useCallback((requestId: string, errorMessage: string, reason: string) => {
        console.error('📄 传输错误:', errorMessage);

        // 通知后端停止传输
        notifyBackendStopTransmission(requestId, reason);

        // 清理所有状态
        clearSegmentData(requestId);
        clearRequestTimeout();
        currentRequestRef.current = null;

        // 更新UI状态
        setLoading(false);
        setLoadingProgress(null);
        setCancelling(false);
        setFileContent({
            type: 'error',
            content: '',
            error: errorMessage
        });
    }, [notifyBackendStopTransmission, clearSegmentData, clearRequestTimeout]);

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

            // 设置当前请求ID，用于取消检查
            currentRequestRef.current = requestId;

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
                // 清理请求ID，因为没有真正的请求
                currentRequestRef.current = null;
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

            // 监听响应的处理函数
            const handleFileViewResponse = (event: MessageEvent) => {
                try {
                    // 检查是否为心跳消息，如果是则忽略
                    if ((event as any).__isHeartbeatMessage) {
                        console.log('💓 FileViewer忽略心跳消息');
                        return;
                    }

                    // 检查数据类型
                    console.log('📄 FileViewer收到消息，数据类型:', typeof event.data, event.data?.constructor?.name);

                    // 如果是Blob类型，尝试转换为文本后重新处理
                    if (event.data instanceof Blob) {
                        console.warn('📄 收到Blob数据，尝试转换为文本');

                        event.data.text().then(text => {
                            console.log('📄 Blob转文本成功，重新处理:', text.substring(0, 100) + '...');
                            // 创建新的事件对象，模拟文本消息
                            const newEvent = {
                                ...event,
                                data: text
                            } as MessageEvent;

                            // 递归调用自己处理转换后的文本
                            handleFileViewResponse(newEvent);
                        }).catch(error => {
                            console.error('📄 Blob转文本失败:', error);
                            clearTimeout(timeoutId);
                            handleTransmissionError(requestId, '无法将Blob数据转换为文本', 'blob_conversion_failed');
                            webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                            message.error('数据格式转换失败');
                        });
                        return;
                    }

                    // 检查是否是字符串
                    if (typeof event.data !== 'string') {
                        clearTimeout(timeoutId);
                        handleTransmissionError(requestId, '收到非文本格式的响应数据', 'non_string_data');
                        webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                        message.error('响应数据格式错误');
                        return;
                    }

                    // 检查是否是"[object Blob]"这样的字符串
                    if (event.data === '[object Blob]' || event.data.startsWith('[object ')) {
                        clearTimeout(timeoutId);
                        handleTransmissionError(requestId, '后端返回了对象字符串而不是JSON数据', 'object_string_received');
                        webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                        message.error('后端数据序列化错误');
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

                        // 清理当前请求ID并移除监听器
                        currentRequestRef.current = null;
                        webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                    } else if (data.type === 'file_view_cancel_response' && data.data.requestId === requestId) {
                        console.log('📄 收到取消确认响应:', data.data.reason);
                        clearTimeout(timeoutId);
                        setLoading(false);
                        setLoadingProgress(null);
                        setCancelling(false);

                        // 清理当前请求ID并移除监听器
                        currentRequestRef.current = null;
                        webSocketRef.current?.removeEventListener('message', handleFileViewResponse);

                        setFileContent({
                            type: 'error',
                            content: '',
                            error: '文件传输已取消'
                        });
                    } else if (data.type === 'file_view_segment' && data.data.requestId === requestId) {
                        console.log('📄 处理文件查看分段响应:', data.data.segmentId, '/', data.data.totalSegments);

                        // 检查请求是否仍然有效（避免处理已取消请求的分段）
                        if (currentRequestRef.current !== requestId) {
                            console.log('📄 忽略已取消请求的分段数据:', requestId);
                            return;
                        }

                        // 重置超时计时器，表示还在接收数据
                        resetTimeout();

                        // 初始化分段数据
                        if (!segmentDataRef.current.has(requestId)) {
                            segmentDataRef.current.set(requestId, {
                                segments: new Map(),
                                totalSegments: data.data.totalSegments
                            });
                        }

                        const segmentInfo = segmentDataRef.current.get(requestId)!;
                        segmentInfo.segments.set(data.data.segmentId, data.data.data);

                        // 更新进度显示
                        setLoadingProgress({
                            current: segmentInfo.segments.size,
                            total: segmentInfo.totalSegments
                        });

                        // 检查是否接收完所有分段
                        if (segmentInfo.segments.size === segmentInfo.totalSegments) {
                            console.log('📄 接收完所有分段，开始合并');

                            try {
                                // 使用流式合并避免大字符串拼接
                                const segments: string[] = [];
                                for (let i = 0; i < segmentInfo.totalSegments; i++) {
                                    const segment = segmentInfo.segments.get(i);
                                    if (segment === undefined) {
                                        throw new Error(`缺少分段 ${i}`);
                                    }
                                    segments.push(segment);
                                }

                                // 分批处理大数据，避免UI阻塞
                                const processSegments = async () => {
                                    // 合并所有分段
                                    const completeData = segments.join('');
                                    console.log('📄 分段数据合并完成，数据大小:', completeData.length);

                                    // 使用setTimeout让出主线程，避免UI阻塞
                                    return new Promise<any>((resolve, reject) => {
                                        setTimeout(() => {
                                            try {
                                                const completeJsonData = JSON.parse(completeData);
                                                resolve(completeJsonData);
                                            } catch (error) {
                                                reject(error);
                                            }
                                        }, 0);
                                    });
                                };

                                processSegments().then(completeJsonData => {
                                    console.log('📄 分段数据解析成功，处理最终响应');

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
                                    clearSegmentData(requestId);

                                    // 清理当前请求ID并移除监听器
                                    currentRequestRef.current = null;
                                    webSocketRef.current?.removeEventListener('message', handleFileViewResponse);

                                }).catch(parseError => {
                                    console.error('📄 解析合并后的分段数据失败:', parseError);
                                    clearTimeout(timeoutId);
                                    handleTransmissionError(requestId, '分段数据解析失败', 'parse_error');
                                    webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                                    message.error('分段数据解析失败');
                                });

                            } catch (segmentError) {
                                console.error('📄 分段处理失败:', segmentError);
                                clearTimeout(timeoutId);
                                handleTransmissionError(requestId, '分段数据处理失败', 'segment_processing_error');
                                webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                                message.error('分段数据处理失败');
                            }
                        }
                    }
                } catch (error) {
                    console.error('📄 解析文件查看响应失败:', error);
                    console.error('📄 原始数据:', event.data);
                    console.error('📄 数据长度:', event.data?.length);
                    console.error('📄 数据前100字符:', typeof event.data === 'string' ? event.data.substring(0, 100) : 'N/A');

                    clearTimeout(timeoutId);
                    const errorMsg = `解析响应失败: ${error instanceof Error ? error.message : String(error)}`;
                    handleTransmissionError(requestId, errorMsg, 'parse_json_error');
                    webSocketRef.current?.removeEventListener('message', handleFileViewResponse);
                    message.error(errorMsg);
                }
            };

            // 保存消息处理器引用并添加监听器
            messageHandlerRef.current = handleFileViewResponse;
            webSocketRef.current.addEventListener('message', handleFileViewResponse);

        } catch (error) {
            setLoading(false);
            console.error('📄 发送文件查看请求失败:', error);
            message.error('发送文件查看请求失败');
        }
    }, [webSocketRef, fileName, filePath, getFileType, connectionId, sessionId, fileSize, formatFileSize]);

    // 取消文件加载
    const cancelFileLoading = useCallback(() => {
        setCancelling(true);
        setLoading(false);
        setLoadingProgress(null);

        // 如果有正在进行的请求，通知后端停止传输
        if (currentRequestRef.current) {
            notifyBackendStopTransmission(currentRequestRef.current, '用户取消了文件加载');
        }

        // 清理分段数据、超时定时器和消息监听器
        clearSegmentData();
        clearRequestTimeout();
        clearMessageHandler();
        currentRequestRef.current = null;

        setFileContent({
            type: 'error',
            content: '',
            error: '用户取消了文件加载'
        });
        message.info('已取消文件加载');
    }, [clearSegmentData, clearRequestTimeout, notifyBackendStopTransmission, clearMessageHandler]);

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
        console.log('📄 useEffect重置状态 - visible:', visible, 'currentRequestRef:', currentRequestRef.current);
        if (!visible) {
            // 如果有正在进行的请求，通知后端停止传输
            if (currentRequestRef.current) {
                console.log('📄 关闭预览，通知后端停止传输:', currentRequestRef.current);
                console.log('📄 WebSocket状态:', webSocketRef.current?.readyState);
                notifyBackendStopTransmission(currentRequestRef.current, '用户关闭了预览');
            } else {
                console.log('📄 关闭预览，但没有活动请求需要取消');
            }

            setFileContent(null);
            setActiveTab('content');
            setImageScale(1);
            setFullscreen(false);
            setEditMode(false);
            setEditContent('');
            setSaving(false);
            setLoadingProgress(null);
            setCancelling(false);

            // 清理分段数据和超时定时器
            clearSegmentData();
            clearRequestTimeout();
            currentRequestRef.current = null;

            // 移除消息监听器
            clearMessageHandler();
        }
    }, [visible, clearSegmentData, clearRequestTimeout, notifyBackendStopTransmission, clearMessageHandler]);

    // 组件卸载时的清理
    useEffect(() => {
        return () => {
            // 组件卸载时，如果有活动请求，则取消
            if (currentRequestRef.current) {
                console.log('📄 组件卸载，取消活动请求:', currentRequestRef.current);
                notifyBackendStopTransmission(currentRequestRef.current, '组件卸载');
            }

            // 移除消息监听器
            clearMessageHandler();
        };
    }, [notifyBackendStopTransmission, clearMessageHandler]);

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
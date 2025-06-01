/*
 * @Author: Await
 * @Date: 2025-05-26 20:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-01 09:16:09
 * @Description: SSH终端文件浏览器组件
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    ReloadOutlined,
    FolderOutlined,
    FileOutlined,
    HomeOutlined,
    FolderAddOutlined,
    UploadOutlined,
    DownloadOutlined,
    DeleteOutlined,
    EditOutlined,
    SearchOutlined,
    SortAscendingOutlined,
    SortDescendingOutlined,
    CheckSquareOutlined,
    MinusSquareOutlined,
    EyeOutlined,
    HistoryOutlined,
    UpOutlined,
    DownOutlined,
    MoreOutlined,
    CopyOutlined,
    ScissorOutlined,
    CloudUploadOutlined,
    FileZipOutlined,
} from '@ant-design/icons';
import {
    Button,
    Input,
    Modal,
    Upload,
    message,
    Progress,
    Spin,
    Breadcrumb,
    Space,
    Checkbox,
    Tooltip,
    Card,
    Tag,
    Form,
    Table,
    App,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import FileViewer from './FileViewer';
import ArchiveManager from './ArchiveManager';
import './FileBrowser.css';

interface FileItem {
    name: string;
    type: 'file' | 'directory';
    size: number;
    permissions: string;
    modified: string;
    path: string;
    owner?: string;
    group?: string;
}

interface FileBrowserProps {
    webSocketRef: React.RefObject<WebSocket | null>;
    visible: boolean;
    onClose?: () => void;
    currentPath?: string;
    connectionId?: string | number;
    sessionId?: string | number;
    tabKey?: string;
}

const FileBrowser: React.FC<FileBrowserProps> = ({
    webSocketRef,
    visible,
    onClose,
    currentPath = '/',
    connectionId,
    sessionId,
    tabKey
}) => {
    // 使用 App Hook API 替代静态 message API
    const { message } = App.useApp();

    // 状态管理
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentDirectory, setCurrentDirectory] = useState(currentPath);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<'name' | 'size' | 'modified'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [uploadVisible, setUploadVisible] = useState(false);
    const [newFolderVisible, setNewFolderVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renameVisible, setRenameVisible] = useState(false);
    const [renameTarget, setRenameTarget] = useState<string>('');
    const [newName, setNewName] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [clipboard, setClipboard] = useState<{ files: string[], operation: 'copy' | 'cut' | null }>({
        files: [],
        operation: null
    });
    const [isWaitingForLs, setIsWaitingForLs] = useState(false);
    const currentRequestRef = useRef<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // 文件查看器和压缩包管理器状态
    const [fileViewerVisible, setFileViewerVisible] = useState(false);
    const [archiveManagerVisible, setArchiveManagerVisible] = useState(false);
    const [selectedFileForView, setSelectedFileForView] = useState<FileItem | null>(null);

    // 分段传输相关状态
    const segmentBufferRef = useRef<Map<string, { segments: Map<number, string>, totalSegments: number, requestId: string }>>(new Map());
    const segmentTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // 添加虚拟化列表的容器引用
    const parentRef = useRef<HTMLDivElement>(null);
    const scrollElementRef = useRef<HTMLDivElement>(null);

    // 添加初始化标记，防止多次请求
    const hasInitializedRef = useRef<boolean>(false);
    const initializationTimerRef = useRef<NodeJS.Timeout | null>(null);

    // 防止状态更新冲突的引用
    const isUpdatingRef = useRef(false);
    const lastUpdateTimeRef = useRef(0);

    // 使用React.useDeferredValue优化大数据处理
    const deferredFiles = React.useDeferredValue(files);
    const deferredSearchTerm = React.useDeferredValue(searchTerm);

    // 搜索和过滤文件 - 优化大数据处理
    const filteredFiles = useMemo(() => {
        // 对于大数据集，使用延迟值避免阻塞UI
        const sourceFiles = files.length > 1000 ? deferredFiles : files;
        const sourceSearchTerm = files.length > 1000 ? deferredSearchTerm : searchTerm;

        let filtered = [...sourceFiles];

        // 搜索过滤
        if (sourceSearchTerm.trim()) {
            const term = sourceSearchTerm.toLowerCase();
            filtered = filtered.filter(file =>
                file.name.toLowerCase().includes(term) ||
                file.type.toLowerCase().includes(term) ||
                file.permissions.toLowerCase().includes(term)
            );
        }

        // 排序
        filtered.sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'name':
                    comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
                    break;
                case 'size':
                    comparison = a.size - b.size;
                    break;
                case 'modified':
                    comparison = a.modified.localeCompare(b.modified);
                    break;
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });

        // 目录排在前面（如果按名称排序）
        if (sortField === 'name') {
            filtered.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return 0;
            });
        }

        return filtered;
    }, [deferredFiles, deferredSearchTerm, sortField, sortOrder, files.length, searchTerm]);

    // 虚拟化文件列表配置 - 高性能优化，减少overscan
    const rowVirtualizer = useVirtualizer({
        count: filteredFiles.length,
        getScrollElement: () => scrollElementRef.current,
        estimateSize: () => 48, // 固定行高
        overscan: 3, // 减少预留渲染项目，提高性能（上下各3个）
        measureElement: undefined, // 禁用动态测量
        scrollMargin: 8, // 减少滚动边距，降低资源消耗
        getItemKey: (index) => {
            const file = filteredFiles[index];
            return file ? `${file.name}_${file.type}_${file.size}` : index;
        },
        debug: false,
        // 高性能配置
        initialRect: { width: 0, height: 0 },
        paddingStart: 0,
        paddingEnd: 0,
    });

    // 生成用于localStorage的唯一键
    const getStorageKey = useCallback(() => {
        // 使用tabKey作为主要标识符，确保每个tab独立存储路径
        const identifier = tabKey || `${connectionId}_${sessionId}` || 'default';
        return `file_browser_path_${identifier}`;
    }, [connectionId, sessionId, tabKey]);

    // 保存当前路径到localStorage
    const saveCurrentPath = useCallback((path: string) => {
        try {
            const storageKey = getStorageKey();
            localStorage.setItem(storageKey, path);
            console.log(`保存路径到localStorage: ${storageKey} = ${path}`);
        } catch (error) {
            console.warn('保存路径到localStorage失败:', error);
        }
    }, [getStorageKey]);

    // 从localStorage恢复路径
    const restoreSavedPath = useCallback(() => {
        try {
            const storageKey = getStorageKey();
            const savedPath = localStorage.getItem(storageKey);
            if (savedPath && savedPath !== currentDirectory) {
                console.log(`从localStorage恢复路径: ${storageKey} = ${savedPath}`);
                setCurrentDirectory(savedPath);
                return savedPath;
            }
        } catch (error) {
            console.warn('从localStorage恢复路径失败:', error);
        }
        return null;
    }, [getStorageKey, currentDirectory]);

    // 清除保存的路径
    const clearSavedPath = useCallback(() => {
        const storageKey = getStorageKey();
        try {
            localStorage.removeItem(storageKey);
            console.log(`已清除连接 ${connectionId} 的保存路径`);
        } catch (error) {
            console.warn('清除保存路径失败:', error);
        }
    }, [getStorageKey, connectionId]);

    // 清除所有连接的保存路径（可选功能）
    const clearAllSavedPaths = useCallback(() => {
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('file_browser_path_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log(`已清除所有文件浏览器历史记录，共清除 ${keysToRemove.length} 条记录`);
        } catch (error) {
            console.warn('清除所有保存路径失败:', error);
        }
    }, []);

    // 检查WebSocket输出是否为ls命令结果
    const isLsOutput = useCallback((text: string): boolean => {
        // 添加类型检查
        if (typeof text !== 'string' || !text) {
            return false;
        }

        console.log('检查是否为ls输出:', text.substring(0, 200) + '...');

        // 清理ANSI转义序列
        const cleanText = text.replace(/\x1b\[[0-9;]*m/g, '');

        // 检查是否包含文件权限模式字符串 (更宽松的匹配)
        const hasPermissions = /[dl-][rwx-]{9}/.test(cleanText);

        // 检查是否包含"total"行（ls -l的第一行）
        const hasTotal = /total\s+\d+/.test(cleanText);

        // 检查是否包含典型的文件大小数字
        const hasFileSize = /\s+\d+\s+\w+\s+\d+\s+/.test(cleanText);

        // 检查是否有多行且包含典型的ls输出格式
        const lines = cleanText.split('\n').filter(line => line.trim());
        const hasMultipleEntries = lines.length > 2;

        const isLs = hasPermissions && (hasTotal || hasFileSize || hasMultipleEntries);

        console.log('ls输出检查结果:', {
            hasPermissions,
            hasTotal,
            hasFileSize,
            hasMultipleEntries,
            isLs,
            firstFewLines: lines.slice(0, 3)
        });

        return isLs;
    }, []);

    // 解析ls命令输出
    const parseLsOutput = useCallback((output: string): FileItem[] => {
        // 添加类型检查
        if (typeof output !== 'string' || !output) {
            console.log('输出为空或无效');
            return [];
        }

        console.log('开始解析ls输出，原始长度:', output.length);

        // 更全面地清理ANSI转义序列和颜色代码
        const cleanOutput = output
            .replace(/\x1b\[[0-9;]*m/g, '')          // 移除ANSI颜色代码
            .replace(/\[0m/g, '')                    // 移除重置代码
            .replace(/\[01;34m/g, '')                // 移除蓝色代码
            .replace(/\[01;36m/g, '')                // 移除青色代码
            .replace(/\[01;32m/g, '')                // 移除绿色代码
            .replace(/\[30;42m/g, '')                // 移除其他颜色代码
            .replace(/conn-\d+-session-\d+-\d+/g, '') // 移除连接ID
            .replace(/await@[\w\-_]+:/g, '')         // 移除用户提示符
            .replace(/\[[\w@\-_]+\]:[~\w\/]*[$#]\s*/g, '') // 移除各种提示符格式
            .replace(/\$/g, '')                      // 移除$符号
            .replace(/~\s*$/gm, '');                 // 移除路径符号

        console.log('清理后的输出前200字符:', cleanOutput.substring(0, 200));

        // 提取ls命令相关的行
        const lines = cleanOutput.split('\n').map(line => line.trim()).filter(line => {
            if (!line) return false;

            // 跳过命令行、提示符和空行
            if (line.startsWith('ls ') ||
                line.includes('command not found') ||
                line.includes('@') && line.includes(':') ||
                line === '' ||
                line.match(/^\s*$/)) {
                return false;
            }

            // 保留包含文件权限信息的行或total行
            return line.match(/^[dlrwx\-]{10}/) || line.startsWith('total');
        });

        console.log('过滤后的有效行数:', lines.length);
        if (lines.length > 0) {
            console.log('前几行内容:', lines.slice(0, 5));
        }

        const items: FileItem[] = [];

        // 使用更健壮的解析逻辑
        lines.forEach((line, index) => {
            // 跳过total行
            if (!line || line.startsWith('total')) return;

            try {
                // 确保行包含文件权限信息
                const permMatch = line.match(/^([dlrwx\-]{10})\s+/);
                if (!permMatch) {
                    console.log(`第${index + 1}行没有权限信息，跳过:`, line);
                    return;
                }

                const permissions = permMatch[1];

                // 使用正则表达式提取文件信息
                // 格式: 权限 链接数 用户 组 大小 月份 日期 时间/年份 文件名
                const fileInfoMatch = line.match(/^[dlrwx\-]{10}\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s+([0-9:]+|\d{4})\s+(.*)/);

                if (!fileInfoMatch) {
                    console.log(`第${index + 1}行格式不匹配，尝试替代解析:`, line);

                    // 替代解析方法：分割并尝试提取关键信息
                    const parts = line.split(/\s+/);
                    if (parts.length < 8) {
                        console.log(`第${index + 1}行字段不足，跳过`);
                        return;
                    }

                    const owner = parts[2];
                    const group = parts[3];
                    const size = parseInt(parts[4], 10) || 0;
                    const month = parts[5];
                    const day = parts[6];
                    const timeOrYear = parts[7];
                    const modTime = `${month} ${day} ${timeOrYear}`;

                    // 文件名可能包含空格，从第8个部分开始
                    let fileName = parts.slice(8).join(' ');

                    // 处理符号链接
                    if (fileName.includes(' -> ')) {
                        fileName = fileName.split(' -> ')[0];
                    }

                    // 跳过当前目录和父目录
                    if (fileName === '.' || fileName === '..' || !fileName) {
                        return;
                    }

                    // 确定文件类型
                    let fileType: 'file' | 'directory' = 'file';
                    if (permissions.startsWith('d')) {
                        fileType = 'directory';
                    }

                    items.push({
                        name: fileName,
                        type: fileType,
                        size,
                        permissions,
                        modified: modTime,
                        path: currentDirectory === '/' ? `/${fileName}` : `${currentDirectory}/${fileName}`,
                        owner,
                        group
                    });

                    return;
                }

                // 使用正则匹配结果
                const linkCount = parseInt(fileInfoMatch[1], 10);
                const owner = fileInfoMatch[2];
                const group = fileInfoMatch[3];
                const size = parseInt(fileInfoMatch[4], 10) || 0;
                const month = fileInfoMatch[5];
                const day = fileInfoMatch[6];
                const timeOrYear = fileInfoMatch[7];
                let fileName = fileInfoMatch[8];

                // 处理符号链接
                if (fileName.includes(' -> ')) {
                    fileName = fileName.split(' -> ')[0];
                }

                // 跳过当前目录和父目录
                if (fileName === '.' || fileName === '..' || !fileName) {
                    return;
                }

                // 确定文件类型
                let fileType: 'file' | 'directory' = 'file';
                if (permissions.startsWith('d')) {
                    fileType = 'directory';
                } else if (permissions.startsWith('l')) {
                    // 符号链接，根据目标判断类型，暂时归类为文件
                    fileType = 'file';
                }

                const fileItem: FileItem = {
                    name: fileName,
                    type: fileType,
                    size,
                    permissions,
                    modified: `${month} ${day} ${timeOrYear}`,
                    path: currentDirectory === '/' ? `/${fileName}` : `${currentDirectory}/${fileName}`,
                    owner,
                    group
                };

                items.push(fileItem);
            } catch (error) {
                console.error(`解析第${index + 1}行时出错:`, line, error);
            }
        });

        console.log(`解析完成，共${items.length}个文件项`);
        if (items.length > 0) {
            console.log('解析结果示例:', items.slice(0, 3));
        }
        return items;
    }, [currentDirectory]);



    // 处理ls命令结果
    const handleLsResult = useCallback((output: string) => {
        if (!output || typeof output !== 'string') {
            console.warn('ls命令输出为空或无效');
            setLoading(false);
            return;
        }

        console.log('处理ls命令输出:', output.length, '字符');

        try {
            const parsedFiles = parseLsOutput(output);
            setFiles(parsedFiles);
            setLoading(false);

            if (parsedFiles.length === 0) {
                console.log('未解析到任何文件，原始输出:', output);
                message.info('目录为空或无法解析文件列表');
            } else {
                console.log(`成功解析到 ${parsedFiles.length} 个文件/目录`);
                // 打印解析结果的详细信息
                parsedFiles.forEach((file, index) => {
                    if (index < 5) { // 只打印前5个文件的详细信息
                        console.log(`文件 ${index + 1}:`, {
                            name: file.name,
                            type: file.type,
                            permissions: file.permissions,
                            size: file.size
                        });
                    }
                });
            }
        } catch (error) {
            console.error('解析ls命令输出时出错:', error);
            console.error('原始输出:', output);
            message.error('解析文件列表时出错');
            setLoading(false);
        }
    }, [parseLsOutput]);

    // 超时引用，用于管理请求超时
    const requestTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 使用ref来存储最新的状态值，避免闭包问题
    const isWaitingForLsRef = useRef(isWaitingForLs);
    const currentDirectoryRef = useRef(currentDirectory);

    // 更新ref值
    useEffect(() => {
        isWaitingForLsRef.current = isWaitingForLs;
    }, [isWaitingForLs]);

    useEffect(() => {
        currentDirectoryRef.current = currentDirectory;
    }, [currentDirectory]);

    // 清除分段传输相关状态的辅助函数
    const clearSegmentState = useCallback((requestId?: string) => {
        if (requestId) {
            // 清除特定请求的分段状态
            segmentBufferRef.current.delete(requestId);
            const timeout = segmentTimeoutRef.current.get(requestId);
            if (timeout) {
                clearTimeout(timeout);
                segmentTimeoutRef.current.delete(requestId);
            }
            console.log('已清除请求', requestId, '的分段状态');
        } else {
            // 清除所有分段状态
            segmentBufferRef.current.clear();
            segmentTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
            segmentTimeoutRef.current.clear();
            console.log('已清除所有分段状态');
        }
    }, []);

    // 处理分段文件列表数据 - 增强版本，添加重试机制
    const handleSegmentedFileList = useCallback((segmentData: {
        requestId: string;
        segmentId: number;
        totalSegments: number;
        data: string;
        isComplete?: boolean;
    }) => {
        const { requestId, segmentId, totalSegments, data, isComplete } = segmentData;

        console.log(`📦 收到分段数据: 请求ID=${requestId}, 分段=${segmentId}/${totalSegments}, 数据长度=${data.length}`);

        // 验证请求ID是否匹配当前请求
        if (requestId !== currentRequestRef.current) {
            console.log('⚠️ 分段数据请求ID不匹配，忽略:', requestId, '当前ID:', currentRequestRef.current);
            return;
        }

        // 初始化或获取该请求的分段缓冲区
        if (!segmentBufferRef.current.has(requestId)) {
            segmentBufferRef.current.set(requestId, {
                segments: new Map(),
                totalSegments,
                requestId
            });
            console.log(`🆕 初始化请求 ${requestId} 的分段缓冲区，总分段数: ${totalSegments}`);
        }

        const segmentBuffer = segmentBufferRef.current.get(requestId)!;
        segmentBuffer.segments.set(segmentId, data);

        console.log(`📝 保存分段 ${segmentId}，当前已收到 ${segmentBuffer.segments.size}/${totalSegments} 个分段`);

        // 设置分段超时，防止永久等待
        const existingTimeout = segmentTimeoutRef.current.get(requestId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const newTimeout = setTimeout(() => {
            console.log(`⏰ 分段接收超时，请求ID: ${requestId}`);
            // 检查缺失的分段
            const missingSegments: number[] = [];
            for (let i = 0; i < totalSegments; i++) {
                if (!segmentBuffer.segments.has(i)) {
                    missingSegments.push(i);
                }
            }

            if (missingSegments.length > 0) {
                console.log(`❌ 检测到缺失分段: ${missingSegments.join(', ')}`);
                message.error(`文件列表传输不完整，缺失 ${missingSegments.length} 个分段，请重试`);
            }

            clearSegmentState(requestId);
            if (currentRequestRef.current === requestId) {
                setLoading(false);
                setIsWaitingForLs(false);
                currentRequestRef.current = null;
            }
        }, 30000); // 30秒超时

        segmentTimeoutRef.current.set(requestId, newTimeout);

        // 检查是否所有分段都已接收完成
        const receivedSegments = segmentBuffer.segments.size;
        const allReceived = receivedSegments === totalSegments;

        if (allReceived || isComplete) {
            console.log(`✅ 所有分段接收完成，开始拼接数据...`);

            // 清除超时
            clearTimeout(newTimeout);
            segmentTimeoutRef.current.delete(requestId);

            try {
                // 检查缺失的分段
                const missingSegments: number[] = [];
                for (let i = 0; i < totalSegments; i++) {
                    if (!segmentBuffer.segments.has(i)) {
                        missingSegments.push(i);
                    }
                }

                if (missingSegments.length > 0) {
                    console.error(`❌ 检测到缺失分段: ${missingSegments.join(', ')}`);
                    message.error(`文件列表传输不完整，缺失分段: ${missingSegments.join(', ')}，请重试`);

                    // 清除分段状态并重置
                    clearSegmentState(requestId);
                    if (currentRequestRef.current === requestId) {
                        setLoading(false);
                        setIsWaitingForLs(false);
                        currentRequestRef.current = null;
                    }
                    return;
                }

                // 按顺序拼接所有分段
                let completeData = '';
                for (let i = 0; i < totalSegments; i++) {
                    const segmentData = segmentBuffer.segments.get(i);
                    if (segmentData) {
                        completeData += segmentData;
                    }
                }

                console.log(`🔧 拼接完成，总数据长度: ${completeData.length}`);
                console.log(`📋 分段分布详情:`);
                for (let i = 0; i < totalSegments; i++) {
                    const segment = segmentBuffer.segments.get(i);
                    console.log(`  分段 ${i}: ${segment ? segment.length + '字符' : '❌缺失'}`);
                }

                // 清除分段状态
                clearSegmentState(requestId);

                // 尝试解析拼接后的JSON数据
                try {
                    const jsonData = JSON.parse(completeData);
                    if (jsonData.type === 'file_list_response' && jsonData.data.files) {
                        console.log(`📂 解析文件列表成功，共 ${jsonData.data.files.length} 个文件`);
                        setFiles(jsonData.data.files);
                        setLoading(false);
                        setIsWaitingForLs(false);
                        currentRequestRef.current = null;
                        return;
                    }
                } catch (jsonError) {
                    console.error('❌ JSON解析失败，尝试作为ls输出处理:', jsonError);
                    console.log('📄 数据前1000字符:', completeData.substring(0, 1000));
                    console.log('📄 数据后1000字符:', completeData.substring(Math.max(0, completeData.length - 1000)));

                    // 如果JSON解析失败，作为普通ls输出处理
                    handleLsResult(completeData);
                    return;
                }

                // 如果不是预期的JSON格式，作为ls输出处理
                handleLsResult(completeData);

            } catch (error) {
                console.error('❌ 分段数据拼接失败:', error);
                clearSegmentState(requestId);
                if (currentRequestRef.current === requestId) {
                    setLoading(false);
                    setIsWaitingForLs(false);
                    currentRequestRef.current = null;
                    message.error('文件列表数据处理失败');
                }
            }
        } else {
            // 还未完全接收，显示进度
            const progress = Math.round((receivedSegments / totalSegments) * 100);
            console.log(`📊 接收进度: ${receivedSegments}/${totalSegments} (${progress}%)`);
        }
    }, [clearSegmentState, handleLsResult]);

    // 重置所有状态的辅助函数
    const resetAllStates = useCallback(() => {
        console.log('重置所有文件浏览器状态');

        // 清除所有超时
        if (requestTimeoutRef.current) {
            clearTimeout(requestTimeoutRef.current);
            requestTimeoutRef.current = null;
        }
        if (initializationTimerRef.current) {
            clearTimeout(initializationTimerRef.current);
            initializationTimerRef.current = null;
        }

        // 清除分段传输状态
        clearSegmentState();

        // 重置状态
        setLoading(false);
        setIsWaitingForLs(false);
        currentRequestRef.current = null;

        // 重置初始化标记，允许重新初始化
        hasInitializedRef.current = false;
        console.log('已重置初始化标记，允许重新初始化');
    }, [clearSegmentState]);

    // 刷新当前目录
    const refreshDirectory = useCallback((targetPath?: string) => {
        // 使用传入的路径或当前目录状态
        const pathToUse = targetPath || currentDirectory;

        // 防止重复调用
        if (loading || isWaitingForLs) {
            console.log('正在加载中，跳过重复请求，loading:', loading, 'isWaitingForLs:', isWaitingForLs);
            return;
        }

        // 检查是否有正在进行的请求
        if (currentRequestRef.current) {
            console.log('存在正在进行的请求，跳过重复请求，请求ID:', currentRequestRef.current);
            return;
        }

        // 清除之前的超时
        if (requestTimeoutRef.current) {
            clearTimeout(requestTimeoutRef.current);
            requestTimeoutRef.current = null;
        }

        // 生成唯一请求ID
        const requestId = `file_list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentRequestRef.current = requestId;

        console.log('📁 开始刷新目录:', pathToUse, '请求ID:', requestId, '初始化状态:', hasInitializedRef.current);
        setLoading(true);
        setFiles([]); // 清空当前文件列表
        setIsWaitingForLs(true); // 设置等待状态为true，开始等待ls输出

        // 发送JSON格式的文件列表请求
        const fileListRequest = {
            type: 'file_list',
            data: {
                path: pathToUse,
                requestId: requestId
            }
        };

        console.log('发送文件列表请求:', fileListRequest);
        console.log('WebSocket状态:', webSocketRef.current?.readyState, 'OPEN常量:', WebSocket.OPEN);

        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            setLoading(false);
            setIsWaitingForLs(false);
            currentRequestRef.current = null;
            return;
        }

        // 发送JSON命令
        webSocketRef.current.send(JSON.stringify(fileListRequest));

        // 设置超时，防止命令无响应
        requestTimeoutRef.current = setTimeout(() => {
            console.log('⏰ 文件列表请求超时，请求ID:', requestId);
            // 只有当前请求ID匹配时才处理超时
            if (currentRequestRef.current === requestId) {
                setLoading(false);
                setIsWaitingForLs(false);
                currentRequestRef.current = null;
                message.error('获取目录信息超时，请重试');
            }
            requestTimeoutRef.current = null;
        }, 15000); // 增加到15秒超时
    }, [currentDirectory, webSocketRef, loading, isWaitingForLs]);

    // 进入目录
    const enterDirectory = useCallback((dirName: string) => {
        const newPath = currentDirectory === '/'
            ? `/${dirName}`
            : `${currentDirectory}/${dirName}`;

        console.log('进入目录:', dirName, '当前目录:', currentDirectory, '新路径:', newPath);
        setCurrentDirectory(newPath);

        // 保存新路径到localStorage
        saveCurrentPath(newPath);

        // 直接传递新路径给refreshDirectory，避免状态更新时序问题
        setTimeout(() => {
            refreshDirectory(newPath);
        }, 100);
    }, [currentDirectory, refreshDirectory, saveCurrentPath]);

    // 返回上级目录
    const goToParent = useCallback(() => {
        if (currentDirectory === '/') return;

        const parentPath = currentDirectory.split('/').slice(0, -1).join('/') || '/';
        console.log('返回上级目录，当前目录:', currentDirectory, '父目录:', parentPath);
        setCurrentDirectory(parentPath);

        // 保存父路径到localStorage
        saveCurrentPath(parentPath);

        // 直接传递父路径给refreshDirectory
        setTimeout(() => {
            refreshDirectory(parentPath);
        }, 100);
    }, [currentDirectory, refreshDirectory, saveCurrentPath]);

    // 删除文件或目录
    const deleteItem = useCallback((fileName: string) => {
        Modal.confirm({
            title: '确认删除',
            content: `确定要删除 "${fileName}" 吗？此操作不可撤销。`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
                // TODO: 实现后端JSON格式的删除操作
                message.info('删除功能正在开发中，将通过后端API实现');
            }
        });
    }, []);

    // 创建目录
    const createDirectory = useCallback(() => {
        if (!newFolderName.trim()) {
            message.error('请输入文件夹名称');
            return;
        }

        // TODO: 实现后端JSON格式的创建目录操作
        message.info('创建目录功能正在开发中，将通过后端API实现');

        setNewFolderVisible(false);
        setNewFolderName('');
    }, [newFolderName]);

    // 重命名文件或目录
    const renameItem = useCallback(() => {
        if (!newName.trim()) {
            message.error('请输入新名称');
            return;
        }

        // TODO: 实现后端JSON格式的重命名操作
        message.info('重命名功能正在开发中，将通过后端API实现');

        setRenameVisible(false);
        setRenameTarget('');
        setNewName('');
    }, [newName, renameTarget]);

    // 查看文件内容
    const viewFile = useCallback((fileName: string) => {
        const file = files.find(f => f.name === fileName);
        if (!file) {
            message.error('文件不存在');
            return;
        }

        if (file.type === 'directory') {
            message.error('无法查看文件夹内容');
            return;
        }

        // 检查是否是压缩包文件
        const archiveExtensions = ['zip', 'tar', 'gz', 'tgz', 'tar.gz', 'rar', '7z', 'bz2', 'xz'];
        const fileExtension = fileName.toLowerCase().split('.').pop() || '';
        const isArchive = archiveExtensions.includes(fileExtension) || fileName.toLowerCase().includes('.tar.');

        if (isArchive) {
            // 如果是压缩包，打开压缩包管理器
            setSelectedFileForView(file);
            setArchiveManagerVisible(true);
        } else {
            // 如果是普通文件，打开文件查看器
            setSelectedFileForView(file);
            setFileViewerVisible(true);
        }
    }, [files]);

    // 下载文件
    const downloadFile = useCallback((fileName: string) => {
        // TODO: 实现后端JSON格式的下载文件操作
        message.info('下载文件功能正在开发中，将通过后端API实现');
    }, []);

    // 上传文件处理
    const handleFileUpload = useCallback((file: File) => {
        if (file.size > 50 * 1024 * 1024) { // 50MB限制
            message.error('文件大小不能超过50MB');
            return false;
        }

        // TODO: 实现后端JSON格式的文件上传操作
        message.info(`文件上传功能正在开发中: ${file.name}`);

        return false; // 阻止默认上传行为
    }, []);

    // 拖拽上传处理
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        // 批量上传文件
        files.forEach(file => {
            handleFileUpload(file);
        });

        message.success(`开始上传 ${files.length} 个文件`);
    }, [handleFileUpload]);

    // 原有的文件图标获取函数（重命名，移到前面避免TDZ错误）
    const getFileIconByNameAndType = useCallback((fileName: string, fileType: string) => {
        const iconStyle = { fontSize: '16px', marginRight: '8px' };

        if (fileType === 'directory') {
            return <FolderOutlined style={{ ...iconStyle, color: '#faad14' }} />;
        }

        // 获取文件扩展名
        const extension = fileName.toLowerCase().split('.').pop() || '';

        switch (extension) {
            // 文本文件
            case 'txt':
            case 'md':
            case 'readme':
                return <FileOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
            case 'log':
                return <FileOutlined style={{ ...iconStyle, color: '#722ed1' }} />;

            // 文档文件
            case 'pdf':
                return <FileOutlined style={{ ...iconStyle, color: '#f5222d' }} />;
            case 'doc':
            case 'docx':
                return <FileOutlined style={{ ...iconStyle, color: '#1890ff' }} />;
            case 'xls':
            case 'xlsx':
                return <FileOutlined style={{ ...iconStyle, color: '#13c2c2' }} />;
            case 'ppt':
            case 'pptx':
                return <FileOutlined style={{ ...iconStyle, color: '#fa541c' }} />;

            // 图片文件
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'gif':
            case 'bmp':
            case 'svg':
            case 'webp':
                return <FileOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;

            // 压缩文件
            case 'zip':
            case 'rar':
            case '7z':
            case 'tar':
            case 'gz':
            case 'bz2':
                return <FileOutlined style={{ ...iconStyle, color: '#722ed1' }} />;

            // 代码文件
            case 'js':
            case 'jsx':
                return <FileOutlined style={{ ...iconStyle, color: '#fadb14' }} />;
            case 'ts':
            case 'tsx':
                return <FileOutlined style={{ ...iconStyle, color: '#1890ff' }} />;
            case 'html':
            case 'htm':
                return <FileOutlined style={{ ...iconStyle, color: '#fa541c' }} />;
            case 'css':
            case 'scss':
            case 'sass':
            case 'less':
                return <FileOutlined style={{ ...iconStyle, color: '#1890ff' }} />;
            case 'json':
            case 'xml':
                return <FileOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
            case 'py':
                return <FileOutlined style={{ ...iconStyle, color: '#3776ab' }} />;
            case 'java':
                return <FileOutlined style={{ ...iconStyle, color: '#f89820' }} />;
            case 'php':
                return <FileOutlined style={{ ...iconStyle, color: '#777bb4' }} />;
            case 'cpp':
            case 'c':
            case 'h':
                return <FileOutlined style={{ ...iconStyle, color: '#659ad2' }} />;
            case 'cs':
                return <FileOutlined style={{ ...iconStyle, color: '#239120' }} />;
            case 'go':
                return <FileOutlined style={{ ...iconStyle, color: '#00add8' }} />;
            case 'rb':
                return <FileOutlined style={{ ...iconStyle, color: '#cc342d' }} />;
            case 'swift':
                return <FileOutlined style={{ ...iconStyle, color: '#fa7343' }} />;
            case 'kt':
                return <FileOutlined style={{ ...iconStyle, color: '#7f52ff' }} />;

            // 配置文件
            case 'yml':
            case 'yaml':
                return <FileOutlined style={{ ...iconStyle, color: '#ff6b6b' }} />;
            case 'toml':
                return <FileOutlined style={{ ...iconStyle, color: '#9c88ff' }} />;
            case 'ini':
            case 'conf':
            case 'config':
                return <FileOutlined style={{ ...iconStyle, color: '#20c997' }} />;

            // 数据库文件
            case 'sql':
            case 'db':
            case 'sqlite':
            case 'sqlite3':
                return <FileOutlined style={{ ...iconStyle, color: '#495057' }} />;

            // 媒体文件
            case 'mp3':
            case 'wav':
            case 'flac':
            case 'aac':
                return <FileOutlined style={{ ...iconStyle, color: '#e83e8c' }} />;
            case 'mp4':
            case 'avi':
            case 'mkv':
            case 'mov':
            case 'wmv':
                return <FileOutlined style={{ ...iconStyle, color: '#6f42c1' }} />;

            // 可执行文件
            case 'exe':
            case 'msi':
            case 'dmg':
            case 'deb':
            case 'rpm':
                return <FileOutlined style={{ ...iconStyle, color: '#dc3545' }} />;

            // 系统文件
            case 'dll':
            case 'so':
            case 'dylib':
                return <FileOutlined style={{ ...iconStyle, color: '#6c757d' }} />;

            default:
                return <FileOutlined style={{ ...iconStyle, color: '#6c757d' }} />;
        }
    }, []);

    // 简化文件图标获取，避免过度缓存
    const getFileIcon = useCallback((file: FileItem) => {
        return getFileIconByNameAndType(file.name, file.type);
    }, [getFileIconByNameAndType]);

    // 格式化文件大小
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // 获取面包屑路径
    const getBreadcrumbItems = useCallback(() => {
        const parts = currentDirectory.split('/').filter(part => part);
        const items = [
            {
                title: (
                    <span
                        onClick={() => {
                            setCurrentDirectory('/');
                            saveCurrentPath('/'); // 保存根目录路径
                            setTimeout(() => {
                                refreshDirectory('/');
                            }, 100);
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        <HomeOutlined /> 根目录
                    </span>
                )
            }
        ];

        let path = '';
        parts.forEach((part, index) => {
            path += `/${part}`;
            const currentPath = path;
            items.push({
                title: (
                    <span
                        onClick={() => {
                            setCurrentDirectory(currentPath);
                            saveCurrentPath(currentPath); // 保存点击的路径
                            setTimeout(() => {
                                refreshDirectory(currentPath);
                            }, 100);
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        {part}
                    </span>
                )
            });
        });

        return items;
    }, [currentDirectory, refreshDirectory, saveCurrentPath]);



    // 处理排序
    const handleSort = useCallback((field: 'name' | 'size' | 'modified') => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    }, [sortField]);

    // 清除搜索
    const clearSearch = useCallback(() => {
        setSearchTerm('');
    }, []);



    // 高性能文件行组件 - 优化memo策略和渲染性能
    const VirtualFileRow = React.memo(({
        index,
        style,
        file
    }: {
        index: number;
        style: React.CSSProperties;
        file: FileItem;
    }) => {
        const isSelected = selectedFiles.includes(file.name);

        // 单击行为：文件夹进入，文件打开，不再默认选中
        const handleRowClick = useCallback((e: React.MouseEvent) => {
            e.stopPropagation();

            // 如果点击的是操作按钮区域，不处理行点击
            if ((e.target as HTMLElement).closest('.file-actions')) {
                return;
            }

            // 如果按住Ctrl键，则进行选择操作
            if (e.ctrlKey || e.metaKey) {
                handleFileAction('select', file, e);
                return;
            }

            // 正常点击：文件夹进入，文件打开
            if (file.type === 'directory') {
                enterDirectory(file.name);
            } else {
                viewFile(file.name);
            }
        }, [file.name, file.type]); // 简化依赖

        // 双击行为保持不变（兼容性）
        const handleRowDoubleClick = useCallback((e: React.MouseEvent) => {
            e.stopPropagation();

            if ((e.target as HTMLElement).closest('.file-actions')) {
                return;
            }

            if (file.type === 'directory') {
                enterDirectory(file.name);
            } else {
                viewFile(file.name);
            }
        }, [file.name, file.type]); // 简化依赖

        const handleCheckboxChange = useCallback((e: any) => {
            e.stopPropagation();
            handleFileSelection(file.name, e.target.checked);
        }, [file.name]); // 简化依赖

        // 优化的操作按钮 - 检查是否是压缩包
        const isArchive = useMemo(() => {
            const archiveExtensions = ['zip', 'tar', 'gz', 'tgz', 'tar.gz', 'rar', '7z', 'bz2', 'xz'];
            const fileExtension = file.name.toLowerCase().split('.').pop() || '';
            return archiveExtensions.includes(fileExtension) || file.name.toLowerCase().includes('.tar.');
        }, [file.name]);

        // 优化的文件操作处理器
        const handleAction = useCallback((action: string) => {
            return (e: React.MouseEvent) => {
                handleFileAction(action, file, e);
            };
        }, [file]);

        return (
            <div
                style={style}
                className={`virtual-file-row ${isSelected ? 'selected' : ''} ${file.type === 'directory' ? 'directory' : 'file'}`}
                onClick={handleRowClick}
                onDoubleClick={handleRowDoubleClick}
                title={file.type === 'directory' ? `点击进入文件夹: ${file.name}` : `点击打开文件: ${file.name}`}
            >
                <div className="file-row-content">
                    {/* 选择框 */}
                    <div className="file-checkbox">
                        <Checkbox
                            id={`file-checkbox-${index}`}
                            name={`fileCheckbox_${file.name}`}
                            checked={isSelected}
                            onChange={handleCheckboxChange}
                        />
                    </div>

                    {/* 文件图标和名称 */}
                    <div className="file-info">
                        <div className="file-icon">
                            {getFileIcon(file)}
                        </div>
                        <div className="file-name" title={file.name}>
                            {file.name}
                        </div>
                    </div>

                    {/* 文件大小 */}
                    <div className="file-size">
                        {file.type === 'file' ? formatFileSize(file.size) : '-'}
                    </div>

                    {/* 权限 */}
                    <div className="file-permissions">
                        {file.permissions}
                    </div>

                    {/* 修改时间 */}
                    <div className="file-modified">
                        {file.modified}
                    </div>

                    {/* 优化的操作按钮 - 使用缓存的事件处理器 */}
                    <div className="file-actions">
                        <Space size={2}>
                            {/* 查看/进入按钮 */}
                            {file.type === 'directory' ? (
                                <Tooltip title="进入文件夹">
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<FolderOutlined />}
                                        onClick={handleAction('enter')}
                                    />
                                </Tooltip>
                            ) : isArchive ? (
                                <Tooltip title="压缩包管理">
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<FileZipOutlined />}
                                        onClick={handleAction('view')}
                                    />
                                </Tooltip>
                            ) : (
                                <Tooltip title="查看文件">
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<EyeOutlined />}
                                        onClick={handleAction('view')}
                                    />
                                </Tooltip>
                            )}

                            {/* 下载按钮 - 只对文件显示 */}
                            {file.type === 'file' && (
                                <Tooltip title="下载">
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<DownloadOutlined />}
                                        onClick={handleAction('download')}
                                    />
                                </Tooltip>
                            )}

                            {/* 重命名按钮 */}
                            <Tooltip title="重命名">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={handleAction('rename')}
                                />
                            </Tooltip>

                            {/* 删除按钮 */}
                            <Tooltip title="删除">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={handleAction('delete')}
                                    danger
                                />
                            </Tooltip>
                        </Space>
                    </div>
                </div>
            </div>
        );
    }, (prevProps, nextProps) => {
        // 高性能比较策略 - 只比较关键属性
        const prevFile = prevProps.file;
        const nextFile = nextProps.file;

        return (
            prevFile.name === nextFile.name &&
            prevFile.type === nextFile.type &&
            prevFile.size === nextFile.size &&
            prevFile.modified === nextFile.modified &&
            prevProps.index === nextProps.index &&
            // 检查style对象的关键属性
            prevProps.style.transform === nextProps.style.transform &&
            prevProps.style.height === nextProps.style.height
        );
    });

    // 统一的初始化逻辑，防止多次请求
    useEffect(() => {
        // 只在组件首次可见且未初始化时执行
        if (!visible || hasInitializedRef.current) {
            return;
        }

        console.log('FileBrowser组件初始化开始...');

        // 清除之前的初始化定时器
        if (initializationTimerRef.current) {
            clearTimeout(initializationTimerRef.current);
            initializationTimerRef.current = null;
        }

        // 设置初始化定时器，确保在组件状态稳定后初始化
        initializationTimerRef.current = setTimeout(() => {
            // 标记已经初始化，防止重复
            hasInitializedRef.current = true;

            console.log('开始FileBrowser初始化流程...');

            // 尝试恢复保存的路径
            let targetPath = currentDirectory;
            if (connectionId) {
                console.log('尝试恢复保存的路径...');
                const savedPath = restoreSavedPath();
                if (savedPath) {
                    console.log(`恢复到保存的路径: ${savedPath}`);
                    targetPath = savedPath;
                }
            }

            // 执行目录刷新
            console.log('FileBrowser初始化，加载目录:', targetPath);
            refreshDirectory(targetPath);

            initializationTimerRef.current = null;
        }, 150); // 延迟150ms确保组件状态稳定

        return () => {
            if (initializationTimerRef.current) {
                clearTimeout(initializationTimerRef.current);
                initializationTimerRef.current = null;
            }
        };
    }, [visible]); // 只依赖visible，避免其他状态变化导致重复调用

    // 组件卸载时的清理工作
    useEffect(() => {
        return () => {
            // 组件卸载时重置初始化标记
            hasInitializedRef.current = false;
            if (initializationTimerRef.current) {
                clearTimeout(initializationTimerRef.current);
                initializationTimerRef.current = null;
            }
        };
    }, []);

    // 高性能WebSocket消息监听 - 使用requestIdleCallback和激进优化
    useEffect(() => {
        if (!webSocketRef.current || !visible) {
            return;
        }

        console.log('FileBrowser: 设置高性能WebSocket消息监听器');

        // 高性能消息队列系统
        let allMessageQueue: MessageEvent[] = [];
        let segmentMessageQueue: MessageEvent[] = [];
        let processingTimer: NodeJS.Timeout | null = null;
        let segmentProcessingTimer: NodeJS.Timeout | null = null;
        let isProcessing = false; // 防止重复处理

        // 消息统计和性能监控
        let messageStats = {
            total: 0,
            segments: 0,
            processed: 0,
            dropped: 0,
            avgProcessTime: 0,
            lastProcessTime: 0
        };

        const handleMessage = (event: MessageEvent) => {
            // 快速类型检查
            if (typeof event.data !== 'string') {
                return;
            }

            const startTime = performance.now();
            messageStats.total++;

            // 添加到消息队列
            allMessageQueue.push(event);

            // 极速分段消息检测和处理
            try {
                const quickCheck = event.data.substring(0, 150); // 减少检查长度
                if (quickCheck.includes('"file_list_segment"')) {
                    segmentMessageQueue.push(event);
                    messageStats.segments++;

                    // 立即处理分段消息，但使用更智能的策略
                    if (!isProcessing && segmentProcessingTimer) {
                        clearTimeout(segmentProcessingTimer);
                    }

                    if (!isProcessing) {
                        segmentProcessingTimer = setTimeout(() => {
                            processSegmentMessagesAsync();
                        }, 1); // 1ms极速处理
                    }
                }
            } catch (e) {
                // 忽略解析错误
            }

            // 更激进的防抖策略处理普通消息
            if (processingTimer) {
                clearTimeout(processingTimer);
            }
            processingTimer = setTimeout(() => {
                processNormalMessagesAsync();
            }, 100); // 提升到100ms防抖，减少处理频率

            const endTime = performance.now();
            messageStats.lastProcessTime = endTime - startTime;
            messageStats.avgProcessTime = (messageStats.avgProcessTime + messageStats.lastProcessTime) / 2;
        };

        // 异步处理分段消息 - 使用requestIdleCallback
        const processSegmentMessagesAsync = () => {
            if (isProcessing || segmentMessageQueue.length === 0) return;

            isProcessing = true;
            console.log(`📨 异步处理分段消息队列，队列长度: ${segmentMessageQueue.length}`);

            // 使用requestIdleCallback在浏览器空闲时处理
            const processChunk = (deadline: IdleDeadline) => {
                while (deadline.timeRemaining() > 0 && segmentMessageQueue.length > 0) {
                    const event = segmentMessageQueue.shift();
                    if (!event) break;

                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'file_list_segment') {
                            handleSegmentedFileList({
                                requestId: data.data.requestId,
                                segmentId: data.data.segmentId,
                                totalSegments: data.data.totalSegments,
                                data: data.data.data,
                                isComplete: data.data.isComplete
                            });
                            messageStats.processed++;
                        }
                    } catch (error) {
                        console.error('❌ 异步处理分段消息失败:', error);
                        messageStats.dropped++;
                    }
                }

                // 如果还有消息未处理，继续在下个空闲时间处理
                if (segmentMessageQueue.length > 0) {
                    requestIdleCallback(processChunk, { timeout: 1000 });
                } else {
                    isProcessing = false;
                    console.log(`📊 分段消息处理完成 - 已处理: ${messageStats.processed}, 丢失: ${messageStats.dropped}`);
                }
            };

            requestIdleCallback(processChunk, { timeout: 500 });
        };

        // 异步处理普通消息 - 大幅减少处理频率
        const processNormalMessagesAsync = () => {
            // 更严格的防抖检查
            const currentTime = Date.now();
            if (isUpdatingRef.current || (currentTime - lastUpdateTimeRef.current) < 200) {
                return;
            }

            isUpdatingRef.current = true;
            lastUpdateTimeRef.current = currentTime;

            // 使用requestIdleCallback处理普通消息
            requestIdleCallback((deadline) => {
                try {
                    const relevantMessages = allMessageQueue.filter(msg => {
                        try {
                            const data = JSON.parse(msg.data);
                            return data.type === 'file_list_response';
                        } catch {
                            return false;
                        }
                    });

                    if (relevantMessages.length > 0 && deadline.timeRemaining() > 5) {
                        const latestMessage = relevantMessages[relevantMessages.length - 1];
                        processFileListMessageAsync(latestMessage);
                    }

                } finally {
                    allMessageQueue = [];
                    processingTimer = null;

                    // 延迟重置更新标志
                    setTimeout(() => {
                        isUpdatingRef.current = false;
                    }, 50);
                }
            }, { timeout: 1000 });
        };

        // 异步处理文件列表消息 - 使用React 19优化
        const processFileListMessageAsync = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'file_list_response') {
                    if (data.data.requestId !== currentRequestRef.current) {
                        return;
                    }

                    // 使用React.startTransition进行低优先级更新
                    React.startTransition(() => {
                        if (requestTimeoutRef.current) {
                            clearTimeout(requestTimeoutRef.current);
                            requestTimeoutRef.current = null;
                        }

                        setLoading(false);
                        setIsWaitingForLs(false);
                        currentRequestRef.current = null;

                        if (data.data.error) {
                            message.error(`获取文件列表失败: ${data.data.error}`);
                            return;
                        }

                        if (data.data.files && Array.isArray(data.data.files)) {
                            // 对于大量文件，分批更新状态
                            if (data.data.files.length > 1000) {
                                console.log(`📦 大文件列表检测 (${data.data.files.length}个)，启用分批处理`);
                                processBatchFiles(data.data.files);
                            } else {
                                setFiles(data.data.files);
                            }
                        } else {
                            setFiles([]);
                        }
                    });
                }

            } catch (error) {
                React.startTransition(() => {
                    if (requestTimeoutRef.current) {
                        clearTimeout(requestTimeoutRef.current);
                        requestTimeoutRef.current = null;
                    }
                    setLoading(false);
                    setIsWaitingForLs(false);
                    currentRequestRef.current = null;
                });
            }
        };

        // 分批处理大量文件数据
        const processBatchFiles = (allFiles: FileItem[]) => {
            const batchSize = 500;
            let currentIndex = 0;

            const processBatch = () => {
                const batch = allFiles.slice(currentIndex, currentIndex + batchSize);

                if (batch.length > 0) {
                    React.startTransition(() => {
                        if (currentIndex === 0) {
                            setFiles(batch); // 第一批直接设置
                        } else {
                            setFiles(prev => [...prev, ...batch]); // 后续批次追加
                        }
                    });

                    currentIndex += batchSize;

                    // 在浏览器空闲时处理下一批
                    if (currentIndex < allFiles.length) {
                        requestIdleCallback(() => {
                            processBatch();
                        }, { timeout: 100 });
                    } else {
                        console.log(`📦 分批处理完成，共处理 ${allFiles.length} 个文件`);
                    }
                }
            };

            processBatch();
        };

        const ws = webSocketRef.current;
        ws.addEventListener('message', handleMessage);

        return () => {
            console.log('FileBrowser: 移除高性能WebSocket消息监听器');
            console.log(`📊 最终性能统计:`, {
                ...messageStats,
                efficiency: messageStats.processed / Math.max(messageStats.total, 1) * 100
            });

            if (processingTimer) {
                clearTimeout(processingTimer);
            }
            if (segmentProcessingTimer) {
                clearTimeout(segmentProcessingTimer);
            }

            isProcessing = false;
            allMessageQueue = [];
            segmentMessageQueue = [];

            if (ws && ws.readyState !== WebSocket.CLOSED) {
                ws.removeEventListener('message', handleMessage);
            }
        };
    }, [webSocketRef, visible]);

    // 清理effect，在组件卸载时清除所有超时
    useEffect(() => {
        return () => {
            if (requestTimeoutRef.current) {
                clearTimeout(requestTimeoutRef.current);
            }
        };
    }, []);

    // 文件选择处理 - 保留用于工具栏按钮等功能
    const handleFileSelection = useCallback((fileName: string, checked: boolean) => {
        setSelectedFiles(prev =>
            checked
                ? [...prev, fileName]
                : prev.filter(f => f !== fileName)
        );
    }, []);

    // 简化的操作处理 - 直接处理，避免复杂的菜单生成
    const handleFileAction = useCallback((action: string, file: FileItem, event?: React.MouseEvent) => {
        if (event) {
            event.stopPropagation();
        }

        switch (action) {
            case 'view':
                viewFile(file.name);
                break;
            case 'download':
                downloadFile(file.name);
                break;
            case 'rename':
                setRenameTarget(file.name);
                setNewName(file.name);
                setRenameVisible(true);
                break;
            case 'delete':
                deleteItem(file.name);
                break;
            case 'enter':
                if (file.type === 'directory') {
                    enterDirectory(file.name);
                }
                break;
            case 'select':
                // 处理手动选择（通过复选框或Ctrl+点击）
                const isCurrentlySelected = selectedFiles.includes(file.name);
                handleFileSelection(file.name, !isCurrentlySelected);
                break;
        }
    }, [viewFile, downloadFile, deleteItem, enterDirectory, selectedFiles, handleFileSelection]);

    // 键盘事件处理 - 阻止事件冒泡到终端
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // 阻止所有键盘事件冒泡到父组件（终端）
        e.stopPropagation();

        // 处理文件浏览器特定的快捷键
        switch (e.key) {
            case 'F5':
                e.preventDefault();
                refreshDirectory();
                break;
            case 'Escape':
                if (onClose) {
                    e.preventDefault();
                    onClose();
                }
                break;
            case 'Delete':
                if (selectedFiles.length > 0) {
                    e.preventDefault();
                    // 处理删除选中文件的逻辑
                    Modal.confirm({
                        title: '批量删除',
                        content: `确定要删除选中的 ${selectedFiles.length} 个项目吗？`,
                        onOk: () => {
                            message.info('批量删除功能正在开发中，将通过后端API实现');
                            setSelectedFiles([]);
                        }
                    });
                }
                break;
            case 'Enter':
                if (selectedFiles.length === 1) {
                    e.preventDefault();
                    const selectedFile = files.find(f => f.name === selectedFiles[0]);
                    if (selectedFile) {
                        if (selectedFile.type === 'directory') {
                            enterDirectory(selectedFile.name);
                        } else {
                            viewFile(selectedFile.name);
                        }
                    }
                }
                break;
            case 'Backspace':
                if (e.ctrlKey) {
                    e.preventDefault();
                    goToParent();
                }
                break;
            case 'a':
                if (e.ctrlKey) {
                    e.preventDefault();
                    // 全选
                    if (selectedFiles.length === filteredFiles.length) {
                        setSelectedFiles([]);
                    } else {
                        setSelectedFiles(filteredFiles.map(f => f.name));
                    }
                }
                break;
            default:
                // 其他按键也阻止冒泡，防止影响终端
                break;
        }
    }, [refreshDirectory, onClose, selectedFiles, files, filteredFiles, enterDirectory, viewFile, goToParent]);

    // 鼠标事件处理 - 阻止不必要的事件冒泡
    const handleMouseEvent = useCallback((e: React.MouseEvent) => {
        // 阻止鼠标事件冒泡，防止影响终端的鼠标处理
        e.stopPropagation();
    }, []);

    // 焦点处理 - 确保文件浏览器获得焦点时不影响终端
    const handleFocus = useCallback((e: React.FocusEvent) => {
        e.stopPropagation();
    }, []);

    if (!visible) return null;

    return (
        <div
            className="file-browser"
            onKeyDown={handleKeyDown}
            onMouseDown={handleMouseEvent}
            onMouseUp={handleMouseEvent}
            onMouseMove={handleMouseEvent}
            onFocus={handleFocus}
            tabIndex={-1} // 使div可以接收键盘事件但不参与tab导航
            style={{
                animation: 'none !important',
                transition: 'none !important',
                willChange: 'auto !important'
            }}
        >
            <Card
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>文件浏览器</span>
                        {onClose && (
                            <Button size="small" onClick={onClose}>
                                关闭
                            </Button>
                        )}
                    </div>
                }
                variant="outlined"
                style={{
                    height: '100%',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column'
                }}
                styles={{ body: { padding: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 } }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* 拖拽覆盖层 */}
                {isDragOver && (
                    <div className="drag-drop-overlay">
                        <div>
                            <CloudUploadOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                            <div>拖拽文件到此处上传</div>
                        </div>
                    </div>
                )}

                {/* 工具栏 */}
                <div className="file-browser-toolbar">
                    <Space wrap>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => {
                                resetAllStates();
                                setTimeout(() => refreshDirectory(), 100);
                            }}
                            loading={loading}
                            type="primary"
                        >
                            刷新
                        </Button>
                        <Button
                            icon={<FolderAddOutlined />}
                            onClick={() => setNewFolderVisible(true)}
                        >
                            新建文件夹
                        </Button>
                        <Upload
                            beforeUpload={handleFileUpload}
                            showUploadList={false}
                            multiple
                        >
                            <Button icon={<UploadOutlined />}>
                                上传文件
                            </Button>
                        </Upload>
                        {connectionId && (
                            <Tooltip title="清除保存的访问历史，下次打开将回到根目录">
                                <Button
                                    icon={<DeleteOutlined />}
                                    onClick={() => {
                                        Modal.confirm({
                                            title: '清除访问历史',
                                            content: '确定要清除保存的目录访问历史吗？下次打开文件浏览器将回到根目录。',
                                            okText: '确认',
                                            cancelText: '取消',
                                            onOk: () => {
                                                clearSavedPath();
                                                message.success('访问历史已清除');
                                            }
                                        });
                                    }}
                                    type="text"
                                >
                                    清除历史
                                </Button>
                            </Tooltip>
                        )}
                        {uploadProgress > 0 && uploadProgress < 100 && (
                            <div className="upload-progress">
                                <Progress
                                    percent={uploadProgress}
                                    size="small"
                                    status="active"
                                />
                            </div>
                        )}
                        {selectedFiles.length > 0 && (
                            <Button
                                icon={<DeleteOutlined />}
                                danger
                                onClick={() => {
                                    Modal.confirm({
                                        title: '批量删除',
                                        content: `确定要删除选中的 ${selectedFiles.length} 个项目吗？`,
                                        onOk: () => {
                                            // TODO: 实现后端JSON格式的批量删除操作
                                            message.info('批量删除功能正在开发中，将通过后端API实现');
                                            setSelectedFiles([]); // 清空选择
                                        }
                                    });
                                }}
                            >
                                批量删除 ({selectedFiles.length})
                            </Button>
                        )}
                    </Space>
                </div>

                <div className="file-browser-content">
                    {/* 面包屑导航 */}
                    <div className="breadcrumb-container">
                        <Breadcrumb items={getBreadcrumbItems()} />
                        {connectionId && (
                            <div className="path-record-indicator">
                                <Tooltip title={`连接 ${connectionId} 的访问路径已自动保存，刷新页面后会恢复到此位置`}>
                                    <span className="saved-path-hint">
                                        📍 已记录路径
                                    </span>
                                </Tooltip>
                            </div>
                        )}
                    </div>

                    {/* 搜索框 */}
                    <div className="search-box">
                        <Input.Search
                            id="file-browser-search"
                            name="fileSearch"
                            placeholder="搜索文件和文件夹..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onSearch={(value) => setSearchTerm(value)}
                            allowClear
                            enterButton="搜索"
                            size="large"
                            style={{ marginBottom: 16 }}
                        />
                    </div>

                    {/* 批量操作提示 */}
                    {selectedFiles.length > 0 && (
                        <div className="batch-actions">
                            <div className="batch-actions-info">
                                已选择 {selectedFiles.length} 个项目
                            </div>
                            <div className="batch-actions-buttons">
                                <Button
                                    size="small"
                                    onClick={() => setSelectedFiles([])}
                                >
                                    取消选择
                                </Button>
                                <Button
                                    size="small"
                                    icon={<CopyOutlined />}
                                >
                                    复制
                                </Button>
                                <Button
                                    size="small"
                                    icon={<ScissorOutlined />}
                                >
                                    剪切
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* 文件表格 */}
                    <div className="file-browser-table">
                        {loading ? (
                            <div className="loading-overlay">
                                <div style={{ textAlign: 'center' }}>
                                    <ReloadOutlined spin style={{ fontSize: 24, marginBottom: 16 }} />
                                    <div>正在加载文件列表...</div>
                                </div>
                            </div>
                        ) : filteredFiles.length === 0 ? (
                            <div className="empty-state">
                                <FolderOutlined className="empty-state-icon" />
                                <div>
                                    {searchTerm ? `没有找到包含 "${searchTerm}" 的文件` : '此目录为空'}
                                </div>
                                {searchTerm && (
                                    <Button
                                        type="link"
                                        onClick={clearSearch}
                                        style={{ marginTop: 8 }}
                                    >
                                        清除搜索条件
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div
                                ref={parentRef}
                                className="virtual-file-container"
                                style={{
                                    flex: 1,
                                    overflow: 'hidden',
                                    position: 'relative',
                                    minHeight: 0, // 确保能够收缩
                                    animation: 'none !important',
                                    transition: 'none !important',
                                    willChange: 'auto !important'
                                }}
                            >
                                {/* 虚拟化列表表头 */}
                                <div className="virtual-file-header">
                                    <div className="header-checkbox">
                                        <Checkbox
                                            id="file-browser-select-all"
                                            name="selectAll"
                                            checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                                            indeterminate={selectedFiles.length > 0 && selectedFiles.length < filteredFiles.length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedFiles(filteredFiles.map(f => f.name));
                                                } else {
                                                    setSelectedFiles([]);
                                                }
                                            }}
                                        />
                                    </div>
                                    <div
                                        className="header-name"
                                        onClick={() => handleSort('name')}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        名称
                                        {sortField === 'name' && (
                                            sortOrder === 'asc' ? <UpOutlined style={{ marginLeft: 4 }} /> : <DownOutlined style={{ marginLeft: 4 }} />
                                        )}
                                    </div>
                                    <div
                                        className="header-size"
                                        onClick={() => handleSort('size')}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        大小
                                        {sortField === 'size' && (
                                            sortOrder === 'asc' ? <UpOutlined style={{ marginLeft: 4 }} /> : <DownOutlined style={{ marginLeft: 4 }} />
                                        )}
                                    </div>
                                    <div className="header-permissions">权限</div>
                                    <div
                                        className="header-modified"
                                        onClick={() => handleSort('modified')}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        修改时间
                                        {sortField === 'modified' && (
                                            sortOrder === 'asc' ? <UpOutlined style={{ marginLeft: 4 }} /> : <DownOutlined style={{ marginLeft: 4 }} />
                                        )}
                                    </div>
                                    <div className="header-actions" style={{ width: '120px' }}>操作</div>
                                </div>

                                {/* 虚拟化列表内容 */}
                                <div
                                    ref={scrollElementRef}
                                    className="virtual-file-scroll-container"
                                    style={{
                                        flex: 1,
                                        overflow: 'auto',
                                        minHeight: 0, // 确保flex子元素能够收缩
                                    }}
                                >
                                    <div
                                        style={{
                                            height: `${rowVirtualizer.getTotalSize()}px`,
                                            width: '100%',
                                            position: 'relative',
                                            // 添加最小高度确保滚动区域稳定
                                            minHeight: filteredFiles.length * 48,
                                        }}
                                    >
                                        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                                            const file = filteredFiles[virtualItem.index];

                                            // 如果文件不存在，渲染占位符防止空白
                                            if (!file) {
                                                return (
                                                    <div
                                                        key={virtualItem.key}
                                                        style={{
                                                            position: 'absolute',
                                                            top: 0,
                                                            left: 0,
                                                            width: '100%',
                                                            height: `${virtualItem.size}px`,
                                                            transform: `translateY(${virtualItem.start}px)`,
                                                            background: '#f9f9f9',
                                                            borderBottom: '1px solid #f0f0f0',
                                                        }}
                                                    >
                                                        <div style={{
                                                            padding: '12px',
                                                            color: '#d9d9d9',
                                                            fontSize: '12px'
                                                        }}>
                                                            加载中...
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <VirtualFileRow
                                                    key={virtualItem.key}
                                                    index={virtualItem.index}
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        width: '100%',
                                                        height: `${virtualItem.size}px`,
                                                        transform: `translateY(${virtualItem.start}px)`,
                                                        // 确保渲染优先级
                                                        zIndex: 1,
                                                        // 禁用动画但保持流畅性
                                                        transition: 'none',
                                                        animation: 'none',
                                                        willChange: 'auto',
                                                    }}
                                                    file={file}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* 文件查看器 */}
            {selectedFileForView && (
                <FileViewer
                    visible={fileViewerVisible}
                    onClose={() => {
                        setFileViewerVisible(false);
                        setSelectedFileForView(null);
                    }}
                    fileName={selectedFileForView.name}
                    filePath={selectedFileForView.path}
                    fileSize={selectedFileForView.size}
                    webSocketRef={webSocketRef}
                    connectionId={connectionId}
                    sessionId={sessionId}
                />
            )}

            {/* 压缩包管理器 */}
            {selectedFileForView && (
                <ArchiveManager
                    visible={archiveManagerVisible}
                    onClose={() => {
                        setArchiveManagerVisible(false);
                        setSelectedFileForView(null);
                    }}
                    fileName={selectedFileForView.name}
                    filePath={selectedFileForView.path}
                    fileSize={selectedFileForView.size}
                    webSocketRef={webSocketRef}
                    connectionId={connectionId}
                    sessionId={sessionId}
                    onRefresh={() => {
                        // 刷新文件列表
                        refreshDirectory();
                    }}
                />
            )}

            {/* 新建文件夹模态框 */}
            <Modal
                title="新建文件夹"
                open={newFolderVisible}
                onOk={createDirectory}
                onCancel={() => {
                    setNewFolderVisible(false);
                    setNewFolderName('');
                }}
                okText="创建"
                cancelText="取消"
            >
                <Input
                    id="new-folder-name-input"
                    name="newFolderName"
                    placeholder="请输入文件夹名称"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onPressEnter={createDirectory}
                    autoFocus
                />
            </Modal>

            {/* 重命名模态框 */}
            <Modal
                title="重命名"
                open={renameVisible}
                onOk={renameItem}
                onCancel={() => {
                    setRenameVisible(false);
                    setNewName('');
                    setRenameTarget('');
                }}
                okText="确定"
                cancelText="取消"
            >
                <Input
                    id="rename-input"
                    name="renameName"
                    placeholder="请输入新名称"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onPressEnter={renameItem}
                    autoFocus
                />
            </Modal>
        </div>
    );
};

export default FileBrowser;
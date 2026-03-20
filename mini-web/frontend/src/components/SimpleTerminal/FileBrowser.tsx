/*
 * @Author: Await
 * @Date: 2025-05-26 20:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-06-07 13:53:22
 * @Description: SSH终端文件浏览器组件
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
    EyeOutlined,
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
    Progress,
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
import FileViewer from './FileViewer';
import ArchiveManager from './ArchiveManager';
import api from '../../services/api';
import './FileBrowser.css';

interface FileItem {
    name: string;
    type: 'file' | 'directory';
    size: number;
    permissions: string;
    numericPermissions?: string; // 数字权限 (如 755)
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
    const [newFolderVisible, setNewFolderVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFileVisible, setNewFileVisible] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [renameVisible, setRenameVisible] = useState(false);
    const [renameTarget, setRenameTarget] = useState<string>('');
    const [newName, setNewName] = useState('');
    const [permissionsVisible, setPermissionsVisible] = useState(false);
    const [permissionsTarget, setPermissionsTarget] = useState<string>('');
    const [newPermissions, setNewPermissions] = useState('');
    const [permissionsMatrix, setPermissionsMatrix] = useState({
        owner: { read: false, write: false, execute: false },
        group: { read: false, write: false, execute: false },
        others: { read: false, write: false, execute: false }
    });
    const [isWaitingForLs, setIsWaitingForLs] = useState(false);
    const currentRequestRef = useRef<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const [fileViewerVisible, setFileViewerVisible] = useState(false);
    const [archiveManagerVisible, setArchiveManagerVisible] = useState(false);
    const [selectedFileForView, setSelectedFileForView] = useState<FileItem | null>(null);
    const [fileEditVisible, setFileEditVisible] = useState(false);
    const [fileEditTarget, setFileEditTarget] = useState<FileItem | null>(null);
    const [fileEditContent, setFileEditContent] = useState('');
    const [fileEditLoading, setFileEditLoading] = useState(false);
    const [fileEditSaving, setFileEditSaving] = useState(false);

    // 分段传输相关状态
    const segmentBufferRef = useRef<Map<string, { segments: Map<number, string>, totalSegments: number, requestId: string }>>(new Map());
    const segmentTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // 分页相关状态
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // 添加初始化标记，防止多次请求
    const hasInitializedRef = useRef<boolean>(false);
    const initializationTimerRef = useRef<NodeJS.Timeout | null>(null);

    // 移除了延迟值处理，简化性能

    // 搜索和过滤文件 - 简化处理
    const filteredFiles = useMemo(() => {
        let filtered = [...files];

        // 搜索过滤 - 简化字符串匹配
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(file =>
                file.name.toLowerCase().includes(term) ||
                file.type.toLowerCase().includes(term)
            );
        }

        // 简化排序
        filtered.sort((a, b) => {
            // 目录优先
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;

            let comparison = 0;
            switch (sortField) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
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

        return filtered;
    }, [files, searchTerm, sortField, sortOrder]);

    // 分页数据处理
    const _paginatedFiles = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        return filteredFiles.slice(startIndex, endIndex);
    }, [filteredFiles, currentPage, pageSize]);

    // 表格列配置
    const columns = [
        {
            title: (
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
            ),
            dataIndex: 'select',
            key: 'select',
            width: 35,
            render: (_: any, record: FileItem, index: number) => (
                <Checkbox
                    id={`file-checkbox-${index}-${record.name}`}
                    name={`fileSelect_${index}`}
                    checked={selectedFiles.includes(record.name)}
                    onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedFiles(prev =>
                            checked
                                ? [...prev, record.name]
                                : prev.filter(f => f !== record.name)
                        );
                    }}
                />
            ),
        },
        {
            title: '文件名',
            dataIndex: 'name',
            key: 'name',
            sorter: true,
            ellipsis: true,
            render: (name: string, record: FileItem) => (
                <Space>
                    {getFileIcon(record)}
                    <button
                        type="button"
                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                        onClick={() => {
                            if (record.type === 'directory') {
                                enterDirectory(record.name);
                            } else {
                                viewFile(record.name);
                            }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (record.type === 'directory') { enterDirectory(record.name); } else { viewFile(record.name); } } }}
                        title={record.type === 'directory' ? `点击进入文件夹: ${name}` : `点击打开文件: ${name}`}
                    >
                        {name}
                    </button>
                </Space>
            ),
        },
        {
            title: '大小',
            dataIndex: 'size',
            key: 'size',
            width: 70,
            sorter: true,
            render: (size: number, record: FileItem) =>
                record.type === 'file' ? formatFileSize(size) : '-',
        },
        {
            title: '权限',
            dataIndex: 'permissions',
            key: 'permissions',
            width: 100,
            ellipsis: true,
            render: (permissions: string, record: FileItem) => (
                <Tooltip title={`符号权限: ${permissions} - 点击修改权限`}>
                    <Tag
                        color="blue"
                        style={{
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            minWidth: '40px',
                            textAlign: 'center',
                            userSelect: 'none'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            const currentPerms = record.numericPermissions || '755';
                            setPermissionsTarget(record.name);
                            setNewPermissions(currentPerms);
                            setPermissionsMatrix(numericToPermissionsMatrix(currentPerms));
                            setPermissionsVisible(true);
                        }}
                    >
                        {record.numericPermissions || '---'}
                    </Tag>
                </Tooltip>
            ),
        },
        {
            title: '修改时间',
            dataIndex: 'modified',
            key: 'modified',
            width: 150,
            sorter: true,
            ellipsis: true,
            render: (text: string) => (
                <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{text}</span>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 110,
            render: (_: any, record: FileItem) => {
                const isArchive = (() => {
                    const extension = record.name.toLowerCase().split('.').pop() || '';
                    return ['zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2', 'xz'].includes(extension) ||
                        record.name.toLowerCase().includes('.tar.');
                })();

                return (
                    <Space size={2}>
                        {/* 查看/进入按钮 */}
                        {record.type === 'directory' ? (
                            <Tooltip title="进入文件夹">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<FolderOutlined />}
                                    onClick={() => enterDirectory(record.name)}
                                />
                            </Tooltip>
                        ) : isArchive ? (
                            <Tooltip title="压缩包管理">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<FileZipOutlined />}
                                    onClick={() => viewFile(record.name)}
                                />
                            </Tooltip>
                        ) : (
                            <Tooltip title="查看文件">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EyeOutlined />}
                                    onClick={() => viewFile(record.name)}
                                />
                            </Tooltip>
                        )}

                        {/* 下载按钮 - 只对文件显示 */}
                        {record.type === 'file' && (
                            <Tooltip title="下载">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<DownloadOutlined />}
                                    onClick={() => downloadFile(record.name)}
                                />
                            </Tooltip>
                        )}

                        {/* 重命名按钮 */}
                        <Tooltip title="重命名">
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => {
                                    setRenameTarget(record.name);
                                    setNewName(record.name);
                                    setRenameVisible(true);
                                }}
                            />
                        </Tooltip>

                        {record.type === 'file' && !isArchive && (
                            <Tooltip title="编辑">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={() => openFileEditor(record)}
                                />
                            </Tooltip>
                        )}

                        {/* 删除按钮 */}
                        <Tooltip title="删除">
                            <Button
                                type="text"
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={() => deleteItem(record.name)}
                                danger
                            />
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

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
    const _clearAllSavedPaths = useCallback(() => {
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('file_browser_path_')) {
                    keysToRemove.push(key);
                }
            }
            for (const key of keysToRemove) { localStorage.removeItem(key); }
            console.log(`已清除所有文件浏览器历史记录，共清除 ${keysToRemove.length} 条记录`);
        } catch (error) {
            console.warn('清除所有保存路径失败:', error);
        }
    }, []);

    // 检查WebSocket输出是否为ls命令结果
    const _isLsOutput = useCallback((text: string): boolean => {
        // 添加类型检查
        if (typeof text !== 'string' || !text) {
            return false;
        }

        console.log('检查是否为ls输出:', text.substring(0, 200) + '...');

        // 清理ANSI转义序列
        const cleanText = text.replace(/\u001b\[[0-9;]*m/g, '');

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

    // 将符号权限转换为数字权限
    const convertPermissionsToNumeric = useCallback((symbolic: string): string => {
        if (symbolic.length < 10) {
            return '000';
        }

        // 跳过第一个字符（文件类型标识符）
        const perms = symbolic.substring(1);

        let result = '';
        for (let i = 0; i < 9; i += 3) {
            if (i + 2 >= perms.length) {
                break;
            }

            let value = 0;
            if (perms[i] === 'r') {
                value += 4;
            }
            if (perms[i + 1] === 'w') {
                value += 2;
            }
            if (perms[i + 2] === 'x' || perms[i + 2] === 's' || perms[i + 2] === 't') {
                value += 1;
            }

            result += value.toString();
        }

        return result;
    }, []);

    // 将数字权限转换为权限矩阵
    const numericToPermissionsMatrix = useCallback((numeric: string) => {
        const paddedNumeric = numeric.padStart(3, '0');
        return {
            owner: {
                read: (parseInt(paddedNumeric[0]) & 4) !== 0,
                write: (parseInt(paddedNumeric[0]) & 2) !== 0,
                execute: (parseInt(paddedNumeric[0]) & 1) !== 0
            },
            group: {
                read: (parseInt(paddedNumeric[1]) & 4) !== 0,
                write: (parseInt(paddedNumeric[1]) & 2) !== 0,
                execute: (parseInt(paddedNumeric[1]) & 1) !== 0
            },
            others: {
                read: (parseInt(paddedNumeric[2]) & 4) !== 0,
                write: (parseInt(paddedNumeric[2]) & 2) !== 0,
                execute: (parseInt(paddedNumeric[2]) & 1) !== 0
            }
        };
    }, []);

    // 将权限矩阵转换为数字权限
    const permissionsMatrixToNumeric = useCallback((matrix: typeof permissionsMatrix) => {
        const calculateValue = (perms: { read: boolean; write: boolean; execute: boolean }) => {
            return (perms.read ? 4 : 0) + (perms.write ? 2 : 0) + (perms.execute ? 1 : 0);
        };

        return `${calculateValue(matrix.owner)}${calculateValue(matrix.group)}${calculateValue(matrix.others)}`;
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
            .replace(/\u001b\[[0-9;]*m/g, '')          // 移除ANSI颜色代码
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
                const _linkCount = parseInt(fileInfoMatch[1], 10); void _linkCount;
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

                // 计算数字权限
                const numericPermissions = convertPermissionsToNumeric(permissions);

                const fileItem: FileItem = {
                    name: fileName,
                    type: fileType,
                    size,
                    permissions,
                    numericPermissions,
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
    }, [currentDirectory, convertPermissionsToNumeric]);



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
            segmentTimeoutRef.current.forEach((timeout) => { clearTimeout(timeout); });
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

                        // 处理文件列表，确保每个文件都有正确的path属性
                        const processedFiles = jsonData.data.files.map((file: FileItem) => {
                            // 如果文件没有path属性或path为空，则根据当前目录生成完整路径
                            if (!file.path) {
                                // 使用当前目录状态来生成完整路径
                                const currentDir = currentDirectoryRef.current || currentDirectory;
                                const fullPath = currentDir === '/'
                                    ? `/${file.name}`
                                    : `${currentDir}/${file.name}`;
                                return {
                                    ...file,
                                    path: fullPath
                                };
                            }
                            return file;
                        });

                        setFiles(processedFiles);
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
        const file = files.find(f => f.name === fileName);
        if (!file) {
            message.error('文件不存在');
            return;
        }

        Modal.confirm({
            title: '确认删除',
            content: `确定要删除 "${fileName}" 吗？此操作不可撤销。`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
                if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
                    message.error('WebSocket连接未建立');
                    return;
                }

                const requestId = `file_delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                const request = {
                    type: 'file_delete',
                    data: {
                        path: file.path,
                        isDirectory: file.type === 'directory',
                        requestId: requestId
                    }
                };

                console.log('🗑️ 发送删除请求:', request);

                try {
                    webSocketRef.current.send(JSON.stringify(request));
                    message.loading('正在删除...', 0);
                } catch (error) {
                    console.error('发送删除请求失败:', error);
                    message.error('发送请求失败');
                }
            }
        });
    }, [files, webSocketRef]);

    // 创建目录
    const createDirectory = useCallback(() => {
        if (!newFolderName.trim()) {
            message.error('请输入文件夹名称');
            return;
        }

        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        const requestId = `folder_create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const folderPath = currentDirectory === '/'
            ? `/${newFolderName}`
            : `${currentDirectory}/${newFolderName}`;

        const request = {
            type: 'folder_create',
            data: {
                path: folderPath,
                requestId: requestId
            }
        };

        console.log('📁 发送创建文件夹请求:', request);

        try {
            webSocketRef.current.send(JSON.stringify(request));
            setNewFolderVisible(false);
            setNewFolderName('');
            message.loading('正在创建文件夹...');
        } catch (error) {
            console.error('发送创建文件夹请求失败:', error);
            message.error('发送请求失败');
        }
    }, [newFolderName, webSocketRef, currentDirectory]);

    // 创建文件
    const createFile = useCallback(() => {
        if (!newFileName.trim()) {
            message.error('请输入文件名称');
            return;
        }

        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        const requestId = `file_create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const filePath = currentDirectory === '/'
            ? `/${newFileName}`
            : `${currentDirectory}/${newFileName}`;

        const request = {
            type: 'file_create',
            data: {
                path: filePath,
                content: '', // 创建空文件
                requestId: requestId
            }
        };

        console.log('📄 发送创建文件请求:', request);

        try {
            webSocketRef.current.send(JSON.stringify(request));
            setNewFileVisible(false);
            setNewFileName('');
            message.loading('正在创建文件...');
        } catch (error) {
            console.error('发送创建文件请求失败:', error);
            message.error('发送请求失败');
        }
    }, [newFileName, webSocketRef, currentDirectory]);

    // 重命名文件或目录
    const renameItem = useCallback(() => {
        if (!newName.trim()) {
            message.error('请输入新名称');
            return;
        }

        if (newName === renameTarget) {
            message.info('名称未更改');
            setRenameVisible(false);
            setRenameTarget('');
            setNewName('');
            return;
        }

        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            setRenameVisible(false);
            setRenameTarget('');
            setNewName('');
            return;
        }

        const file = files.find(f => f.name === renameTarget);
        if (!file) {
            message.error('原文件不存在');
            setRenameVisible(false);
            setRenameTarget('');
            setNewName('');
            return;
        }

        const requestId = `file_rename_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 构建新的完整路径
        const parentDir = file.path.substring(0, file.path.lastIndexOf('/') + 1);
        const newPath = parentDir + newName;

        const request = {
            type: 'file_rename',
            data: {
                oldPath: file.path,
                newPath: newPath,
                requestId: requestId
            }
        };

        console.log('📝 发送重命名请求:', request);

        try {
            webSocketRef.current.send(JSON.stringify(request));
            message.loading('正在重命名...', 0);
            setRenameVisible(false);
            setRenameTarget('');
            setNewName('');
        } catch (error) {
            console.error('发送重命名请求失败:', error);
            message.error('发送请求失败');
            setRenameVisible(false);
            setRenameTarget('');
            setNewName('');
        }
    }, [newName, renameTarget, files, webSocketRef]);

    // 修改文件权限
    const changePermissions = useCallback(() => {
        if (!permissionsTarget || !newPermissions) {
            message.error('请输入有效的权限');
            return;
        }

        // 验证权限格式
        if (!/^[0-7]{3}$/.test(newPermissions)) {
            message.error('权限格式错误，应为3位数字（0-7）');
            return;
        }

        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        const file = files.find(f => f.name === permissionsTarget);
        if (!file) {
            message.error('文件不存在');
            setPermissionsVisible(false);
            return;
        }

        const requestId = `file_permissions_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const request = {
            type: 'file_permissions',
            data: {
                path: file.path,
                permissions: newPermissions,
                requestId
            }
        };

        try {
            webSocketRef.current.send(JSON.stringify(request));
            message.loading('正在修改权限...', 5);
            setPermissionsVisible(false);
            setPermissionsTarget('');
            setNewPermissions('');
        } catch (error) {
            console.error('发送权限修改请求失败:', error);
            message.error('发送权限修改请求失败');
        }
    }, [permissionsTarget, newPermissions, files, webSocketRef]);

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

        console.log('📄 viewFile 调用 - 文件信息:', {
            fileName: file.name,
            filePath: file.path,
            fileSize: file.size,
            fileType: file.type,
            currentDirectory: currentDirectory
        });

        // 检查是否是压缩包文件
        const archiveExtensions = ['zip', 'tar', 'gz', 'tgz', 'tar.gz', 'rar', '7z', 'bz2', 'xz'];
        const fileExtension = fileName.toLowerCase().split('.').pop() || '';
        const isArchive = archiveExtensions.includes(fileExtension) || fileName.toLowerCase().includes('.tar.');

        if (isArchive) {
            // 如果是压缩包，打开压缩包管理器
            console.log('📄 打开压缩包管理器:', fileName);
            setSelectedFileForView(file);
            setArchiveManagerVisible(true);
        } else {
            // 如果是普通文件，打开文件查看器
            console.log('📄 打开文件查看器:', fileName, 'path:', file.path);
            setSelectedFileForView(file);
            setFileViewerVisible(true);
        }
    }, [files, currentDirectory]);

    const openFileEditor = useCallback(async (file: FileItem) => {
        if (!sessionId) {
            message.error('会话ID无效');
            return;
        }
        setFileEditTarget(file);
        setFileEditLoading(true);
        setFileEditVisible(true);
        try {
            const remotePath = file.path || (currentDirectory === '/' ? `/${file.name}` : `${currentDirectory}/${file.name}`);
            const response = await api.get('/files/download', {
                params: { sessionId: String(sessionId), remotePath },
                responseType: 'text',
            });
            setFileEditContent(typeof response.data === 'string' ? response.data : JSON.stringify(response.data));
        } catch (err) {
            message.error('读取文件内容失败');
            setFileEditVisible(false);
        } finally {
            setFileEditLoading(false);
        }
    }, [sessionId, currentDirectory, message]);

    const saveFileEdit = useCallback(async () => {
        if (!sessionId || !fileEditTarget) return;
        const remotePath = fileEditTarget.path || (currentDirectory === '/' ? `/${fileEditTarget.name}` : `${currentDirectory}/${fileEditTarget.name}`);
        setFileEditSaving(true);
        try {
            await api.put('/files/edit', {
                sessionId: String(sessionId),
                remotePath,
                content: fileEditContent,
            });
            message.success('文件保存成功');
            setFileEditVisible(false);
        } catch (err) {
            message.error('保存文件失败');
        } finally {
            setFileEditSaving(false);
        }
    }, [sessionId, fileEditTarget, fileEditContent, currentDirectory, message]);

    const downloadFile = useCallback(async (fileName: string) => {
        const file = files.find((item) => item.name === fileName);
        if (!file) {
            message.error('文件不存在');
            return;
        }

        if (file.type === 'directory') {
            message.error('暂不支持直接下载文件夹');
            return;
        }

        if (!sessionId) {
            message.error('会话ID无效，无法下载文件');
            return;
        }

        const remotePath = file.path || (currentDirectory === '/' ? `/${fileName}` : `${currentDirectory}/${fileName}`);
        const hideLoading = message.loading('正在下载文件...', 0);

        try {
            const response = await api.get('/files/download', {
                params: {
                    sessionId: String(sessionId),
                    remotePath,
                },
                responseType: 'blob',
            });

            const contentDisposition = response.headers['content-disposition'];
            const match = typeof contentDisposition === 'string'
                ? contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
                : null;
            const fileNameFromHeader = match?.[1] || match?.[2];
            const downloadName = fileNameFromHeader ? decodeURIComponent(fileNameFromHeader) : fileName;

            const blob = new Blob([response.data], {
                type: response.headers['content-type'] || 'application/octet-stream',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = downloadName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            message.success(`下载成功: ${downloadName}`);
        } catch (error) {
            const err = error as {
                response?: {
                    data?: Blob | { error?: string; message?: string };
                };
                message?: string;
            };

            const responseData = err.response?.data;
            if (responseData instanceof Blob) {
                try {
                    const text = await responseData.text();
                    let serverMessage = text;

                    try {
                        const parsed = JSON.parse(text) as { error?: string; message?: string };
                        serverMessage = parsed.error || parsed.message || text;
                    } catch {
                    }

                    message.error(`下载失败: ${serverMessage || '未知错误'}`);
                } catch {
                    message.error('下载失败，请重试');
                }
            } else {
                const serverMessage = responseData?.error || responseData?.message || err.message || '未知错误';
                message.error(`下载失败: ${serverMessage}`);
            }
        } finally {
            hideLoading();
        }
    }, [files, sessionId, currentDirectory, message]);

    const batchDeleteItems = useCallback(async () => {
        if (!sessionId) {
            message.error('会话ID无效，无法执行批量删除');
            return;
        }

        if (selectedFiles.length === 0) {
            message.info('请先选择要删除的文件');
            return;
        }

        const remotePaths = Array.from(new Set(selectedFiles.map((name) => {
            const file = files.find((item) => item.name === name);
            return file?.path || (currentDirectory === '/' ? `/${name}` : `${currentDirectory}/${name}`);
        })));

        const hideLoading = message.loading('正在批量删除...', 0);

        try {
            const response = await api.post('/files/delete', {
                sessionId: String(sessionId),
                remotePaths,
            });

            const result = response.data as {
                success?: boolean;
                message?: string;
                count?: number;
                error?: string;
            };

            if (!result.success) {
                message.error(result.error || result.message || '批量删除失败');
                return;
            }

            message.success(result.message || `成功删除 ${result.count ?? remotePaths.length} 个项目`);
            setSelectedFiles([]);
            setTimeout(() => refreshDirectory(), 500);
        } catch (error) {
            const err = error as {
                response?: {
                    data?: { error?: string; message?: string };
                };
                message?: string;
            };
            const serverMessage = err.response?.data?.error || err.response?.data?.message || err.message || '未知错误';
            message.error(`批量删除失败: ${serverMessage}`);
        } finally {
            hideLoading();
        }
    }, [sessionId, selectedFiles, files, currentDirectory, message, refreshDirectory]);

    // 上传状态管理
    const [uploadingFiles, setUploadingFiles] = useState<Map<string, { progress: number, status: 'uploading' | 'success' | 'error' | 'retrying', error?: string, file?: File }>>(new Map());

    // 上传文件处理
    const handleFileUpload = useCallback((file: File) => {
        if (file.size > 100 * 1024 * 1024) { // 100MB限制
            message.error('文件大小不能超过100MB');
            return false;
        }

        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return false;
        }

        // 开始上传文件
        uploadFile(file);

        return false; // 阻止默认上传行为
    }, [webSocketRef, currentDirectory]);

    // WebSocket连接状态检测
    const checkWebSocketConnection = useCallback(() => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ WebSocket连接异常，状态:', webSocketRef.current?.readyState);
            return false;
        }
        return true;
    }, []);

    // 文件上传实现
    const uploadFile = useCallback(async (file: File) => {
        const requestId = `file_upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fileName = file.name;
        const chunkSize = 64 * 1024; // 64KB分片
        const totalChunks = Math.ceil(file.size / chunkSize);

        console.log('📤 开始上传文件:', {
            fileName,
            fileSize: file.size,
            chunkSize,
            totalChunks,
            requestId
        });

        // 检查WebSocket连接状态
        if (!checkWebSocketConnection()) {
            const errorMsg = 'WebSocket连接断开，请刷新页面重试';
            message.error(errorMsg);
            setUploadingFiles(prev => new Map(prev.set(fileName, {
                progress: 0,
                status: 'error',
                error: errorMsg,
                file: file
            })));
            return;
        }

        // 初始化上传状态（保存文件引用）
        setUploadingFiles(prev => new Map(prev.set(fileName, { progress: 0, status: 'uploading', file: file })));

        let uploadFailed = false;

        try {
            // 读取文件内容并分片上传
            const fileBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(fileBuffer);

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                // 在每个分片前再次检查连接状态
                if (!checkWebSocketConnection()) {
                    throw new Error('WebSocket连接在上传过程中断开');
                }

                const start = chunkIndex * chunkSize;
                const end = Math.min(start + chunkSize, uint8Array.length);
                const chunk = uint8Array.slice(start, end);

                // 转换为base64
                const base64Chunk = btoa(String.fromCharCode(...chunk));

                const uploadRequest = {
                    type: 'file_upload',
                    data: {
                        path: currentDirectory,
                        fileName: fileName,
                        content: base64Chunk,
                        totalSize: file.size,
                        chunkIndex: chunkIndex,
                        totalChunks: totalChunks,
                        requestId: requestId
                    }
                };

                console.log(`📤 发送文件分片 ${chunkIndex + 1}/${totalChunks}:`, {
                    fileName,
                    chunkSize: chunk.length,
                    progress: Math.round((chunkIndex + 1) / totalChunks * 100)
                });

                // 等待当前分片上传完成的确认（通过Promise和事件监听）
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        uploadFailed = true;
                        reject(new Error('分片上传超时（30秒）'));
                    }, 30000); // 30秒超时

                    const handleResponse = (event: MessageEvent) => {
                        try {
                            const data = JSON.parse(event.data);
                            if (data.type === 'file_upload_response' && data.data.requestId === requestId) {
                                if (data.data.success && data.data.chunkIndex === chunkIndex) {
                                    clearTimeout(timeout);
                                    webSocketRef.current?.removeEventListener('message', handleResponse);

                                    // 更新进度
                                    setUploadingFiles(prev => {
                                        const newMap = new Map(prev);
                                        const current = newMap.get(fileName);
                                        if (current && current.status === 'uploading') {
                                            newMap.set(fileName, {
                                                ...current,
                                                progress: data.data.progress,
                                                status: data.data.isComplete ? 'success' : 'uploading'
                                            });
                                        }
                                        return newMap;
                                    });

                                    resolve();
                                } else if (!data.data.success) {
                                    clearTimeout(timeout);
                                    webSocketRef.current?.removeEventListener('message', handleResponse);
                                    uploadFailed = true;
                                    reject(new Error(data.data.error || '上传失败'));
                                }
                            }
                        } catch (error) {
                            // 忽略解析错误，可能不是我们期望的消息
                        }
                    };

                    webSocketRef.current?.addEventListener('message', handleResponse);

                    // 发送分片请求
                    try {
                        webSocketRef.current?.send(JSON.stringify(uploadRequest));
                    } catch (sendError) {
                        clearTimeout(timeout);
                        webSocketRef.current?.removeEventListener('message', handleResponse);
                        uploadFailed = true;
                        reject(new Error(`发送请求失败: ${sendError}`));
                    }
                });

                // 如果上传失败，立即停止
                if (uploadFailed) {
                    break;
                }

                // 稍微延迟，避免发送过快
                if (chunkIndex < totalChunks - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // 检查是否因为失败而停止
            if (uploadFailed) {
                throw new Error('上传过程中出现错误');
            }

            console.log('✅ 文件上传完成:', fileName);
            message.success(`文件上传完成: ${fileName}`);

            // 刷新文件列表
            setTimeout(() => {
                refreshDirectory();
                // 清除上传状态（成功后3秒自动清除）
                setTimeout(() => {
                    setUploadingFiles(prev => {
                        const newMap = new Map(prev);
                        newMap.delete(fileName);
                        return newMap;
                    });
                }, 3000);
            }, 500);

        } catch (error) {
            console.error('❌ 文件上传失败:', error);
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            message.error(`文件上传失败: ${errorMessage}`);

            // 设置错误状态（不自动清除，让用户自己决定）
            setUploadingFiles(prev => {
                const newMap = new Map(prev);
                const currentState = newMap.get(fileName);
                newMap.set(fileName, {
                    progress: 0,
                    status: 'error',
                    error: errorMessage,
                    file: currentState?.file || file // 保持文件引用
                });
                return newMap;
            });

            // 不再自动清除错误状态，让用户通过重试按钮或手动操作来清除
        }
    }, [webSocketRef, currentDirectory, refreshDirectory, checkWebSocketConnection]);

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
                    <button
                        type="button"
                        onClick={() => { setCurrentDirectory('/'); saveCurrentPath('/'); setTimeout(() => { refreshDirectory('/'); }, 100); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setCurrentDirectory('/'); saveCurrentPath('/'); setTimeout(() => { refreshDirectory('/'); }, 100); } }}
                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                    >
                        <HomeOutlined /> 根目录
                    </button>
                )
            }
        ];

        let path = '';
        parts.forEach((part) => {
            path += `/${part}`;
            const currentPath = path;
            items.push({
                title: (
                    <button
                        type="button"
                        onClick={() => { setCurrentDirectory(currentPath); saveCurrentPath(currentPath); setTimeout(() => { refreshDirectory(currentPath); }, 100); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setCurrentDirectory(currentPath); saveCurrentPath(currentPath); setTimeout(() => { refreshDirectory(currentPath); }, 100); } }}
                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                    >
                        {part}
                    </button>
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



    // VirtualFileRow 组件已移除，改用 Ant Design Table

    // 统一的初始化逻辑，防止多次请求
    useEffect(() => {
        // 只在组件首次可见且未初始化时执行
        if (!visible || hasInitializedRef.current) {
            return;
        }


        // 清除之前的初始化定时器
        if (initializationTimerRef.current) {
            clearTimeout(initializationTimerRef.current);
            initializationTimerRef.current = null;
        }

        // 设置初始化定时器，确保在组件状态稳定后初始化
        initializationTimerRef.current = setTimeout(() => {
            // 标记已经初始化，防止重复
            hasInitializedRef.current = true;


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


        // 消息统计
        let messageStats = {
            total: 0
        };

        const handleMessage = (event: MessageEvent) => {
            // 基本类型检查
            if (typeof event.data !== 'string' || event.data.length < 10) {
                return;
            }

            messageStats.total++;

            try {
                const data = JSON.parse(event.data);

                // 只处理FileBrowser相关的消息类型
                if (data.type === 'file_list_response') {
                    processFileListMessageAsync(event);
                    return;
                }

                // 处理分段消息
                if (data.type === 'file_list_segment') {
                    handleSegmentedFileList({
                        requestId: data.data.requestId,
                        segmentId: data.data.segmentId,
                        totalSegments: data.data.totalSegments,
                        data: data.data.data,
                        isComplete: data.data.isComplete
                    });
                    return;
                }

                // 处理文件创建响应
                if (data.type === 'file_create_response') {
                    if (data.data.success) {
                        message.success('文件创建成功');
                        // 刷新文件列表
                        setTimeout(() => refreshDirectory(), 500);
                    } else {
                        message.error(`文件创建失败: ${data.data.error || '未知错误'}`);
                    }
                    return;
                }

                // 处理文件夹创建响应
                if (data.type === 'folder_create_response') {
                    if (data.data.success) {
                        message.success('文件夹创建成功');
                        // 刷新文件列表
                        setTimeout(() => refreshDirectory(), 500);
                    } else {
                        message.error(`文件夹创建失败: ${data.data.error || '未知错误'}`);
                    }
                    return;
                }

                // 处理文件上传响应
                if (data.type === 'file_upload_response') {
                    // 文件上传的响应在uploadFile函数中通过事件监听器处理
                    // 这里不需要额外处理，让uploadFile函数的监听器处理
                    return;
                }

                // 处理文件删除响应
                if (data.type === 'file_delete_response') {
                    message.destroy(); // 清除loading消息
                    if (data.data.success) {
                        message.success('删除成功');
                        // 刷新文件列表
                        setTimeout(() => refreshDirectory(), 500);
                    } else {
                        message.error(`删除失败: ${data.data.error || '未知错误'}`);
                    }
                    return;
                }

                // 处理文件重命名响应
                if (data.type === 'file_rename_response') {
                    message.destroy(); // 清除loading消息
                    if (data.data.success) {
                        message.success('重命名成功');
                        // 刷新文件列表
                        setTimeout(() => refreshDirectory(), 500);
                    } else {
                        message.error(`重命名失败: ${data.data.error || '未知错误'}`);
                    }
                    return;
                }

                // 处理文件权限修改响应
                if (data.type === 'file_permissions_response') {
                    message.destroy(); // 清除loading消息
                    if (data.data.success) {
                        message.success('权限修改成功');
                        // 刷新文件列表
                        setTimeout(() => refreshDirectory(), 500);
                    } else {
                        // 更详细的错误信息显示
                        const errorMsg = data.data.error || '未知错误';
                        console.error('权限修改失败:', errorMsg);
                        message.error({
                            content: `权限修改失败: ${errorMsg}`,
                            duration: 6, // 显示6秒，让用户有足够时间看到错误信息
                        });
                    }
                    return;
                }

                // 对于其他消息类型（如file_view_response），不做任何处理
                // 让它们能够被其他组件的监听器正常处理
                // 这里什么都不做，事件会继续冒泡给其他监听器
            } catch (error) {
                console.error('❌ 解析WebSocket消息失败:', error);
            }
        };



        // 直接处理文件列表消息
        const processFileListMessageAsync = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'file_list_response') {

                    if (data.data.requestId !== currentRequestRef.current) {
                        return;
                    }


                    // 清理超时和状态
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

                        // 处理文件列表，确保每个文件都有正确的path属性
                        const processedFiles = data.data.files.map((file: FileItem) => {
                            // 如果文件没有path属性或path为空，则根据当前目录生成完整路径
                            if (!file.path) {
                                // 使用当前目录状态来生成完整路径
                                const currentDir = currentDirectoryRef.current || currentDirectory;
                                const fullPath = currentDir === '/'
                                    ? `/${file.name}`
                                    : `${currentDir}/${file.name}`;
                                return {
                                    ...file,
                                    path: fullPath
                                };
                            }
                            return file;
                        });

                        // 设置处理后的文件列表
                        setFiles(processedFiles);
                    } else {
                        console.log('📁 文件列表为空或无效');
                        setFiles([]);
                    }
                }

            } catch (error) {
                console.error('❌ processFileListMessageAsync 错误:', error);

                // 清理状态
                if (requestTimeoutRef.current) {
                    clearTimeout(requestTimeoutRef.current);
                    requestTimeoutRef.current = null;
                }
                setLoading(false);
                setIsWaitingForLs(false);
                currentRequestRef.current = null;
            }
        };



        const ws = webSocketRef.current;
        ws.addEventListener('message', handleMessage);

        return () => {
            if (ws && ws.readyState !== WebSocket.CLOSED) {
                ws.removeEventListener('message', handleMessage);
            }
        };
    }, [webSocketRef, visible, currentDirectory, handleSegmentedFileList]);

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
            case 'select': {
                const isCurrentlySelected = selectedFiles.includes(file.name);
                handleFileSelection(file.name, !isCurrentlySelected);
                break;
            }
        }
    }, [viewFile, downloadFile, deleteItem, enterDirectory, selectedFiles, handleFileSelection]);

    // 全局键盘事件处理 - 阻止所有事件冒泡到终端
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // 阻止所有键盘事件冒泡到父组件（终端）
        e.stopPropagation();

        // 如果是在输入框中，大部分按键都应该被阻止传播
        const target = e.target as HTMLElement;
        const isInputElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';

        if (isInputElement) {
            // 在输入框中时，只允许少数特殊按键进行处理
            if (e.key === 'Escape' && onClose) {
                e.preventDefault();
                onClose();
            }
            return; // 其他所有按键都直接返回，不进行任何处理
        }

        // 处理文件浏览器特定的快捷键（仅在非输入元素时）
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
                        onOk: () => batchDeleteItems()
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
    }, [refreshDirectory, onClose, selectedFiles, files, filteredFiles, enterDirectory, viewFile, goToParent, batchDeleteItems]);

    // 输入事件处理 - 专门处理输入相关事件
    const handleInput = useCallback((e: React.FormEvent) => {
        e.stopPropagation();
    }, []);

    // 组合输入事件处理
    const handleCompositionStart = useCallback((e: React.CompositionEvent) => {
        e.stopPropagation();
    }, []);

    const handleCompositionEnd = useCallback((e: React.CompositionEvent) => {
        e.stopPropagation();
    }, []);

    // 粘贴事件处理
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.stopPropagation();
    }, []);

    // 鼠标事件处理 - 阻止不必要的事件冒泡
    const handleMouseEvent = useCallback((e: React.MouseEvent) => {
        // 阻止鼠标事件冒泡，防止影响终端的鼠标处理
        e.stopPropagation();
    }, []);

    // 焦点处理 - 确保文件浏览器获得焦点时不影响终端
    const handleFocus = useCallback((e: React.FocusEvent) => {
        e.stopPropagation();
    }, []);

    // 完全移除滚动处理，让虚拟化库自己处理

    if (!visible) return null;

    return (
        <section
            aria-label="文件浏览器"
            className="file-browser"
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
            onInput={handleInput}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onPaste={handlePaste}
            onCut={(e) => e.stopPropagation()}
            onCopy={(e) => e.stopPropagation()}
            onMouseDown={handleMouseEvent}
            onMouseUp={handleMouseEvent}
            onMouseMove={handleMouseEvent}
            onClick={handleMouseEvent}
            onDoubleClick={handleMouseEvent}
            onContextMenu={handleMouseEvent}
            onFocus={handleFocus}
            onBlur={(e) => e.stopPropagation()}
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
                        <Button
                            icon={<FileOutlined />}
                            onClick={() => setNewFileVisible(true)}
                        >
                            新建文件
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
                        {/* 上传进度显示 */}
                        {uploadingFiles.size > 0 && (
                            <div className="upload-progress-container">
                                {Array.from(uploadingFiles.entries()).map(([fileName, status]) => (
                                    <div key={fileName} className="upload-progress-item">
                                        <div className="upload-file-info">
                                            <span className="upload-file-name">{fileName}</span>
                                            <div className="upload-file-actions">
                                                <span className="upload-file-status">
                                                    {status.status === 'uploading' && `${status.progress.toFixed(1)}%`}
                                                    {status.status === 'retrying' && '🔄 重试中...'}
                                                    {status.status === 'success' && '✅ 完成'}
                                                    {status.status === 'error' && '❌ 失败'}
                                                </span>
                                                {status.status === 'error' && (
                                                    <>
                                                        <Button
                                                            type="link"
                                                            size="small"
                                                            onClick={() => {
                                                                // 获取保存的文件对象并重新上传
                                                                const fileData = status.file;
                                                                if (fileData) {
                                                                    console.log('🔄 重新上传文件:', fileName);
                                                                    message.info('正在重新上传...');

                                                                    // 设置重试状态
                                                                    setUploadingFiles(prev => {
                                                                        const newMap = new Map(prev);
                                                                        const current = newMap.get(fileName);
                                                                        if (current) {
                                                                            newMap.set(fileName, {
                                                                                ...current,
                                                                                status: 'retrying',
                                                                                progress: 0,
                                                                                error: undefined
                                                                            });
                                                                        }
                                                                        return newMap;
                                                                    });

                                                                    // 重新上传文件
                                                                    setTimeout(() => {
                                                                        uploadFile(fileData);
                                                                    }, 500);
                                                                } else {
                                                                    // 如果没有文件引用，提示重新选择
                                                                    setUploadingFiles(prev => {
                                                                        const newMap = new Map(prev);
                                                                        newMap.delete(fileName);
                                                                        return newMap;
                                                                    });
                                                                    message.info('请重新选择文件上传');
                                                                }
                                                            }}
                                                            style={{
                                                                padding: '0 4px',
                                                                height: 'auto',
                                                                fontSize: '12px',
                                                                color: '#1677ff'
                                                            }}
                                                        >
                                                            重试
                                                        </Button>
                                                    </>
                                                )}
                                                {(status.status === 'error' || status.status === 'retrying') && (
                                                    <Button
                                                        type="link"
                                                        size="small"
                                                        onClick={() => {
                                                            // 直接清除状态
                                                            setUploadingFiles(prev => {
                                                                const newMap = new Map(prev);
                                                                newMap.delete(fileName);
                                                                return newMap;
                                                            });
                                                        }}
                                                        style={{
                                                            padding: '0 4px',
                                                            height: 'auto',
                                                            fontSize: '12px',
                                                            color: '#8c8c8c'
                                                        }}
                                                    >
                                                        ✕
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <Progress
                                            percent={status.progress}
                                            size="small"
                                            status={
                                                status.status === 'uploading' || status.status === 'retrying' ? 'active' :
                                                    status.status === 'success' ? 'success' : 'exception'
                                            }
                                            showInfo={false}
                                        />
                                        {status.status === 'error' && status.error && (
                                            <div className="upload-error-message">
                                                {status.error}
                                                {status.error.includes('权限') && (
                                                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#666' }}>
                                                        提示：请选择有写权限的目录，或联系管理员
                                                    </div>
                                                )}
                                                {status.error.includes('连接') && (
                                                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#666' }}>
                                                        提示：网络连接异常，请刷新页面后重试
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
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
                                        onOk: () => batchDeleteItems()
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
                            onKeyDown={(e) => e.stopPropagation()}
                            onKeyUp={(e) => e.stopPropagation()}
                            onKeyPress={(e) => e.stopPropagation()}
                            onInput={(e) => e.stopPropagation()}
                            onCompositionStart={(e) => e.stopPropagation()}
                            onCompositionEnd={(e) => e.stopPropagation()}
                            onPaste={(e) => e.stopPropagation()}
                            onFocus={(e) => e.stopPropagation()}
                            onBlur={(e) => e.stopPropagation()}
                            allowClear
                            enterButton="搜索"
                            size="middle"
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
                            <Table
                                columns={columns}
                                dataSource={filteredFiles}
                                rowKey="name"
                                loading={loading}
                                pagination={{
                                    current: currentPage,
                                    pageSize: pageSize,
                                    total: filteredFiles.length,
                                    showSizeChanger: true,
                                    showQuickJumper: true,
                                    showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                                    pageSizeOptions: ['20', '50', '100', '200'],
                                    onChange: (page, size) => {
                                        setCurrentPage(page);
                                        if (size !== pageSize) {
                                            setPageSize(size);
                                            setCurrentPage(1); // 重置到第一页
                                        }
                                    },
                                }}
                                size="small"
                                style={{ flex: 1, height: '100%' }}
                            />
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

            <Modal
                title={`编辑文件: ${fileEditTarget?.name ?? ''}`}
                open={fileEditVisible}
                onOk={saveFileEdit}
                onCancel={() => { setFileEditVisible(false); setFileEditContent(''); setFileEditTarget(null); }}
                okText="保存"
                cancelText="取消"
                confirmLoading={fileEditSaving}
                width={800}
                style={{ top: 40 }}
            >
                {fileEditLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
                ) : (
                    <Input.TextArea
                        value={fileEditContent}
                        onChange={(e) => setFileEditContent(e.target.value)}
                        rows={24}
                        style={{ fontFamily: 'monospace', fontSize: 13 }}
                        onKeyDown={(e) => e.stopPropagation()}
                        onKeyUp={(e) => e.stopPropagation()}
                    />
                )}
            </Modal>

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
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    onKeyPress={(e) => e.stopPropagation()}
                    onInput={(e) => e.stopPropagation()}
                    onCompositionStart={(e) => e.stopPropagation()}
                    onCompositionEnd={(e) => e.stopPropagation()}
                    onPaste={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    onBlur={(e) => e.stopPropagation()}
                    autoFocus
                />
            </Modal>

            {/* 新建文件模态框 */}
            <Modal
                title="新建文件"
                open={newFileVisible}
                onOk={createFile}
                onCancel={() => {
                    setNewFileVisible(false);
                    setNewFileName('');
                }}
                okText="创建"
                cancelText="取消"
            >
                <Input
                    id="new-file-name-input"
                    name="newFileName"
                    placeholder="请输入文件名称（如: index.html, config.txt）"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onPressEnter={createFile}
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    onKeyPress={(e) => e.stopPropagation()}
                    onInput={(e) => e.stopPropagation()}
                    onCompositionStart={(e) => e.stopPropagation()}
                    onCompositionEnd={(e) => e.stopPropagation()}
                    onPaste={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    onBlur={(e) => e.stopPropagation()}
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
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    onKeyPress={(e) => e.stopPropagation()}
                    onInput={(e) => e.stopPropagation()}
                    onCompositionStart={(e) => e.stopPropagation()}
                    onCompositionEnd={(e) => e.stopPropagation()}
                    onPaste={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    onBlur={(e) => e.stopPropagation()}
                    autoFocus
                />
            </Modal>

            {/* 权限修改对话框 */}
            <Modal
                title="修改文件权限"
                open={permissionsVisible}
                onOk={changePermissions}
                onCancel={() => {
                    setPermissionsVisible(false);
                    setPermissionsTarget('');
                    setNewPermissions('');
                }}
                okText="确认修改"
                cancelText="取消"
                destroyOnHidden
                width={500}
            >
                <div style={{ marginBottom: 20 }}>
                    <p><strong>文件:</strong> {permissionsTarget}</p>
                    <p><strong>当前权限:</strong> {files.find(f => f.name === permissionsTarget)?.permissions || 'N/A'}</p>
                </div>

                {/* 可视化权限设置 */}
                <div style={{ marginBottom: 20 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f5f5f5' }}>
                                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d9d9d9' }}></th>
                                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #d9d9d9' }}>读取</th>
                                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #d9d9d9' }}>写入</th>
                                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #d9d9d9' }}>可执行</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', fontWeight: 'bold' }}>所有者</td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.owner.read}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                owner: { ...permissionsMatrix.owner, read: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.owner.write}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                owner: { ...permissionsMatrix.owner, write: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.owner.execute}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                owner: { ...permissionsMatrix.owner, execute: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                            </tr>
                            <tr>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', fontWeight: 'bold' }}>用户组</td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.group.read}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                group: { ...permissionsMatrix.group, read: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.group.write}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                group: { ...permissionsMatrix.group, write: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.group.execute}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                group: { ...permissionsMatrix.group, execute: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                            </tr>
                            <tr>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', fontWeight: 'bold' }}>公共</td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.others.read}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                others: { ...permissionsMatrix.others, read: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.others.write}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                others: { ...permissionsMatrix.others, write: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '8px', border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Checkbox
                                        checked={permissionsMatrix.others.execute}
                                        onChange={(e) => {
                                            const newMatrix = {
                                                ...permissionsMatrix,
                                                others: { ...permissionsMatrix.others, execute: e.target.checked }
                                            };
                                            setPermissionsMatrix(newMatrix);
                                            setNewPermissions(permissionsMatrixToNumeric(newMatrix));
                                        }}
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* 权限数字输入 */}
                <Form layout="vertical">
                    <Form.Item label="权限">
                        <Input
                            value={newPermissions}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (/^[0-7]{0,3}$/.test(value)) {
                                    setNewPermissions(value);
                                    if (value.length === 3) {
                                        setPermissionsMatrix(numericToPermissionsMatrix(value));
                                    }
                                }
                            }}
                            placeholder="例如: 755"
                            maxLength={3}
                            style={{ width: 200, fontFamily: 'monospace', fontSize: '16px' }}
                            onKeyDown={(e) => e.stopPropagation()}
                            onKeyUp={(e) => e.stopPropagation()}
                            onKeyPress={(e) => e.stopPropagation()}
                            onInput={(e) => e.stopPropagation()}
                            onCompositionStart={(e) => e.stopPropagation()}
                            onCompositionEnd={(e) => e.stopPropagation()}
                            onPaste={(e) => e.stopPropagation()}
                            onFocus={(e) => e.stopPropagation()}
                            onBlur={(e) => e.stopPropagation()}
                        />
                    </Form.Item>

                    {/* 常用权限快速选择 */}
                    <div style={{ marginTop: 16 }}>
                        <p style={{ marginBottom: 8 }}><strong>常用权限:</strong></p>
                        <Space wrap>
                            {[
                                { value: '755', desc: '拥有者全权限，其他读执行', color: 'green' },
                                { value: '644', desc: '拥有者读写，其他只读', color: 'blue' },
                                { value: '777', desc: '所有用户全权限', color: 'orange' },
                                { value: '600', desc: '仅拥有者读写', color: 'purple' }
                            ].map(perm => (
                                <Tooltip key={perm.value} title={perm.desc}>
                                    <Tag
                                        color={perm.color}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => {
                                            setNewPermissions(perm.value);
                                            setPermissionsMatrix(numericToPermissionsMatrix(perm.value));
                                        }}
                                    >
                                        {perm.value}
                                    </Tag>
                                </Tooltip>
                            ))}
                        </Space>
                    </div>
                </Form>
            </Modal>
        </section>
    );
};

export default FileBrowser;

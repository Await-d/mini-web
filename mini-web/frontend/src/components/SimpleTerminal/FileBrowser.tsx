/*
 * @Author: Await
 * @Date: 2025-05-26 20:00:00
 * @LastEditors: Await
 * @LastEditTime: 2025-05-31 17:18:33
 * @Description: SSH终端文件浏览器组件
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Tree, Button, Space, Modal, Input, Upload, message, Dropdown, Menu,
    Breadcrumb, Tooltip, Card, Table, Tag, Progress, Form
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { MenuProps } from 'antd';
import {
    FolderOutlined, FileOutlined, UploadOutlined, DownloadOutlined,
    DeleteOutlined, EditOutlined, PlusOutlined, CopyOutlined,
    HomeOutlined, ReloadOutlined, MoreOutlined, EyeOutlined,
    ScissorOutlined, CloudUploadOutlined, FolderAddOutlined,
    FileTextOutlined, FilePdfOutlined, FileImageOutlined,
    FileZipOutlined, SelectOutlined, UpOutlined, DownOutlined
} from '@ant-design/icons';
import './FileBrowser.css';

interface FileItem {
    name: string;
    type: 'file' | 'directory';
    size: number;
    permissions: string;
    modifiedTime: string;
    path: string;
    owner?: string;
    group?: string;
}

interface FileBrowserProps {
    webSocketRef: React.RefObject<WebSocket | null>;
    visible: boolean;
    onClose?: () => void;
    currentPath?: string;
}

const FileBrowser: React.FC<FileBrowserProps> = ({
    webSocketRef,
    visible,
    onClose,
    currentPath = '/'
}) => {
    // 状态管理
    const [files, setFiles] = useState<FileItem[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
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
    const [outputBuffer, setOutputBuffer] = useState<string>('');
    const [isWaitingForLs, setIsWaitingForLs] = useState(false);
    const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const currentRequestRef = useRef<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // 执行SSH命令
    const executeSSHCommand = useCallback((command: string) => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            return;
        }

        console.log('执行SSH命令:', command);
        webSocketRef.current.send(command + '\n');
    }, [webSocketRef]);

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
                        modifiedTime: modTime,
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
                    modifiedTime: `${month} ${day} ${timeOrYear}`,
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

    // 刷新当前目录
    const refreshDirectory = useCallback(() => {
        // 防止重复调用
        if (loading || isWaitingForLs) {
            console.log('正在加载中，跳过重复请求');
            return;
        }

        // 生成唯一请求ID
        const requestId = `file_list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentRequestRef.current = requestId;

        console.log('开始刷新目录:', currentDirectory, '请求ID:', requestId);
        setLoading(true);
        setFiles([]); // 清空当前文件列表
        setOutputBuffer(''); // 清空缓冲区
        setIsWaitingForLs(true); // 设置等待状态为true，开始等待ls输出

        // 发送JSON格式的文件列表请求
        const fileListRequest = {
            type: 'file_list',
            data: {
                path: currentDirectory,
                requestId: requestId
            }
        };

        console.log('发送文件列表请求:', fileListRequest);

        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立');
            setLoading(false);
            setIsWaitingForLs(false);
            return;
        }

        // 发送JSON命令
        webSocketRef.current.send(JSON.stringify(fileListRequest));

        // 设置超时，防止命令无响应
        const timeoutId = setTimeout(() => {
            console.log('文件列表请求超时');
            setLoading(false);
            setIsWaitingForLs(false);
            message.error('获取目录信息超时');
        }, 10000); // 10秒超时

        // 返回清理函数
        return () => {
            clearTimeout(timeoutId);
        };
    }, [currentDirectory, webSocketRef]);

    // 进入目录
    const enterDirectory = useCallback((dirName: string) => {
        const newPath = currentDirectory === '/'
            ? `/${dirName}`
            : `${currentDirectory}/${dirName}`;

        // 先检查目录是否存在
        executeSSHCommand(`test -d "${newPath}" && echo "DIR_EXISTS" || echo "DIR_NOT_EXISTS"`);

        // 模拟检查结果处理
        setTimeout(() => {
            setCurrentDirectory(newPath);
            refreshDirectory();
        }, 500);
    }, [currentDirectory, executeSSHCommand, refreshDirectory]);

    // 返回上级目录
    const goToParent = useCallback(() => {
        if (currentDirectory === '/') return;

        const parentPath = currentDirectory.split('/').slice(0, -1).join('/') || '/';
        setCurrentDirectory(parentPath);
        executeSSHCommand(`cd "${parentPath}"`);

        // 刷新父目录内容
        setTimeout(() => {
            refreshDirectory();
        }, 500);
    }, [currentDirectory, executeSSHCommand, refreshDirectory]);

    // 删除文件或目录
    const deleteItem = useCallback((fileName: string) => {
        Modal.confirm({
            title: '确认删除',
            content: `确定要删除 "${fileName}" 吗？此操作不可撤销。`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
                const file = files.find(f => f.name === fileName);
                const command = file?.type === 'directory'
                    ? `rm -rf "${currentDirectory}/${fileName}"`
                    : `rm "${currentDirectory}/${fileName}"`;

                executeSSHCommand(command);
                message.success(`删除${file?.type === 'directory' ? '目录' : '文件'}: ${fileName}`);

                // 刷新目录
                setTimeout(() => {
                    refreshDirectory();
                }, 1000);
            }
        });
    }, [currentDirectory, executeSSHCommand, refreshDirectory, files]);

    // 创建目录
    const createDirectory = useCallback(() => {
        if (!newFolderName.trim()) {
            message.error('请输入文件夹名称');
            return;
        }

        executeSSHCommand(`mkdir -p "${currentDirectory}/${newFolderName}"`);
        message.success(`创建目录: ${newFolderName}`);

        setNewFolderVisible(false);
        setNewFolderName('');

        // 刷新目录
        setTimeout(() => {
            refreshDirectory();
        }, 1000);
    }, [newFolderName, currentDirectory, executeSSHCommand, refreshDirectory]);

    // 重命名文件或目录
    const renameItem = useCallback(() => {
        if (!newName.trim()) {
            message.error('请输入新名称');
            return;
        }

        executeSSHCommand(`mv "${currentDirectory}/${renameTarget}" "${currentDirectory}/${newName}"`);
        message.success(`重命名: ${renameTarget} -> ${newName}`);

        setRenameVisible(false);
        setRenameTarget('');
        setNewName('');

        // 刷新目录
        setTimeout(() => {
            refreshDirectory();
        }, 1000);
    }, [newName, renameTarget, currentDirectory, executeSSHCommand, refreshDirectory]);

    // 查看文件内容
    const viewFile = useCallback((fileName: string) => {
        executeSSHCommand(`head -n 50 "${currentDirectory}/${fileName}"`);
        message.info(`查看文件内容: ${fileName}`);
    }, [currentDirectory, executeSSHCommand]);

    // 下载文件
    const downloadFile = useCallback((fileName: string) => {
        executeSSHCommand(`cat "${currentDirectory}/${fileName}" | base64`);
        message.info(`正在准备下载文件: ${fileName}`);
    }, [currentDirectory, executeSSHCommand]);

    // 上传文件处理
    const handleFileUpload = useCallback((file: File) => {
        if (file.size > 50 * 1024 * 1024) { // 50MB限制
            message.error('文件大小不能超过50MB');
            return false;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) {
                message.error('文件读取失败');
                return;
            }

            // 将文件转换为base64
            const uint8Array = new Uint8Array(arrayBuffer);
            const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
            const base64Content = btoa(binaryString);

            // 使用base64编码上传文件
            const uploadCommand = `echo "${base64Content}" | base64 -d > "${currentDirectory}/${file.name}"`;
            executeSSHCommand(uploadCommand);

            message.success(`正在上传文件: ${file.name}`);

            // 设置上传进度模拟
            setUploadProgress(0);
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return 90;
                    }
                    return prev + 10;
                });
            }, 200);

            // 上传完成后刷新目录
            setTimeout(() => {
                setUploadProgress(100);
                setTimeout(() => {
                    setUploadProgress(0);
                    refreshDirectory();
                }, 500);
            }, 2000);
        };

        reader.onerror = () => {
            message.error('文件读取失败');
        };

        reader.readAsArrayBuffer(file); // 使用ArrayBuffer读取支持二进制文件
        return false; // 阻止默认上传行为
    }, [currentDirectory, executeSSHCommand, refreshDirectory]);

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

    // 获取文件图标
    const getFileIcon = useCallback((file: FileItem) => {
        if (file.type === 'directory') {
            return <FolderOutlined style={{ color: '#1890ff', fontSize: '16px' }} />;
        }

        const ext = file.name.split('.').pop()?.toLowerCase();
        const iconStyle = { fontSize: '16px' };

        switch (ext) {
            // 文本文件
            case 'txt':
            case 'md':
            case 'readme':
                return <FileTextOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
            case 'log':
                return <FileTextOutlined style={{ ...iconStyle, color: '#722ed1' }} />;

            // 文档文件
            case 'pdf':
                return <FilePdfOutlined style={{ ...iconStyle, color: '#f5222d' }} />;
            case 'doc':
            case 'docx':
                return <FileTextOutlined style={{ ...iconStyle, color: '#1890ff' }} />;
            case 'xls':
            case 'xlsx':
                return <FileOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
            case 'ppt':
            case 'pptx':
                return <FileOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;

            // 图片文件
            case 'jpg':
            case 'jpeg':
            case 'png':
            case 'gif':
            case 'bmp':
            case 'svg':
            case 'webp':
                return <FileImageOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;

            // 压缩文件
            case 'zip':
            case 'rar':
            case '7z':
            case 'tar':
            case 'gz':
            case 'bz2':
                return <FileZipOutlined style={{ ...iconStyle, color: '#722ed1' }} />;

            // 代码文件
            case 'js':
            case 'jsx':
            case 'ts':
            case 'tsx':
                return <FileOutlined style={{ ...iconStyle, color: '#fadb14' }} />;
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
            case 'c':
            case 'cpp':
            case 'h':
                return <FileOutlined style={{ ...iconStyle, color: '#659ad2' }} />;
            case 'go':
                return <FileOutlined style={{ ...iconStyle, color: '#00add8' }} />;
            case 'php':
                return <FileOutlined style={{ ...iconStyle, color: '#777bb4' }} />;
            case 'rb':
                return <FileOutlined style={{ ...iconStyle, color: '#cc342d' }} />;

            // 配置文件
            case 'conf':
            case 'config':
            case 'ini':
            case 'cfg':
            case 'yaml':
            case 'yml':
                return <FileOutlined style={{ ...iconStyle, color: '#8c8c8c' }} />;

            // 数据库文件
            case 'sql':
            case 'db':
            case 'sqlite':
                return <FileOutlined style={{ ...iconStyle, color: '#fa541c' }} />;

            // 音视频文件
            case 'mp3':
            case 'wav':
            case 'flac':
            case 'aac':
                return <FileOutlined style={{ ...iconStyle, color: '#eb2f96' }} />;
            case 'mp4':
            case 'avi':
            case 'mkv':
            case 'mov':
            case 'wmv':
                return <FileOutlined style={{ ...iconStyle, color: '#13c2c2' }} />;

            // 可执行文件
            case 'exe':
            case 'msi':
            case 'deb':
            case 'rpm':
            case 'dmg':
                return <FileOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;

            // 系统文件
            case 'dll':
            case 'so':
            case 'dylib':
                return <FileOutlined style={{ ...iconStyle, color: '#595959' }} />;

            default:
                return <FileOutlined style={{ ...iconStyle, color: '#8c8c8c' }} />;
        }
    }, []);

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
                    <span onClick={() => setCurrentDirectory('/')} style={{ cursor: 'pointer' }}>
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
                    <span onClick={() => setCurrentDirectory(currentPath)} style={{ cursor: 'pointer' }}>
                        {part}
                    </span>
                )
            });
        });

        return items;
    }, [currentDirectory]);

    // 搜索和过滤文件
    useEffect(() => {
        let filtered = [...files];

        // 搜索过滤
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
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
                    comparison = a.modifiedTime.localeCompare(b.modifiedTime);
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

        setFilteredFiles(filtered);
    }, [files, searchTerm, sortField, sortOrder]);

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

    // 表格列定义
    const columns = [
        {
            title: (
                <div
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onClick={() => handleSort('name')}
                >
                    名称
                    {sortField === 'name' && (
                        sortOrder === 'asc' ? <UpOutlined style={{ marginLeft: 4 }} /> : <DownOutlined style={{ marginLeft: 4 }} />
                    )}
                </div>
            ),
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record: FileItem) => (
                <div
                    className={`file-item ${selectedFiles.includes(name) ? 'selected' : ''}`}
                    onClick={() => {
                        if (record.type === 'directory') {
                            enterDirectory(name);
                        } else {
                            setSelectedFiles(prev =>
                                prev.includes(name)
                                    ? prev.filter(f => f !== name)
                                    : [...prev, name]
                            );
                        }
                    }}
                >
                    <div className="file-item-icon">
                        {getFileIcon(record)}
                    </div>
                    <span className="file-item-name">{name}</span>
                </div>
            ),
        },
        {
            title: (
                <div
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onClick={() => handleSort('size')}
                >
                    大小
                    {sortField === 'size' && (
                        sortOrder === 'asc' ? <UpOutlined style={{ marginLeft: 4 }} /> : <DownOutlined style={{ marginLeft: 4 }} />
                    )}
                </div>
            ),
            dataIndex: 'size',
            key: 'size',
            render: (size: number, record: FileItem) => (
                <span className="file-size">
                    {record.type === 'directory' ? '-' : formatFileSize(size)}
                </span>
            ),
        },
        {
            title: '权限',
            dataIndex: 'permissions',
            key: 'permissions',
            render: (permissions: string) => (
                <span className="file-permissions">{permissions}</span>
            ),
        },
        {
            title: (
                <div
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onClick={() => handleSort('modified')}
                >
                    修改时间
                    {sortField === 'modified' && (
                        sortOrder === 'asc' ? <UpOutlined style={{ marginLeft: 4 }} /> : <DownOutlined style={{ marginLeft: 4 }} />
                    )}
                </div>
            ),
            dataIndex: 'modifiedTime',
            key: 'modifiedTime',
            render: (modifiedTime: string) => (
                <span className="file-time">{modifiedTime}</span>
            ),
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: FileItem) => {
                const menuItems: MenuProps['items'] = [
                    {
                        key: 'rename',
                        icon: <EditOutlined />,
                        label: '重命名',
                        onClick: () => {
                            setRenameTarget(record.name);
                            setNewName(record.name);
                            setRenameVisible(true);
                        }
                    },
                    {
                        key: 'delete',
                        icon: <DeleteOutlined />,
                        label: '删除',
                        danger: true,
                        onClick: () => deleteItem(record.name)
                    }
                ];

                if (record.type === 'file') {
                    menuItems.unshift(
                        {
                            key: 'view',
                            icon: <EyeOutlined />,
                            label: '查看',
                            onClick: () => viewFile(record.name)
                        },
                        {
                            key: 'download',
                            icon: <DownloadOutlined />,
                            label: '下载',
                            onClick: () => downloadFile(record.name)
                        }
                    );
                }

                return (
                    <div className="file-actions">
                        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                            <Button size="small" icon={<MoreOutlined />} />
                        </Dropdown>
                    </div>
                );
            },
        },
    ];

    // 初始化时加载目录
    useEffect(() => {
        if (visible && files.length === 0 && !loading && !isWaitingForLs) {
            console.log('FileBrowser初始化，加载目录:', currentDirectory);
            const timeoutId = setTimeout(() => {
                refreshDirectory();
            }, 100); // 延迟100ms避免重复调用

            return () => clearTimeout(timeoutId);
        }
    }, [visible]); // 只依赖visible，避免因其他状态变化导致重复调用

    // 监听WebSocket消息，解析ls命令结果
    useEffect(() => {
        if (!webSocketRef.current || !visible) return;

        const handleMessage = (event: MessageEvent) => {
            let messageData: string = '';

            try {
                // 检查原始数据类型
                if (typeof event.data !== 'string') {
                    console.log('收到非字符串类型的WebSocket消息，忽略');
                    return;
                }

                // 尝试解析JSON消息
                try {
                    const data = JSON.parse(event.data);

                    // 处理文件列表响应
                    if (data.type === 'file_list_response') {
                        console.log('收到文件列表响应:', data);

                        // 验证请求ID是否匹配
                        if (data.data.requestId && data.data.requestId !== currentRequestRef.current) {
                            console.log('请求ID不匹配，忽略响应:', data.data.requestId, '当前ID:', currentRequestRef.current);
                            return;
                        }

                        setLoading(false);
                        setIsWaitingForLs(false);

                        if (data.data.error) {
                            message.error(`获取文件列表失败: ${data.data.error}`);
                            return;
                        }

                        // 解析文件列表
                        if (data.data.files && Array.isArray(data.data.files)) {
                            setFiles(data.data.files);
                            console.log('文件列表更新完成，共', data.data.files.length, '个文件');
                        }

                        // 清除当前请求ID
                        currentRequestRef.current = null;
                        return;
                    }

                    // 处理处理中响应
                    if (data.type === 'file_list_processing') {
                        console.log('文件列表正在处理中...');
                        return;
                    }

                    // 处理其他类型的消息
                    if (data.type === 'terminal_output' || data.type === 'output') {
                        messageData = String(data.content || data.data || '');
                    } else {
                        return; // 忽略其他类型的JSON消息
                    }
                } catch (jsonError) {
                    // 如果不是JSON，直接使用原始数据
                    messageData = String(event.data || '');
                }

                // 确保messageData是字符串且不为空
                if (typeof messageData !== 'string' || !messageData.trim()) {
                    return;
                }

                // 打印接收到的消息前缀，帮助调试
                const prefix = messageData.substring(0, Math.min(50, messageData.length));
                console.log('接收到WebSocket消息前缀:', prefix);

                // 移除连接ID前缀 (conn-X-session-XXX-XXXXXXXXXX)
                messageData = messageData.replace(/^conn-\d+-session-\d+-\d+\s+/, '');

                // 移除各种提示符格式
                messageData = messageData
                    .replace(/\[01;32m[\w@\-_]+\[00m:\[01;34m~\[00m\$\s*/, '')
                    .replace(/[\w@\-_]+:[~\w\/]*[$#]\s*/, '');

                // 检查是否是ls命令的输出 - 更宽松的条件
                const containsLsIndicators =
                    messageData.includes('total ') ||
                    messageData.includes('drwxr-xr-x') ||
                    messageData.includes('-rwxr-xr-x') ||
                    messageData.includes('lrwxrwxrwx') ||
                    /[dl\-][rwx\-]{9}\s+\d+/.test(messageData);

                // 如果是ls命令输出或者我们正在等待ls输出
                if (isWaitingForLs || containsLsIndicators) {
                    console.log('识别为ls输出，添加到缓冲区');

                    // 累积输出到缓冲区
                    setOutputBuffer(prev => {
                        const newBuffer = prev + messageData;
                        console.log('缓冲区更新，当前长度:', newBuffer.length);
                        return newBuffer;
                    });

                    // 清除之前的超时
                    if (bufferTimeoutRef.current) {
                        clearTimeout(bufferTimeoutRef.current);
                    }

                    // 设置新的超时，等待完整输出
                    bufferTimeoutRef.current = setTimeout(() => {
                        console.log('缓冲区超时，开始处理accumulated data');
                        setOutputBuffer(currentBuffer => {
                            if (currentBuffer && currentBuffer.trim()) {
                                try {
                                    console.log('处理缓冲区数据，长度:', currentBuffer.length);
                                    // 处理完整的ls输出
                                    handleLsResult(currentBuffer);
                                } catch (error) {
                                    console.error('处理ls命令结果时出错:', error);
                                    message.error('解析文件列表失败');
                                    setLoading(false);
                                }
                            }
                            setIsWaitingForLs(false);
                            return ''; // 清空缓冲区
                        });
                    }, 2000); // 增加到2000ms等待更多数据
                }

                // 检查是否收到了命令错误
                if (messageData.includes('command not found') ||
                    messageData.includes('No such file or directory')) {
                    console.error('命令执行错误:', messageData);
                    setLoading(false);
                    message.error('执行命令失败，请重试');
                    setIsWaitingForLs(false);
                }
            } catch (error) {
                console.error('处理WebSocket消息时出错:', error);
                setLoading(false);
            }
        };

        const ws = webSocketRef.current;
        ws.addEventListener('message', handleMessage);

        return () => {
            if (ws && ws.readyState !== WebSocket.CLOSED) {
                ws.removeEventListener('message', handleMessage);
            }
            if (bufferTimeoutRef.current) {
                clearTimeout(bufferTimeoutRef.current);
            }
        };
    }, [webSocketRef, visible, handleLsResult, isWaitingForLs, currentDirectory]);

    // 清理effect，在组件卸载时清除缓冲区超时
    useEffect(() => {
        return () => {
            if (bufferTimeoutRef.current) {
                clearTimeout(bufferTimeoutRef.current);
            }
        };
    }, []);

    // 改进的文件操作错误处理
    const executeFileOperation = useCallback((command: string, successMessage: string, errorMessage: string) => {
        executeSSHCommand(command);

        // 模拟操作结果检查
        setTimeout(() => {
            // 这里应该根据实际的命令执行结果来判断成功或失败
            // 暂时使用模拟的成功处理
            message.success(successMessage);
            refreshDirectory();
        }, 1000);
    }, [executeSSHCommand, refreshDirectory]);

    // 手动解析当前终端输出（调试用）
    const manualParseTerminalOutput = useCallback(() => {
        console.log('手动触发解析终端输出');

        // 模拟从终端获取当前显示的内容
        const terminalElement = document.querySelector('.simple-terminal-output');
        if (terminalElement) {
            const terminalText = terminalElement.textContent || '';
            console.log('获取到终端文本:', terminalText.substring(0, 500));

            if (terminalText.includes('drwxr-xr-x') || terminalText.includes('-rwxr-xr-x')) {
                console.log('在终端文本中发现ls输出，开始解析');
                handleLsResult(terminalText);
            } else {
                message.info('终端中未找到ls命令输出');
            }
        } else {
            // 如果找不到终端元素，强制触发一次ls命令
            console.log('未找到终端元素，重新执行ls命令');
            refreshDirectory();
        }
    }, [handleLsResult, refreshDirectory]);

    if (!visible) return null;

    return (
        <div className="file-browser">
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
                style={{ height: '100%', position: 'relative' }}
                styles={{ body: { padding: 0, height: 'calc(100% - 57px)' } }}
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
                            onClick={refreshDirectory}
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
                                            selectedFiles.forEach(fileName => {
                                                const file = files.find(f => f.name === fileName);
                                                const command = file?.type === 'directory'
                                                    ? `rm -rf "${currentDirectory}/${fileName}"`
                                                    : `rm "${currentDirectory}/${fileName}"`;
                                                executeFileOperation(
                                                    command,
                                                    `删除${file?.type === 'directory' ? '目录' : '文件'}: ${fileName}`,
                                                    `删除失败: ${fileName}`
                                                );
                                            });
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
                    <div className="file-browser-breadcrumb">
                        <Breadcrumb items={getBreadcrumbItems()} />
                    </div>

                    {/* 搜索框 */}
                    <div className="search-box">
                        <Input.Search
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
                            <Table
                                columns={columns}
                                dataSource={filteredFiles}
                                rowKey="name"
                                pagination={false}
                                size="small"
                                scroll={{ y: 'calc(100vh - 400px)' }}
                                rowSelection={{
                                    selectedRowKeys: selectedFiles,
                                    onChange: (keys) => setSelectedFiles(keys as string[]),
                                    getCheckboxProps: (record) => ({
                                        name: record.name,
                                    }),
                                }}
                            />
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default FileBrowser;
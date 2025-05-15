import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, message, Space, Spin, Tooltip, Select, Typography } from 'antd';
import {
    FullscreenOutlined,
    FullscreenExitOutlined,
    ReloadOutlined,
    WindowsOutlined,
    ControlOutlined,
    CopyOutlined,
    ScissorOutlined,
    DesktopOutlined,
    LinkOutlined
} from '@ant-design/icons';
import styles from './styles.module.css';

// 导入基础图形终端功能
import GraphicalTerminal from '../GraphicalTerminal';

// 导入RDP连接辅助函数
import {
    sendRdpKeyCombo,
    sendRdpResize,
    sendRdpClipboard,
    sendRdpRefresh,
    sendRdpPing
} from '../../pages/Terminal/utils/rdpConnector';

const { Option } = Select;
const { Text } = Typography;

// 预定义的RDP分辨率
const RDP_RESOLUTIONS = [
    { label: '800x600', width: 800, height: 600 },
    { label: '1024x768', width: 1024, height: 768 },
    { label: '1280x720', width: 1280, height: 720 },
    { label: '1366x768', width: 1366, height: 768 },
    { label: '1440x900', width: 1440, height: 900 },
    { label: '1600x900', width: 1600, height: 900 },
    { label: '1920x1080', width: 1920, height: 1080 },
    { label: '自适应', width: 0, height: 0 }, // 特殊值，表示自适应
];

// 简化版RDP终端组件，只负责显示和控制，不处理连接逻辑
export interface RdpTerminalProps {
    webSocketRef: React.RefObject<WebSocket | null>;
    onResize?: (width: number, height: number) => void;
    onInput?: (data: string) => void;
}

// 在文件顶部添加全局类型定义
declare global {
    interface Window {
        _rdpDebugInfo?: {
            hasWebSocket: boolean;
            webSocketState: number | string;
            hasDisplayRef: boolean;
            containerRefExists: boolean;
        };
        checkRdpDom?: () => any;
        debugRdpComponent?: () => any;
        forceUpdateRdpImage?: (base64Data?: string) => boolean;
    }
}

const RdpTerminal: React.FC<RdpTerminalProps> = ({
    webSocketRef,
    onResize,
    onInput
}) => {
    console.log('【RDP终端】组件初始渲染', {
        webSocketRefExists: !!webSocketRef,
        webSocketConnected: webSocketRef?.current ? webSocketRef.current.readyState === WebSocket.OPEN : false
    });

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [showSpecialKeys, setShowSpecialKeys] = useState(false);
    const [resolution, setResolution] = useState('1280x720');
    const [isConnecting, setIsConnecting] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const displayRef = useRef<HTMLDivElement>(null);

    // 发送特殊键组合到RDP会话
    const sendSpecialKey = useCallback((key: string) => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立，无法发送按键');
            return;
        }

        const command = JSON.stringify({
            type: 'key',
            key: key
        });

        webSocketRef.current.send(command);
        message.success(`已发送特殊键: ${key}`);
    }, [webSocketRef]);

    // 请求服务端刷新屏幕
    const requestRefresh = useCallback(() => {
        if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
            message.error('WebSocket连接未建立，无法请求刷新');
            return;
        }

        console.log('发送屏幕刷新请求到服务器...');

        // 尝试发送不同格式的刷新请求，确保后端能够正确处理
        try {
            // 发送纯文本刷新命令
            webSocketRef.current.send('refresh');

            // 发送JSON格式刷新命令
            webSocketRef.current.send(JSON.stringify({
                type: 'refresh',
                timestamp: Date.now()
            }));

            // 发送标准协议格式
            webSocketRef.current.send('RDP_COMMAND:refresh');

            message.success('已请求刷新屏幕');
        } catch (error) {
            console.error('发送刷新请求失败:', error);
            message.error('发送刷新请求失败');
        }
    }, [webSocketRef]);

    // 切换全屏显示
    const toggleFullscreen = useCallback(() => {
        setIsFullscreen(!isFullscreen);

        // 如果有容器引用，调整大小
        if (containerRef.current) {
            const newWidth = isFullscreen ? 1280 : window.innerWidth;
            const newHeight = isFullscreen ? 720 : window.innerHeight;

            if (onResize) {
                onResize(newWidth, newHeight);
            }
        }
    }, [isFullscreen, onResize]);

    // 处理分辨率变更
    const handleResolutionChange = useCallback((value: string) => {
        setResolution(value);

        // 解析宽度和高度
        const [width, height] = value.split('x').map(Number);

        if (onResize && width && height) {
            onResize(width, height);
        }
    }, [onResize]);

    // 处理控制面板的鼠标进入/离开
    const handleMouseEnter = useCallback(() => {
        setShowControls(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (!showSpecialKeys) {
            setShowControls(false);
        }
    }, [showSpecialKeys]);

    // 辅助函数：将base64编码的图像数据直接写入DOM调试元素
    const debugBase64Image = (base64Data: string, width: number, height: number) => {
        // 创建或获取调试元素
        let debugDiv = document.getElementById('rdp-debug-panel');
        if (!debugDiv) {
            debugDiv = document.createElement('div');
            debugDiv.id = 'rdp-debug-panel';
            debugDiv.style.position = 'fixed';
            debugDiv.style.top = '10px';
            debugDiv.style.right = '10px';
            debugDiv.style.padding = '10px';
            debugDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
            debugDiv.style.border = '1px solid white';
            debugDiv.style.color = 'white';
            debugDiv.style.zIndex = '9999';
            debugDiv.style.fontSize = '12px';
            debugDiv.style.maxWidth = '80%';
            debugDiv.style.maxHeight = '80%';
            debugDiv.style.overflow = 'auto';
            document.body.appendChild(debugDiv);
        }

        // 添加当前时间
        const timestamp = document.createElement('div');
        timestamp.textContent = `接收图像数据时间: ${new Date().toISOString()}`;
        timestamp.style.marginBottom = '5px';
        debugDiv.appendChild(timestamp);

        // 添加图像信息
        const info = document.createElement('div');
        info.textContent = `图像尺寸: ${width}x${height}, Base64长度: ${base64Data.length}`;
        info.style.marginBottom = '5px';
        debugDiv.appendChild(info);

        // 添加调试图像 (最多100KB数据，避免崩溃)
        if (base64Data.length > 0) {
            try {
                const truncatedBase64 = base64Data.length > 100000 ? base64Data.substring(0, 100000) : base64Data;
                const imgElement = document.createElement('img');
                imgElement.src = `data:image/png;base64,${truncatedBase64}`;
                imgElement.style.maxWidth = '300px';
                imgElement.style.maxHeight = '200px';
                imgElement.style.border = '1px solid gray';
                imgElement.style.marginBottom = '5px';
                debugDiv.appendChild(imgElement);

                // 自动限制调试面板中的元素数量
                while (debugDiv.childElementCount > 10) {
                    const firstChild = debugDiv.firstChild;
                    if (firstChild) {
                        debugDiv.removeChild(firstChild);
                    } else {
                        break;
                    }
                }

                return true;
            } catch (error) {
                console.error('创建调试图像失败:', error);
                return false;
            }
        }
        return false;
    };

    // 添加创建WebSocket连接的功能
    const createManualWebSocketConnection = useCallback(() => {
        // 检查WebSocket引用是否存在
        if (!webSocketRef) {
            console.error('无法手动创建WebSocket: 引用不存在');
            message.error('无法创建WebSocket连接，请刷新页面重试');
            return;
        }

        // 如果已有WebSocket连接且状态正常，不需要创建新的
        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
            console.log('WebSocket连接已存在且已打开，不需要重新创建');
            message.info('WebSocket连接已建立');
            setIsConnected(true);
            setIsConnecting(false);
            return;
        }

        // 尝试获取连接ID和会话ID
        const urlParams = new URLSearchParams(window.location.search);
        const connectionId = urlParams.get('connectionId') || localStorage.getItem('current_connection_id');
        const sessionId = urlParams.get('session') || localStorage.getItem('current_session_id');

        if (!connectionId) {
            console.error('无法手动创建WebSocket: 缺少连接ID');
            message.error('缺少连接ID，无法创建WebSocket连接');
            return;
        }

        // 创建WebSocket连接URL
        let wsUrl = '';

        // 根据当前协议确定WebSocket协议
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;

        // 构建WebSocket URL
        if (sessionId) {
            wsUrl = `${protocol}//${host}/api/ws/${connectionId}?session=${sessionId}`;
        } else {
            wsUrl = `${protocol}//${host}/api/ws/${connectionId}`;
        }

        console.log(`尝试手动创建WebSocket连接: ${wsUrl}`);

        try {
            // 创建新的WebSocket连接
            const newWs = new WebSocket(wsUrl);

            // 保存到webSocketRef
            if (webSocketRef) {
                webSocketRef.current = newWs;
            }

            // 显示正在连接消息
            message.loading('正在建立WebSocket连接...');
            setIsConnecting(true);

            // 创建WebSocket后，主动刷新页面以确保所有组件能正确识别新的WebSocket
            setTimeout(() => {
                if (newWs.readyState === WebSocket.CONNECTING) {
                    console.log('WebSocket仍在连接中...');
                }
            }, 2000);

            // 5秒后如果仍然在连接中，提示用户刷新页面
            setTimeout(() => {
                if (newWs.readyState === WebSocket.CONNECTING) {
                    message.info('连接较慢，您可以刷新页面重试');
                }
            }, 5000);

            return newWs;
        } catch (error) {
            console.error('创建WebSocket连接失败:', error);
            message.error('创建WebSocket连接失败，请检查网络连接');
            return null;
        }
    }, [webSocketRef, setIsConnected, setIsConnecting]);

    // 修改RDP终端初始化逻辑
    /**
     * 改进WebSocket初始化和连接检查
     */
    useEffect(() => {
        // 添加更多调试日志
        console.log('【RDP终端】useEffect[webSocketRef]启动，状态:', {
            webSocketExists: !!webSocketRef?.current,
            webSocketState: webSocketRef?.current ? getWebSocketStateText(webSocketRef.current.readyState) : '不存在',
            displayRefExists: !!displayRef?.current,
        });

        // 创建调试元素
        const wsDebugElement = document.createElement('div');
        wsDebugElement.style.position = 'fixed';
        wsDebugElement.style.bottom = '0';
        wsDebugElement.style.left = '0';
        wsDebugElement.style.padding = '5px 10px';
        wsDebugElement.style.backgroundColor = 'rgba(0,0,0,0.5)';
        wsDebugElement.style.color = 'white';
        wsDebugElement.style.fontSize = '12px';
        wsDebugElement.style.zIndex = '9999';
        document.body.appendChild(wsDebugElement);

        const showWSStatus = () => {
            if (wsDebugElement) {
                if (!webSocketRef?.current) {
                    wsDebugElement.textContent = '⚠️ WebSocket引用不存在';
                    wsDebugElement.style.backgroundColor = 'rgba(255,0,0,0.7)';
                } else {
                    wsDebugElement.textContent = `WebSocket状态: ${getWebSocketStateText(webSocketRef.current.readyState)}`;
                    wsDebugElement.style.backgroundColor = webSocketRef.current.readyState === WebSocket.OPEN
                        ? 'rgba(0,128,0,0.7)'
                        : 'rgba(255,165,0,0.7)';
                }
            }
        };

        // 立即显示状态
        showWSStatus();

        // 如果webSocketRef不为null但是未连接，尝试主动创建WebSocket连接
        if (webSocketRef?.current === null) {
            console.error('WebSocket引用为null，这可能是TerminalConnectionWrapper没有正确初始化WebSocket');
            setError('无法初始化RDP终端: WebSocket引用不可用');
            setIsConnecting(false);
            wsDebugElement.textContent = '⚠️ WebSocket引用为null';
            wsDebugElement.style.backgroundColor = 'rgba(255,0,0,0.7)';

            // 尝试创建新的WebSocket
            try {
                console.log('尝试主动创建WebSocket连接...');
                // 通过window事件请求父组件创建WebSocket连接
                window.dispatchEvent(new CustomEvent('terminal-request-websocket', {
                    detail: { tabKey: window.location.pathname.split('/').pop() || 'unknown' }
                }));
            } catch (e) {
                console.error('请求创建WebSocket失败:', e);
            }
        } else if (webSocketRef?.current) {
            console.log(`WebSocket引用存在，状态: ${getWebSocketStateText(webSocketRef.current.readyState)}`);
            wsDebugElement.textContent = `WebSocket存在，状态: ${getWebSocketStateText(webSocketRef.current.readyState)}`;

            // WebSocket已经存在，检查它的状态
            if (webSocketRef.current.readyState === WebSocket.OPEN) {
                // 已经连接，设置事件处理器
                setupWebSocketHandlers(webSocketRef.current);
                // 立即发送初始命令
                sendInitialCommands();
            } else if (webSocketRef.current.readyState === WebSocket.CONNECTING) {
                // 正在连接，等待它打开
                webSocketRef.current.addEventListener('open', () => {
                    setupWebSocketHandlers(webSocketRef.current!);
                    sendInitialCommands();
                });
            } else {
                // WebSocket已关闭或正在关闭，这是一个问题
                console.error(`WebSocket引用存在但状态异常: ${getWebSocketStateText(webSocketRef.current.readyState)}`);
                wsDebugElement.textContent = `⚠️ WebSocket状态异常: ${getWebSocketStateText(webSocketRef.current.readyState)}`;
                wsDebugElement.style.backgroundColor = 'rgba(255,0,0,0.7)';

                // 可以在这里触发重连逻辑
            }
        } else {
            // webSocketRef或webSocketRef.current不存在
            console.log('WebSocket引用存在但未初始化，开始轮询检查');
            wsDebugElement.textContent = '⚠️ WebSocket引用存在但未初始化';
            wsDebugElement.style.backgroundColor = 'rgba(255,165,0,0.7)';

            // 设置一个轮询来检查WebSocket是否变为可用
            const checkInterval = setInterval(() => {
                if (webSocketRef?.current) {
                    clearInterval(checkInterval);
                    console.log(`WebSocket现在可用，状态: ${getWebSocketStateText(webSocketRef.current.readyState)}`);
                    wsDebugElement.textContent = `WebSocket现在可用，状态: ${getWebSocketStateText(webSocketRef.current.readyState)}`;

                    // 设置WebSocket事件处理
                    setupWebSocketHandlers(webSocketRef.current);

                    // 如果WebSocket已打开，立即发送初始命令
                    if (webSocketRef.current.readyState === WebSocket.OPEN) {
                        sendInitialCommands();
                    }
                } else {
                    // 更新状态
                    showWSStatus();

                    // 尝试从全局状态获取WebSocket
                    if (terminalStateRef.current?.tabs) {
                        const activeTabKey = terminalStateRef.current.activeTabKey;
                        const activeTab = terminalStateRef.current.tabs.find(tab => tab.key === activeTabKey);
                        if (activeTab?.webSocketRef?.current) {
                            console.log('已从全局状态找到WebSocket连接!');
                            // 使用找到的WebSocket
                            if (webSocketRef) {
                                webSocketRef.current = activeTab.webSocketRef.current;
                                // 设置事件处理器和发送初始命令
                                setupWebSocketHandlers(webSocketRef.current);
                                if (webSocketRef.current.readyState === WebSocket.OPEN) {
                                    sendInitialCommands();
                                }
                                clearInterval(checkInterval);
                            }
                        }
                    }
                }
            }, 1000);

            // 设置超时，防止无限等待
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!webSocketRef?.current) {
                    console.error('等待WebSocket初始化超时');
                    setError('等待WebSocket初始化超时，请刷新页面重试');
                    setIsConnecting(false);
                    wsDebugElement.textContent = '⚠️ WebSocket初始化超时';
                    wsDebugElement.style.backgroundColor = 'rgba(255,0,0,0.7)';

                    // 尝试主动连接WebSocket
                    if (createManualWebSocketConnection) {
                        try {
                            console.log('尝试通过createManualWebSocketConnection手动创建WebSocket...');
                            createManualWebSocketConnection();
                        } catch (e) {
                            console.error('手动创建WebSocket失败:', e);
                        }
                    }
                }
            }, 15000);

            return () => {
                clearInterval(checkInterval);
            };
        }

        // 定期更新状态显示
        const statusInterval = setInterval(showWSStatus, 5000);

        // 设置WebSocket事件处理函数
        function setupWebSocketHandlers(ws: WebSocket) {
            // 在WebSocket上添加事件监听器之前，先移除可能存在的旧监听器
            try {
                ws.removeEventListener('open', handleOpenWs);
                ws.removeEventListener('close', handleCloseWs);
                ws.removeEventListener('error', handleErrorWs);
                ws.removeEventListener('message', handleMessageWs);
            } catch (e) {
                console.warn('移除WebSocket监听器失败，可能不存在:', e);
            }

            // 添加事件监听器
            ws.addEventListener('open', handleOpenWs);
            ws.addEventListener('close', handleCloseWs);
            ws.addEventListener('error', handleErrorWs);
            ws.addEventListener('message', handleMessageWs);

            // 如果WebSocket已经打开，手动触发open处理
            if (ws.readyState === WebSocket.OPEN) {
                handleOpenWs();
            }
        }

        // 发送初始命令函数
        function sendInitialCommands() {
            if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
                console.error('无法发送初始命令: WebSocket未连接');
                return;
            }

            // 发送RDP初始化命令
            try {
                console.log('发送RDP初始化命令');

                // 发送ping命令保持连接活跃
                webSocketRef.current.send(JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                }));

                // 发送刷新命令请求初始屏幕
                webSocketRef.current.send(JSON.stringify({
                    type: 'refresh',
                    timestamp: Date.now()
                }));

                // 兼容不同格式
                webSocketRef.current.send('RDP_COMMAND:refresh');
                webSocketRef.current.send('refresh');
            } catch (e) {
                console.error('发送初始化命令失败:', e);
            }
        }

        return () => {
            // 清理定时器和事件监听器
            clearInterval(statusInterval);

            // 清理可能的轮询检查器
            if (wsDebugElement) {
                wsDebugElement.remove();
            }

            try {
                if (webSocketRef.current) {
                    webSocketRef.current.removeEventListener('open', handleOpenWs);
                    webSocketRef.current.removeEventListener('close', handleCloseWs);
                    webSocketRef.current.removeEventListener('error', handleErrorWs);
                    webSocketRef.current.removeEventListener('message', handleMessageWs);
                }
            } catch (e) {
                console.warn('清理WebSocket事件时出错:', e);
            }
        };
    }, [webSocketRef]);

    // 添加下面这个effect来尝试修复WebSocket引用为null的情况
    useEffect(() => {
        if (!webSocketRef?.current && displayRef.current) {
            // 在DOM中显示错误提示
            const errorMessage = document.createElement('div');
            errorMessage.style.position = 'absolute';
            errorMessage.style.top = '50%';
            errorMessage.style.left = '50%';
            errorMessage.style.transform = 'translate(-50%, -50%)';
            errorMessage.style.color = 'white';
            errorMessage.style.fontSize = '16px';
            errorMessage.style.textAlign = 'center';
            errorMessage.style.backgroundColor = 'rgba(0,0,0,0.7)';
            errorMessage.style.padding = '20px';
            errorMessage.style.borderRadius = '5px';
            errorMessage.style.maxWidth = '80%';

            errorMessage.innerHTML = `
                <div style="margin-bottom:15px;font-weight:bold;color:#ff4d4f;">WebSocket连接未初始化</div>
                <div style="margin-bottom:10px;">可能原因:</div>
                <div style="text-align:left;margin-bottom:15px;">
                    1. 后端服务未启动或不可用<br>
                    2. WebSocket连接配置错误<br>
                    3. 网络连接问题<br>
                    4. 浏览器安全策略阻止了WebSocket
                </div>
                <div>
                    <button id="rdp-retry-button" style="background:#1677ff;color:white;border:none;padding:5px 15px;border-radius:3px;cursor:pointer;margin-right:10px;">重试连接</button>
                    <button id="rdp-manual-button" style="background:#52c41a;color:white;border:none;padding:5px 15px;border-radius:3px;cursor:pointer;margin-right:10px;">手动连接</button>
                    <button id="rdp-close-button" style="background:#ff4d4f;color:white;border:none;padding:5px 15px;border-radius:3px;cursor:pointer;">关闭连接</button>
                </div>
            `;

            displayRef.current.appendChild(errorMessage);

            // 添加按钮事件
            const retryButton = document.getElementById('rdp-retry-button');
            const manualButton = document.getElementById('rdp-manual-button');
            const closeButton = document.getElementById('rdp-close-button');

            if (retryButton) {
                retryButton.addEventListener('click', () => {
                    window.location.reload();
                });
            }

            if (manualButton) {
                manualButton.addEventListener('click', () => {
                    // 调用手动创建WebSocket的函数
                    const newWs = createManualWebSocketConnection();
                    if (newWs) {
                        // 移除错误消息
                        errorMessage.remove();
                        message.success('已尝试手动创建WebSocket连接');
                    }
                });
            }

            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    window.history.back();
                });
            }

            // 更新状态
            setError('WebSocket连接未初始化');
            setIsConnecting(false);
        }
    }, [webSocketRef, displayRef, createManualWebSocketConnection]);

    // 监听WebSocket连接状态
    useEffect(() => {
        if (!webSocketRef.current) {
            setIsConnecting(true);
            setIsConnected(false);
            setError('WebSocket连接尚未初始化');
            return;
        }

        // 添加一个定时器，定期检查和报告WebSocket状态
        const wsStatusChecker = setInterval(() => {
            if (webSocketRef.current) {
                const statusTexts: Record<number, string> = {
                    [WebSocket.CONNECTING]: "正在连接",
                    [WebSocket.OPEN]: "已连接",
                    [WebSocket.CLOSING]: "正在关闭",
                    [WebSocket.CLOSED]: "已关闭"
                };
                const status = statusTexts[webSocketRef.current.readyState] || "未知状态";
                console.log(`WebSocket当前状态: ${status} (${webSocketRef.current.readyState})`);
            } else {
                console.log('WebSocket引用不存在');
            }
        }, 5000); // 每5秒检查一次

        const handleOpen = () => {
            console.log('WebSocket连接已打开');
            setIsConnected(true);
            setIsConnecting(false);
            setError(null);

            // 发送初始分辨率
            const [width, height] = resolution.split('x').map(Number);
            if (onResize && width && height) {
                onResize(width, height);
            }
        };

        const handleClose = () => {
            setIsConnected(false);
            setIsConnecting(false);
            setError('WebSocket连接已关闭');
        };

        const handleError = (event: Event) => {
            setIsConnected(false);
            setIsConnecting(false);
            setError('WebSocket连接出错');
            console.error('RdpTerminal WebSocket error:', event);
        };

        const handleMessage = (event: MessageEvent) => {
            // 这里应该处理从服务器接收的帧数据
            try {
                console.log('--------------------------------');
                console.log('RDP终端收到WebSocket消息类型:', typeof event.data);
                if (typeof event.data === 'string') {
                    // 添加更详细的消息记录
                    const dataLen = event.data.length;
                    console.log(`RDP终端收到字符串消息 [长度: ${dataLen}]`);
                    console.log('消息前缀:', event.data.substring(0, 50));
                    console.log('消息格式识别结果:',
                        event.data.startsWith('RDP_SCREENSHOT:') ? 'RDP_SCREENSHOT' :
                            event.data.startsWith('RDP_ERROR:') ? 'RDP_ERROR' :
                                event.data.startsWith('RDP_NOTICE:') ? 'RDP_NOTICE' :
                                    event.data.startsWith('RDP_INFO:') ? 'RDP_INFO' :
                                        event.data.startsWith('RDP_CONNECTED') ? 'RDP_CONNECTED' :
                                            event.data.startsWith('RDP_KEEP_ALIVE') ? 'RDP_KEEP_ALIVE' :
                                                event.data.startsWith('{') ? 'JSON' : 'UNKNOWN'
                    );

                    // 检查消息是否是协议格式
                    if (event.data.startsWith('RDP_SCREENSHOT:')) {
                        // RDP屏幕截图消息
                        console.log('=== RDP终端识别到屏幕截图消息 ===');
                        const parts = event.data.split(':');
                        console.log('分割后的部分数量:', parts.length);

                        // 在全局对象上存储最后一条消息，便于调试
                        (window as any).lastRdpScreenshot = event.data;

                        if (parts.length >= 4) {
                            const width = parseInt(parts[1]);
                            const height = parseInt(parts[2]);
                            const base64Image = parts.slice(3).join(':'); // 重新组合可能包含冒号的base64数据

                            // 全局保存数据，便于控制台调试
                            (window as any).lastBase64Image = base64Image;
                            (window as any).lastImageWidth = width;
                            (window as any).lastImageHeight = height;
                            // 提供手动调试函数
                            (window as any).debugLastImage = () => debugBase64Image(base64Image, width, height);
                            (window as any).manualRenderImage = () => {
                                if (displayRef.current) {
                                    console.log('手动渲染图像');
                                    displayRef.current.style.backgroundImage = `url(data:image/png;base64,${base64Image})`;
                                    return true;
                                }
                                return false;
                            };

                            console.log(`RDP终端收到屏幕截图详情:
                                宽度=${width}
                                高度=${height}
                                数据长度=${base64Image.length}
                                数据有效=${base64Image.length > 100 ? '是' : '否'}
                                数据前10字符="${base64Image.substring(0, 10)}..."
                                数据最后10字符="...${base64Image.substring(base64Image.length - 10)}"
                            `);

                            // 添加到调试面板
                            debugBase64Image(base64Image, width, height);

                            // 检查是否有正常的base64数据
                            if (base64Image && base64Image.length > 0) {
                                // 显示图像 - 修改这部分以确保正确渲染
                                console.log('尝试在RDP终端显示图像数据');
                                if (displayRef.current) {
                                    console.log('RDP终端displayRef存在，设置背景图像');

                                    // 检查base64数据是否有效
                                    try {
                                        // 创建测试图像前输出一些信息
                                        console.log('创建测试图像验证base64数据');

                                        // 创建一个测试图像来验证base64数据
                                        const testImg = new Image();
                                        testImg.onload = () => {
                                            console.log('Base64图像数据加载成功! 尺寸:', testImg.width, 'x', testImg.height);
                                            console.log('设置为背景图像');

                                            // 使用内联图像直接设置背景
                                            if (!displayRef.current) {
                                                console.error('RDP终端displayRef不存在，无法设置背景图像');
                                                return;
                                            }

                                            displayRef.current.style.backgroundImage = `url(data:image/png;base64,${base64Image})`;
                                            console.log('RDP终端背景图像已设置, DOM状态:', {
                                                displayRef: !!displayRef.current,
                                                displayRefId: displayRef.current?.id,
                                                displayRefVisible: displayRef.current ? window.getComputedStyle(displayRef.current).display !== 'none' : false,
                                                displayRefParent: displayRef.current?.parentElement ? {
                                                    id: displayRef.current.parentElement.id,
                                                    className: displayRef.current.parentElement.className,
                                                    style: displayRef.current.parentElement.getAttribute('style')
                                                } : null,
                                                containerRefVisible: containerRef.current ? window.getComputedStyle(containerRef.current).display !== 'none' : false
                                            });

                                            // 确保背景属性正确设置
                                            displayRef.current.style.backgroundSize = 'contain';
                                            displayRef.current.style.backgroundPosition = 'center';
                                            displayRef.current.style.backgroundRepeat = 'no-repeat';
                                            displayRef.current.style.backgroundColor = '#000';

                                            // 更新连接状态
                                            console.log('RDP终端背景图像已设置，更新连接状态');
                                            setIsConnected(true);
                                            setIsConnecting(false);
                                            setError(null);
                                        };

                                        testImg.onerror = (error) => {
                                            console.error('Base64图像数据无效，显示错误图像', error);
                                            // 记录更多信息以诊断问题
                                            console.error('无效的base64数据特征:', {
                                                长度: base64Image.length,
                                                前缀: base64Image.substring(0, 20),
                                                包含非base64字符: /[^A-Za-z0-9+/=]/.test(base64Image)
                                            });

                                            // 显示错误图像
                                            displayErrorImage(width, height, "无效的RDP图像数据");
                                        };

                                        // 测试base64数据
                                        console.log('设置测试图像src...');
                                        testImg.src = `data:image/png;base64,${base64Image}`;
                                        console.log('测试图像src已设置');
                                    } catch (imgErr) {
                                        console.error('处理图像数据时出错:', imgErr);
                                        displayErrorImage(width, height, "RDP图像处理错误");
                                    }

                                    // 输出元素状态用于调试
                                    console.log('RDP终端显示元素状态:', {
                                        width: displayRef.current.offsetWidth,
                                        height: displayRef.current.offsetHeight,
                                        backgroundSize: displayRef.current.style.backgroundSize,
                                        backgroundRepeat: displayRef.current.style.backgroundRepeat,
                                        backgroundPosition: displayRef.current.style.backgroundPosition,
                                        visibility: displayRef.current.style.visibility,
                                        display: displayRef.current.style.display
                                    });
                                } else {
                                    console.error('RDP终端displayRef不存在，无法设置背景图像');
                                }
                            } else {
                                console.error('RDP屏幕截图数据为空或无效');
                                // 显示空数据提示
                                displayErrorImage(width, height, "RDP屏幕数据为空或无效");
                            }
                        } else {
                            console.error('RDP_SCREENSHOT消息格式错误，分段数不足:', parts.length);
                        }
                        return;
                    }

                    try {
                        const data = JSON.parse(event.data);

                        // 根据消息类型处理
                        if (data.type === 'frame' || data.type === 'screenshot') {
                            // 渲染帧
                            if (displayRef.current && data.image) {
                                // 设置base64图像为背景
                                displayRef.current.style.backgroundImage = `url(data:image/png;base64,${data.image})`;
                                setIsConnected(true);
                                setIsConnecting(false);
                            }
                        } else if (data.type === 'error') {
                            setError(data.message || '接收到错误消息');
                        } else if (data.type === 'status') {
                            if (data.connected) {
                                setIsConnected(true);
                                setIsConnecting(false);
                            } else {
                                setIsConnected(false);
                            }
                        }
                    } catch (jsonErr) {
                        // 不是JSON格式，可能是其他文本消息
                        console.log('非JSON格式的RDP消息:', event.data);
                    }
                }
            } catch (err) {
                console.error('解析WebSocket消息失败:', err);
            }
        };

        // 添加事件监听器
        if (webSocketRef.current.readyState === WebSocket.OPEN) {
            handleOpen();
        } else {
            webSocketRef.current.addEventListener('open', handleOpen);
        }
        webSocketRef.current.addEventListener('close', handleClose);
        webSocketRef.current.addEventListener('error', handleError);
        webSocketRef.current.addEventListener('message', handleMessage);

        // 清理函数
        return () => {
            clearInterval(wsStatusChecker); // 清理定时器
            if (webSocketRef.current) {
                webSocketRef.current.removeEventListener('open', handleOpen);
                webSocketRef.current.removeEventListener('close', handleClose);
                webSocketRef.current.removeEventListener('error', handleError);
                webSocketRef.current.removeEventListener('message', handleMessage);
            }
        };
    }, [webSocketRef, resolution, onResize]);

    // 辅助函数：显示错误图像
    const displayErrorImage = (width: number, height: number, errorMessage: string) => {
        if (!displayRef.current) return;

        // 创建一个显示错误信息的简单SVG
        const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="100%" height="100%" fill="#0057a8"/>
            <text x="50%" y="45%" text-anchor="middle" fill="white" font-family="Arial" font-size="24">
                ${errorMessage}
            </text>
            <text x="50%" y="55%" text-anchor="middle" fill="white" font-family="Arial" font-size="20">
                分辨率: ${width} x ${height}
            </text>
            <text x="50%" y="65%" text-anchor="middle" fill="white" font-family="Arial" font-size="16">
                点击"刷新"按钮重试
            </text>
        </svg>
        `;

        // 创建Blob并生成URL
        try {
            const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
            const svgUrl = URL.createObjectURL(svgBlob);
            console.log('生成错误图像URL:', svgUrl);

            // 设置为背景图像
            displayRef.current.style.backgroundImage = `url(${svgUrl})`;
            console.log('已设置错误图像为背景');

            // 更新状态
            setIsConnecting(false);
            setError(errorMessage);
        } catch (error) {
            console.error('创建错误图像失败:', error);
        }
    };

    // 如果没有设置WebSocket引用，显示错误消息
    if (!webSocketRef.current) {
        return (
            <div className={styles.rdpTerminalContainer}>
                <div className={styles.errorMessage}>
                    <Text type="danger">无法初始化RDP终端: WebSocket引用不可用</Text>
                </div>
            </div>
        );
    }

    useEffect(() => {
        console.log('【RDP组件】初始化, displayRef存在:', !!displayRef.current);

        // 添加DOM检查函数到window，方便控制台调试
        (window as any).checkRdpDom = () => {
            const containers = document.querySelectorAll('.rdp-container');
            const displayElements = document.querySelectorAll(`.${styles.displayArea}`);

            console.log(`【RDP DOM检查】
                RDP容器数量: ${containers.length}
                显示区域元素数量: ${displayElements.length}
                显示区域引用存在: ${!!displayRef.current}
                WebSocket引用存在: ${!!webSocketRef.current}
                WebSocket状态: ${webSocketRef.current ?
                    ['连接中', '已连接', '正在关闭', '已关闭'][webSocketRef.current.readyState] :
                    '未初始化'}
            `);

            // 返回容器和显示元素，便于在控制台进一步检查
            return {
                containers: Array.from(containers),
                displayElements: Array.from(displayElements),
                displayRef: displayRef.current,
                webSocketRef: webSocketRef.current
            };
        };

        // 组件卸载时移除全局函数
        return () => {
            delete (window as any).checkRdpDom;
        };
    }, [displayRef, webSocketRef]);

    useEffect(() => {
        if (displayRef.current) {
            console.log('【RDP组件】displayRef正确设置，元素ID:', displayRef.current.id);
            // 为了方便调试，给显示元素添加一个唯一ID
            displayRef.current.id = `rdp-display-${Date.now()}`;
        } else {
            console.error('【RDP组件】displayRef未正确设置！');
        }
    }, []);

    // 添加一个新的interval来检查DOM状态
    useEffect(() => {
        // 创建一个检查DOM结构的函数
        const checkDomStructure = () => {
            if (document.querySelector(`.${styles.rdpTerminalContainer}`) === null) {
                console.error('【RDP严重错误】找不到RDP终端容器DOM元素!');
            } else {
                const containerDom = document.querySelector(`.${styles.rdpTerminalContainer}`);
                const displayDom = document.querySelector(`.${styles.displayArea}`);

                console.log('【RDP DOM检查】', {
                    containerExists: !!containerDom,
                    containerStyle: containerDom ? window.getComputedStyle(containerDom) : null,
                    displayExists: !!displayDom,
                    displayStyle: displayDom ? {
                        display: window.getComputedStyle(displayDom).display,
                        visibility: window.getComputedStyle(displayDom).visibility,
                        backgroundImage: window.getComputedStyle(displayDom).backgroundImage.substring(0, 30) + '...'
                    } : null
                });
            }
        };

        // 立即执行一次
        checkDomStructure();

        // 设置定时器，每5秒检查一次DOM
        const domCheckInterval = setInterval(checkDomStructure, 5000);

        return () => {
            clearInterval(domCheckInterval);
        };
    }, [styles.rdpTerminalContainer, styles.displayArea]);

    useEffect(() => {
        // 添加调试功能到控制台
        console.log('【RDP终端】组件初始化，添加调试功能');

        (window as any).debugRdpComponent = () => {
            console.log('【RDP调试】检查RDP组件DOM状态');

            const displayRefStatus = {
                exists: !!displayRef.current,
                id: displayRef.current?.id,
                className: displayRef.current?.className,
                style: {
                    backgroundImage: displayRef.current?.style.backgroundImage,
                    display: displayRef.current?.style.display,
                    visibility: displayRef.current?.style.visibility,
                    zIndex: displayRef.current?.style.zIndex,
                    position: displayRef.current?.style.position
                },
                dimensions: displayRef.current ? {
                    width: displayRef.current.offsetWidth,
                    height: displayRef.current.offsetHeight,
                    clientWidth: displayRef.current.clientWidth,
                    clientHeight: displayRef.current.clientHeight
                } : null,
                parent: displayRef.current?.parentElement ? {
                    id: displayRef.current.parentElement.id,
                    className: displayRef.current.parentElement.className,
                    childCount: displayRef.current.parentElement.childElementCount
                } : null
            };

            const webSocketStatus = {
                exists: !!webSocketRef?.current,
                readyState: webSocketRef?.current ?
                    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][webSocketRef.current.readyState] : 'NULL',
                url: webSocketRef?.current?.url
            };

            // 检查DOM中的RDP容器
            const rdpContainers = document.querySelectorAll('.rdp-container, [class*="rdpContainer"]');
            const displayAreas = document.querySelectorAll('[class*="displayArea"]');

            const domStatus = {
                rdpContainers: Array.from(rdpContainers).map(container => ({
                    id: (container as HTMLElement).id,
                    className: (container as HTMLElement).className,
                    display: window.getComputedStyle(container).display,
                    zIndex: window.getComputedStyle(container).zIndex,
                    childCount: (container as HTMLElement).childElementCount
                })),
                displayAreas: Array.from(displayAreas).map(area => ({
                    id: (area as HTMLElement).id,
                    className: (area as HTMLElement).className,
                    backgroundImage: window.getComputedStyle(area).backgroundImage,
                    display: window.getComputedStyle(area).display,
                    zIndex: window.getComputedStyle(area).zIndex
                }))
            };

            const result = {
                displayRef: displayRefStatus,
                webSocket: webSocketStatus,
                dom: domStatus,
                timestamp: new Date().toISOString()
            };

            console.log('【RDP调试结果】', result);
            return result;
        };

        // 增加强制更新RDP图像的功能
        (window as any).forceUpdateRdpImage = (base64Data?: string) => {
            if (!displayRef.current) {
                console.error('【RDP图像更新】displayRef不存在，无法更新图像');
                return false;
            }

            try {
                if (base64Data) {
                    // 使用提供的base64数据
                    displayRef.current.style.backgroundImage = `url(data:image/png;base64,${base64Data})`;
                    console.log('【RDP图像更新】已使用提供的base64数据更新图像');
                } else if ((window as any).lastBase64Image) {
                    // 使用最后接收的图像
                    displayRef.current.style.backgroundImage = `url(data:image/png;base64,${(window as any).lastBase64Image})`;
                    console.log('【RDP图像更新】已使用最后接收的图像数据更新背景');
                } else {
                    console.error('【RDP图像更新】没有可用的图像数据');
                    return false;
                }

                // 确保显示设置正确
                displayRef.current.style.backgroundSize = 'contain';
                displayRef.current.style.backgroundPosition = 'center';
                displayRef.current.style.backgroundRepeat = 'no-repeat';
                displayRef.current.style.backgroundColor = '#000';
                displayRef.current.style.width = '100%';
                displayRef.current.style.height = '100%';
                displayRef.current.style.position = 'absolute';
                displayRef.current.style.top = '0';
                displayRef.current.style.left = '0';
                displayRef.current.style.zIndex = '10';

                return true;
            } catch (error) {
                console.error('【RDP图像更新】更新图像失败:', error);
                return false;
            }
        };

        console.log('【RDP调试工具】已添加全局方法 window.debugRdpComponent() 和 window.forceUpdateRdpImage()');

        // 确保RDP样式正确设置
        const style = document.createElement('style');
        style.textContent = `
            .rdp-container {
                position: relative !important;
                width: 100% !important;
                height: 100% !important;
                background-color: #000 !important;
                z-index: 100 !important;
                display: block !important;
            }
            .xterm-container {
                display: none !important;
            }
        `;
        document.head.appendChild(style);

        return () => {
            document.head.removeChild(style);
        };
    }, []);

    // 在displayRef.current初始化后调整样式
    useEffect(() => {
        if (displayRef.current) {
            console.log('【RDP显示区】设置显示区样式');

            // 强制设置样式
            displayRef.current.style.width = '100%';
            displayRef.current.style.height = '100%';
            displayRef.current.style.position = 'absolute';
            displayRef.current.style.top = '0';
            displayRef.current.style.left = '0';
            displayRef.current.style.backgroundColor = '#000';
            displayRef.current.style.zIndex = '10';
            displayRef.current.style.backgroundSize = 'contain';
            displayRef.current.style.backgroundPosition = 'center';
            displayRef.current.style.backgroundRepeat = 'no-repeat';

            // 尝试强制显示
            setTimeout(() => {
                if (displayRef.current) {
                    const parent = displayRef.current.parentElement;
                    if (parent) {
                        parent.style.display = 'block';
                        parent.style.position = 'relative';
                        parent.style.zIndex = '100';
                        console.log('【RDP显示区】已设置父元素样式');
                    }
                }
            }, 100);
        }
    }, [displayRef.current]);

    // 添加DOM节点完全加载后的初始化监听
    useEffect(() => {
        // 为RDP组件添加自定义事件监听器，监听rdp-container-created事件
        const handleRdpContainerCreated = (event: CustomEvent) => {
            console.log('【RDP监听】检测到RDP容器创建事件:', event.detail);

            // 如果容器ID与当前活动标签相关联，则尝试重新初始化
            if (displayRef.current && event.detail.containerId) {
                console.log('【RDP初始化】检测到新的RDP容器，重新初始化RDP组件');

                // 清除所有可能的错误消息
                if (displayRef.current.querySelector('.rdp-error-message')) {
                    displayRef.current.innerHTML = '';
                }

                // 重新尝试WebSocket连接
                if (!webSocketRef?.current && createManualWebSocketConnection) {
                    createManualWebSocketConnection();
                }

                // 请求刷新
                if (webSocketRef?.current && webSocketRef.current.readyState === WebSocket.OPEN) {
                    requestRefresh();
                }
            }
        };

        // 添加事件监听器
        window.addEventListener('rdp-container-created', handleRdpContainerCreated as EventListener);

        // 添加DOM结构检查器
        const domObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    // 如果添加了新节点并且有显示区域存在
                    if (mutation.addedNodes.length > 0 && displayRef.current) {
                        // 检查背景图像是否已设置
                        const hasBackgroundImage = displayRef.current.style.backgroundImage &&
                            displayRef.current.style.backgroundImage !== 'none';

                        // 如果WebSocket已打开但没有背景图像，请求一次刷新
                        if (!hasBackgroundImage && webSocketRef?.current &&
                            webSocketRef.current.readyState === WebSocket.OPEN) {
                            console.log('【RDP DOM检查】检测到显示区域但无背景图像，尝试请求刷新');
                            requestRefresh();
                        }
                    }
                }
            });
        });

        // 开始监视
        if (displayRef.current) {
            domObserver.observe(displayRef.current, {
                childList: true,
                attributes: true,
                attributeFilter: ['style']
            });
        }

        // 全局调试信息
        window._rdpDebugInfo = {
            hasWebSocket: !!webSocketRef?.current,
            webSocketState: webSocketRef?.current ? webSocketRef.current.readyState : 'undefined',
            hasDisplayRef: !!displayRef.current,
            containerRefExists: !!containerRef.current
        };

        return () => {
            window.removeEventListener('rdp-container-created', handleRdpContainerCreated as EventListener);
            domObserver.disconnect();
            delete window._rdpDebugInfo;
        };
    }, [webSocketRef, displayRef, containerRef, requestRefresh, createManualWebSocketConnection]);

    // 添加一个新的effect，用于监听WebSocket消息事件并确保正确处理图像数据
    useEffect(() => {
        if (!webSocketRef?.current) return;

        // 创建消息处理器
        const handleMessage = (event: MessageEvent) => {
            try {
                // 如果是字符串类型
                if (typeof event.data === 'string') {
                    const data = event.data;

                    // 检查消息是否是RDP_SCREENSHOT格式
                    if (data.startsWith('RDP_SCREENSHOT:')) {
                        console.log('【RDP消息】检测到屏幕截图消息，长度:', data.length);

                        // 解析屏幕截图数据
                        const parts = data.split(':');
                        if (parts.length >= 4) {
                            const width = parseInt(parts[1]);
                            const height = parseInt(parts[2]);
                            const base64Image = parts.slice(3).join(':');

                            // 验证base64数据是否有效
                            if (base64Image && base64Image.length > 100) {
                                console.log(`【RDP渲染】尝试渲染屏幕截图 (${width}x${height})`);

                                // 如果displayRef存在，设置背景图像
                                if (displayRef.current) {
                                    const testImg = new Image();
                                    testImg.onload = () => {
                                        console.log('【RDP渲染】图像加载成功，设置为背景');
                                        if (displayRef.current) {
                                            // 设置背景
                                            displayRef.current.style.backgroundImage = `url(data:image/png;base64,${base64Image})`;
                                            displayRef.current.style.backgroundSize = 'contain';
                                            displayRef.current.style.backgroundPosition = 'center';
                                            displayRef.current.style.backgroundRepeat = 'no-repeat';

                                            // 更新连接状态
                                            setIsConnected(true);
                                            setIsConnecting(false);
                                            setError(null);

                                            // 触发成功事件
                                            window.dispatchEvent(new CustomEvent('rdp-render-success', {
                                                detail: { width, height, timestamp: Date.now() }
                                            }));
                                        }
                                    };

                                    testImg.onerror = () => {
                                        console.error('【RDP渲染】Base64图像加载失败');
                                        // 可以在这里处理加载失败的情况
                                    };

                                    // 设置图像源
                                    testImg.src = `data:image/png;base64,${base64Image}`;
                                } else {
                                    console.error('【RDP渲染】displayRef不存在，无法渲染图像');
                                }
                            } else {
                                console.error('【RDP渲染】Base64数据无效或长度不足', {
                                    dataLength: base64Image?.length || 0,
                                    valid: base64Image?.length > 100
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('【RDP消息】处理WebSocket消息失败:', error);
            }
        };

        // 添加事件监听器
        webSocketRef.current.addEventListener('message', handleMessage);

        // 清理函数
        return () => {
            if (webSocketRef.current) {
                webSocketRef.current.removeEventListener('message', handleMessage);
            }
        };
    }, [webSocketRef, displayRef]);

    return (
        <div
            className={styles.rdpTerminalContainer}
            ref={containerRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* RDP显示区域 */}
            <div
                ref={displayRef}
                className={styles.displayArea}
                style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#000',
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                }}
            >
                {/* 连接状态或错误显示 */}
                {isConnecting && (
                    <div className={styles.statusOverlay}>
                        <Spin size="large" />
                        <Text style={{ color: '#fff', marginTop: 16 }}>正在连接到RDP服务器...</Text>
                    </div>
                )}

                {error && (
                    <div className={styles.errorOverlay}>
                        <Text type="danger" style={{ fontSize: 16 }}>{error}</Text>
                        <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={requestRefresh}
                            style={{ marginTop: 16 }}
                        >
                            重新连接
                        </Button>
                    </div>
                )}
            </div>

            {/* 控制面板 */}
            {showControls && (
                <div className={styles.rdpControls}>
                    <Space>
                        <Tooltip title="刷新">
                            <Button
                                icon={<ReloadOutlined />}
                                size="small"
                                onClick={requestRefresh}
                            />
                        </Tooltip>

                        <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
                            <Button
                                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                size="small"
                                onClick={toggleFullscreen}
                            />
                        </Tooltip>
                    </Space>
                </div>
            )}
        </div>
    );
};

export default RdpTerminal;
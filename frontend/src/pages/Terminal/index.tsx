import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Tooltip, Space, Modal, message, Typography, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import {
  FullscreenOutlined, FullscreenExitOutlined, SettingOutlined,
  CloseOutlined, ExclamationCircleOutlined, CopyOutlined,
  DownloadOutlined, PlusOutlined, MenuFoldOutlined, MenuUnfoldOutlined
} from '@ant-design/icons';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebglAddon } from 'xterm-addon-webgl';
import { SearchAddon } from 'xterm-addon-search';
import { type Connection, connectionAPI, sessionAPI } from '../../services/api';
import { useTerminal } from '../../contexts/TerminalContext';
import type { TerminalTab } from '../../contexts/TerminalContext';
import TerminalSettings, { type TerminalSettings as TermSettings } from './TerminalSettings';
import GraphicalTerminal from '../../components/GraphicalTerminal';
import 'xterm/css/xterm.css';
import styles from './styles.module.css';

const { Title, Text } = Typography;
const { confirm } = Modal;

// 搜索图标
import { SearchOutlined } from '@ant-design/icons';

// 配置
const TERMINAL_FONT_SIZE = 14;
const TERMINAL_BG_COLOR = '#1e1e1e';
const TERMINAL_FG_COLOR = '#f0f0f0';
const TERMINAL_CURSOR_COLOR = '#ffffff';

interface WindowSize {
  cols: number;
  rows: number;
}

// WebSocket消息类型
interface TerminalMessage {
  type: 'resize' | 'data' | 'error';
  data?: any;
  cols?: number;
  rows?: number;
  error?: string;
}

const Terminal: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const navigate = useNavigate();

  // 使用终端上下文
  const { state, addTab, closeTab, setActiveTab } = useTerminal();
  const { tabs, activeTabKey } = state;

  const [connection, setConnection] = useState<Connection | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [terminalSize, setTerminalSize] = useState<WindowSize>({ cols: 80, rows: 24 });

  // XTerm相关引用 - 这些将用于当前活动标签（兼容性考虑）
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  // 当没有标签时监听
  useEffect(() => {
    if (tabs.length === 0 && !connectionId) {
      // 如果没有连接ID参数且没有标签，返回连接列表
      navigate('/connections');
    }
  }, [tabs.length, navigate, connectionId]);

  // 加载连接信息并创建标签
  useEffect(() => {
    const fetchConnectionAndCreateTab = async () => {
      if (!connectionId) return;

      try {
        const response = await connectionAPI.getConnection(Number(connectionId));
        if (response.data && response.data.code === 200) {
          const conn = response.data.data;
          setConnection(conn);

          // 如果URL中包含会话ID，使用它；否则创建新会话
          let session = null;
          if (sessionParam) {
            session = { id: Number(sessionParam) };
          } else {
            const sessResponse = await sessionAPI.createSession(conn.id);
            if (sessResponse.data && sessResponse.data.code === 200) {
              session = sessResponse.data.data;
            } else {
              message.error('创建会话失败');
              return;
            }
          }

          if (session) {
            // 检查是否已存在相同的标签
            const existingTab = tabs.find(
              tab => tab.connectionId === conn.id && tab.sessionId === session.id
            );

            if (!existingTab) {
              // 使用上下文管理器添加标签
              addTab(conn.id, session.id, conn);
            } else {
              // 如果已存在，只激活该标签
              setActiveTab(existingTab.key);
            }
          }
        } else {
          message.error('获取连接信息失败');
          navigate('/connections');
        }
      } catch (error) {
        console.error('获取连接信息失败:', error);
        message.error('获取连接信息失败，请稍后再试');
        navigate('/connections');
      }
    };

    // 如果有连接ID，获取连接信息并创建新标签
    if (connectionId && sessionParam) {
      // 添加检查以防止重复请求
      const existingTab = tabs.find(
        tab => tab.connectionId === Number(connectionId) && tab.sessionId === Number(sessionParam)
      );

      if (!existingTab) {
        fetchConnectionAndCreateTab();
      } else {
        // 如果已存在，只激活该标签
        setActiveTab(existingTab.key);
      }
    }
  }, [connectionId, sessionParam, navigate, addTab, setActiveTab]);

  // 监视标签变化，初始化当前活动标签的终端
  useEffect(() => {
    const activeTab = tabs.find(tab => tab.key === activeTabKey);
    if (!activeTab || !activeTab.terminalRef.current) return;

    // 终端已初始化，无需再次初始化
    if (activeTab.xtermRef.current) return;

    // 初始化终端
    const initActiveTerminal = async () => {
      // 如果是图形化终端或已经初始化了终端，则不再重复初始化XTerm
      if (activeTab.isGraphical) {
        console.log(`初始化图形化终端: ${activeTab.connection?.protocol}`);

        // 图形化终端使用GraphicalTerminal组件，组件会在挂载时自行初始化
        // 这里只需要确保WebSocket连接已建立
        if (!activeTab.webSocketRef.current) {
          // 为图形化终端建立WebSocket连接，无需传递XTerm实例
          connectWebSocket(activeTab.sessionId, null, activeTab);
        }
        return;
      }

      // 以下是常规终端(SSH/Telnet)的初始化逻辑
      if (activeTab.xtermRef.current) return;

      // 初始化终端
      const term = new XTerm({
        cursorBlink: true,
        fontSize: TERMINAL_FONT_SIZE,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: TERMINAL_BG_COLOR,
          foreground: TERMINAL_FG_COLOR,
          cursor: TERMINAL_CURSOR_COLOR,
        },
        scrollback: 3000,
      });

      // 创建并加载插件
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      const searchAddon = new SearchAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(searchAddon);

      // 尝试加载WebGL插件（如果浏览器支持）
      try {
        const webgl = new WebglAddon();
        term.loadAddon(webgl);
      } catch (e) {
        console.warn('WebGL不受支持，使用Canvas渲染器', e);
      }

      // 打开终端
      term.open(activeTab.terminalRef.current);

      // 保存引用
      activeTab.xtermRef.current = term;
      activeTab.fitAddonRef.current = fitAddon;
      activeTab.searchAddonRef.current = searchAddon;

      // 同时更新本地的引用（用于兼容现有功能）
      xtermRef.current = term;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      // 调整大小
      fitAddon.fit();

      // 初始消息
      term.writeln('正在连接到服务器...');

      // 设置输入处理
      term.onData(data => {
        if (activeTab.webSocketRef.current && activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
          activeTab.webSocketRef.current.send(data);
        }
      });

      // 连接WebSocket
      connectWebSocket(activeTab.sessionId, term, activeTab);
    };

    initActiveTerminal();

    // 组件卸载时清理
    return () => {
      // 只在组件完全卸载时清理资源，标签切换时保留连接
    };
  }, [activeTabKey, tabs]);

  // 监听窗口大小变化，调整终端大小
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        setTimeout(() => {
          fitAddonRef.current?.fit();

          // 获取新的终端尺寸
          const newSize = {
            cols: xtermRef.current?.cols || 80,
            rows: xtermRef.current?.rows || 24
          };

          // 发送尺寸调整消息到服务器
          if (isConnected &&
            (newSize.cols !== terminalSize.cols || newSize.rows !== terminalSize.rows)) {
            setTerminalSize(newSize);
            sendResizeMessage(newSize.cols, newSize.rows);
          }
        }, 0);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isConnected, terminalSize]);

  // 切换全屏模式
  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
    // 调整终端大小
    setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();

        // 更新终端大小并通知服务器
        if (xtermRef.current && isConnected) {
          const newSize = {
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows
          };

          setTerminalSize(newSize);
          sendResizeMessage(newSize.cols, newSize.rows);
        }
      }
    }, 100);
  };

  // 发送终端大小调整消息
  const sendResizeMessage = (cols: number, rows: number) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      const resizeMessage: TerminalMessage = {
        type: 'resize',
        cols,
        rows
      };
      webSocketRef.current.send(JSON.stringify(resizeMessage));
    }
  };

  // 初始化终端
  const initTerminal = (sessionId: number) => {
    if (!terminalRef.current || !connection) return;

    // 初始化XTerm
    const term = new XTerm({
      cursorBlink: true,
      fontSize: TERMINAL_FONT_SIZE,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: TERMINAL_BG_COLOR,
        foreground: TERMINAL_FG_COLOR,
        cursor: TERMINAL_CURSOR_COLOR,
      },
      scrollback: 3000,
    });

    // 添加插件
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    // 保存引用
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // 渲染终端
    term.open(terminalRef.current);

    // 尝试使用WebGL渲染
    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL渲染不可用，降级为Canvas渲染', e);
    }

    // 调整终端大小
    fitAddon.fit();

    // 获取终端尺寸
    setTerminalSize({
      cols: term.cols,
      rows: term.rows
    });

    // 显示连接中消息
    term.writeln(`正在连接到 ${connection.name} (${connection.host}:${connection.port})...`);
    term.writeln('');
    term.writeln(`协议: ${connection.protocol.toUpperCase()}`);
    term.writeln(`用户: ${connection.username}`);
    term.writeln('');

    // 连接WebSocket
    connectWebSocket(sessionId, term, null);

    // 监听终端输入
    term.onData(data => {
      sendDataToServer(data);
    });

    // 监听终端尺寸变化
    term.onResize(size => {
      if (size.cols !== terminalSize.cols || size.rows !== terminalSize.rows) {
        setTerminalSize(size);
        sendResizeMessage(size.cols, size.rows);
      }
    });
  };

  // 检测WebSocket服务是否可用
  const checkWebSocketAvailability = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        console.log(`尝试检测WebSocket可用性: ${url}`);
        const ws = new WebSocket(url);

        const timeout = setTimeout(() => {
          // 5秒超时认为不可用
          console.log(`WebSocket连接超时: ${url}`);
          ws.close();
          resolve(false);
        }, 5000);

        ws.onopen = () => {
          console.log(`WebSocket连接成功: ${url}`);
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        };

        ws.onerror = (error) => {
          console.error(`WebSocket连接错误: ${url}`, error);
          clearTimeout(timeout);
          resolve(false);
        };
      } catch (error) {
        console.error(`WebSocket连接异常: ${url}`, error);
        resolve(false);
      }
    });
  };

  // 连接WebSocket
  const connectWebSocket = async (sessionId: number, term: XTerm | null, tab?: TerminalTab) => {
    if (!connection) return;

    const protocol = connection.protocol;
    const token = localStorage.getItem('token') || '';

    // 在连接标签中存储尝试次数
    const reconnectAttempts = tab ? (tab as any).reconnectAttempts || 0 : 0;

    // 如果尝试次数超过限制，停止重连
    if (reconnectAttempts >= 3) {
      term?.writeln('\r\n\x1b[31m连接失败，已达到最大重试次数\x1b[0m');
      term?.writeln('\r\n\x1b[33m可能原因：\x1b[0m');
      term?.writeln('\r\n\x1b[33m1. 后端服务未启动或WebSocket端点不可用\x1b[0m');
      term?.writeln('\r\n\x1b[33m2. 协议处理程序尚未完全实现\x1b[0m');
      term?.writeln('\r\n\x1b[33m3. 会话ID无效或已过期\x1b[0m');
      term?.writeln('\r\n\x1b[33m请检查后端服务状态或联系管理员\x1b[0m');

      // 添加手动重连按钮
      term?.writeln('\r\n\x1b[33m可以在终端设置中修改后端连接参数后重试\x1b[0m');

      if (tab) {
        tab.isConnected = false;
      } else {
        setIsConnected(false);
      }

      return;
    }

    // 记录重连尝试次数
    if (tab) {
      (tab as any).reconnectAttempts = reconnectAttempts + 1;
    }

    // 从本地存储中获取后端配置
    const savedSettings = localStorage.getItem('terminal_settings');
    let backendUrl = window.location.hostname;
    let backendPort = 8080;

    // 如果有保存的设置，使用保存的后端URL和端口
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        backendUrl = settings.backendUrl || backendUrl;
        backendPort = settings.backendPort || backendPort;
      } catch (e) {
        console.error('读取终端设置失败:', e);
      }
    }

    // 创建WebSocket连接
    let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // 后端接口固定为/api/ws/{protocol}/{sessionId}，不需要检测多个路径
    const possiblePaths = [
      `/api/ws/${protocol}/${sessionId}`
    ];

    // 如果是RDP协议，添加特殊处理
    if (protocol === 'rdp') {
      term?.writeln('\r\n\x1b[33mRDP协议可能需要特殊配置，正在准备连接参数...\x1b[0m');

      // 获取连接的附加参数
      const connectionParams = {
        username: connection.username || '',
        host: connection.host,
        port: connection.port,
        protocol: 'rdp',
        sessionId: sessionId
      };

      // 延长RDP连接的超时时间
      const connectionTimeout = 10000; // 10秒

      term?.writeln(`\r\n\x1b[33m连接到 ${connectionParams.host}:${connectionParams.port} (${connectionParams.username})\x1b[0m`);
    }

    // 直接使用固定的WebSocket端点
    term?.writeln('\r\n\x1b[33m正在连接到WebSocket端点...\x1b[0m');

    // 根据后端实际API路由配置使用固定的WebSocket路径
    let wsUrl = `${wsProtocol}//${backendUrl}:${backendPort}/ws/${protocol}/${sessionId}`;
    term?.writeln(`\r\n\x1b[33m使用WebSocket端点: ${wsUrl}\x1b[0m`);

    // 跳过健康检查，避免CORS问题
    term?.writeln('\r\n\x1b[33m尝试直接连接WebSocket，跳过健康检查\x1b[0m');

    term?.writeln(`\r\n\x1b[33m尝试连接到 ${wsUrl} (尝试 ${reconnectAttempts + 1}/3)\x1b[0m`);

    // 检查WebSocket是否已存在且处于连接状态
    if (tab && tab.webSocketRef.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket已连接，无需重新连接');
      return;
    }

    // 如果存在旧的WebSocket连接，先关闭
    if (tab && tab.webSocketRef.current) {
      try {
        tab.webSocketRef.current.close();
      } catch (e) {
        console.error('关闭旧WebSocket连接失败:', e);
      }
    }

    // 创建新的WebSocket连接
    let ws: WebSocket;
    try {
      // 添加短暂延迟，确保后端处理完会话创建
      term?.writeln('\r\n\x1b[33m准备连接WebSocket...\x1b[0m');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 获取认证令牌
      const token = localStorage.getItem('token') || '';
      
      // 在URL中添加认证令牌 - 通过查询参数
      wsUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;

      // 准备连接到WebSocket
      term?.writeln(`\r\n\x1b[33m准备连接到WebSocket: ${wsUrl}\x1b[0m`);
      console.log(`尝试WebSocket连接: ${wsUrl}`);
      
      term?.writeln(`\r\n\x1b[33m最终WebSocket连接地址: ${wsUrl}\x1b[0m`);
      
      // 添加更多调试信息
      console.log(`尝试创建WebSocket连接: ${wsUrl}，协议: ${protocol}，会话ID: ${sessionId}`);
      term?.writeln(`\\r\\n\\x1b[33m正在创建WebSocket连接: ${wsUrl}\\x1b[0m`);
      
      try {
        // 创建WebSocket连接
        ws = new WebSocket(wsUrl);
        console.log("WebSocket实例创建成功，等待连接...");
        term?.writeln("\\r\\n\\x1b[33mWebSocket实例创建成功，等待连接...\\x1b[0m");
      } catch (error) {
        console.error("创建WebSocket实例失败:", error);
        term?.writeln(`\\r\\n\\x1b[31m创建WebSocket实例失败: ${error}\\x1b[0m`);
        reconnect();
        return;
      }

      // 保存原始处理器
      const originalOnOpen = ws.onopen;

      // 设置新的onopen处理器，在处理完自定义逻辑后调用原始处理器
      ws.onopen = (event) => {
        console.log('WebSocket连接已打开，会话ID:', sessionId);

        // 发送认证消息
        try {
          const authMessage = JSON.stringify({
            type: 'auth',
            token: token,
            connectionInfo: {
              protocol: protocol,
              host: connection.host,
              port: connection.port,
              username: connection.username,
              sessionId: sessionId
            }
          });

          ws.send(authMessage);
          term?.writeln('\r\n\x1b[32m发送认证信息成功\x1b[0m');
        } catch (e) {
          term?.writeln('\r\n\x1b[31m发送认证信息失败\x1b[0m');
          console.error('发送认证信息失败:', e);
        }

        // 连接成功消息
        term?.writeln('\r\n\x1b[32m连接成功!\x1b[0m');

        // 如果是RDP协议，发送特殊的初始化指令
        if (protocol === 'rdp') {
          try {
            const rdpInitMessage = JSON.stringify({
              type: 'init',
              protocol: 'rdp',
              width: term?.cols || 800,
              height: term?.rows || 600,
              connectionId: connection.id,
              sessionId: sessionId
            });

            ws.send(rdpInitMessage);
            term?.writeln('\r\n\x1b[32m发送RDP初始化信息成功\x1b[0m');
          } catch (e) {
            term?.writeln('\r\n\x1b[31m发送RDP初始化信息失败\x1b[0m');
            console.error('发送RDP初始化信息失败:', e);
          }
        }

        // 调用原始处理器（如果存在）
        if (originalOnOpen) {
          originalOnOpen.call(ws, event);
        }

        clearTimeout(connectionTimeout);

        if (tab) {
          tab.isConnected = true;
          // 重置重连计数
          (tab as any).reconnectAttempts = 0;
        } else {
          setIsConnected(true);
        }

        // 发送初始终端大小
        if (tab) {
          // 使用标签特定的大小
          if (tab.xtermRef.current) {
            const sizeMessage = {
              type: 'resize',
              cols: tab.xtermRef.current.cols,
              rows: tab.xtermRef.current.rows
            };
            ws.send(JSON.stringify(sizeMessage));
          }
        } else if (term) {
          // 使用全局大小
          sendResizeMessage(term.cols, term.rows);
        }
      };
    } catch (error) {
      console.error('创建WebSocket连接失败:', error);
      term?.writeln('\r\n\x1b[31m创建WebSocket连接失败\x1b[0m');
      return;
    }

    // 如果是标签模式，则保存到标签的引用，否则保存到全局引用
    if (tab) {
      tab.webSocketRef.current = ws;
    } else {
      webSocketRef.current = ws;
    }

    // 设置连接超时
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        term.writeln('\r\n\x1b[31m连接超时\x1b[0m');
        ws.close();
      }
    }, 5000);

    // 收到消息时
    ws.onmessage = (event) => {
      // 检查当前标签是否为图形化模式
      const isGraphical = tab?.isGraphical || false;

      // 如果是图形化模式，不需要将消息写入XTerm
      if (isGraphical) {
        return; // GraphicalTerminal组件会直接处理WebSocket消息
      }

      // 确保term存在
      if (!term) return;

      try {
        // 尝试解析JSON消息
        const message = JSON.parse(event.data) as TerminalMessage;

        if (message.type === 'error') {
          term.writeln(`\r\n\x1b[31m错误: ${message.error}\x1b[0m`);
        } else {
          // 处理其他类型的消息
          if (message.data) {
            term.write(message.data);
          }
        }
      } catch (e) {
        // 如果不是JSON，则视为终端输出
        term.write(event.data);
      }
    };

    // 连接关闭时
    ws.onclose = (event) => {
      console.log(`WebSocket连接已关闭，会话ID: ${sessionId}, 代码: ${event.code}, 原因: ${event.reason}`);
      clearTimeout(connectionTimeout);

      if (tab) {
        tab.isConnected = false;
      } else {
        setIsConnected(false);
      }

      // 确保term存在
      if (!term) return;

      term.writeln('\r\n\x1b[31m连接已关闭\x1b[0m');
      if (event.reason) {
        term.writeln(`\r\n\x1b[31m原因: ${event.reason}\x1b[0m`);
      }

      // 如果连接被意外关闭且尝试次数小于最大值，尝试重连
      if (event.code !== 1000 && event.code !== 1005 && reconnectAttempts < 3) {
        const delay = Math.pow(2, reconnectAttempts) * 1000; // 指数退避
        term.writeln(`\r\n\x1b[33m${delay / 1000}秒后尝试重新连接...\x1b[0m`);

        setTimeout(() => {
          // 避免页面卸载后重连
          if (term && term.element && document.body.contains(term.element)) {
            connectWebSocket(sessionId, term, tab);
          }
        }, delay);
      } else if (reconnectAttempts >= 3) {
        term.writeln('\r\n\x1b[33m可以在终端设置中修改后端连接参数后重试\x1b[0m');
      }
    };

    // 连接错误时
    ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
      
      // 确保term存在
      if (!term) return;
      
      term.writeln('\r\n\x1b[31m连接错误\x1b[0m');

      // 提供更多调试信息和解决方案
      term.writeln('\r\n\x1b[33m可能的原因:\x1b[0m');
      term.writeln('\r\n\x1b[33m1. 后端服务未启动或WebSocket端点未正确配置\x1b[0m');
      term.writeln('\r\n\x1b[33m2. 端口号或主机地址错误\x1b[0m');
      term.writeln('\r\n\x1b[33m3. 网络连接问题或防火墙限制\x1b[0m');
      term.writeln('\r\n\x1b[33m4. WebSocket路径不匹配后端路由配置\x1b[0m');
      term.writeln('\r\n\x1b[33m5. 认证令牌无效或过期\x1b[0m');
      
      term.writeln('\r\n\x1b[33m详细连接信息:\x1b[0m');
      term.writeln(`\r\n\x1b[33m- WebSocket URL: ${wsUrl}\x1b[0m`);
      term.writeln(`\r\n\x1b[33m- 协议: ${protocol}\x1b[0m`);
      term.writeln(`\r\n\x1b[33m- 会话ID: ${sessionId}\x1b[0m`);
      term.writeln(`\r\n\x1b[33m- 重连尝试次数: ${reconnectAttempts + 1}/3\x1b[0m`);
      
      // 尝试向服务器发送一个健康检查请求以检测连接状态
      fetch(`http://${backendUrl}:${backendPort}/api/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (response.ok) {
          term.writeln('\r\n\x1b[32m后端服务可用，但WebSocket连接失败\x1b[0m');
          term.writeln('\r\n\x1b[33m这可能是WebSocket配置问题\x1b[0m');
        } else {
          term.writeln('\r\n\x1b[31m后端服务响应异常\x1b[0m');
        }
      })
      .catch(err => {
        term.writeln('\r\n\x1b[31m后端服务不可达，请检查服务是否启动\x1b[0m');
        term.writeln(`\r\n\x1b[31m错误: ${err.message}\x1b[0m`);
      });
      
      term.writeln('\r\n\x1b[33m解决方案:\x1b[0m');
      term.writeln('\r\n\x1b[33m1. 确认后端服务正在运行（检查控制台输出）\x1b[0m');
      term.writeln('\r\n\x1b[33m2. 在终端设置中检查后端URL和端口配置\x1b[0m');
      term.writeln('\r\n\x1b[33m3. 确保WebSocket路径与后端路由匹配\x1b[0m');
      term.writeln('\r\n\x1b[33m4. 尝试重新登录以刷新认证令牌\x1b[0m');
      
      // 错误处理主要在onclose中完成
    };
  };

  // 发送数据到服务器
  const sendDataToServer = (data: string) => {
    // 获取当前活动标签
    const activeTab = tabs.find(tab => tab.key === activeTabKey);

    if (activeTab && activeTab.webSocketRef.current &&
      activeTab.webSocketRef.current.readyState === WebSocket.OPEN) {
      // 优先使用标签的WebSocket连接
      activeTab.webSocketRef.current.send(data);
    } else if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      // 兼容旧代码，使用全局WebSocket连接
      webSocketRef.current.send(data);
    } else {
      console.warn('无法发送数据：WebSocket未连接');
    }
  };

  // 处理所有会话关闭
  const handleCloseSession = () => {
    confirm({
      title: '确认关闭',
      icon: <ExclamationCircleOutlined />,
      content: '确定要关闭所有会话并返回连接列表吗？',
      okText: '关闭',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        // 关闭所有标签并返回连接列表
        try {
          // 关闭所有标签
          for (const tab of tabs) {
            // 关闭WebSocket连接
            if (tab.webSocketRef.current) {
              tab.webSocketRef.current.close();
            }

            // 关闭会话
            await sessionAPI.closeSession(tab.sessionId).catch(console.error);
          }

          message.success('所有会话已关闭');
          // 返回连接列表
          navigate('/connections');
        } catch (error) {
          console.error('关闭会话失败:', error);
          message.error('关闭会话失败，请稍后再试');
        }
      },
    });
  };

  // 内容复制功能
  const handleCopyContent = () => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection)
          .then(() => message.success('复制成功'))
          .catch(() => message.error('复制失败'));
      } else {
        message.info('请先选择要复制的内容');
      }
    }
  };

  // 搜索功能
  const handleSearch = () => {
    if (searchAddonRef.current) {
      // 在实际应用中，应该使用输入对话框获取搜索文本
      const searchText = prompt('请输入搜索内容:');
      if (searchText) {
        searchAddonRef.current.findNext(searchText);
      }
    }
  };

  // 下载日志功能
  const handleDownloadLog = () => {
    if (xtermRef.current) {
      const lines = xtermRef.current.buffer.active.getLine(0);
      if (!lines) {
        message.info('没有可下载的内容');
        return;
      }

      // 获取当前活动标签
      const activeTab = tabs.find(tab => tab.key === activeTabKey);
      if (!activeTab) {
        message.error('未找到活动标签');
        return;
      }

      const buffer = xtermRef.current.buffer.active;
      const lineCount = buffer.length;
      let logContent = '';

      for (let i = 0; i < lineCount; i++) {
        const line = buffer.getLine(i);
        if (line) {
          logContent += line.translateToString() + '\n';
        }
      }

      const blob = new Blob([logContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${activeTab.sessionId}_${new Date().toISOString().replace(/:/g, '-')}.log`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    }
  };

  // 添加新标签
  const handleAddNewTab = () => {
    // 使用当前连接创建新会话
    if (connection) {
      sessionAPI.createSession(connection.id)
        .then(response => {
          if (response.data && response.data.code === 200) {
            const session = response.data.data;
            // 使用上下文管理器添加标签
            addTab(connection.id, session.id, connection);
          } else {
            message.error('创建会话失败');
          }
        })
        .catch(error => {
          console.error('创建会话失败:', error);
          message.error('创建会话失败，请稍后再试');
        });
    }
  };

  // 标签页变更处理
  const handleTabChange = (newActiveKey: string) => {
    setActiveTab(newActiveKey);
  };

  // 标签编辑处理（添加/删除标签）
  const handleTabEdit = (targetKey: React.MouseEvent<Element, MouseEvent> | React.KeyboardEvent<Element> | string, action: 'add' | 'remove') => {
    if (action === 'add') {
      handleAddNewTab();
    } else if (action === 'remove') {
      // 确保targetKey是字符串
      const tabKey = typeof targetKey === 'string' ? targetKey : '';
      if (tabKey) {
        closeTab(tabKey);
      }
    }
  };

  // 渲染标签内容
  const renderTabContent = (tab: TerminalTab) => {
    if (!tab) return null;

    // 根据标签是否为图形化终端决定渲染不同的组件
    if (tab.isGraphical) {
      // 渲染图形化终端（RDP/VNC）
      return (
        <div
          className={styles.terminalContainer}
          ref={tab.terminalRef}
        >
          <GraphicalTerminal
            protocol={tab.connection?.protocol as 'rdp' | 'vnc'}
            webSocketRef={tab.webSocketRef}
            onResize={(width, height) => {
              // 发送调整大小的消息
              if (tab.webSocketRef.current && tab.webSocketRef.current.readyState === WebSocket.OPEN) {
                const resizeMessage = {
                  type: 'resize',
                  width,
                  height
                };
                tab.webSocketRef.current.send(JSON.stringify(resizeMessage));
              }
            }}
          />
        </div>
      );
    } else {
      // 渲染普通终端（SSH/Telnet）
      return (
        <div
          className={styles.terminalContainer}
          ref={tab.terminalRef}
        />
      );
    }
  };

  // 渲染标签页
  const renderTabs = () => {
    // 确保每个标签项都有唯一的key
    const items: TabsProps['items'] = tabs.map((tab) => ({
      key: tab.key,
      label: (
        <span>
          {tab.title}
          <CloseOutlined
            className={styles.closeIcon}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.key);
            }}
          />
        </span>
      ),
      children: renderTabContent(tab),
    }));

    return (
      <Tabs
        type="card"
        activeKey={activeTabKey}
        onChange={handleTabChange}
        className={styles.terminalTabs}
        items={items}
      />
    );
  };

  return (
    <div className={`${styles.terminalContainer} ${fullscreen ? styles.fullscreen : ''}`}>
      <div className={styles.terminalHeader}>
        <div className={styles.terminalInfo}>
          <Title level={4} style={{ margin: 0 }}>
            {connection?.name}
            <Text type="secondary" style={{ fontSize: '14px', marginLeft: '10px' }}>
              {connection?.host}:{connection?.port} - {connection?.protocol.toUpperCase()}
            </Text>
          </Title>
        </div>
        <div className={styles.terminalControls}>
          <Space>
            <Tooltip title="新建标签">
              <Button
                icon={<PlusOutlined />}
                onClick={handleAddNewTab}
              />
            </Tooltip>
            <Tooltip title="复制选中内容">
              <Button
                icon={<CopyOutlined />}
                onClick={handleCopyContent}
              />
            </Tooltip>
            <Tooltip title="下载日志">
              <Button
                icon={<DownloadOutlined />}
                onClick={handleDownloadLog}
              />
            </Tooltip>
            <Tooltip title="终端设置">
              <Button
                icon={<SettingOutlined />}
                onClick={() => setSettingsVisible(true)}
              />
            </Tooltip>
            <Tooltip title={fullscreen ? "退出全屏" : "全屏"}>
              <Button
                icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleFullscreen}
              />
            </Tooltip>
            <Tooltip title="关闭会话">
              <Button
                danger
                icon={<CloseOutlined />}
                onClick={handleCloseSession}
              />
            </Tooltip>
          </Space>
        </div>
      </div>

      {renderTabs()}

      <div className={styles.terminalFooter}>
        <Space split={<span style={{ margin: '0 8px', color: '#d9d9d9' }}>|</span>}>
          <span>
            <strong>状态:</strong> {isConnected ? '已连接' : '连接中...'}
          </span>
          <span>
            <strong>终端尺寸:</strong> {terminalSize.cols}x{terminalSize.rows}
          </span>
          <span>
            <strong>会话ID:</strong> {tabs.length > 0 ? tabs[0].sessionId : '未知'}
          </span>
        </Space>
      </div>

      <TerminalSettings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onApply={(settings: TermSettings) => {
          // 应用终端设置
          if (xtermRef.current) {
            // 应用外观设置
            xtermRef.current.options.theme = {
              ...xtermRef.current.options.theme,
              background: settings.background,
              foreground: settings.foreground,
            };
            xtermRef.current.options.fontSize = settings.fontSize;
            xtermRef.current.options.fontFamily = settings.fontFamily;
            xtermRef.current.options.cursorBlink = settings.cursorBlink;

            // 应用滚动行数设置
            if (settings.scrollback) {
              xtermRef.current.options.scrollback = settings.scrollback;
            }

            // 调整终端大小
            if (fitAddonRef.current) {
              fitAddonRef.current.fit();
            }

            // 如果后端URL或端口发生了变化，提示用户需要重新连接
            const savedSettings = localStorage.getItem('terminal_settings');
            if (savedSettings) {
              try {
                const oldSettings = JSON.parse(savedSettings);
                if (oldSettings.backendUrl !== settings.backendUrl ||
                  oldSettings.backendPort !== settings.backendPort) {
                  message.info('后端连接设置已更改，重新连接终端后生效');
                }
              } catch (e) {
                console.error('读取旧终端设置失败:', e);
              }
            }
          }
        }}
      />
    </div>
  );
};

export default Terminal;
import axios from 'axios';
import { API_BASE_URL } from './api';

// 创建专用的终端会话API实例
const terminalApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 添加请求拦截器
terminalApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 终端会话类型定义
export interface TerminalSession {
  session_id: string;
  connection_id: number;
  protocol: string;
  status: 'active' | 'disconnected' | 'closed';
  created_at: string;
  last_active: string;
  expires_at: string;
  message_count: number;
}

export interface TerminalMessage {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: string;
  user_id?: number;
}

export interface CreateSessionRequest {
  connection_id: number;
  protocol: string;
}

export interface SessionStats {
  total_sessions?: number;
  active_sessions?: number;
  disconnected_sessions?: number;
  users_with_sessions?: number;
  user_sessions?: number; // 用户个人统计
}

// 终端会话API
export const terminalSessionAPI = {
  // 创建终端会话
  createSession: (request: CreateSessionRequest) => {
    return terminalApi.post<{
      code: number;
      message: string;
      data: TerminalSession;
    }>('/terminal/sessions', request);
  },

  // 获取用户的所有终端会话
  getUserSessions: () => {
    return terminalApi.get<{
      code: number;
      message: string;
      data: TerminalSession[];
    }>('/terminal/sessions');
  },

  // 获取指定会话信息
  getSession: (sessionId: string) => {
    return terminalApi.get<{
      code: number;
      message: string;
      data: TerminalSession;
    }>(`/terminal/sessions/${sessionId}`);
  },

  // 关闭终端会话
  closeSession: (sessionId: string) => {
    return terminalApi.delete<{
      code: number;
      message: string;
    }>(`/terminal/sessions/${sessionId}`);
  },

  // 获取会话统计信息
  getSessionStats: () => {
    return terminalApi.get<{
      code: number;
      message: string;
      data: SessionStats;
    }>('/terminal/sessions/stats');
  },

  // 创建WebSocket连接URL
  getWebSocketUrl: (sessionId: string, resume = false) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NODE_ENV === 'production' 
      ? window.location.host  // 生产环境使用当前host和port
      : 'localhost:8080';     // 开发环境使用localhost:8080
    const token = localStorage.getItem('token');
    
    let url = `${protocol}//${host}/ws/terminal/${sessionId}`;
    
    const params = new URLSearchParams();
    if (token) {
      params.append('token', token);
    }
    if (resume) {
      params.append('resume', 'true');
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    return url;
  }
};

// 终端会话管理器类
export class TerminalSessionManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private websockets: Map<string, WebSocket> = new Map();
  private messageHandlers: Map<string, (message: TerminalMessage) => void> = new Map();
  private statusHandlers: Map<string, (status: string) => void> = new Map();

  // 创建会话
  async createSession(connectionId: number, protocol: string): Promise<TerminalSession> {
    const response = await terminalSessionAPI.createSession({
      connection_id: connectionId,
      protocol: protocol
    });
    
    if (response.data.code === 200) {
      const session = response.data.data;
      this.sessions.set(session.session_id, session);
      return session;
    } else {
      throw new Error(response.data.message);
    }
  }

  // 连接到会话
  async connectToSession(sessionId: string, resume = false): Promise<WebSocket> {
    // 如果已经有连接，先关闭
    if (this.websockets.has(sessionId)) {
      this.disconnectFromSession(sessionId);
    }

    const wsUrl = terminalSessionAPI.getWebSocketUrl(sessionId, resume);
    const ws = new WebSocket(wsUrl);

    // 设置事件处理器
    ws.onopen = () => {
      console.log(`WebSocket连接已建立: ${sessionId}`);
      // 更新会话状态
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'active';
        this.sessions.set(sessionId, session);
      }
      
      // 触发状态变化处理器
      const statusHandler = this.statusHandlers.get(sessionId);
      if (statusHandler) {
        statusHandler('connected');
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: TerminalMessage = JSON.parse(event.data);
        console.log(`收到会话消息: ${sessionId}`, message);
        
        // 触发消息处理器
        const messageHandler = this.messageHandlers.get(sessionId);
        if (messageHandler) {
          messageHandler(message);
        }
      } catch (error) {
        console.error('解析WebSocket消息失败:', error);
      }
    };

    ws.onclose = (event) => {
      console.log(`WebSocket连接已关闭: ${sessionId}`, event);
      this.websockets.delete(sessionId);
      
      // 更新会话状态
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'disconnected';
        this.sessions.set(sessionId, session);
      }
      
      // 触发状态变化处理器
      const statusHandler = this.statusHandlers.get(sessionId);
      if (statusHandler) {
        statusHandler('disconnected');
      }
    };

    ws.onerror = (error) => {
      console.error(`WebSocket连接错误: ${sessionId}`, error);
      
      // 触发状态变化处理器
      const statusHandler = this.statusHandlers.get(sessionId);
      if (statusHandler) {
        statusHandler('error');
      }
    };

    this.websockets.set(sessionId, ws);
    return ws;
  }

  // 断开会话连接
  disconnectFromSession(sessionId: string) {
    const ws = this.websockets.get(sessionId);
    if (ws) {
      ws.close();
      this.websockets.delete(sessionId);
    }
  }

  // 发送消息到会话
  sendMessage(sessionId: string, message: any): boolean {
    const ws = this.websockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  // 发送输入到会话
  sendInput(sessionId: string, input: string): boolean {
    return this.sendMessage(sessionId, {
      type: 'input',
      content: input
    });
  }

  // 发送心跳
  sendHeartbeat(sessionId: string): boolean {
    return this.sendMessage(sessionId, {
      type: 'heartbeat',
      timestamp: Date.now()
    });
  }

  // 关闭会话
  async closeSession(sessionId: string): Promise<void> {
    // 先断开WebSocket连接
    this.disconnectFromSession(sessionId);
    
    // 发送关闭请求到服务器
    try {
      await terminalSessionAPI.closeSession(sessionId);
    } catch (error) {
      console.error('关闭会话失败:', error);
    }
    
    // 清理本地状态
    this.sessions.delete(sessionId);
    this.messageHandlers.delete(sessionId);
    this.statusHandlers.delete(sessionId);
  }

  // 设置消息处理器
  setMessageHandler(sessionId: string, handler: (message: TerminalMessage) => void) {
    this.messageHandlers.set(sessionId, handler);
  }

  // 设置状态变化处理器
  setStatusHandler(sessionId: string, handler: (status: string) => void) {
    this.statusHandlers.set(sessionId, handler);
  }

  // 获取会话信息
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  // 获取所有会话
  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  // 检查连接状态
  isConnected(sessionId: string): boolean {
    const ws = this.websockets.get(sessionId);
    return ws ? ws.readyState === WebSocket.OPEN : false;
  }

  // 恢复会话
  async resumeSession(sessionId: string): Promise<WebSocket> {
    console.log(`恢复会话: ${sessionId}`);
    return this.connectToSession(sessionId, true);
  }

  // 刷新会话列表
  async refreshSessions(): Promise<TerminalSession[]> {
    try {
      const response = await terminalSessionAPI.getUserSessions();
      if (response.data.code === 200) {
        const sessions = response.data.data;
        
        // 更新本地会话缓存
        this.sessions.clear();
        sessions.forEach(session => {
          this.sessions.set(session.session_id, session);
        });
        
        return sessions;
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      console.error('刷新会话列表失败:', error);
      throw error;
    }
  }

  // 清理所有连接
  cleanup() {
    // 关闭所有WebSocket连接
    this.websockets.forEach((ws, sessionId) => {
      console.log(`清理WebSocket连接: ${sessionId}`);
      ws.close();
    });
    
    // 清理所有状态
    this.websockets.clear();
    this.sessions.clear();
    this.messageHandlers.clear();
    this.statusHandlers.clear();
  }
}

// 创建全局终端会话管理器实例
export const globalTerminalSessionManager = new TerminalSessionManager();

export default terminalSessionAPI;
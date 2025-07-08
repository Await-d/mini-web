import axios from 'axios';

// API基础URL - 确保所有HTTP请求使用8080端口
export const API_BASE_URL = 'http://localhost:8080/api';

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 对于登录请求，不自动跳转，让组件处理错误
    const isLoginRequest = error.config &&
      error.config.url &&
      error.config.url.includes('/auth/login');

    // 处理401错误（非登录请求）
    if (error.response && error.response.status === 401 && !isLoginRequest) {
      // 清除本地存储
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // 重定向到登录页
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 认证相关API
export const authAPI = {
  // 用户登录
  login: (username: string, password: string) => {
    return api.post('/auth/login', { username, password });
  },

  // 用户注册
  register: (userData: {
    username: string;
    email: string;
    password: string;
    nickname: string;
  }) => {
    return api.post('/auth/register', userData);
  },

  // 获取用户信息
  getUserInfo: () => {
    return api.get('/user/profile');
  },

  // 更新用户信息
  updateUserInfo: (userData: { nickname: string; avatar?: string }) => {
    return api.put('/user/profile', userData);
  },

  // 更新密码
  updatePassword: (passwordData: {
    old_password: string;
    new_password: string;
  }) => {
    return api.put('/user/password', passwordData);
  },

  // 刷新Token
  refreshToken: () => {
    return api.post('/auth/refresh');
  },
};

// 用户类型
export interface User {
  id: number;
  username: string;
  email: string;
  nickname: string;
  role: string;
  avatar?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// 用户管理API
export const userAPI = {
  // 获取用户列表
  getUsers: () => {
    return api.get<{
      code: number;
      message: string;
      data: {
        list: User[];
        total: number;
      };
    }>('/users');
  },

  // 获取指定用户信息
  getUserByID: (id: number) => {
    return api.get<{
      code: number;
      message: string;
      data: User;
    }>(`/users/${id}`);
  },

  // 创建用户
  createUser: (userData: {
    username: string;
    email: string;
    password: string;
    nickname: string;
    role?: string;
    status?: string;
  }) => {
    return api.post<{
      code: number;
      message: string;
      data: User;
    }>('/users', userData);
  },

  // 更新用户
  updateUser: (id: number, userData: Partial<User>) => {
    return api.put<{
      code: number;
      message: string;
      data: User;
    }>(`/users/${id}`, userData);
  },

  // 删除用户
  deleteUser: (id: number) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/users/${id}`);
  },

  // 批量操作用户
  batchUpdateUsers: (operation: string, userIds: number[]) => {
    return api.post<{
      code: number;
      message: string;
    }>('/users/batch', {
      operation,
      user_ids: userIds
    });
  },

  // 上传用户头像
  uploadAvatar: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    
    return api.post<{
      code: number;
      message: string;
      data: {
        avatar_url: string;
        user: User;
      };
    }>(`/users/${id}/avatar`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // 获取用户活动日志
  getUserActivities: (id: number, page = 1, pageSize = 20) => {
    return api.get<{
      code: number;
      message: string;
      data: {
        list: any[];
        page: number;
        page_size: number;
        total: number;
      };
    }>(`/users/${id}/activities?page=${page}&page_size=${pageSize}`);
  },

  // 更改用户状态
  changeUserStatus: (id: number, status: string) => {
    return api.put<{
      code: number;
      message: string;
      data: User;
    }>(`/users/${id}`, { status });
  },

  // 重置密码
  resetPassword: (id: number) => {
    return api.post<{
      code: number;
      message: string;
    }>(`/users/${id}/reset-password`);
  }
};

// 连接类型
export interface Connection {
  id: number;
  name: string;
  protocol: 'rdp' | 'ssh' | 'vnc' | 'telnet';
  host: string;
  port: number;
  username: string;
  group: string;
  description: string;
  last_used: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

// 连接请求类型
export interface ConnectionRequest {
  name: string;
  protocol: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key?: string;
  group: string;
  description: string;
}

// 会话类型
export interface Session {
  id: number;
  connection_id: number;
  user_id: number;
  start_time: string;
  end_time: string;
  duration: number;
  status: string;
  client_ip: string;
  server_ip: string;
  log_path: string;
}

// 连接API
export const connectionAPI = {
  // 获取所有连接
  getConnections: () => {
    return api.get<{
      code: number;
      message: string;
      data: Connection[];
    }>('/connections');
  },

  // 获取指定连接
  getConnection: (id: number) => {
    return api.get<{
      code: number;
      message: string;
      data: Connection;
    }>(`/connections/${id}`);
  },

  // 创建连接
  createConnection: (connectionData: ConnectionRequest) => {
    return api.post<{
      code: number;
      message: string;
      data: Connection;
    }>('/connections', connectionData);
  },

  // 更新连接
  updateConnection: (id: number, connectionData: ConnectionRequest) => {
    return api.put<{
      code: number;
      message: string;
      data: Connection;
    }>(`/connections/${id}`, connectionData);
  },

  // 删除连接
  deleteConnection: (id: number) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/connections/${id}`);
  },

  // 测试连接
  testConnection: (connectionData: ConnectionRequest) => {
    return api.post<{
      code: number;
      message: string;
    }>('/connections/test', connectionData);
  }
};

// 会话API
export const sessionAPI = {
  // 获取所有会话
  getSessions: () => {
    return api.get<{
      code: number;
      message: string;
      data: Session[];
    }>('/sessions');
  },

  // 获取活动会话
  getActiveSessions: () => {
    return api.get<{
      code: number;
      message: string;
      data: Session[];
    }>('/sessions/active');
  },

  // 创建会话
  createSession: (connectionId: number) => {
    return api.post<{
      code: number;
      message: string;
      data: Session;
    }>(`/connections/${connectionId}/sessions`);
  },

  // 关闭会话
  closeSession: (id: number) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/sessions/${id}`);
  }
};

// 系统配置类型
export interface SystemConfig {
  id: number;
  key: string;
  value: string;
  description: string;
  category: string;
  type: string;
  created_at: string;
  updated_at: string;
}

// 系统日志类型
export interface SystemLog {
  id: number;
  level: string;
  module: string;
  message: string;
  details?: string;
  user_id?: number;
  ip_address?: string;
  created_at: string;
}

// 系统设置API
export const systemAPI = {
  // 获取所有系统配置
  getAllConfigs: () => {
    return api.get<{
      code: number;
      message: string;
      data: SystemConfig[];
    }>('/admin/system/configs');
  },

  // 根据分类获取系统配置
  getConfigsByCategory: (category: string) => {
    return api.get<{
      code: number;
      message: string;
      data: SystemConfig[];
    }>(`/admin/system/configs/category/${category}`);
  },

  // 获取指定配置
  getConfig: (key: string) => {
    return api.get<{
      code: number;
      message: string;
      data: SystemConfig;
    }>(`/admin/system/configs/${key}`);
  },

  // 更新配置
  updateConfig: (key: string, data: { value: string; description?: string }) => {
    return api.put<{
      code: number;
      message: string;
      data: SystemConfig;
    }>(`/admin/system/configs/${key}`, data);
  },

  // 批量更新配置
  batchUpdateConfigs: (configs: Record<string, string>) => {
    return api.put<{
      code: number;
      message: string;
    }>('/admin/system/configs/batch', configs);
  },

  // 创建配置
  createConfig: (data: {
    key: string;
    value: string;
    description: string;
    category: string;
    type: string;
  }) => {
    return api.post<{
      code: number;
      message: string;
      data: SystemConfig;
    }>('/admin/system/configs', data);
  },

  // 删除配置
  deleteConfig: (key: string) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/admin/system/configs/${key}`);
  },

  // 获取系统日志
  getLogs: (params?: {
    limit?: number;
    offset?: number;
    level?: string;
    module?: string;
    start_time?: string;
    end_time?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    
    const queryString = queryParams.toString();
    const url = `/admin/system/logs${queryString ? `?${queryString}` : ''}`;
    
    return api.get<{
      code: number;
      message: string;
      data: {
        list: SystemLog[];
        limit: number;
        offset: number;
      };
    }>(url);
  },

  // 删除日志
  deleteLog: (id: number) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/admin/system/logs/${id}`);
  },

  // 清除日志
  clearLogs: (data: { start_time: string; end_time: string }) => {
    return api.post<{
      code: number;
      message: string;
    }>('/admin/system/logs/clear', data);
  },

  // 获取日志统计
  getLogStats: () => {
    return api.get<{
      code: number;
      message: string;
      data: {
        total: number;
        by_level: Record<string, number>;
        by_module: Record<string, number>;
        today_count: number;
      };
    }>('/admin/system/logs/stats');
  }
};

export default api;
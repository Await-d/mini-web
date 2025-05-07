import axios from 'axios';

// API基础URL
const API_BASE_URL = 'http://localhost:8080/api';

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
      data: User[];
    }>('/admin/users');
  },

  // 获取指定用户信息
  getUserByID: (id: number) => {
    return api.get<{
      code: number;
      message: string;
      data: User;
    }>(`/admin/users/${id}`);
  },
  
  // 创建用户
  createUser: (userData: Omit<User, 'id' | 'created_at' | 'updated_at'>) => {
    return api.post<{
      code: number;
      message: string;
      data: User;
    }>('/admin/users', userData);
  },
  
  // 更新用户
  updateUser: (id: number, userData: Partial<User>) => {
    return api.put<{
      code: number;
      message: string;
      data: User;
    }>(`/admin/users/${id}`, userData);
  },
  
  // 删除用户
  deleteUser: (id: number) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/admin/users/${id}`);
  },
  
  // 更改用户状态
  changeUserStatus: (id: number, status: string) => {
    return api.put<{
      code: number;
      message: string;
      data: User;
    }>(`/admin/users/${id}/status`, { status });
  },
  
  // 重置密码
  resetPassword: (id: number) => {
    return api.post<{
      code: number;
      message: string;
    }>(`/admin/users/${id}/reset-password`);
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

export default api;
import axios from 'axios';

// API基础URL - 根据环境自动配置
export const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api'  // 生产环境使用相对路径，通过Nginx代理
  : 'http://localhost:8080/api';  // 开发环境直连后端

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

// 性能监控指标类型
export interface PerformanceMetrics {
  system_load: {
    average: number;
    one_minute: number;
    five_minute: number;
    fifteen_minute: number;
  };
  cpu_usage: number;
  memory_usage: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  disk_usage: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  database_stats: {
    connections: number;
    active_connections: number;
    queries_per_second: number;
    avg_query_time: number;
    db_size: number;
  };
  network_stats: {
    active_connections: number;
    bytes_in: number;
    bytes_out: number;
    packet_loss: number;
    latency: number;
  };
  app_stats: {
    online_users: number;
    total_users: number;
    active_sessions: number;
    rdp_connections: number;
    ssh_connections: number;
    telnet_connections: number;
    requests_per_minute: number;
    avg_response_time: number;
    error_rate: number;
  };
  timestamp: string;
}



// 邮件配置类型
export interface EmailConfig {
  id: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  enable_tls: boolean;
  enable_ssl: boolean;
  test_email: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// 邮件模板类型
export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  type: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// 邮件配置API
export const emailAPI = {
  // 获取邮件配置
  getEmailConfig: () => {
    return api.get<{
      code: number;
      message: string;
      data: EmailConfig;
    }>('/admin/system/email/config');
  },

  // 更新邮件配置
  updateEmailConfig: (config: Partial<EmailConfig>) => {
    return api.put<{
      code: number;
      message: string;
      data: EmailConfig;
    }>('/admin/system/email/config', config);
  },

  // 测试邮件连接
  testEmailConnection: (config: Partial<EmailConfig>) => {
    return api.post<{
      code: number;
      message: string;
    }>('/admin/system/email/test-connection', config);
  },

  // 发送测试邮件
  sendTestEmail: (config: Partial<EmailConfig>, email: string) => {
    return api.post<{
      code: number;
      message: string;
    }>('/admin/system/email/test-send', { config, email });
  },

  // 获取邮件模板列表
  getEmailTemplates: () => {
    return api.get<{
      code: number;
      message: string;
      data: EmailTemplate[];
    }>('/admin/system/email/templates');
  },

  // 创建邮件模板
  createEmailTemplate: (template: Partial<EmailTemplate>) => {
    return api.post<{
      code: number;
      message: string;
      data: EmailTemplate;
    }>('/admin/system/email/templates', template);
  },

  // 更新邮件模板
  updateEmailTemplate: (id: number, template: Partial<EmailTemplate>) => {
    return api.put<{
      code: number;
      message: string;
      data: EmailTemplate;
    }>(`/admin/system/email/templates/${id}`, template);
  },

  // 删除邮件模板
  deleteEmailTemplate: (id: number) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/admin/system/email/templates/${id}`);
  },

  // 获取模板变量
  getEmailTemplateVariables: () => {
    return api.get<{
      code: number;
      message: string;
      data: {
        variables: Record<string, string>;
        descriptions: Record<string, string>;
        usage: string;
      };
    }>('/admin/system/email/variables');
  }
};

// SSL配置类型
export interface SSLConfig {
  id: number;
  name: string;
  domain: string;
  cert_path: string;
  key_path: string;
  cert_content: string;
  key_content: string;
  issuer: string;
  subject: string;
  not_before: string;
  not_after: string;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// SSL证书信息类型
export interface SSLCertInfo {
  subject: string;
  issuer: string;
  not_before: string;
  not_after: string;
  dns_names: string[];
  serial_number: string;
  is_valid: boolean;
  days_until_expiry: number;
}

// SSL配置API
export const sslAPI = {
  // 获取SSL配置列表
  getSSLConfigs: () => {
    return api.get<{
      code: number;
      message: string;
      data: SSLConfig[];
    }>('/admin/system/ssl/configs');
  },

  // 获取单个SSL配置
  getSSLConfig: (id: number) => {
    return api.get<{
      code: number;
      message: string;
      data: SSLConfig;
    }>(`/admin/system/ssl/configs/${id}`);
  },

  // 创建SSL配置
  createSSLConfig: (config: Partial<SSLConfig>) => {
    return api.post<{
      code: number;
      message: string;
      data: SSLConfig;
    }>('/admin/system/ssl/configs', config);
  },

  // 更新SSL配置
  updateSSLConfig: (id: number, config: Partial<SSLConfig>) => {
    return api.put<{
      code: number;
      message: string;
      data: SSLConfig;
    }>(`/admin/system/ssl/configs/${id}`, config);
  },

  // 删除SSL配置
  deleteSSLConfig: (id: number) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/admin/system/ssl/configs/${id}`);
  },

  // 启用SSL配置
  enableSSLConfig: (id: number) => {
    return api.post<{
      code: number;
      message: string;
    }>(`/admin/system/ssl/configs/${id}/enable`);
  },

  // 禁用SSL配置
  disableSSLConfig: (id: number) => {
    return api.post<{
      code: number;
      message: string;
    }>(`/admin/system/ssl/configs/${id}/disable`);
  },

  // 设置默认SSL配置
  setDefaultSSLConfig: (id: number) => {
    return api.post<{
      code: number;
      message: string;
    }>(`/admin/system/ssl/configs/${id}/default`);
  },

  // 测试SSL连接
  testSSLConnection: (data: { host: string; port: number; cert_content: string; key_content: string }) => {
    return api.post<{
      code: number;
      message: string;
    }>('/admin/system/ssl/test-connection', data);
  },

  // 解析证书信息
  parseCertificate: (certContent: string) => {
    return api.post<{
      code: number;
      message: string;
      data: SSLCertInfo;
    }>('/admin/system/ssl/parse-certificate', { cert_content: certContent });
  },

  // 获取即将过期的证书
  getExpiringCertificates: () => {
    return api.get<{
      code: number;
      message: string;
      data: SSLConfig[];
    }>('/admin/system/ssl/expiring');
  },

  // 获取SSL状态统计
  getSSLStatus: () => {
    return api.get<{
      code: number;
      message: string;
      data: {
        total: number;
        enabled: number;
        disabled: number;
        expired: number;
        expiring_soon: number;
        default_config: string;
      };
    }>('/admin/system/ssl/status');
  }
};

// Dashboard API类型定义
export interface DashboardStats {
  user_stats: {
    total_users: number;
    active_users: number;
    online_users: number;
    today_new_users: number;
    admin_users: number;
    regular_users: number;
  };
  connection_stats: {
    total_connections: number;
    ssh_connections: number;
    rdp_connections: number;
    vnc_connections: number;
    telnet_connections: number;
    today_connections: number;
    by_protocol: Record<string, number>;
  };
  session_stats: {
    total_sessions: number;
    active_sessions: number;
    today_sessions: number;
    avg_duration: number;
    completed_sessions: number;
  };
  system_status: {
    uptime: number;
    status: string;
    version: string;
    last_updated: string;
    performance: PerformanceMetrics;
  };
}

export interface SystemInfo {
  hostname: string;
  os: string;
  architecture: string;
  go_version: string;
  uptime: number;
  version: string;
  build_time: string;
}

export interface PerformanceMetrics {
  cpu_usage: {
    usage: number;
    cores: number;
    load_avg: number[];
  };
  memory_usage: {
    total: number;
    used: number;
    free: number;
    percent: number;
    go_heap: number;
    go_sys: number;
  };
  disk_usage: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  system_load: {
    average: number;
    "1min": number;
    "5min": number;
    "15min": number;
  };
  network_stats: {
    active_connections: number;
    bytes_in: number;
    bytes_out: number;
    packet_loss: number;
    latency: number;
  };
  database_stats: {
    connections: number;
    active_connections: number;
    queries_per_second: number;
    avg_query_time: number;
    db_size: number;
  };
  app_stats: {
    online_users: number;
    total_users: number;
    active_sessions: number;
    rdp_connections: number;
    ssh_connections: number;
    telnet_connections: number;
    requests_per_minute: number;
    avg_response_time: number;
    error_rate: number;
  };
}

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

export interface UserActivity {
  id: number;
  user: string;
  action: string;
  resource: string;
  timestamp: string;
  ip_address: string;
  status: string;
}

// Dashboard API
export const dashboardAPI = {
  // 获取Dashboard统计数据
  getStats: () => {
    return api.get<{
      code: number;
      message: string;
      data: DashboardStats;
    }>('/dashboard/stats');
  },

  // 获取系统状态
  getSystemStatus: () => {
    return api.get<{
      code: number;
      message: string;
      data: DashboardStats['system_status'];
    }>('/dashboard/system-status');
  },

  // 获取最近活动
  getRecentActivities: () => {
    return api.get<{
      code: number;
      message: string;
      data: UserActivity[];
    }>('/dashboard/activities');
  },

  // 获取连接统计
  getConnectionStats: () => {
    return api.get<{
      code: number;
      message: string;
      data: DashboardStats['connection_stats'];
    }>('/dashboard/connections');
  },

  // 获取用户统计
  getUserStats: () => {
    return api.get<{
      code: number;
      message: string;
      data: DashboardStats['user_stats'];
    }>('/dashboard/users');
  },

  // 获取会话统计
  getSessionStats: () => {
    return api.get<{
      code: number;
      message: string;
      data: DashboardStats['session_stats'];
    }>('/dashboard/sessions');
  }
};

// 系统API
export const systemAPI = {
  // 获取所有系统配置
  getAllConfigs: () => {
    return api.get<{
      code: number;
      message: string;
      data: SystemConfig[];
    }>('/admin/system/configs');
  },

  // 批量更新系统配置
  batchUpdateConfigs: (configs: Record<string, string>) => {
    return api.put<{
      code: number;
      message: string;
    }>('/admin/system/configs/batch', configs);
  },

  // 获取系统信息
  getSystemInfo: () => {
    return api.get<{
      code: number;
      message: string;
      data: SystemInfo;
    }>('/admin/system/info');
  },

  // 获取性能监控数据
  getPerformanceMetrics: () => {
    return api.get<{
      code: number;
      message: string;
      data: PerformanceMetrics;
    }>('/admin/system/performance');
  },

  // 获取系统日志
  getLogs: (params: {
    limit?: number;
    offset?: number;
    level?: string;
    module?: string;
    start_time?: string;
    end_time?: string;
  }) => {
    return api.get<{
      code: number;
      message: string;
      data: {
        list: SystemLog[];
        limit: number;
        offset: number;
      };
    }>('/admin/system/logs', { params });
  },

  // 获取日志统计
  getLogStats: () => {
    return api.get<{
      code: number;
      message: string;
      data: {
        total: number;
        today_count: number;
        by_level: Record<string, number>;
      };
    }>('/admin/system/logs/stats');
  },

  // 删除日志
  deleteLog: (id: number) => {
    return api.delete<{
      code: number;
      message: string;
    }>(`/admin/system/logs/${id}`);
  },

  // 清除日志
  clearLogs: (params: { start_time: string; end_time: string }) => {
    return api.post<{
      code: number;
      message: string;
    }>('/admin/system/logs/clear', params);
  },

  // 测试邮件配置
  testEmailConfig: (config: {
    host: string;
    port: number;
    username: string;
    password: string;
    to: string;
  }) => {
    return api.post<{
      code: number;
      message: string;
    }>('/admin/system/email/test', config);
  }
};

export default api;
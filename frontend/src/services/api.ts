// API基础URL
const API_BASE_URL = 'http://localhost:8080/api';

// 接口返回类型
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// 通用请求方法
async function request<T>(
  endpoint: string, 
  method: string = 'GET', 
  data?: any
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    
    // 处理非200响应
    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        message: errorData.message || `请求失败: ${response.status}`,
      };
    }
    
    // 解析响应数据
    const responseData = await response.json();
    return responseData;
  } catch (error) {
    console.error('API请求错误:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '网络请求失败',
    };
  }
}

// 用户接口
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

// 用户API
export const userApi = {
  // 获取所有用户
  getUsers: () => request<User[]>('/users'),
  
  // 获取单个用户
  getUser: (id: number) => request<User>(`/users/${id}`),
  
  // 创建用户
  createUser: (user: Omit<User, 'id'>) => request<User>('/users', 'POST', user),
  
  // 更新用户
  updateUser: (id: number, user: Partial<User>) => 
    request<User>(`/users/${id}`, 'PUT', user),
  
  // 删除用户
  deleteUser: (id: number) => request<void>(`/users/${id}`, 'DELETE'),
};

// 导出所有API
export default {
  user: userApi,
};
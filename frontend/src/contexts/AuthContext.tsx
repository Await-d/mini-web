import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { message } from 'antd';

// 用户信息接口
interface User {
  id: number;
  username: string;
  email: string;
  nickname: string;
  avatar: string;
  role: string;
  status: string;
}

// 认证上下文接口
interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

// 创建认证上下文
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 认证提供者组件
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // 初始化时检查本地存储中的用户信息和令牌
  useEffect(() => {
    const checkAuthStatus = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (token && storedUser) {
        try {
          // 尝试解析存储的用户信息
          const parsedUser = JSON.parse(storedUser);
          setCurrentUser(parsedUser);
          
          // 验证令牌的有效性（可选）
          try {
            // 获取最新的用户信息
            const response = await authAPI.getUserInfo();
            if (response.data && response.data.code === 200) {
              setCurrentUser(response.data.data);
              // 更新存储的用户信息
              localStorage.setItem('user', JSON.stringify(response.data.data));
            }
          } catch (error) {
            console.error('获取用户信息失败:', error);
            // 令牌无效，清除认证状态
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setCurrentUser(null);
          }
        } catch (error) {
          console.error('解析用户信息失败:', error);
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          setCurrentUser(null);
        }
      }
      
      setLoading(false);
    };
    
    checkAuthStatus();
  }, []);

  // 登录方法
  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    
    try {
      const response = await authAPI.login(username, password);
      
      if (response.data && response.data.code === 200) {
        const { token, user } = response.data.data;
        
        // 保存令牌和用户信息到本地存储
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // 更新状态
        setCurrentUser(user);
        setLoading(false);
        
        return true;
      } else {
        // 登录失败
        setLoading(false);
        // 传递错误消息
        throw new Error(response.data.message || '登录失败');
      }
    } catch (error) {
      console.error('登录出错:', error);
      setLoading(false);
      // 向上传递错误，让组件处理
      throw error;
    }
  };

  // 登出方法
  const logout = () => {
    // 清除本地存储和状态
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentUser(null);
    
    // 重定向到登录页
    navigate('/login');
  };

  const value = {
    currentUser,
    loading,
    login,
    logout,
    isAuthenticated: !!currentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// 自定义Hook，用于在组件中使用认证上下文
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 认证检查组件，用于保护路由
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // 未认证时重定向到登录页
      navigate('/login');
    }
  }, [isAuthenticated, loading, navigate]);
  
  if (loading) {
    return <div>加载中...</div>;
  }
  
  return isAuthenticated ? <>{children}</> : null;
};
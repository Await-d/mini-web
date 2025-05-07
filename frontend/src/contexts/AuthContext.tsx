import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// 用户信息接口
interface User {
  username: string;
  role: string;
  token: string;
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

// 模拟用户数据
const MOCK_USERS = [
  { username: 'admin', password: 'admin123', role: '管理员' },
  { username: 'user', password: 'user123', role: '普通用户' },
];

// 认证提供者组件
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化时检查本地存储中的用户信息
  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setCurrentUser(parsedUser);
      } catch (error) {
        console.error('解析用户信息失败:', error);
        localStorage.removeItem('currentUser');
      }
    }
    setLoading(false);
  }, []);

  // 登录方法
  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    
    // 模拟API请求延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 验证用户
    const user = MOCK_USERS.find(
      u => u.username === username && u.password === password
    );
    
    if (user) {
      const userData: User = {
        username: user.username,
        role: user.role,
        token: 'mock-jwt-token',
      };
      
      // 保存到状态和本地存储
      setCurrentUser(userData);
      localStorage.setItem('currentUser', JSON.stringify(userData));
      setLoading(false);
      return true;
    } else {
      setLoading(false);
      return false;
    }
  };

  // 登出方法
  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
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
  
  if (loading) {
    return <div>加载中...</div>;
  }
  
  if (!isAuthenticated) {
    // 可以重定向到登录页面，但在这里我们只返回一个提示
    return <div>请先登录</div>;
  }
  
  return <>{children}</>;
};
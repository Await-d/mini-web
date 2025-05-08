import { useState, useEffect, useCallback } from 'react';
import { userAPI } from '../services/api';
import { message } from 'antd';

// 用户类型定义
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

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取所有用户
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await userAPI.getUsers();
      if (response.data && response.data.code === 200) {
        setUsers(response.data.data);
      } else {
        const errorMsg = response.data?.message || '获取用户失败';
        setError(errorMsg);
        message.error(errorMsg);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取用户失败';
      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // 创建用户
  const createUser = useCallback(async (userData: Omit<User, 'id' | 'created_at' | 'updated_at'>) => {
    setLoading(true);
    setError(null);

    try {
      // 注意：需要在api.ts中添加createUser方法
      // const response = await userAPI.createUser(userData);
      message.error('创建用户功能尚未实现');
      return false;
      /* 
      if (response.data && response.data.code === 200) {
        setUsers(prevUsers => [...prevUsers, response.data.data as User]);
        message.success('用户创建成功');
        return true;
      } else {
        const errorMsg = response.data?.message || '创建用户失败';
        setError(errorMsg);
        message.error(errorMsg);
        return false;
      }
      */
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建用户失败';
      setError(errorMessage);
      message.error(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 更新用户
  const updateUser = useCallback(async (id: number, userData: Partial<User>) => {
    setLoading(true);
    setError(null);

    try {
      // 注意：需要在api.ts中添加updateUser方法
      // const response = await userAPI.updateUser(id, userData);
      message.error('更新用户功能尚未实现');
      return false;
      /*
      if (response.data && response.data.code === 200) {
        setUsers(prevUsers => 
          prevUsers.map(user => user.id === id ? { ...user, ...response.data.data } as User : user)
        );
        message.success('用户更新成功');
        return true;
      } else {
        const errorMsg = response.data?.message || '更新用户失败';
        setError(errorMsg);
        message.error(errorMsg);
        return false;
      }
      */
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '更新用户失败';
      setError(errorMessage);
      message.error(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 删除用户
  const deleteUser = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);

    try {
      // 注意：需要在api.ts中添加deleteUser方法
      // const response = await userAPI.deleteUser(id);
      message.error('删除用户功能尚未实现');
      return false;
      /*
      if (response.data && response.data.code === 200) {
        setUsers(prevUsers => prevUsers.filter(user => user.id !== id));
        message.success('用户删除成功');
        return true;
      } else {
        const errorMsg = response.data?.message || '删除用户失败';
        setError(errorMsg);
        message.error(errorMsg);
        return false;
      }
      */
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除用户失败';
      setError(errorMessage);
      message.error(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载用户
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser
  };
}
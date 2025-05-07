import { useState, useEffect, useCallback } from 'react';
import { userApi, User } from '../services/api';
import { message } from 'antd';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取所有用户
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await userApi.getUsers();
      if (response.success && response.data) {
        setUsers(response.data);
      } else {
        setError(response.message || '获取用户失败');
        message.error(response.message || '获取用户失败');
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
  const createUser = useCallback(async (userData: Omit<User, 'id'>) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await userApi.createUser(userData);
      if (response.success && response.data) {
        setUsers(prevUsers => [...prevUsers, response.data as User]);
        message.success('用户创建成功');
        return true;
      } else {
        setError(response.message || '创建用户失败');
        message.error(response.message || '创建用户失败');
        return false;
      }
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
      const response = await userApi.updateUser(id, userData);
      if (response.success && response.data) {
        setUsers(prevUsers => 
          prevUsers.map(user => user.id === id ? { ...user, ...response.data } as User : user)
        );
        message.success('用户更新成功');
        return true;
      } else {
        setError(response.message || '更新用户失败');
        message.error(response.message || '更新用户失败');
        return false;
      }
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
      const response = await userApi.deleteUser(id);
      if (response.success) {
        setUsers(prevUsers => prevUsers.filter(user => user.id !== id));
        message.success('用户删除成功');
        return true;
      } else {
        setError(response.message || '删除用户失败');
        message.error(response.message || '删除用户失败');
        return false;
      }
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
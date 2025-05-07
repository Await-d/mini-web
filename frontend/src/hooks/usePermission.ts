import { useAuth } from '../contexts/AuthContext';

// 权限类型
export type Permission = 
  | 'dashboard:view'
  | 'users:view'
  | 'users:create'
  | 'users:edit'
  | 'users:delete'
  | 'settings:access';

// 角色权限映射
const rolePermissions: Record<string, Permission[]> = {
  '管理员': [
    'dashboard:view',
    'users:view',
    'users:create',
    'users:edit',
    'users:delete',
    'settings:access'
  ],
  '普通用户': [
    'dashboard:view',
    'users:view'
  ]
};

export const usePermission = () => {
  const { currentUser } = useAuth();
  
  // 检查是否有权限
  const hasPermission = (permission: Permission): boolean => {
    if (!currentUser) return false;
    
    const userRole = currentUser.role;
    const permissions = rolePermissions[userRole] || [];
    
    return permissions.includes(permission);
  };
  
  // 检查是否有多个权限中的任意一个
  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some(permission => hasPermission(permission));
  };
  
  // 检查是否有所有权限
  const hasAllPermissions = (permissions: Permission[]): boolean => {
    return permissions.every(permission => hasPermission(permission));
  };
  
  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions
  };
};
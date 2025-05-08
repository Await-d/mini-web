import React, { ReactNode } from 'react';
import { usePermission, Permission } from '../../hooks/usePermission';

interface PermissionGuardProps {
  permission: Permission | Permission[];
  children: ReactNode;
  fallback?: ReactNode;
  requireAll?: boolean;
}

/**
 * 权限保护组件
 * 
 * @param permission 需要的权限或权限列表
 * @param children 有权限时显示的内容
 * @param fallback 无权限时显示的内容，默认为null（不显示）
 * @param requireAll 是否需要所有权限，默认为false（任意一个权限即可）
 */
const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission,
  children,
  fallback = null,
  requireAll = false
}) => {
  const { hasPermission, hasAllPermissions, hasAnyPermission } = usePermission();
  
  // 检查单个权限
  if (typeof permission === 'string') {
    return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
  }
  
  // 检查多个权限
  if (requireAll) {
    return hasAllPermissions(permission) ? <>{children}</> : <>{fallback}</>;
  }
  
  return hasAnyPermission(permission) ? <>{children}</> : <>{fallback}</>;
};

export default PermissionGuard;
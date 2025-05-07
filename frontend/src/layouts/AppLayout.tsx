import React, { useState, useEffect } from 'react';
import { Layout, Menu, theme, Button, Dropdown, Avatar, Space } from 'antd';
import { 
  MenuFoldOutlined, 
  MenuUnfoldOutlined, 
  HomeOutlined,
  AppstoreOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserSwitchOutlined,
  LinkOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('dashboard');
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  
  const { token } = theme.useToken();
  
  // 根据当前路径更新选中的菜单项
  useEffect(() => {
    const pathname = location.pathname;
    // 提取路径的第一部分作为当前选中的菜单项
    const path = pathname.split('/')[1] || 'dashboard';
    setSelectedKey(path);
  }, [location.pathname]);
  
  const menuItems = [
    {
      key: 'dashboard',
      icon: <HomeOutlined />,
      label: '首页',
      onClick: () => navigate('/dashboard')
    },
    {
      key: 'connections',
      icon: <LinkOutlined />,
      label: '远程连接',
      onClick: () => navigate('/connections')
    },
    {
      key: 'data',
      icon: <AppstoreOutlined />,
      label: '数据管理',
      onClick: () => navigate('/data')
    },
    {
      key: 'user',
      icon: <UserSwitchOutlined />,
      label: '用户管理',
      onClick: () => navigate('/users')
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
      onClick: () => navigate('/settings')
    }
  ];
  
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        theme="light"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 0 : '0 16px',
          color: token.colorPrimary,
          fontSize: 18,
          fontWeight: 'bold'
        }}>
          {!collapsed && 'Mini Web'}
          {collapsed && 'MW'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          style={{ borderRight: 0 }}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: 0, 
          background: token.colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          <div style={{ flex: 1 }}></div>
          <div style={{ marginRight: 24 }}>
            <Dropdown menu={{ 
              items: [
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: '个人资料',
                  onClick: () => navigate('/profile')
                },
                {
                  key: 'settings',
                  icon: <SettingOutlined />,
                  label: '系统设置',
                  onClick: () => navigate('/settings')
                },
                {
                  type: 'divider'
                },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: () => {
                    logout();
                    navigate('/login');
                  }
                }
              ]
            }}>
              <Space>
                <Avatar 
                  style={{ 
                    backgroundColor: token.colorPrimary,
                    cursor: 'pointer' 
                  }}
                  icon={<UserOutlined />}
                />
                <span>{currentUser?.username || '未登录'}</span>
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ 
          margin: '24px 16px', 
          padding: 24, 
          background: token.colorBgContainer,
          borderRadius: 6,
          minHeight: 280 
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
import React, { useState } from 'react';
import { Layout, Menu, theme, Button, Dropdown, Avatar, Space } from 'antd';
import { 
  MenuFoldOutlined, 
  MenuUnfoldOutlined, 
  HomeOutlined,
  AppstoreOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserSwitchOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { Outlet, useNavigate } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  
  const { token } = theme.useToken();
  
  const menuItems = [
    {
      key: 'dashboard',
      icon: <HomeOutlined />,
      label: '首页',
      onClick: () => navigate('/dashboard')
    },
    {
      key: 'data',
      icon: <AppstoreOutlined />,
      label: '数据管理',
      onClick: () => navigate('/data')
    },
    {
      key: 'user',
      icon: <UserOutlined />,
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
          defaultSelectedKeys={['dashboard']}
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
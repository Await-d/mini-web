import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Divider } from 'antd';
import { UserOutlined, LockOutlined, GithubOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import styles from './styles.module.css';

const { Title, Text } = Typography;

// 模拟用户数据
const MOCK_USERS = [
  { username: 'admin', password: 'admin123', role: '管理员' },
  { username: 'user', password: 'user123', role: '普通用户' },
];

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    
    // 模拟API请求延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 简单验证
    const user = MOCK_USERS.find(
      u => u.username === values.username && u.password === values.password
    );
    
    if (user) {
      // 存储用户信息到本地存储
      localStorage.setItem('currentUser', JSON.stringify({
        username: user.username,
        role: user.role,
        token: 'mock-jwt-token',
      }));
      
      message.success('登录成功！');
      navigate('/dashboard');
    } else {
      message.error('用户名或密码错误');
    }
    
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginContainer}>
        <Card bordered={false} className={styles.loginCard}>
          <div className={styles.logoContainer}>
            <div className={styles.logo}>Mini Web</div>
          </div>
          
          <Title level={2} className={styles.title}>用户登录</Title>
          <Text type="secondary" className={styles.subtitle}>
            欢迎使用Mini Web管理系统
          </Text>
          
          <Form
            name="login"
            initialValues={{ remember: true }}
            onFinish={handleLogin}
            className={styles.loginForm}
            size="large"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input 
                prefix={<UserOutlined />} 
                placeholder="用户名：admin 或 user" 
              />
            </Form.Item>
            
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password 
                prefix={<LockOutlined />} 
                placeholder="密码：admin123 或 user123" 
              />
            </Form.Item>
            
            <Form.Item>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                block
              >
                登录
              </Button>
            </Form.Item>
            
            <div className={styles.forgotContainer}>
              <a href="#">忘记密码？</a>
              <a href="#">注册账号</a>
            </div>
            
            <Divider plain>其他登录方式</Divider>
            
            <div className={styles.otherLogin}>
              <Button type="text" icon={<GithubOutlined />} size="large" />
            </div>
          </Form>
        </Card>
      </div>
      <div className={styles.copyright}>
        Copyright © {new Date().getFullYear()} Mini Web. All Rights Reserved.
      </div>
    </div>
  );
};

export default LoginPage;
import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Divider } from 'antd';
import { UserOutlined, LockOutlined, GithubOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './styles.module.css';

const { Title, Text } = Typography;

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);

    try {
      // 调用认证上下文中的登录方法
      const success = await login(values.username, values.password);

      if (success) {
        message.success('登录成功！');
        navigate('/dashboard');
      } else {
        // 登录方法返回false但没有抛出异常的情况
        message.error('登录失败，用户名或密码错误');
      }
    } catch (error: any) {
      console.error('登录失败:', error);

      // 提供更详细的错误消息
      if (error.response && error.response.data && error.response.data.message) {
        message.error(error.response.data.message);
      } else if (error.response && error.response.status === 401) {
        message.error('用户名或密码错误');
      } else {
        message.error('登录失败，请检查网络连接后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginContainer}>
        <Card variant="borderless" className={styles.loginCard}>
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
                placeholder="用户名: admin 或 user"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码: admin"
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
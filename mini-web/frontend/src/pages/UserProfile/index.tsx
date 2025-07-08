import { useState, useEffect } from 'react';
import { 
  Card, 
  Tabs, 
  Form, 
  Input, 
  Button, 
  Space, 
  message, 
  Typography, 
  Divider, 
  Alert,
  Row,
  Col,
  Descriptions
} from 'antd';
import { 
  SaveOutlined, 
  UserOutlined, 
  LockOutlined, 
  SettingOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { useAuthContext } from '../../contexts/AuthContext';
import { authAPI } from '../../services/api';
import AvatarUpload from '../../components/AvatarUpload';

const { Title, Text } = Typography;

interface ProfileFormData {
  nickname: string;
  email: string;
}

interface PasswordFormData {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

const UserProfile = () => {
  const { user, updateUser } = useAuthContext();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        nickname: user.nickname,
        email: user.email,
      });
    }
  }, [user, profileForm]);

  // 保存个人信息
  const handleSaveProfile = async (values: ProfileFormData) => {
    setSaving(true);
    
    try {
      const response = await authAPI.updateUserInfo({
        nickname: values.nickname,
        avatar: user?.avatar
      });
      
      if (response.data && response.data.code === 200) {
        // 更新用户上下文
        if (user) {
          updateUser({
            ...user,
            nickname: values.nickname,
            email: values.email
          });
        }
        message.success('个人信息已更新');
        setEditingProfile(false);
      } else {
        message.error(response.data?.message || '更新失败');
      }
    } catch (error) {
      console.error('更新个人信息失败:', error);
      message.error('更新失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  // 修改密码
  const handleChangePassword = async (values: PasswordFormData) => {
    if (values.new_password !== values.confirm_password) {
      message.error('两次输入的密码不一致');
      return;
    }

    setChangingPassword(true);
    
    try {
      const response = await authAPI.updatePassword({
        old_password: values.old_password,
        new_password: values.new_password
      });
      
      if (response.data && response.data.code === 200) {
        message.success('密码修改成功');
        passwordForm.resetFields();
      } else {
        message.error(response.data?.message || '密码修改失败');
      }
    } catch (error) {
      console.error('修改密码失败:', error);
      message.error('密码修改失败，请稍后重试');
    } finally {
      setChangingPassword(false);
    }
  };

  // 头像更新回调
  const handleAvatarChange = (avatarUrl: string) => {
    if (user) {
      updateUser({
        ...user,
        avatar: avatarUrl
      });
    }
  };

  const tabItems = [
    {
      key: 'profile',
      label: (
        <span>
          <UserOutlined />
          个人信息
        </span>
      ),
      children: (
        <Row gutter={24}>
          <Col span={8}>
            {/* 头像上传区域 */}
            <Card title="头像" size="small">
              <div style={{ textAlign: 'center' }}>
                {user && (
                  <AvatarUpload
                    userId={user.id}
                    currentAvatar={user.avatar}
                    size={120}
                    onAvatarChange={handleAvatarChange}
                  />
                )}
              </div>
            </Card>
          </Col>
          
          <Col span={16}>
            {/* 基本信息 */}
            <Card 
              title="基本信息" 
              size="small"
              extra={
                !editingProfile ? (
                  <Button 
                    type="text" 
                    icon={<EditOutlined />}
                    onClick={() => setEditingProfile(true)}
                  >
                    编辑
                  </Button>
                ) : null
              }
            >
              {!editingProfile ? (
                <Descriptions column={1} labelStyle={{ width: 80 }}>
                  <Descriptions.Item label="用户名">
                    {user?.username}
                  </Descriptions.Item>
                  <Descriptions.Item label="昵称">
                    {user?.nickname}
                  </Descriptions.Item>
                  <Descriptions.Item label="邮箱">
                    {user?.email}
                  </Descriptions.Item>
                  <Descriptions.Item label="角色">
                    {user?.role === 'admin' ? '管理员' : '普通用户'}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Form
                  form={profileForm}
                  layout="vertical"
                  onFinish={handleSaveProfile}
                >
                  <Form.Item label="用户名">
                    <Input value={user?.username} disabled />
                  </Form.Item>
                  
                  <Form.Item
                    name="nickname"
                    label="昵称"
                    rules={[{ required: true, message: '请输入昵称' }]}
                  >
                    <Input placeholder="请输入昵称" />
                  </Form.Item>
                  
                  <Form.Item label="邮箱">
                    <Input value={user?.email} disabled />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      邮箱暂时无法修改，如需更换请联系管理员
                    </Text>
                  </Form.Item>
                  
                  <Form.Item>
                    <Space>
                      <Button 
                        type="primary" 
                        htmlType="submit" 
                        icon={<CheckOutlined />}
                        loading={saving}
                      >
                        保存
                      </Button>
                      <Button 
                        icon={<CloseOutlined />}
                        onClick={() => {
                          setEditingProfile(false);
                          profileForm.setFieldsValue({
                            nickname: user?.nickname,
                            email: user?.email,
                          });
                        }}
                      >
                        取消
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
              )}
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'security',
      label: (
        <span>
          <LockOutlined />
          安全设置
        </span>
      ),
      children: (
        <Row gutter={24}>
          <Col span={12}>
            <Card title="修改密码" size="small">
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={handleChangePassword}
              >
                <Form.Item
                  name="old_password"
                  label="当前密码"
                  rules={[{ required: true, message: '请输入当前密码' }]}
                >
                  <Input.Password placeholder="请输入当前密码" />
                </Form.Item>
                
                <Form.Item
                  name="new_password"
                  label="新密码"
                  rules={[
                    { required: true, message: '请输入新密码' },
                    { min: 6, message: '密码至少6位字符' },
                    {
                      pattern: /^(?=.*[a-zA-Z])(?=.*\d)/,
                      message: '密码必须包含字母和数字'
                    }
                  ]}
                >
                  <Input.Password placeholder="请输入新密码" />
                </Form.Item>
                
                <Form.Item
                  name="confirm_password"
                  label="确认密码"
                  dependencies={['new_password']}
                  rules={[
                    { required: true, message: '请确认新密码' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('new_password') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('两次输入的密码不一致'));
                      },
                    }),
                  ]}
                >
                  <Input.Password placeholder="请再次输入新密码" />
                </Form.Item>
                
                <Form.Item>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    icon={<SaveOutlined />}
                    loading={changingPassword}
                    block
                  >
                    修改密码
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </Col>
          
          <Col span={12}>
            <Card title="安全提示" size="small">
              <Alert
                message="密码安全建议"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>密码长度至少6位字符</li>
                    <li>包含字母和数字的组合</li>
                    <li>定期更换密码</li>
                    <li>不要使用简单的密码</li>
                    <li>不要与他人分享密码</li>
                  </ul>
                }
                type="info"
                showIcon
              />
            </Card>
          </Col>
        </Row>
      ),
    }
  ];

  if (!user) {
    return (
      <Alert
        message="加载失败"
        description="无法获取用户信息，请重新登录"
        type="error"
        showIcon
      />
    );
  }

  return (
    <div className="user-profile">
      <Card variant="borderless">
        <Title level={4}>
          <SettingOutlined /> 个人设置
        </Title>
        <Text type="secondary">
          管理您的个人信息和账户安全设置
        </Text>
        
        <Divider />
        
        <Tabs defaultActiveKey="profile" items={tabItems} />
      </Card>
    </div>
  );
};

export default UserProfile;
import { useState } from 'react';
import { Card, Tabs, Form, Input, Button, Switch, Select, Space, message, Typography, Divider, Alert } from 'antd';
import { SaveOutlined, SettingOutlined, BulbOutlined, GlobalOutlined, LockOutlined } from '@ant-design/icons';
import PermissionGuard from '../../components/PermissionGuard';

const { Title, Text } = Typography;
const { Option } = Select;

const SettingsPage = () => {
  const [generalForm] = Form.useForm();
  const [appearanceForm] = Form.useForm();
  const [securityForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 模拟保存设置
  const handleSave = async (values: any) => {
    setSaving(true);
    console.log('保存设置:', values);
    
    // 模拟API请求
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    message.success('设置已保存');
    setSaving(false);
  };

  const tabItems = [
    {
      key: 'general',
      label: (
        <span>
          <SettingOutlined />
          常规设置
        </span>
      ),
      children: (
        <Form
          form={generalForm}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            siteName: 'Mini Web 管理系统',
            siteDescription: '一个基于React和Go的Web管理系统',
            pageSize: 10
          }}
        >
          <Form.Item
            name="siteName"
            label="系统名称"
            rules={[{ required: true, message: '请输入系统名称' }]}
          >
            <Input placeholder="请输入系统名称" />
          </Form.Item>
          
          <Form.Item
            name="siteDescription"
            label="系统描述"
          >
            <Input.TextArea rows={3} placeholder="请输入系统描述" />
          </Form.Item>
          
          <Form.Item
            name="pageSize"
            label="默认分页大小"
            rules={[{ required: true, message: '请选择默认分页大小' }]}
          >
            <Select>
              <Option value={5}>5条/页</Option>
              <Option value={10}>10条/页</Option>
              <Option value={20}>20条/页</Option>
              <Option value={50}>50条/页</Option>
            </Select>
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'appearance',
      label: (
        <span>
          <BulbOutlined />
          外观设置
        </span>
      ),
      children: (
        <Form
          form={appearanceForm}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            theme: 'light',
            primaryColor: '#1677ff',
            compactMode: false,
            animationEnabled: true
          }}
        >
          <Form.Item
            name="theme"
            label="主题模式"
          >
            <Select>
              <Option value="light">亮色模式</Option>
              <Option value="dark">暗色模式</Option>
              <Option value="auto">跟随系统</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="primaryColor"
            label="主题色"
          >
            <Select>
              <Option value="#1677ff">默认蓝</Option>
              <Option value="#52c41a">优雅绿</Option>
              <Option value="#fa541c">激情橙</Option>
              <Option value="#722ed1">神秘紫</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="compactMode"
            label="紧凑模式"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          
          <Form.Item
            name="animationEnabled"
            label="启用动画"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
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
        <PermissionGuard 
          permission="settings:access"
          fallback={
            <Alert
              message="权限不足"
              description="您没有访问安全设置的权限，请联系管理员。"
              type="error"
              showIcon
            />
          }
        >
          <Form
            form={securityForm}
            layout="vertical"
            onFinish={handleSave}
            initialValues={{
              passwordPolicy: 'medium',
              sessionTimeout: 30,
              loginAttempts: 5,
              twoFactorAuth: false
            }}
          >
            <Form.Item
              name="passwordPolicy"
              label="密码策略"
            >
              <Select>
                <Option value="low">低（至少6个字符）</Option>
                <Option value="medium">中（至少8个字符，包含字母和数字）</Option>
                <Option value="high">高（至少10个字符，包含大小写字母、数字和特殊字符）</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              name="sessionTimeout"
              label="会话超时时间（分钟）"
            >
              <Select>
                <Option value={15}>15分钟</Option>
                <Option value={30}>30分钟</Option>
                <Option value={60}>1小时</Option>
                <Option value={120}>2小时</Option>
                <Option value={-1}>永不超时</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              name="loginAttempts"
              label="最大登录失败次数"
            >
              <Select>
                <Option value={3}>3次</Option>
                <Option value={5}>5次</Option>
                <Option value={10}>10次</Option>
                <Option value={-1}>不限制</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              name="twoFactorAuth"
              label="启用两步验证"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </PermissionGuard>
      ),
    }
  ];

  return (
    <div className="settings-page">
      <Card bordered={false}>
        <Title level={4}>
          <SettingOutlined /> 系统设置
        </Title>
        <Text type="secondary">
          配置系统的各项参数和行为
        </Text>
        
        <Divider />
        
        <Tabs defaultActiveKey="general" items={tabItems} />
      </Card>
    </div>
  );
};

export default SettingsPage;
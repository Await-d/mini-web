import React, { useState } from 'react';
import { Form, Input, Select, InputNumber, Button, Space, Tooltip, Divider, message } from 'antd';
import { QuestionCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { Connection, ConnectionRequest, connectionAPI } from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

interface ConnectionFormProps {
  initialValues?: Connection | null;
  onSubmit: (values: ConnectionRequest) => void;
  onCancel: () => void;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({ 
  initialValues, 
  onSubmit, 
  onCancel 
}) => {
  const [form] = Form.useForm();
  const [protocol, setProtocol] = useState(initialValues?.protocol || 'ssh');
  const [testing, setTesting] = useState(false);
  
  // 获取协议默认端口
  const getDefaultPort = (protocol: string) => {
    switch (protocol) {
      case 'ssh':
        return 22;
      case 'rdp':
        return 3389;
      case 'vnc':
        return 5900;
      case 'telnet':
        return 23;
      default:
        return 22;
    }
  };
  
  // 处理协议变更
  const handleProtocolChange = (value: string) => {
    setProtocol(value);
    form.setFieldsValue({ port: getDefaultPort(value) });
  };
  
  // 测试连接
  const handleTestConnection = async () => {
    try {
      // 验证表单
      const values = await form.validateFields(['protocol', 'host', 'port', 'username', 'password']);
      
      setTesting(true);
      
      // 发送测试请求
      await connectionAPI.testConnection(values);
      
      message.success('连接测试成功！');
    } catch (error) {
      console.error('连接测试失败:', error);
      message.error('连接测试失败，请检查连接参数');
    } finally {
      setTesting(false);
    }
  };
  
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        name: initialValues?.name || '',
        protocol: initialValues?.protocol || 'ssh',
        host: initialValues?.host || '',
        port: initialValues?.port || getDefaultPort(initialValues?.protocol || 'ssh'),
        username: initialValues?.username || '',
        password: '',
        private_key: '',
        group: initialValues?.group || '',
        description: initialValues?.description || '',
      }}
      onFinish={onSubmit}
    >
      <Form.Item
        name="name"
        label="连接名称"
        rules={[{ required: true, message: '请输入连接名称' }]}
      >
        <Input placeholder="例如: 开发服务器" />
      </Form.Item>
      
      <Form.Item
        name="protocol"
        label="协议"
        rules={[{ required: true, message: '请选择协议' }]}
      >
        <Select onChange={handleProtocolChange}>
          <Option value="ssh">SSH</Option>
          <Option value="rdp">RDP (远程桌面)</Option>
          <Option value="vnc">VNC</Option>
          <Option value="telnet">Telnet</Option>
        </Select>
      </Form.Item>
      
      <Space style={{ width: '100%' }}>
        <Form.Item
          name="host"
          label="主机地址"
          rules={[{ required: true, message: '请输入主机地址' }]}
          style={{ width: '70%' }}
        >
          <Input placeholder="例如: 192.168.1.100" />
        </Form.Item>
        
        <Form.Item
          name="port"
          label="端口"
          rules={[{ required: true, message: '请输入端口' }]}
          style={{ width: '30%' }}
        >
          <InputNumber min={1} max={65535} style={{ width: '100%' }} />
        </Form.Item>
      </Space>
      
      <Form.Item
        name="username"
        label="用户名"
      >
        <Input placeholder="例如: root" />
      </Form.Item>
      
      <Form.Item
        name="password"
        label={
          <Space>
            <span>密码</span>
            <Tooltip title="密码将被加密存储">
              <QuestionCircleOutlined />
            </Tooltip>
          </Space>
        }
      >
        <Input.Password 
          placeholder="输入密码" 
          autoComplete="new-password"
        />
      </Form.Item>
      
      {protocol === 'ssh' && (
        <Form.Item
          name="private_key"
          label="SSH私钥"
        >
          <TextArea rows={4} placeholder="（可选）粘贴SSH私钥" />
        </Form.Item>
      )}
      
      <Divider dashed />
      
      <Form.Item
        name="group"
        label="分组"
      >
        <Input placeholder="例如: 开发服务器" />
      </Form.Item>
      
      <Form.Item
        name="description"
        label="描述"
      >
        <TextArea rows={2} placeholder="描述这个连接..." />
      </Form.Item>
      
      <Divider />
      
      <Form.Item>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
          <Button 
            type="default" 
            icon={<LinkOutlined />} 
            onClick={handleTestConnection}
            loading={testing}
          >
            测试连接
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

export default ConnectionForm;
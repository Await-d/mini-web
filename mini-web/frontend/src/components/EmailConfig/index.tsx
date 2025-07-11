import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Space,
  message,
  Divider,
  Typography,
  Modal,
  Table,
  Tabs,
  Tag,
  Popconfirm,
  Tooltip
} from 'antd';
import {
  MailOutlined,
  SendOutlined,
  SettingOutlined,
  ExperimentOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { emailAPI, EmailConfig, EmailTemplate } from '../../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;

interface EmailConfigComponentProps {
  onConfigChange?: (config: EmailConfig) => void;
}

const EmailConfigComponent: React.FC<EmailConfigComponentProps> = ({ onConfigChange }) => {
  const [form] = Form.useForm();
  const [templateForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [sendTestLoading, setSendTestLoading] = useState(false);
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [variablesModalVisible, setVariablesModalVisible] = useState(false);
  const [variables, setVariables] = useState<any>(null);

  // 加载邮件配置
  const loadEmailConfig = async () => {
    try {
      setLoading(true);
      const response = await emailAPI.getEmailConfig();
      if (response.data && response.data.code === 200) {
        setConfig(response.data.data);
        form.setFieldsValue(response.data.data);
        onConfigChange?.(response.data.data);
      }
    } catch (error: any) {
      console.error('加载邮件配置失败:', error);
      message.error('加载邮件配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载邮件模板
  const loadEmailTemplates = async () => {
    try {
      const response = await emailAPI.getEmailTemplates();
      if (response.data && response.data.code === 200) {
        setTemplates(response.data.data);
      }
    } catch (error: any) {
      console.error('加载邮件模板失败:', error);
      message.error('加载邮件模板失败');
    }
  };

  // 加载模板变量
  const loadTemplateVariables = async () => {
    try {
      const response = await emailAPI.getEmailTemplateVariables();
      if (response.data && response.data.code === 200) {
        setVariables(response.data.data);
      }
    } catch (error: any) {
      console.error('加载模板变量失败:', error);
      message.error('加载模板变量失败');
    }
  };

  useEffect(() => {
    loadEmailConfig();
    loadEmailTemplates();
    loadTemplateVariables();
  }, []);

  // 保存邮件配置
  const handleSaveConfig = async (values: any) => {
    try {
      setLoading(true);
      const response = await emailAPI.updateEmailConfig(values);
      if (response.data && response.data.code === 200) {
        message.success('邮件配置保存成功');
        setConfig(response.data.data);
        onConfigChange?.(response.data.data);
      } else {
        message.error(response.data?.message || '保存失败');
      }
    } catch (error: any) {
      console.error('保存邮件配置失败:', error);
      message.error('保存邮件配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 测试邮件连接
  const handleTestConnection = async () => {
    try {
      setTestLoading(true);
      const values = form.getFieldsValue();
      const response = await emailAPI.testEmailConnection(values);
      if (response.data && response.data.code === 200) {
        message.success('邮件连接测试成功');
      } else {
        message.error(response.data?.message || '连接测试失败');
      }
    } catch (error: any) {
      console.error('测试邮件连接失败:', error);
      message.error('测试邮件连接失败');
    } finally {
      setTestLoading(false);
    }
  };

  // 发送测试邮件
  const handleSendTestEmail = async () => {
    try {
      setSendTestLoading(true);
      const values = form.getFieldsValue();
      if (!values.test_email) {
        message.error('请输入测试邮箱地址');
        return;
      }
      const response = await emailAPI.sendTestEmail(values, values.test_email);
      if (response.data && response.data.code === 200) {
        message.success('测试邮件发送成功，请检查收件箱');
      } else {
        message.error(response.data?.message || '发送测试邮件失败');
      }
    } catch (error: any) {
      console.error('发送测试邮件失败:', error);
      message.error('发送测试邮件失败');
    } finally {
      setSendTestLoading(false);
    }
  };

  // 保存邮件模板
  const handleSaveTemplate = async (values: any) => {
    try {
      setLoading(true);
      let response;
      if (editingTemplate) {
        response = await emailAPI.updateEmailTemplate(editingTemplate.id, values);
      } else {
        response = await emailAPI.createEmailTemplate(values);
      }
      
      if (response.data && response.data.code === 200) {
        message.success(editingTemplate ? '模板更新成功' : '模板创建成功');
        setTemplateModalVisible(false);
        setEditingTemplate(null);
        templateForm.resetFields();
        loadEmailTemplates();
      } else {
        message.error(response.data?.message || '保存失败');
      }
    } catch (error: any) {
      console.error('保存邮件模板失败:', error);
      message.error('保存邮件模板失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除邮件模板
  const handleDeleteTemplate = async (id: number) => {
    try {
      const response = await emailAPI.deleteEmailTemplate(id);
      if (response.data && response.data.code === 200) {
        message.success('模板删除成功');
        loadEmailTemplates();
      } else {
        message.error(response.data?.message || '删除失败');
      }
    } catch (error: any) {
      console.error('删除邮件模板失败:', error);
      message.error('删除邮件模板失败');
    }
  };

  // 编辑模板
  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    templateForm.setFieldsValue(template);
    setTemplateModalVisible(true);
  };

  // 模板表格列定义
  const templateColumns = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: Record<string, { color: string; text: string }> = {
          welcome: { color: 'green', text: '欢迎邮件' },
          reset_password: { color: 'orange', text: '密码重置' },
          security_notification: { color: 'red', text: '安全通知' },
          system_notification: { color: 'blue', text: '系统通知' },
        };
        const config = typeMap[type] || { color: 'default', text: type };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '主题',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
    },
    {
      title: '默认模板',
      dataIndex: 'is_default',
      key: 'is_default',
      render: (isDefault: boolean) => (
        <Tag color={isDefault ? 'blue' : 'default'}>
          {isDefault ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: EmailTemplate) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditTemplate(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个模板吗？"
            onConfirm={() => handleDeleteTemplate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Tabs defaultActiveKey="config" type="card">
        <TabPane
          tab={
            <span>
              <SettingOutlined />
              邮件配置
            </span>
          }
          key="config"
        >
          <Card>
            <Title level={4}>
              <MailOutlined /> 邮件服务配置
            </Title>
            <Paragraph type="secondary">
              配置SMTP服务器信息，用于发送系统邮件通知。
            </Paragraph>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSaveConfig}
              initialValues={{
                smtp_port: 587,
                enable_tls: true,
                enable_ssl: false,
                is_enabled: false,
              }}
            >
              <Form.Item
                label="启用邮件服务"
                name="is_enabled"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>

              <Form.Item
                label="SMTP 主机"
                name="smtp_host"
                rules={[{ required: true, message: '请输入SMTP主机地址' }]}
              >
                <Input placeholder="例如: smtp.gmail.com" />
              </Form.Item>

              <Form.Item
                label="SMTP 端口"
                name="smtp_port"
                rules={[{ required: true, message: '请输入SMTP端口' }]}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                label="用户名"
                name="username"
              >
                <Input placeholder="SMTP认证用户名" />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
              >
                <Input.Password placeholder="SMTP认证密码" />
              </Form.Item>

              <Form.Item
                label="发件人邮箱"
                name="from_email"
                rules={[
                  { required: true, message: '请输入发件人邮箱' },
                  { type: 'email', message: '请输入有效的邮箱地址' }
                ]}
              >
                <Input placeholder="noreply@example.com" />
              </Form.Item>

              <Form.Item
                label="发件人姓名"
                name="from_name"
              >
                <Input placeholder="Mini Web System" />
              </Form.Item>

              <Form.Item
                label="启用TLS"
                name="enable_tls"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>

              <Form.Item
                label="启用SSL"
                name="enable_ssl"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>

              <Divider />

              <Title level={5}>测试配置</Title>
              <Form.Item
                label="测试邮箱"
                name="test_email"
                rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
              >
                <Input placeholder="test@example.com" />
              </Form.Item>

              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  icon={<SettingOutlined />}
                >
                  保存配置
                </Button>
                <Button
                  onClick={handleTestConnection}
                  loading={testLoading}
                  icon={<ExperimentOutlined />}
                >
                  测试连接
                </Button>
                <Button
                  onClick={handleSendTestEmail}
                  loading={sendTestLoading}
                  icon={<SendOutlined />}
                >
                  发送测试邮件
                </Button>
              </Space>
            </Form>
          </Card>
        </TabPane>

        <TabPane
          tab={
            <span>
              <EditOutlined />
              邮件模板
            </span>
          }
          key="templates"
        >
          <Card
            title="邮件模板管理"
            extra={
              <Space>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingTemplate(null);
                    templateForm.resetFields();
                    setTemplateModalVisible(true);
                  }}
                >
                  新建模板
                </Button>
                <Button
                  icon={<QuestionCircleOutlined />}
                  onClick={() => setVariablesModalVisible(true)}
                >
                  模板变量
                </Button>
              </Space>
            }
          >
            <Table
              columns={templateColumns}
              dataSource={templates}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>
      </Tabs>

      {/* 模板编辑模态框 */}
      <Modal
        title={editingTemplate ? '编辑邮件模板' : '新建邮件模板'}
        open={templateModalVisible}
        onCancel={() => {
          setTemplateModalVisible(false);
          setEditingTemplate(null);
          templateForm.resetFields();
        }}
        footer={null}
        width={800}
      >
        <Form
          form={templateForm}
          layout="vertical"
          onFinish={handleSaveTemplate}
        >
          <Form.Item
            label="模板名称"
            name="name"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="输入模板名称" />
          </Form.Item>

          <Form.Item
            label="模板类型"
            name="type"
            rules={[{ required: true, message: '请输入模板类型' }]}
          >
            <Input placeholder="例如: welcome, reset_password, notification" />
          </Form.Item>

          <Form.Item
            label="邮件主题"
            name="subject"
            rules={[{ required: true, message: '请输入邮件主题' }]}
          >
            <Input placeholder="支持变量，如：{{site_name}} - 欢迎信息" />
          </Form.Item>

          <Form.Item
            label="邮件内容"
            name="body"
            rules={[{ required: true, message: '请输入邮件内容' }]}
          >
            <TextArea
              rows={10}
              placeholder="支持变量，如：您好 {{user_name}}，欢迎使用 {{site_name}}！"
            />
          </Form.Item>

          <Form.Item
            label="设为默认模板"
            name="is_default"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                保存
              </Button>
              <Button
                onClick={() => {
                  setTemplateModalVisible(false);
                  setEditingTemplate(null);
                  templateForm.resetFields();
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 模板变量说明模态框 */}
      <Modal
        title="邮件模板变量说明"
        open={variablesModalVisible}
        onCancel={() => setVariablesModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setVariablesModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {variables && (
          <div>
            <Paragraph>{variables.usage}</Paragraph>
            <Title level={5}>可用变量：</Title>
            <Table
              size="small"
              pagination={false}
              columns={[
                {
                  title: '变量名',
                  dataIndex: 'name',
                  key: 'name',
                  render: (name) => <code>{`{{${name}}}`}</code>
                },
                {
                  title: '说明',
                  dataIndex: 'description',
                  key: 'description',
                },
                {
                  title: '示例值',
                  dataIndex: 'value',
                  key: 'value',
                  render: (value) => <Text type="secondary">{value}</Text>
                },
              ]}
              dataSource={Object.entries(variables.descriptions).map(([name, description]) => ({
                name,
                description,
                value: variables.variables[name] || '动态生成'
              }))}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EmailConfigComponent;
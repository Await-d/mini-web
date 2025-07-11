import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  message,
  Tag,
  Popconfirm,
  Tooltip,
  Alert,
  Statistic,
  Row,
  Col,
  Typography,
  Badge,
  Tabs
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  StarOutlined,
  StarFilled,
  ExperimentOutlined,
  EyeOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { sslAPI, SSLConfig, SSLCertInfo } from '../../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;

interface SSLConfigComponentProps {
  onConfigChange?: (configs: SSLConfig[]) => void;
}

const SSLConfigComponent: React.FC<SSLConfigComponentProps> = ({ onConfigChange }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<SSLConfig[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SSLConfig | null>(null);
  const [certInfoModalVisible, setCertInfoModalVisible] = useState(false);
  const [currentCertInfo, setCurrentCertInfo] = useState<SSLCertInfo | null>(null);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [testForm] = Form.useForm();
  const [testLoading, setTestLoading] = useState(false);
  const [sslStatus, setSSLStatus] = useState<any>({});

  // 加载SSL配置列表
  const loadSSLConfigs = async () => {
    try {
      setLoading(true);
      const response = await sslAPI.getSSLConfigs();
      if (response.data && response.data.code === 200) {
        setConfigs(response.data.data);
        onConfigChange?.(response.data.data);
      }
    } catch (error: any) {
      console.error('加载SSL配置失败:', error);
      message.error('加载SSL配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载SSL状态统计
  const loadSSLStatus = async () => {
    try {
      const response = await sslAPI.getSSLStatus();
      if (response.data && response.data.code === 200) {
        setSSLStatus(response.data.data);
      }
    } catch (error: any) {
      console.error('加载SSL状态失败:', error);
    }
  };

  useEffect(() => {
    loadSSLConfigs();
    loadSSLStatus();
  }, []);

  // 保存SSL配置
  const handleSaveConfig = async (values: any) => {
    try {
      setLoading(true);
      let response;
      
      if (editingConfig) {
        response = await sslAPI.updateSSLConfig(editingConfig.id, values);
      } else {
        response = await sslAPI.createSSLConfig(values);
      }
      
      if (response.data && response.data.code === 200) {
        message.success(editingConfig ? 'SSL配置更新成功' : 'SSL配置创建成功');
        setModalVisible(false);
        setEditingConfig(null);
        form.resetFields();
        loadSSLConfigs();
        loadSSLStatus();
      } else {
        message.error(response.data?.message || '保存失败');
      }
    } catch (error: any) {
      console.error('保存SSL配置失败:', error);
      message.error('保存SSL配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除SSL配置
  const handleDeleteConfig = async (id: number) => {
    try {
      const response = await sslAPI.deleteSSLConfig(id);
      if (response.data && response.data.code === 200) {
        message.success('SSL配置删除成功');
        loadSSLConfigs();
        loadSSLStatus();
      } else {
        message.error(response.data?.message || '删除失败');
      }
    } catch (error: any) {
      console.error('删除SSL配置失败:', error);
      message.error('删除SSL配置失败');
    }
  };

  // 启用/禁用SSL配置
  const handleToggleConfig = async (id: number, enabled: boolean) => {
    try {
      const response = enabled 
        ? await sslAPI.enableSSLConfig(id)
        : await sslAPI.disableSSLConfig(id);
        
      if (response.data && response.data.code === 200) {
        message.success(enabled ? 'SSL配置启用成功' : 'SSL配置禁用成功');
        loadSSLConfigs();
        loadSSLStatus();
      } else {
        message.error(response.data?.message || '操作失败');
      }
    } catch (error: any) {
      console.error('切换SSL配置状态失败:', error);
      message.error('操作失败');
    }
  };

  // 设置默认SSL配置
  const handleSetDefault = async (id: number) => {
    try {
      const response = await sslAPI.setDefaultSSLConfig(id);
      if (response.data && response.data.code === 200) {
        message.success('默认SSL配置设置成功');
        loadSSLConfigs();
        loadSSLStatus();
      } else {
        message.error(response.data?.message || '设置失败');
      }
    } catch (error: any) {
      console.error('设置默认SSL配置失败:', error);
      message.error('设置失败');
    }
  };

  // 编辑配置
  const handleEditConfig = (config: SSLConfig) => {
    setEditingConfig(config);
    form.setFieldsValue(config);
    setModalVisible(true);
  };

  // 查看证书信息
  const handleViewCertInfo = async (config: SSLConfig) => {
    try {
      const response = await sslAPI.parseCertificate(config.cert_content);
      if (response.data && response.data.code === 200) {
        setCurrentCertInfo(response.data.data);
        setCertInfoModalVisible(true);
      } else {
        message.error('解析证书信息失败');
      }
    } catch (error: any) {
      console.error('解析证书信息失败:', error);
      message.error('解析证书信息失败');
    }
  };

  // 测试SSL连接
  const handleTestConnection = async (values: any) => {
    try {
      setTestLoading(true);
      const response = await sslAPI.testSSLConnection(values);
      if (response.data && response.data.code === 200) {
        message.success('SSL连接测试成功');
      } else {
        message.error(response.data?.message || 'SSL连接测试失败');
      }
    } catch (error: any) {
      console.error('SSL连接测试失败:', error);
      message.error('SSL连接测试失败');
    } finally {
      setTestLoading(false);
    }
  };

  // 解析证书信息
  const handleParseCertificate = async () => {
    const certContent = form.getFieldValue('cert_content');
    if (!certContent) {
      message.warning('请先输入证书内容');
      return;
    }

    try {
      const response = await sslAPI.parseCertificate(certContent);
      if (response.data && response.data.code === 200) {
        const certInfo = response.data.data;
        message.success('证书解析成功');
        
        // 自动填充域名
        if (certInfo.dns_names && certInfo.dns_names.length > 0) {
          form.setFieldValue('domain', certInfo.dns_names[0]);
        }
        
        // 显示证书信息
        setCurrentCertInfo(certInfo);
        setCertInfoModalVisible(true);
      } else {
        message.error(response.data?.message || '证书解析失败');
      }
    } catch (error: any) {
      console.error('证书解析失败:', error);
      message.error('证书解析失败');
    }
  };

  // 获取证书状态标签
  const getCertStatusTag = (config: SSLConfig) => {
    const now = new Date();
    const notAfter = new Date(config.not_after);
    const daysUntilExpiry = Math.ceil((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return <Tag color="red" icon={<CloseCircleOutlined />}>已过期</Tag>;
    } else if (daysUntilExpiry <= 30) {
      return <Tag color="orange" icon={<ExclamationCircleOutlined />}>即将过期</Tag>;
    } else {
      return <Tag color="green" icon={<CheckCircleOutlined />}>有效</Tag>;
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '证书名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: SSLConfig) => (
        <Space>
          <Text strong>{name}</Text>
          {record.is_default && (
            <Tooltip title="默认证书">
              <StarFilled style={{ color: '#faad14' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '域名',
      dataIndex: 'domain',
      key: 'domain',
    },
    {
      title: '颁发者',
      dataIndex: 'issuer',
      key: 'issuer',
      ellipsis: true,
      render: (issuer: string) => (
        <Tooltip title={issuer}>
          <Text ellipsis>{issuer}</Text>
        </Tooltip>
      ),
    },
    {
      title: '有效期至',
      dataIndex: 'not_after',
      key: 'not_after',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: SSLConfig) => (
        <Space>
          {getCertStatusTag(record)}
          <Tag color={record.is_enabled ? 'blue' : 'default'}>
            {record.is_enabled ? '已启用' : '已禁用'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: SSLConfig) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewCertInfo(record)}
            size="small"
          >
            查看
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditConfig(record)}
            size="small"
          >
            编辑
          </Button>
          {!record.is_default && (
            <Button
              type="link"
              icon={<StarOutlined />}
              onClick={() => handleSetDefault(record.id)}
              size="small"
            >
              设为默认
            </Button>
          )}
          <Button
            type="link"
            onClick={() => handleToggleConfig(record.id, !record.is_enabled)}
            size="small"
          >
            {record.is_enabled ? '禁用' : '启用'}
          </Button>
          {!record.is_default && (
            <Popconfirm
              title="确定要删除这个SSL配置吗？"
              onConfirm={() => handleDeleteConfig(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
                size="small"
              >
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Tabs defaultActiveKey="configs" type="card">
        <TabPane
          tab={
            <span>
              <SafetyOutlined />
              SSL证书管理
            </span>
          }
          key="configs"
        >
          {/* 统计信息 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="总证书数"
                  value={sslStatus.total || 0}
                  prefix={<SafetyOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="已启用"
                  value={sslStatus.enabled || 0}
                  valueStyle={{ color: '#3f8600' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="即将过期"
                  value={sslStatus.expiring_soon || 0}
                  valueStyle={{ color: '#cf1322' }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="已过期"
                  value={sslStatus.expired || 0}
                  valueStyle={{ color: '#cf1322' }}
                  prefix={<CloseCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Card
            title="SSL证书列表"
            extra={
              <Space>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingConfig(null);
                    form.resetFields();
                    setModalVisible(true);
                  }}
                >
                  添加证书
                </Button>
                <Button
                  icon={<ExperimentOutlined />}
                  onClick={() => setTestModalVisible(true)}
                >
                  测试连接
                </Button>
              </Space>
            }
          >
            <Table
              columns={columns}
              dataSource={configs}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>
      </Tabs>

      {/* 添加/编辑证书模态框 */}
      <Modal
        title={editingConfig ? '编辑SSL证书' : '添加SSL证书'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingConfig(null);
          form.resetFields();
        }}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveConfig}
        >
          <Form.Item
            label="证书名称"
            name="name"
            rules={[{ required: true, message: '请输入证书名称' }]}
          >
            <Input placeholder="输入证书名称" />
          </Form.Item>

          <Form.Item
            label="绑定域名"
            name="domain"
            rules={[{ required: true, message: '请输入绑定域名' }]}
          >
            <Input placeholder="example.com" />
          </Form.Item>

          <Form.Item
            label="证书内容"
            name="cert_content"
            rules={[{ required: true, message: '请输入证书内容' }]}
            extra={
              <Space>
                <Text type="secondary">请粘贴PEM格式的证书内容</Text>
                <Button type="link" onClick={handleParseCertificate} size="small">
                  解析证书信息
                </Button>
              </Space>
            }
          >
            <TextArea
              rows={8}
              placeholder="-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----"
            />
          </Form.Item>

          <Form.Item
            label="私钥内容"
            name="key_content"
            rules={[{ required: true, message: '请输入私钥内容' }]}
            extra={<Text type="secondary">请粘贴PEM格式的私钥内容</Text>}
          >
            <TextArea
              rows={8}
              placeholder="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                保存
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingConfig(null);
                  form.resetFields();
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 证书信息查看模态框 */}
      <Modal
        title="证书信息"
        open={certInfoModalVisible}
        onCancel={() => setCertInfoModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setCertInfoModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {currentCertInfo && (
          <div>
            <Row gutter={16}>
              <Col span={24}>
                <Alert
                  message={`证书${currentCertInfo.is_valid ? '有效' : '无效'}`}
                  description={`距离过期还有 ${currentCertInfo.days_until_expiry} 天`}
                  type={currentCertInfo.is_valid && currentCertInfo.days_until_expiry > 30 ? 'success' : 'warning'}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              </Col>
            </Row>
            
            <Row gutter={16}>
              <Col span={12}>
                <Card size="small" title="基本信息">
                  <p><strong>序列号:</strong> {currentCertInfo.serial_number}</p>
                  <p><strong>有效期从:</strong> {new Date(currentCertInfo.not_before).toLocaleString()}</p>
                  <p><strong>有效期至:</strong> {new Date(currentCertInfo.not_after).toLocaleString()}</p>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="支持域名">
                  {currentCertInfo.dns_names.map((domain, index) => (
                    <Tag key={index} color="blue" style={{ margin: '2px' }}>
                      {domain}
                    </Tag>
                  ))}
                </Card>
              </Col>
            </Row>
            
            <Card size="small" title="证书主体" style={{ marginTop: 16 }}>
              <Paragraph copyable style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                {currentCertInfo.subject}
              </Paragraph>
            </Card>
            
            <Card size="small" title="颁发机构">
              <Paragraph copyable style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                {currentCertInfo.issuer}
              </Paragraph>
            </Card>
          </div>
        )}
      </Modal>

      {/* SSL连接测试模态框 */}
      <Modal
        title="SSL连接测试"
        open={testModalVisible}
        onCancel={() => {
          setTestModalVisible(false);
          testForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={testForm}
          layout="vertical"
          onFinish={handleTestConnection}
        >
          <Form.Item
            label="主机地址"
            name="host"
            rules={[{ required: true, message: '请输入主机地址' }]}
          >
            <Input placeholder="example.com" />
          </Form.Item>

          <Form.Item
            label="端口"
            name="port"
            rules={[{ required: true, message: '请输入端口' }]}
            initialValue={443}
          >
            <Input type="number" placeholder="443" />
          </Form.Item>

          <Form.Item
            label="证书内容"
            name="cert_content"
            rules={[{ required: true, message: '请输入证书内容' }]}
          >
            <TextArea rows={6} placeholder="PEM格式证书内容" />
          </Form.Item>

          <Form.Item
            label="私钥内容"
            name="key_content"
            rules={[{ required: true, message: '请输入私钥内容' }]}
          >
            <TextArea rows={6} placeholder="PEM格式私钥内容" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={testLoading}>
                测试连接
              </Button>
              <Button
                onClick={() => {
                  setTestModalVisible(false);
                  testForm.resetFields();
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SSLConfigComponent;
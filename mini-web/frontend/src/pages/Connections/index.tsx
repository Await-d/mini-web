import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Table, Card, Button, Space, Tag, Dropdown, Menu, Modal, message, Form, Input,
  Select, InputNumber, Tabs, Tooltip, Divider
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined,
  ExclamationCircleOutlined, MoreOutlined, PlayCircleOutlined,
  DatabaseOutlined, DesktopOutlined, CloudServerOutlined, ApiOutlined
} from '@ant-design/icons';
import { connectionAPI, sessionAPI } from '../../services/api';
import type { Connection, ConnectionRequest } from '../../services/api';
import ConnectionForm from './ConnectionForm';
import ConnectionDetail from './ConnectionDetail';
import styles from './styles.module.css';

const { Title } = Typography;
const { confirm } = Modal;

const ConnectionsPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentConnection, setCurrentConnection] = useState<Connection | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  // 加载连接列表
  const fetchConnections = async () => {
    setLoading(true);
    try {
      const response = await connectionAPI.getConnections();
      if (response.data && response.data.code === 200) {
        setConnections(response.data.data || []);
      }
    } catch (error) {
      console.error('获取连接列表失败:', error);
      message.error('获取连接列表失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  // 处理连接创建/编辑
  const handleSaveConnection = async (values: ConnectionRequest) => {
    try {
      if (currentConnection) {
        // 更新现有连接
        await connectionAPI.updateConnection(currentConnection.id, values);
        message.success('连接更新成功');
      } else {
        // 创建新连接
        await connectionAPI.createConnection(values);
        message.success('连接创建成功');
      }
      setEditModalVisible(false);
      fetchConnections();
    } catch (error) {
      console.error('保存连接失败:', error);
      message.error('保存连接失败，请稍后再试');
    }
  };

  // 处理连接删除
  const handleDeleteConnection = (connection: Connection) => {
    confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除连接 "${connection.name}" 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await connectionAPI.deleteConnection(connection.id);
          message.success('连接删除成功');
          fetchConnections();
        } catch (error) {
          console.error('删除连接失败:', error);
          message.error('删除连接失败，请稍后再试');
        }
      },
    });
  };

  // 处理连接
  const handleConnect = (connection: Connection) => {
    message.info(`正在连接到 ${connection.name}...`);
    
    // 创建会话
    sessionAPI.createSession(connection.id)
      .then(response => {
        if (response.data && response.data.code === 200) {
          const sessionId = response.data.data.id;
          
          // 保存更详细的会话信息到localStorage，便于页面刷新时恢复
          localStorage.setItem('current_terminal_session', JSON.stringify({
            connectionId: connection.id,
            sessionId: sessionId,
            connectionProtocol: connection.protocol,
            connectionName: connection.name,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            isConnected: false,
            lastActive: new Date().toISOString(),
            timestamp: new Date().getTime()
          }));
          
          // 使用操作模式布局路由
          navigate(`/terminal/${connection.id}?session=${sessionId}`);
        } else {
          message.error('创建会话失败');
        }
      })
      .catch(error => {
        console.error('创建会话失败:', error);
        message.error('创建会话失败，请稍后再试');
      });
  };

  // 处理查看连接详情
  const handleViewDetails = (connection: Connection) => {
    setCurrentConnection(connection);
    setDetailModalVisible(true);
  };

  // 处理编辑连接
  const handleEditConnection = (connection: Connection) => {
    setCurrentConnection(connection);
    setEditModalVisible(true);
  };

  // 渲染协议图标
  const renderProtocolIcon = (protocol: string) => {
    switch (protocol) {
      case 'ssh':
        return <CloudServerOutlined style={{ color: '#52c41a' }} />;
      case 'rdp':
        return <DesktopOutlined style={{ color: '#1677ff' }} />;
      case 'vnc':
        return <DatabaseOutlined style={{ color: '#722ed1' }} />;
      case 'telnet':
        return <ApiOutlined style={{ color: '#fa8c16' }} />;
      default:
        return <LinkOutlined />;
    }
  };

  // 表格列配置
  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Connection) => (
        <Space>
          {renderProtocolIcon(record.protocol)}
          <a onClick={() => handleViewDetails(record)}>{text}</a>
        </Space>
      ),
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      render: (protocol: string) => {
        let color = '';
        switch (protocol) {
          case 'ssh':
            color = 'green';
            break;
          case 'rdp':
            color = 'blue';
            break;
          case 'vnc':
            color = 'purple';
            break;
          case 'telnet':
            color = 'orange';
            break;
          default:
            color = 'default';
        }
        return <Tag color={color}>{protocol.toUpperCase()}</Tag>;
      },
    },
    {
      title: '主机',
      dataIndex: 'host',
      key: 'host',
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '分组',
      dataIndex: 'group',
      key: 'group',
      render: (group: string) => group || '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Connection) => (
        <Space size="small">
          <Tooltip title="连接">
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              size="small"
              onClick={() => handleConnect(record)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEditConnection(record)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => handleDeleteConnection(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // 过滤连接列表
  const getFilteredConnections = () => {
    if (activeTab === 'all') {
      return connections;
    }
    return connections.filter(conn => conn.protocol === activeTab);
  };

  // 定义Tabs的items
  const tabItems = [
    {
      key: 'all',
      label: '全部',
    },
    {
      key: 'rdp',
      label: (
        <Space>
          <DesktopOutlined />
          RDP
        </Space>
      ),
    },
    {
      key: 'ssh',
      label: (
        <Space>
          <CloudServerOutlined />
          SSH
        </Space>
      ),
    },
    {
      key: 'vnc',
      label: (
        <Space>
          <DatabaseOutlined />
          VNC
        </Space>
      ),
    },
    {
      key: 'telnet',
      label: (
        <Space>
          <ApiOutlined />
          Telnet
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={3}>远程连接</Title>
        <Space>
          <Tooltip title="在专注模式下操作远程连接，提供更多工作空间">
          <Button
            icon={<DesktopOutlined />}
            onClick={() => navigate('/terminal')}
            type="primary"
            ghost
          >
            操作模式
          </Button>
        </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCurrentConnection(null);
              setEditModalVisible(true);
            }}
          >
            添加连接
          </Button>
        </Space>
      </div>

      <Card variant="borderless">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

        <div className={styles.tabContent}>
          <Table
            dataSource={getFilteredConnections()}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
          />
        </div>
      </Card>

      {/* 表单模态框 */}
      <Modal
        title={currentConnection ? '编辑连接' : '添加连接'}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
        destroyOnClose
        width={700}
      >
        <ConnectionForm
          initialValues={currentConnection}
          onSubmit={handleSaveConnection}
          onCancel={() => setEditModalVisible(false)}
        />
      </Modal>

      {/* 详情模态框 */}
      <Modal
        title="连接详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          <Button
            key="edit"
            type="primary"
            onClick={() => {
              setDetailModalVisible(false);
              setEditModalVisible(true);
            }}
          >
            编辑
          </Button>
        ]}
        width={600}
      >
        {currentConnection && (
          <ConnectionDetail connection={currentConnection} />
        )}
      </Modal>
    </div>
  );
};

export default ConnectionsPage;
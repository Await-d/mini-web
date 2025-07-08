import React, { useState, useEffect } from 'react';
import { Typography, Table, Card, Button, Space, Tag, Tooltip, Modal, message, Badge } from 'antd';
import { 
  ReloadOutlined, EyeOutlined, StopOutlined, ClockCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { Session, sessionAPI, connectionAPI, Connection } from '../../services/api';
import styles from './styles.module.css';

const { Title } = Typography;
const { confirm } = Modal;

const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [connections, setConnections] = useState<Record<number, Connection>>({});
  const [loading, setLoading] = useState(false);
  
  // 加载会话列表
  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await sessionAPI.getSessions();
      if (response.data && response.data.code === 200) {
        setSessions(response.data.data || []);
      }
    } catch (error) {
      console.error('获取会话列表失败:', error);
      message.error('获取会话列表失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };
  
  // 加载连接信息
  const fetchConnections = async () => {
    try {
      const response = await connectionAPI.getConnections();
      if (response.data && response.data.code === 200) {
        const connectionsMap: Record<number, Connection> = {};
        response.data.data.forEach((conn: Connection) => {
          connectionsMap[conn.id] = conn;
        });
        setConnections(connectionsMap);
      }
    } catch (error) {
      console.error('获取连接列表失败:', error);
    }
  };
  
  useEffect(() => {
    fetchSessions();
    fetchConnections();
  }, []);
  
  // 获取连接名称
  const getConnectionName = (connectionId: number) => {
    return connections[connectionId]?.name || `连接 #${connectionId}`;
  };
  
  // 获取连接协议
  const getConnectionProtocol = (connectionId: number) => {
    return connections[connectionId]?.protocol.toUpperCase() || '-';
  };
  
  // 格式化时间
  const formatTime = (timeString: string) => {
    if (!timeString) return '-';
    return new Date(timeString).toLocaleString();
  };
  
  // 格式化持续时间
  const formatDuration = (seconds: number) => {
    if (!seconds) return '-';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainSeconds = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainSeconds.toString().padStart(2, '0')}`;
  };
  
  // 关闭会话
  const handleCloseSession = (session: Session) => {
    if (session.status !== 'active') {
      message.info('会话已关闭');
      return;
    }
    
    confirm({
      title: '确认关闭会话',
      icon: <ExclamationCircleOutlined />,
      content: `确定要关闭会话 #${session.id} 吗？`,
      okText: '关闭',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await sessionAPI.closeSession(session.id);
          message.success('会话已关闭');
          fetchSessions();
        } catch (error) {
          console.error('关闭会话失败:', error);
          message.error('关闭会话失败，请稍后再试');
        }
      },
    });
  };
  
  // 查看会话详情
  const handleViewSessionDetails = (session: Session) => {
    Modal.info({
      title: '会话详情',
      width: 600,
      content: (
        <div>
          <p><strong>会话ID:</strong> {session.id}</p>
          <p><strong>连接:</strong> {getConnectionName(session.connection_id)} ({getConnectionProtocol(session.connection_id)})</p>
          <p><strong>开始时间:</strong> {formatTime(session.start_time)}</p>
          <p><strong>结束时间:</strong> {formatTime(session.end_time)}</p>
          <p><strong>持续时间:</strong> {formatDuration(session.duration)}</p>
          <p><strong>状态:</strong> {session.status === 'active' ? '活动' : '已关闭'}</p>
          <p><strong>客户端IP:</strong> {session.client_ip}</p>
          <p><strong>服务器IP:</strong> {session.server_ip}</p>
          {session.log_path && <p><strong>日志路径:</strong> {session.log_path}</p>}
        </div>
      ),
      onOk() {},
    });
  };
  
  // 表格列配置
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: '连接名称',
      key: 'connection',
      render: (_: any, record: Session) => getConnectionName(record.connection_id),
    },
    {
      title: '协议',
      key: 'protocol',
      render: (_: any, record: Session) => {
        const protocol = getConnectionProtocol(record.connection_id);
        let color = '';
        switch (protocol) {
          case 'SSH':
            color = 'green';
            break;
          case 'RDP':
            color = 'blue';
            break;
          case 'VNC':
            color = 'purple';
            break;
          case 'TELNET':
            color = 'orange';
            break;
          default:
            color = 'default';
        }
        return <Tag color={color}>{protocol}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <>
          {status === 'active' ? (
            <Badge status="processing" text="活动" />
          ) : (
            <Badge status="default" text="已关闭" />
          )}
        </>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (time: string) => formatTime(time),
    },
    {
      title: '持续时间',
      dataIndex: 'duration',
      key: 'duration',
      render: (duration: number, record: Session) => {
        if (record.status === 'active') {
          return <ClockCircleOutlined style={{ color: '#1677ff' }} />;
        }
        return formatDuration(duration);
      },
    },
    {
      title: '客户端IP',
      dataIndex: 'client_ip',
      key: 'client_ip',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Session) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button 
              icon={<EyeOutlined />} 
              size="small"
              onClick={() => handleViewSessionDetails(record)}
            />
          </Tooltip>
          {record.status === 'active' && (
            <Tooltip title="关闭会话">
              <Button 
                danger 
                icon={<StopOutlined />} 
                size="small"
                onClick={() => handleCloseSession(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={3}>会话管理</Title>
        <Button 
          icon={<ReloadOutlined />}
          onClick={fetchSessions}
        >
          刷新
        </Button>
      </div>
      
      <Card variant="borderless">
        <Table 
          columns={columns} 
          dataSource={sessions} 
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default SessionsPage;
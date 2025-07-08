import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, 
  Descriptions, 
  Button, 
  Space, 
  Spin, 
  Alert, 
  Tag, 
  Avatar, 
  Table, 
  Typography,
  Divider
} from 'antd';
import { 
  ArrowLeftOutlined, 
  EditOutlined, 
  UserOutlined,
  MailOutlined,
  CalendarOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { userAPI } from '../../services/api';
import { User } from '../../hooks/useUsers';
import AvatarUpload from '../../components/AvatarUpload';

const { Title, Text } = Typography;

interface UserActivity {
  id: number;
  action: string;
  resource: string;
  details: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

const UserDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取用户详情
  const fetchUserDetail = async () => {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await userAPI.getUserByID(parseInt(id));
      if (response.data && response.data.code === 200) {
        setUser(response.data.data);
      } else {
        setError(response.data?.message || '获取用户详情失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取用户详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取用户活动日志
  const fetchUserActivities = async () => {
    if (!id) return;
    
    setActivitiesLoading(true);
    
    try {
      const response = await userAPI.getUserActivities(parseInt(id), 1, 50);
      if (response.data && response.data.code === 200) {
        setActivities(response.data.data.list || []);
      }
    } catch (err) {
      console.error('获取用户活动日志失败:', err);
    } finally {
      setActivitiesLoading(false);
    }
  };

  useEffect(() => {
    fetchUserDetail();
    fetchUserActivities();
  }, [id]);

  // 活动日志表格列配置
  const activityColumns = [
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 100,
    },
    {
      title: '资源',
      dataIndex: 'resource',
      key: 'resource',
      width: 120,
    },
    {
      title: '详情',
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 130,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (time: string) => new Date(time).toLocaleString(),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="加载用户详情中..." />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="加载失败"
        description={error}
        type="error"
        showIcon
        action={
          <Button size="small" onClick={() => navigate('/users')}>
            返回用户列表
          </Button>
        }
      />
    );
  }

  if (!user) {
    return (
      <Alert
        message="用户不存在"
        description="未找到指定的用户信息"
        type="warning"
        showIcon
        action={
          <Button size="small" onClick={() => navigate('/users')}>
            返回用户列表
          </Button>
        }
      />
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/users')}
          >
            返回
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            用户详情
          </Title>
        </Space>
        
        <Button 
          type="primary" 
          icon={<EditOutlined />}
          onClick={() => {
            // 这里可以打开编辑模态框或跳转到编辑页面
            console.log('编辑用户:', user.id);
          }}
        >
          编辑用户
        </Button>
      </div>

      {/* 用户基本信息卡片 */}
      <Card title="基本信息" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          {/* 用户头像 */}
          <div style={{ textAlign: 'center' }}>
            <AvatarUpload
              userId={user.id}
              currentAvatar={user.avatar}
              size={120}
              onAvatarChange={(avatarUrl) => {
                setUser(prev => prev ? { ...prev, avatar: avatarUrl } : null);
              }}
            />
            <div style={{ marginTop: 16 }}>
              <Text strong>{user.nickname}</Text>
              <br />
              <Text type="secondary">@{user.username}</Text>
            </div>
          </div>
          
          {/* 用户详细信息 */}
          <div style={{ flex: 1 }}>
            <Descriptions column={2} labelStyle={{ width: 120 }}>
              <Descriptions.Item label="用户ID">
                {user.id}
              </Descriptions.Item>
              <Descriptions.Item label="用户名">
                {user.username}
              </Descriptions.Item>
              <Descriptions.Item label="昵称">
                {user.nickname}
              </Descriptions.Item>
              <Descriptions.Item label="邮箱">
                <Space>
                  <MailOutlined />
                  {user.email}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="角色">
                <Tag color={user.role === 'admin' ? 'red' : 'blue'}>
                  {user.role === 'admin' ? '管理员' : '普通用户'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={user.status === 'active' ? 'green' : 'red'}>
                  {user.status === 'active' ? '活跃' : '停用'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                <Space>
                  <CalendarOutlined />
                  {new Date(user.created_at).toLocaleString()}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                <Space>
                  <ClockCircleOutlined />
                  {new Date(user.updated_at).toLocaleString()}
                </Space>
              </Descriptions.Item>
              {user.last_login_at && (
                <Descriptions.Item label="最后登录">
                  <Space>
                    <ClockCircleOutlined />
                    {new Date(user.last_login_at).toLocaleString()}
                  </Space>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="登录次数">
                {user.login_count || 0} 次
              </Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      </Card>

      {/* 活动日志卡片 */}
      <Card 
        title="活动日志" 
        extra={
          <Button 
            size="small" 
            onClick={fetchUserActivities}
            loading={activitiesLoading}
          >
            刷新
          </Button>
        }
      >
        <Table
          columns={activityColumns}
          dataSource={activities}
          rowKey="id"
          loading={activitiesLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          scroll={{ x: 800 }}
          locale={{
            emptyText: '暂无活动记录'
          }}
        />
      </Card>
    </div>
  );
};

export default UserDetail;
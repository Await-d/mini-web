import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Typography, Statistic, Button, Spin, message, Timeline, Progress, Space } from 'antd';
import { 
  UserOutlined, 
  TeamOutlined, 
  DesktopOutlined, 
  ClockCircleOutlined, 
  ArrowUpOutlined, 
  ArrowDownOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  WifiOutlined,
  UserSwitchOutlined,
  LinkOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { dashboardAPI, DashboardStats, UserActivity } from '../services/api';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // 加载Dashboard数据
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsResponse, activitiesResponse] = await Promise.all([
        dashboardAPI.getStats(),
        dashboardAPI.getRecentActivities()
      ]);

      if (statsResponse.data && statsResponse.data.code === 200) {
        setStats(statsResponse.data.data);
      }

      if (activitiesResponse.data && activitiesResponse.data.code === 200) {
        setActivities(activitiesResponse.data.data);
      }
    } catch (error) {
      message.error('加载Dashboard数据失败');
      console.error('Dashboard数据加载错误:', error);
    } finally {
      setLoading(false);
    }
  };

  // 手动刷新
  const handleRefresh = () => {
    loadDashboardData();
  };

  // 切换自动刷新
  const toggleAutoRefresh = () => {
    if (autoRefresh) {
      // 关闭自动刷新
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
      setAutoRefresh(false);
    } else {
      // 开启自动刷新，每30秒刷新一次
      const interval = setInterval(() => {
        loadDashboardData();
      }, 30000);
      setRefreshInterval(interval);
      setAutoRefresh(true);
    }
  };

  // 格式化字节数
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化运行时间
  const formatUptime = (hours: number): string => {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    return `${days}天${remainingHours}小时`;
  };

  useEffect(() => {
    loadDashboardData();
    
    // 组件卸载时清理定时器
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>仪表盘</Title>
        <Space>
          <Button
            type={autoRefresh ? 'primary' : 'default'}
            icon={<ClockCircleOutlined />}
            onClick={toggleAutoRefresh}
          >
            {autoRefresh ? '关闭自动刷新' : '开启自动刷新'}
          </Button>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
          >
            手动刷新
          </Button>
        </Space>
      </div>
      
      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card variant="borderless" hoverable>
            <Statistic 
              title="用户总数" 
              value={stats?.user_stats.total_users || 0} 
              prefix={<UserOutlined />} 
              valueStyle={{ color: '#1677ff' }}
              suffix={
                <span style={{ fontSize: '12px', color: '#666' }}>
                  <Text type="secondary">在线: {stats?.user_stats.online_users || 0}</Text>
                </span>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card variant="borderless" hoverable>
            <Statistic 
              title="连接总数" 
              value={stats?.connection_stats.total_connections || 0} 
              prefix={<LinkOutlined />} 
              valueStyle={{ color: '#52c41a' }}
              suffix={
                <span style={{ fontSize: '12px', color: '#666' }}>
                  <Text type="secondary">今日: {stats?.connection_stats.today_connections || 0}</Text>
                </span>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card variant="borderless" hoverable>
            <Statistic 
              title="活跃会话" 
              value={stats?.session_stats.active_sessions || 0} 
              prefix={<DesktopOutlined />} 
              valueStyle={{ color: '#722ed1' }}
              suffix={
                <span style={{ fontSize: '12px', color: '#666' }}>
                  <Text type="secondary">总计: {stats?.session_stats.total_sessions || 0}</Text>
                </span>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card variant="borderless" hoverable>
            <Statistic 
              title="平均会话时长" 
              value={stats?.session_stats.avg_duration || 0} 
              prefix={<ClockCircleOutlined />}
              precision={1}
              suffix="分钟"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>
      
      {/* 系统状态和活动 */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={12}>
          <Card 
            title="最近活动" 
            variant="borderless"
            styles={{ header: { borderBottom: '1px solid #f0f0f0' } }}
            extra={<EyeOutlined />}
          >
            <Timeline
              size="small"
              items={activities.slice(0, 5).map((activity, index) => ({
                color: activity.status === 'success' ? 'green' : 'red',
                children: (
                  <div key={index}>
                    <Text strong>{activity.user}</Text> {activity.action}
                    <br />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {activity.resource} • {activity.timestamp} • {activity.ip_address}
                    </Text>
                  </div>
                ),
              }))}
            />
            {activities.length === 0 && (
              <Text type="secondary">暂无最近活动</Text>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card 
            title="系统概况" 
            variant="borderless" 
            styles={{ header: { borderBottom: '1px solid #f0f0f0' } }}
            extra={<DatabaseOutlined />}
          >
            {stats?.system_status.performance && (
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text>CPU使用率</Text>
                  <Progress 
                    percent={Math.round(stats.system_status.performance.cpu_usage.usage)} 
                    size="small"
                    status={stats.system_status.performance.cpu_usage.usage > 80 ? 'exception' : 'normal'}
                  />
                </div>
                <div>
                  <Text>内存使用率</Text>
                  <Progress 
                    percent={Math.round(stats.system_status.performance.memory_usage.percent)} 
                    size="small"
                    status={stats.system_status.performance.memory_usage.percent > 80 ? 'exception' : 'normal'}
                  />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {formatBytes(stats.system_status.performance.memory_usage.used)} / {formatBytes(stats.system_status.performance.memory_usage.total)}
                  </Text>
                </div>
                <div>
                  <Text>磁盘使用率</Text>
                  <Progress 
                    percent={Math.round(stats.system_status.performance.disk_usage.percent)} 
                    size="small"
                    status={stats.system_status.performance.disk_usage.percent > 80 ? 'exception' : 'normal'}
                  />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {formatBytes(stats.system_status.performance.disk_usage.used)} / {formatBytes(stats.system_status.performance.disk_usage.total)}
                  </Text>
                </div>
                <div>
                  <Text>系统运行时间: </Text>
                  <Text strong>{formatUptime(stats.system_status.uptime)}</Text>
                </div>
                <div>
                  <Text>版本: </Text>
                  <Text strong>{stats.system_status.version}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({stats.system_status.status === 'running' ? 
                      <><CheckCircleOutlined style={{ color: '#52c41a' }} /> 运行正常</> : 
                      <><WarningOutlined style={{ color: '#faad14' }} /> 状态异常</>
                    })
                  </Text>
                </div>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* 连接协议统计 */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24}>
          <Card 
            title="连接协议分布" 
            variant="borderless"
            styles={{ header: { borderBottom: '1px solid #f0f0f0' } }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Statistic
                  title="SSH"
                  value={stats?.connection_stats.ssh_connections || 0}
                  prefix={<WifiOutlined style={{ color: '#1677ff' }} />}
                  valueStyle={{ color: '#1677ff' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="RDP"
                  value={stats?.connection_stats.rdp_connections || 0}
                  prefix={<DesktopOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="VNC"
                  value={stats?.connection_stats.vnc_connections || 0}
                  prefix={<EyeOutlined style={{ color: '#722ed1' }} />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Telnet"
                  value={stats?.connection_stats.telnet_connections || 0}
                  prefix={<UserSwitchOutlined style={{ color: '#fa541c' }} />}
                  valueStyle={{ color: '#fa541c' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
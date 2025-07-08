import React from 'react';
import { Descriptions, Tag, Typography, Divider, Space } from 'antd';
import { 
  CloudServerOutlined, DesktopOutlined, 
  DatabaseOutlined, ApiOutlined, LinkOutlined 
} from '@ant-design/icons';
import { Connection } from '../../services/api';

const { Text } = Typography;

interface ConnectionDetailProps {
  connection: Connection;
}

const ConnectionDetail: React.FC<ConnectionDetailProps> = ({ connection }) => {
  // 获取协议图标
  const getProtocolIcon = () => {
    switch (connection.protocol) {
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
  
  // 获取协议标签颜色
  const getProtocolColor = () => {
    switch (connection.protocol) {
      case 'ssh':
        return 'green';
      case 'rdp':
        return 'blue';
      case 'vnc':
        return 'purple';
      case 'telnet':
        return 'orange';
      default:
        return 'default';
    }
  };
  
  // 格式化日期时间
  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };
  
  return (
    <div>
      <Descriptions title={<Space>{getProtocolIcon()} {connection.name}</Space>} bordered column={1}>
        <Descriptions.Item label="协议">
          <Tag color={getProtocolColor()}>{connection.protocol.toUpperCase()}</Tag>
        </Descriptions.Item>
        
        <Descriptions.Item label="连接地址">
          <Text copyable>{`${connection.host}:${connection.port}`}</Text>
        </Descriptions.Item>
        
        <Descriptions.Item label="用户名">
          {connection.username || '-'}
        </Descriptions.Item>
        
        <Descriptions.Item label="分组">
          {connection.group || '-'}
        </Descriptions.Item>
        
        <Descriptions.Item label="描述">
          {connection.description || '-'}
        </Descriptions.Item>
        
        <Descriptions.Item label="上次使用">
          {formatDateTime(connection.last_used) || '从未使用'}
        </Descriptions.Item>
        
        <Descriptions.Item label="创建时间">
          {formatDateTime(connection.created_at)}
        </Descriptions.Item>
      </Descriptions>
      
      <Divider />
      
      <Typography.Paragraph>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          提示: 点击"连接"按钮打开远程会话。所有会话活动将被记录用于安全审计。
        </Typography.Text>
      </Typography.Paragraph>
    </div>
  );
};

export default ConnectionDetail;
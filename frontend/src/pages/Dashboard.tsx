import React from 'react';
import { Row, Col, Card, Typography, Statistic } from 'antd';
import { UserOutlined, ShoppingOutlined, FileOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const { Title } = Typography;

const Dashboard: React.FC = () => {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>仪表盘</Title>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} hoverable>
            <Statistic 
              title="用户总数" 
              value={1254} 
              prefix={<UserOutlined />} 
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} hoverable>
            <Statistic 
              title="总订单" 
              value={8846} 
              prefix={<ShoppingOutlined />} 
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} hoverable>
            <Statistic 
              title="文件数" 
              value={572} 
              prefix={<FileOutlined />} 
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} hoverable>
            <Statistic 
              title="销售额" 
              value={9280} 
              prefix="¥" 
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              suffix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
      </Row>
      
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={12}>
          <Card 
            title="最近活动" 
            bordered={false}
            headStyle={{ borderBottom: '1px solid #f0f0f0' }}
          >
            <p>用户登录系统 - 10分钟前</p>
            <p>新订单 #12345 已创建 - 25分钟前</p>
            <p>用户更新了个人资料 - 1小时前</p>
            <p>系统备份已完成 - 3小时前</p>
            <p>新用户注册 - 5小时前</p>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card 
            title="系统概况" 
            bordered={false} 
            headStyle={{ borderBottom: '1px solid #f0f0f0' }}
          >
            <p>CPU使用率: 32% <ArrowDownOutlined style={{ color: '#52c41a' }} /></p>
            <p>内存使用率: 65% <ArrowUpOutlined style={{ color: '#faad14' }} /></p>
            <p>磁盘空间: 756GB/1TB</p>
            <p>系统运行时间: 15天</p>
            <p>上次维护: 2024-05-01</p>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
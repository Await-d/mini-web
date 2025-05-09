import React from 'react';
import { Button, Typography, Card, Space, Row, Col } from 'antd';
import {
  CodeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LinkOutlined,
  DesktopOutlined
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import styles from '../styles.module.css';

const { Title, Paragraph, Text } = Typography;

interface TerminalGuideProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

const TerminalGuide: React.FC<TerminalGuideProps> = ({
  onToggleSidebar,
  sidebarCollapsed
}) => {
  return (
    <div className={styles.terminalGuide}>
      <div className={styles.guideContent}>
        <Typography>
          <Title level={2}>欢迎使用 Mini Web 远程终端</Title>
          <Paragraph>
            从左侧选择一个连接，或创建一个新的连接来开始使用。
          </Paragraph>
        </Typography>

        <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
          <Col xs={24} sm={12}>
            <Card title="快速操作" className={styles.guideCard}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  block
                >
                  <Link to="/connections">管理连接</Link>
                </Button>
                <Button
                  icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={onToggleSidebar}
                  block
                >
                  {sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
                </Button>
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card title="支持的协议" className={styles.guideCard}>
              <ul className={styles.protocolList}>
                <li>
                  <CodeOutlined /> <Text strong>SSH</Text> - 安全外壳协议
                </li>
                <li>
                  <DesktopOutlined /> <Text strong>RDP</Text> - 远程桌面协议
                </li>
                <li>
                  <DesktopOutlined /> <Text strong>VNC</Text> - 虚拟网络计算
                </li>
                <li>
                  <CodeOutlined /> <Text strong>Telnet</Text> - 远程登录协议
                </li>
              </ul>
            </Card>
          </Col>
        </Row>

        <Card title="使用技巧" className={styles.guideCard} style={{ marginTop: '16px' }}>
          <ul className={styles.tipsList}>
            <li>使用<Text keyboard>Ctrl+C</Text>复制选中的文本</li>
            <li>使用<Text keyboard>Ctrl+V</Text>粘贴文本</li>
            <li>使用<Text keyboard>F11</Text>或点击全屏按钮进入/退出全屏模式</li>
            <li>点击"批量命令"按钮可以执行预定义的命令序列</li>
            <li>使用多标签页同时管理多个连接</li>
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default TerminalGuide;
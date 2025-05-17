import React from 'react';
import { Empty, Typography, Card, Steps, Button } from 'antd';
import { LinkOutlined, CodeOutlined, BulbOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Paragraph, Text } = Typography;
const { Step } = Steps;

/**
 * 空终端引导组件
 * 在没有打开终端标签时显示
 */
const EmptyTerminalGuide: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div style={{ padding: '40px 20px', maxWidth: '900px', margin: '0 auto' }}>
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span>没有打开的终端连接</span>}
            >
                <Button type="primary" onClick={() => navigate('/connections')}>
                    浏览连接列表
                </Button>
            </Empty>

            <Card style={{ marginTop: 24 }}>
                <Title level={3}>远程终端使用指南</Title>
                <Paragraph>
                    欢迎使用Mini-Web远程终端管理系统。本系统支持多种远程连接协议，包括SSH、RDP、VNC和Telnet。
                    通过浏览器即可轻松连接和管理远程服务器。
                </Paragraph>

                <Title level={4}>开始使用</Title>
                <Steps
                    direction="vertical"
                    current={-1}
                    items={[
                        {
                            title: '创建连接',
                            description: '点击左侧导航中的"连接管理"，创建新的远程连接配置。',
                            icon: <LinkOutlined />
                        },
                        {
                            title: '连接服务器',
                            description: '从左侧连接列表中点击一个连接，系统将自动打开新的终端标签页。',
                            icon: <CodeOutlined />
                        },
                        {
                            title: '使用终端',
                            description: '连接成功后，您可以通过终端与远程服务器交互，支持多标签页和会话管理。',
                            icon: <BulbOutlined />
                        }
                    ]}
                />

                <Title level={4} style={{ marginTop: 16 }}>快捷操作</Title>
                <ul>
                    <li><Text strong>刷新标签</Text>：点击标签页右键菜单中的"刷新"选项</li>
                    <li><Text strong>复制标签</Text>：点击标签页右键菜单中的"复制"选项</li>
                    <li><Text strong>关闭标签</Text>：点击标签页上的关闭图标或使用右键菜单</li>
                    <li><Text strong>全屏模式</Text>：使用终端右上角的全屏按钮</li>
                </ul>

                <Paragraph style={{ marginTop: 16 }}>
                    <Text type="secondary">
                        如需更多帮助，请参阅系统文档或联系管理员。
                    </Text>
                </Paragraph>
            </Card>
        </div>
    );
};

export default EmptyTerminalGuide; 
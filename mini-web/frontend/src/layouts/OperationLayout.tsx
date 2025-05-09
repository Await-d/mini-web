import React, { useState, useEffect } from 'react';
import { Layout, Tree, Button, Spin, Space, Input, Dropdown, Avatar, Menu, message, Modal } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ApiOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  FolderOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { Outlet, useNavigate } from 'react-router-dom';
import { connectionAPI, sessionAPI } from '../services/api';
import type { Connection } from '../services/api';

const { Header, Sider, Content } = Layout;
const { Search } = Input;
const { DirectoryTree } = Tree;

// 树节点类型
interface TreeNode {
  title: string;
  key: string;
  icon?: React.ReactNode;
  isLeaf?: boolean;
  connection?: Connection;
  children?: TreeNode[];
}

const OperationLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [searchValue, setSearchValue] = useState('');

  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  // 监听Terminal组件发送的自定义事件
  useEffect(() => {
    const handleToggleSidebar = (event: CustomEvent) => {
      setCollapsed(!collapsed);
    };

    // 添加事件监听器
    window.addEventListener('toggle-operation-sidebar',
      handleToggleSidebar as EventListener);

    // 组件卸载时移除监听器
    return () => {
      window.removeEventListener('toggle-operation-sidebar',
        handleToggleSidebar as EventListener);
    };
  }, [collapsed]);

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

  // 页面加载时获取连接列表
  useEffect(() => {
    fetchConnections();
  }, []);

  // 处理连接
  const handleConnect = (connection: Connection) => {
    message.info(`正在连接到 ${connection.name}...`);

    // 创建会话
    sessionAPI.createSession(connection.id)
      .then(response => {
        if (response.data && response.data.code === 200) {
          const sessionId = response.data.data.id;

          // 创建标签键，确保在恢复时可以识别
          const timestamp = Date.now();
          const tabKey = `conn-${connection.id}-session-${sessionId}-${timestamp}`;

          // 保存更详细的会话信息到localStorage，便于页面刷新时恢复
          localStorage.setItem('current_terminal_session', JSON.stringify({
            connectionId: connection.id,
            sessionId: sessionId,
            tabKey: tabKey,
            connectionProtocol: connection.protocol,
            connectionName: connection.name,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            isConnected: false,
            timestamp: timestamp
          }));

          // 导航到终端页面，包含连接ID和会话ID作为参数
          console.log(`【连接】跳转到终端页面: /terminal/${connection.id}?session=${sessionId}`);
          navigate(`/terminal/${connection.id}?session=${sessionId}`);

          // 直接发布会话创建事件，通知相关组件
          window.dispatchEvent(new CustomEvent('session-created', {
            detail: {
              connectionId: connection.id,
              sessionId: sessionId,
              tabKey: tabKey
            }
          }));
        } else {
          message.error(`创建会话失败: ${response.data?.message || '未知错误'}`);
        }
      })
      .catch(error => {
        message.error(`连接失败: ${error.message || '网络错误'}`);
      });
  };

  // 处理添加新连接
  const handleAddConnection = () => {
    navigate('/connections');
  };

  // 处理全屏切换
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        message.error(`无法进入全屏模式: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 分组视图类型
  const [groupBy, setGroupBy] = useState<'protocol' | 'group' | 'all'>('protocol');

  // 将连接数据转换为树形结构
  useEffect(() => {
    const groupMap: Record<string, TreeNode> = {};
    const protocolMap: Record<string, TreeNode> = {
      'ssh': {
        title: 'SSH 连接',
        key: 'protocol-ssh',
        icon: <CloudServerOutlined style={{ color: '#52c41a' }} />,
        children: [],
      },
      'rdp': {
        title: 'RDP 连接',
        key: 'protocol-rdp',
        icon: <DesktopOutlined style={{ color: '#1677ff' }} />,
        children: [],
      },
      'vnc': {
        title: 'VNC 连接',
        key: 'protocol-vnc',
        icon: <DatabaseOutlined style={{ color: '#722ed1' }} />,
        children: [],
      },
      'telnet': {
        title: 'Telnet 连接',
        key: 'protocol-telnet',
        icon: <ApiOutlined style={{ color: '#fa8c16' }} />,
        children: [],
      }
    };

    // 创建连接节点并组织到对应协议组和分组下
    connections.forEach(conn => {
      const connectionNode: TreeNode = {
        title: conn.name,
        key: `connection-${conn.id}`,
        isLeaf: true,
        connection: conn,
        icon: getProtocolIcon(conn.protocol)
      };

      // 添加到协议分组
      if (protocolMap[conn.protocol]) {
        protocolMap[conn.protocol].children!.push({ ...connectionNode });
      }

      // 添加到用户分组
      if (conn.group) {
        if (!groupMap[conn.group]) {
          groupMap[conn.group] = {
            title: conn.group,
            key: `group-${conn.group}`,
            icon: <FolderOutlined />,
            children: []
          };
        }
        groupMap[conn.group].children!.push({ ...connectionNode });
      } else {
        // 如果没有分组，添加到"未分组"
        if (!groupMap['未分组']) {
          groupMap['未分组'] = {
            title: '未分组',
            key: 'group-uncategorized',
            icon: <FolderOutlined />,
            children: []
          };
        }
        groupMap['未分组'].children!.push({ ...connectionNode });
      }
    });

    // 构建最终的树结构
    const tree: TreeNode[] = [];

    // 根据分组方式构建树
    if (groupBy === 'protocol') {
      // 按协议分组
      Object.values(protocolMap).forEach(protocol => {
        if (protocol.children && protocol.children.length > 0) {
          tree.push(protocol);
        }
      });
    } else if (groupBy === 'group') {
      // 按用户分组
      const sortedGroups = Object.values(groupMap).sort((a, b) => a.title.localeCompare(b.title));
      tree.push(...sortedGroups);
    } else if (groupBy === 'all') {
      // 所有连接平铺显示
      const allConnections: TreeNode[] = connections.map(conn => ({
        title: conn.name,
        key: `connection-${conn.id}`,
        isLeaf: true,
        connection: conn,
        icon: getProtocolIcon(conn.protocol)
      }));

      // 按名称排序
      allConnections.sort((a, b) =>
        a.title.toString().localeCompare(b.title.toString())
      );

      tree.push(...allConnections);
    }

    setTreeData(tree);
  }, [connections, groupBy]);

  // 右键菜单状态
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  // 处理树节点选择
  const handleSelect = (selectedKeys: React.Key[], info: any) => {
    const node = info.node as TreeNode;
    if (node.isLeaf && node.connection) {
      handleConnect(node.connection);
    }
  };

  // 处理树节点右键点击
  const handleRightClick = (info: any) => {
    const node = info.node as TreeNode;
    if (node.isLeaf && node.connection) {
      setSelectedNode(node);
      setContextMenuPosition({
        x: info.event.clientX,
        y: info.event.clientY,
      });
    }
  };

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenuPosition(null);
  };

  // 点击文档时关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => {
      closeContextMenu();
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // 处理编辑连接
  const handleEditConnection = () => {
    if (selectedNode?.connection) {
      closeContextMenu();
      navigate(`/connections?edit=${selectedNode.connection.id}`);
    }
  };

  // 处理删除连接
  const handleDeleteConnection = () => {
    if (selectedNode?.connection) {
      closeContextMenu();
      Modal.confirm({
        title: '确认删除',
        content: `确定要删除连接 "${selectedNode.connection.name}" 吗？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            await connectionAPI.deleteConnection(selectedNode.connection.id);
            message.success('连接删除成功');
            fetchConnections(); // 刷新连接列表
          } catch (error) {
            console.error('删除连接失败:', error);
            message.error('删除连接失败，请稍后再试');
          }
        },
      });
    }
  };

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchValue(value);
  };

  // 过滤树数据
  const getFilteredTreeData = () => {
    if (!searchValue) return treeData;

    const filterTreeNode = (node: TreeNode): TreeNode | null => {
      // 如果节点标题包含搜索值，保留节点
      if (node.title.toLowerCase().includes(searchValue.toLowerCase())) {
        return node;
      }

      // 如果是叶子节点且不匹配，返回null
      if (node.isLeaf) {
        return null;
      }

      // 处理子节点
      if (node.children) {
        const filteredChildren = node.children
          .map(child => filterTreeNode(child))
          .filter(Boolean) as TreeNode[];

        // 如果有匹配的子节点，返回带有过滤后子节点的节点
        if (filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren
          };
        }
      }

      // 没有匹配则返回null
      return null;
    };

    // 过滤根节点
    const filtered = treeData
      .map(node => filterTreeNode(node))
      .filter(Boolean) as TreeNode[];

    return filtered;
  };

  // 获取协议图标
  const getProtocolIcon = (protocol: string) => {
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
        return <CloudServerOutlined />;
    }
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        width={280}
        collapsedWidth={0}
        trigger={null}
        style={{
          boxShadow: collapsed ? 'none' : '0 1px 4px rgba(0,0,0,0.1)',
          overflow: 'auto',
          height: '100vh',
          borderRight: collapsed ? 'none' : '1px solid #f0f0f0',
          zIndex: 10
        }}
      >
        <div style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <Search
            placeholder="搜索连接..."
            allowClear
            enterButton
            onSearch={handleSearch}
          />

          <Space style={{ marginBottom: 8 }}>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddConnection}
            >
              新建连接
            </Button>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchConnections}
              loading={loading}
            />
            <Button
              size="small"
              icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
            />
          </Space>

          <Space style={{ marginBottom: 8 }}>
            <Button
              type={groupBy === 'protocol' ? 'primary' : 'default'}
              size="small"
              onClick={() => setGroupBy('protocol')}
            >
              按协议
            </Button>
            <Button
              type={groupBy === 'group' ? 'primary' : 'default'}
              size="small"
              onClick={() => setGroupBy('group')}
            >
              按分组
            </Button>
            <Button
              type={groupBy === 'all' ? 'primary' : 'default'}
              size="small"
              onClick={() => setGroupBy('all')}
            >
              全部
            </Button>
          </Space>
        </div>

        <div style={{ padding: '0 8px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin>
                <div style={{ padding: '30px 50px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.05)' }}>
                  加载中...
                </div>
              </Spin>
            </div>
          ) : (
            <DirectoryTree
              defaultExpandAll={false}
              defaultExpandedKeys={treeData.length > 0 ? [treeData[0].key] : []}
              selectable
              onSelect={handleSelect}
              onRightClick={handleRightClick}
              treeData={getFilteredTreeData()}
            />
          )}

          {/* 右键菜单 */}
          {contextMenuPosition && selectedNode && (
            <div
              style={{
                position: 'fixed',
                zIndex: 1000,
                left: contextMenuPosition.x,
                top: contextMenuPosition.y,
                backgroundColor: 'white',
                boxShadow: '0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 6px 16px 0 rgba(0, 0, 0, 0.08)',
                borderRadius: '2px',
                padding: '4px 0'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Menu>
                <Menu.Item key="connect" icon={<PlayCircleOutlined />} onClick={() => {
                  closeContextMenu();
                  if (selectedNode.connection) {
                    handleConnect(selectedNode.connection);
                  }
                }}>
                  连接
                </Menu.Item>
                <Menu.Item key="edit" icon={<SettingOutlined />} onClick={handleEditConnection}>
                  编辑
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item key="delete" icon={<DeleteOutlined />} danger onClick={handleDeleteConnection}>
                  删除
                </Menu.Item>
              </Menu>
            </div>
          )}
        </div>
      </Sider>

      <Layout>
        <Header style={{
          padding: '0 12px',
          background: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          height: 36 /* 更紧凑的高度 */
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '14px', width: 36, height: 36 }}
          />
          <Dropdown menu={{
            items: [
              {
                key: 'exit-operation',
                label: '退出操作模式',
                icon: <DesktopOutlined />,
                onClick: () => navigate('/connections')
              },
              {
                key: 'dashboard',
                label: '返回仪表盘',
                onClick: () => navigate('/dashboard')
              },
              {
                key: 'connections',
                label: '管理连接',
                onClick: () => navigate('/connections')
              },
              {
                key: 'sessions',
                label: '会话管理',
                onClick: () => navigate('/sessions')
              },
              {
                type: 'divider'
              },
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: '退出登录',
                onClick: () => {
                  logout();
                  navigate('/login');
                }
              }
            ]
          }}>
            <Space>
              <Avatar style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
              <span>{currentUser?.username || '未登录'}</span>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{
          height: 'calc(100vh - 36px)', /* 匹配新的头部高度 */
          overflow: 'auto',
          background: '#f0f2f5',
          position: 'relative',
          padding: 0
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default OperationLayout;
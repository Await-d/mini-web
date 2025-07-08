import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Button, Space, Input, Modal, Form, Select, Typography, Tag, Tooltip, message } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, ReloadOutlined, LockOutlined, EyeOutlined } from '@ant-design/icons';
import { useUsers, User } from '../../hooks/useUsers';
import PermissionGuard from '../../components/PermissionGuard';
import AvatarUpload from '../../components/AvatarUpload';

const { Title } = Typography;

const UserManagement = () => {
  const navigate = useNavigate();
  const { users, loading, fetchUsers, createUser, updateUser, deleteUser, batchUpdateUsers } = useUsers();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchText(value);
    if (!value) {
      setFilteredUsers(users);
      return;
    }
    
    const filtered = users.filter(user => 
      user.username.toLowerCase().includes(value.toLowerCase()) || 
      user.nickname.toLowerCase().includes(value.toLowerCase()) ||
      user.email.toLowerCase().includes(value.toLowerCase()) || 
      user.role.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredUsers(filtered);
  };

  // 处理编辑
  const handleEdit = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue(user);
    setIsModalVisible(true);
  };

  // 处理删除
  const handleDelete = (userId: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除此用户吗？此操作不可撤销。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const success = await deleteUser(userId);
        if (success) {
          // 更新过滤后的用户列表
          setFilteredUsers(prev => prev.filter(user => user.id !== userId));
        }
      }
    });
  };

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingUser) {
        // 更新现有用户
        const success = await updateUser(editingUser.id, values);
        if (success) {
          setIsModalVisible(false);
          form.resetFields();
          setEditingUser(null);
          // 刷新过滤后的用户列表
          if (searchText) {
            handleSearch(searchText);
          } else {
            setFilteredUsers(users);
          }
        }
      } else {
        // 添加新用户
        const success = await createUser(values);
        if (success) {
          setIsModalVisible(false);
          form.resetFields();
          // 刷新过滤后的用户列表
          if (searchText) {
            handleSearch(searchText);
          } else {
            setFilteredUsers(users);
          }
        }
      }
    } catch (errorInfo) {
      console.log('表单验证失败:', errorInfo);
    }
  };

  // 批量启用用户
  const handleBatchEnable = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要启用的用户');
      return;
    }
    
    Modal.confirm({
      title: '批量启用用户',
      content: `确定要启用选中的 ${selectedRowKeys.length} 个用户吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const success = await batchUpdateUsers('enable', selectedRowKeys as number[]);
        if (success) {
          setSelectedRowKeys([]);
        }
      }
    });
  };

  // 批量禁用用户
  const handleBatchDisable = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要禁用的用户');
      return;
    }
    
    Modal.confirm({
      title: '批量禁用用户',
      content: `确定要禁用选中的 ${selectedRowKeys.length} 个用户吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const success = await batchUpdateUsers('disable', selectedRowKeys as number[]);
        if (success) {
          setSelectedRowKeys([]);
        }
      }
    });
  };

  // 批量删除用户
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的用户');
      return;
    }
    
    Modal.confirm({
      title: '批量删除用户',
      content: `确定要删除选中的 ${selectedRowKeys.length} 个用户吗？此操作不可撤销。`,
      okText: '确认',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        const success = await batchUpdateUsers('delete', selectedRowKeys as number[]);
        if (success) {
          setSelectedRowKeys([]);
        }
      }
    });
  };

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '头像',
      dataIndex: 'avatar',
      key: 'avatar',
      width: 80,
      render: (_: any, record: User) => (
        <AvatarUpload
          userId={record.id}
          currentAvatar={record.avatar}
          size={40}
          showUploadButton={false}
        />
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '昵称',
      dataIndex: 'nickname',
      key: 'nickname',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'red' : 'blue'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        status === 'active' ? 
          <Tag color="green">活跃</Tag> : 
          <Tag color="red">停用</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: User) => (
        <Space size="middle">
          <Button 
            type="text" 
            icon={<EyeOutlined />} 
            onClick={() => navigate(`/users/${record.id}`)}
          >
            详情
          </Button>
          
          <PermissionGuard permission="users:edit">
            <Button 
              type="text" 
              icon={<EditOutlined />} 
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          </PermissionGuard>
          
          <PermissionGuard 
            permission="users:delete"
            fallback={
              <Tooltip title="您没有删除用户的权限">
                <Button 
                  type="text" 
                  icon={<LockOutlined />} 
                  disabled
                >
                  删除
                </Button>
              </Tooltip>
            }
          >
            <Button 
              type="text" 
              danger
              icon={<DeleteOutlined />} 
              onClick={() => handleDelete(record.id)}
            >
              删除
            </Button>
          </PermissionGuard>
        </Space>
      ),
    },
  ];

  // 同步过滤后的用户列表
  useEffect(() => {
    setFilteredUsers(users);
  }, [users]);

  return (
    <div className="user-management">
      <Card variant="borderless">
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <Title level={4}>
            <UserOutlined /> 用户管理
          </Title>
          <Space>
            <Input
              placeholder="搜索用户"
              prefix={<SearchOutlined />}
              onChange={e => handleSearch(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                fetchUsers();
                setSearchText('');
              }}
            >
              刷新
            </Button>
            <PermissionGuard 
              permission="users:create"
              fallback={
                <Tooltip title="您没有创建用户的权限">
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    disabled
                  >
                    添加用户
                  </Button>
                </Tooltip>
              }
            >
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingUser(null);
                  form.resetFields();
                  setIsModalVisible(true);
                }}
              >
                添加用户
              </Button>
            </PermissionGuard>
          </Space>
        </div>
        
        {/* 批量操作按钮 */}
        {selectedRowKeys.length > 0 && (
          <div style={{ marginBottom: 16, padding: '8px 16px', background: '#f0f2f5', borderRadius: '6px' }}>
            <Space>
              <span>已选择 {selectedRowKeys.length} 个用户</span>
              <PermissionGuard permission="users:edit">
                <Button size="small" onClick={handleBatchEnable}>
                  批量启用
                </Button>
                <Button size="small" onClick={handleBatchDisable}>
                  批量禁用
                </Button>
              </PermissionGuard>
              <PermissionGuard permission="users:delete">
                <Button size="small" danger onClick={handleBatchDelete}>
                  批量删除
                </Button>
              </PermissionGuard>
              <Button size="small" onClick={() => setSelectedRowKeys([])}>
                取消选择
              </Button>
            </Space>
          </div>
        )}
        
        <Table 
          columns={columns} 
          dataSource={filteredUsers} 
          rowKey="id" 
          loading={loading}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys,
            onChange: (selectedKeys) => {
              setSelectedRowKeys(selectedKeys);
            },
            onSelectAll: (selected, selectedRows, changeRows) => {
              // 可以在这里添加全选逻辑
            },
            getCheckboxProps: (record) => ({
              disabled: record.role === 'admin' && record.username === 'admin', // 禁止选择系统管理员
            }),
          }}
          pagination={{ 
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ status: 'active', role: 'user' }}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            name="nickname"
            label="昵称"
            rules={[{ required: true, message: '请输入昵称' }]}
          >
            <Input placeholder="请输入昵称" />
          </Form.Item>
          
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          )}
          
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              <Select.Option value="user">普通用户</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select placeholder="请选择状态">
              <Select.Option value="active">活跃</Select.Option>
              <Select.Option value="inactive">停用</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;
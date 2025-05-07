import { useState } from 'react';
import { Card, Table, Button, Space, Input, Modal, Form, message, Typography, Tag, Tooltip } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, ReloadOutlined, LockOutlined } from '@ant-design/icons';
import { useUsers } from '../../hooks/useUsers';
import { User } from '../../services/api';
import PermissionGuard from '../../components/PermissionGuard';

const { Title } = Typography;

const UserManagement = () => {
  const { users, loading, fetchUsers, createUser, updateUser, deleteUser } = useUsers();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [form] = Form.useForm();

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchText(value);
    if (!value) {
      setFilteredUsers(users);
      return;
    }
    
    const filtered = users.filter(user => 
      user.name.includes(value) || 
      user.email.includes(value) || 
      user.role.includes(value)
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
        const success = await createUser(values as Omit<User, 'id'>);
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

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
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
        
        <Table 
          columns={columns} 
          dataSource={filteredUsers} 
          rowKey="id" 
          loading={loading}
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
          initialValues={{ status: 'active' }}
        >
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
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
          
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Input placeholder="请输入角色" />
          </Form.Item>
          
          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Input placeholder="请输入状态" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;
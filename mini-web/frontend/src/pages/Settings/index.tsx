import { useState, useEffect } from 'react';
import { Card, Tabs, Form, Input, Button, Switch, Select, Space, message, Typography, Divider, Alert, Table, Tag, DatePicker, Modal, Statistic, Progress, Row, Col } from 'antd';
import { SaveOutlined, SettingOutlined, BulbOutlined, GlobalOutlined, LockOutlined, FileTextOutlined, DeleteOutlined, ClearOutlined, EyeOutlined, MailOutlined, SafetyOutlined, DashboardOutlined, DatabaseOutlined, CloudServerOutlined, LineChartOutlined } from '@ant-design/icons';
import PermissionGuard from '../../components/PermissionGuard';
import EmailConfigComponent from '../../components/EmailConfig';
import SSLConfigComponent from '../../components/SSLConfig';
import { systemAPI, SystemConfig, SystemLog, PerformanceMetrics } from '../../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const SettingsPage = () => {
  const [generalForm] = Form.useForm();
  const [appearanceForm] = Form.useForm();
  const [securityForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<Record<string, SystemConfig>>({});
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logStats, setLogStats] = useState<any>({});
  const [logFilters, setLogFilters] = useState({
    level: '',
    module: '',
    start_time: '',
    end_time: ''
  });
  const [logDetailModal, setLogDetailModal] = useState<{
    visible: boolean;
    log: SystemLog | null;
  }>({ visible: false, log: null });
  
  // 性能监控相关状态
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceAutoRefresh, setPerformanceAutoRefresh] = useState(false);
  const [performanceInterval, setPerformanceInterval] = useState<NodeJS.Timeout | null>(null);

  // 加载系统配置
  const loadConfigs = async () => {
    try {
      const response = await systemAPI.getAllConfigs();
      if (response.data && response.data.code === 200) {
        const configMap: Record<string, SystemConfig> = {};
        response.data.data.forEach(config => {
          configMap[config.key] = config;
        });
        setConfigs(configMap);
        
        // 设置表单初始值
        const generalValues: any = {};
        const appearanceValues: any = {};
        const securityValues: any = {};
        
        response.data.data.forEach(config => {
          const value = config.type === 'boolean' ? config.value === 'true' : 
                       config.type === 'number' ? parseInt(config.value) : config.value;
          
          if (config.category === 'general') {
            generalValues[config.key] = value;
          } else if (config.category === 'appearance') {
            appearanceValues[config.key] = value;
          } else if (config.category === 'security') {
            securityValues[config.key] = value;
          }
        });
        
        generalForm.setFieldsValue(generalValues);
        appearanceForm.setFieldsValue(appearanceValues);
        securityForm.setFieldsValue(securityValues);
      }
    } catch (error) {
      message.error('加载系统配置失败');
    }
  };

  // 保存设置
  const handleSave = async (values: any, category: string) => {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      Object.keys(values).forEach(key => {
        let value = values[key];
        if (typeof value === 'boolean') {
          value = value.toString();
        } else if (typeof value === 'number') {
          value = value.toString();
        }
        updates[key] = value;
      });
      
      const response = await systemAPI.batchUpdateConfigs(updates);
      if (response.data && response.data.code === 200) {
        message.success('设置已保存');
        loadConfigs(); // 重新加载配置
      } else {
        message.error('保存设置失败');
      }
    } catch (error) {
      message.error('保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  // 加载系统日志
  const loadLogs = async (filters?: any) => {
    setLogsLoading(true);
    try {
      const params = {
        limit: 50,
        offset: 0,
        ...filters
      };
      const response = await systemAPI.getLogs(params);
      if (response.data && response.data.code === 200) {
        setLogs(response.data.data.list);
      }
    } catch (error) {
      message.error('加载系统日志失败');
    } finally {
      setLogsLoading(false);
    }
  };

  // 加载日志统计
  const loadLogStats = async () => {
    try {
      const response = await systemAPI.getLogStats();
      if (response.data && response.data.code === 200) {
        setLogStats(response.data.data);
      }
    } catch (error) {
      message.error('加载日志统计失败');
    }
  };

  // 删除日志
  const handleDeleteLog = async (id: number) => {
    try {
      const response = await systemAPI.deleteLog(id);
      if (response.data && response.data.code === 200) {
        message.success('删除日志成功');
        loadLogs(logFilters);
        loadLogStats();
      }
    } catch (error) {
      message.error('删除日志失败');
    }
  };

  // 清除日志
  const handleClearLogs = () => {
    Modal.confirm({
      title: '清除系统日志',
      content: '确定要清除指定时间范围的日志吗？此操作不可恢复。',
      onOk: async () => {
        try {
          const response = await systemAPI.clearLogs({
            start_time: logFilters.start_time || dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
            end_time: logFilters.end_time || dayjs().format('YYYY-MM-DD')
          });
          if (response.data && response.data.code === 200) {
            message.success('清除日志成功');
            loadLogs(logFilters);
            loadLogStats();
          }
        } catch (error) {
          message.error('清除日志失败');
        }
      }
    });
  };

  // 筛选日志
  const handleFilterLogs = () => {
    loadLogs(logFilters);
  };

  // 加载性能监控数据
  const loadPerformanceMetrics = async () => {
    setPerformanceLoading(true);
    try {
      const response = await systemAPI.getPerformanceMetrics();
      if (response.data && response.data.code === 200) {
        setPerformanceMetrics(response.data.data);
      }
    } catch (error) {
      message.error('加载性能监控数据失败');
    } finally {
      setPerformanceLoading(false);
    }
  };

  // 切换自动刷新
  const toggleAutoRefresh = (checked: boolean) => {
    setPerformanceAutoRefresh(checked);
    if (checked) {
      // 开启自动刷新，每30秒刷新一次
      const interval = setInterval(() => {
        loadPerformanceMetrics();
      }, 30000);
      setPerformanceInterval(interval);
    } else {
      // 关闭自动刷新
      if (performanceInterval) {
        clearInterval(performanceInterval);
        setPerformanceInterval(null);
      }
    }
  };

  // 格式化字节大小
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化百分比
  const formatPercent = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  useEffect(() => {
    loadConfigs();
    loadLogs();
    loadLogStats();
    loadPerformanceMetrics();
    
    // 组件卸载时清理定时器
    return () => {
      if (performanceInterval) {
        clearInterval(performanceInterval);
      }
    };
  }, []);

  // 监听自动刷新状态变化
  useEffect(() => {
    return () => {
      if (performanceInterval) {
        clearInterval(performanceInterval);
      }
    };
  }, [performanceInterval]);

  const tabItems = [
    {
      key: 'general',
      label: (
        <span>
          <SettingOutlined />
          常规设置
        </span>
      ),
      children: (
        <Form
          form={generalForm}
          layout="vertical"
          onFinish={(values) => handleSave(values, 'general')}
        >
          <Form.Item
            name="site_name"
            label="系统名称"
            rules={[{ required: true, message: '请输入系统名称' }]}
          >
            <Input placeholder="请输入系统名称" />
          </Form.Item>
          
          <Form.Item
            name="site_description"
            label="系统描述"
          >
            <Input.TextArea rows={3} placeholder="请输入系统描述" />
          </Form.Item>
          
          <Form.Item
            name="page_size"
            label="默认分页大小"
            rules={[{ required: true, message: '请选择默认分页大小' }]}
          >
            <Select>
              <Option value={5}>5条/页</Option>
              <Option value={10}>10条/页</Option>
              <Option value={20}>20条/页</Option>
              <Option value={50}>50条/页</Option>
            </Select>
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'appearance',
      label: (
        <span>
          <BulbOutlined />
          外观设置
        </span>
      ),
      children: (
        <Form
          form={appearanceForm}
          layout="vertical"
          onFinish={(values) => handleSave(values, 'appearance')}
        >
          <Form.Item
            name="theme"
            label="主题模式"
          >
            <Select>
              <Option value="light">亮色模式</Option>
              <Option value="dark">暗色模式</Option>
              <Option value="auto">跟随系统</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="primary_color"
            label="主题色"
          >
            <Select>
              <Option value="#1677ff">默认蓝</Option>
              <Option value="#52c41a">优雅绿</Option>
              <Option value="#fa541c">激情橙</Option>
              <Option value="#722ed1">神秘紫</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="compact_mode"
            label="紧凑模式"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          
          <Form.Item
            name="animation_enabled"
            label="启用动画"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'security',
      label: (
        <span>
          <LockOutlined />
          安全设置
        </span>
      ),
      children: (
        <PermissionGuard 
          permission="settings:access"
          fallback={
            <Alert
              message="权限不足"
              description="您没有访问安全设置的权限，请联系管理员。"
              type="error"
              showIcon
            />
          }
        >
          <Form
            form={securityForm}
            layout="vertical"
            onFinish={(values) => handleSave(values, 'security')}
          >
            <Form.Item
              name="password_policy"
              label="密码策略"
            >
              <Select>
                <Option value="low">低（至少6个字符）</Option>
                <Option value="medium">中（至少8个字符，包含字母和数字）</Option>
                <Option value="high">高（至少10个字符，包含大小写字母、数字和特殊字符）</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              name="session_timeout"
              label="会话超时时间（分钟）"
            >
              <Select>
                <Option value={15}>15分钟</Option>
                <Option value={30}>30分钟</Option>
                <Option value={60}>1小时</Option>
                <Option value={120}>2小时</Option>
                <Option value={-1}>永不超时</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              name="login_attempts"
              label="最大登录失败次数"
            >
              <Select>
                <Option value={3}>3次</Option>
                <Option value={5}>5次</Option>
                <Option value={10}>10次</Option>
                <Option value={-1}>不限制</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              name="two_factor_auth"
              label="启用两步验证"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                保存设置
              </Button>
            </Form.Item>
          </Form>
        </PermissionGuard>
      ),
    },
    {
      key: 'email',
      label: (
        <span>
          <MailOutlined />
          邮件配置
        </span>
      ),
      children: (
        <PermissionGuard 
          permission="settings:access"
          fallback={
            <Alert
              message="权限不足"
              description="您没有访问邮件配置的权限，请联系管理员。"
              type="error"
              showIcon
            />
          }
        >
          <EmailConfigComponent />
        </PermissionGuard>
      ),
    },
    {
      key: 'ssl',
      label: (
        <span>
          <SafetyOutlined />
          SSL证书
        </span>
      ),
      children: (
        <PermissionGuard 
          permission="settings:access"
          fallback={
            <Alert
              message="权限不足"
              description="您没有访问SSL证书管理的权限，请联系管理员。"
              type="error"
              showIcon
            />
          }
        >
          <SSLConfigComponent />
        </PermissionGuard>
      ),
    },
    {
      key: 'performance',
      label: (
        <span>
          <DashboardOutlined />
          性能监控
        </span>
      ),
      children: (
        <PermissionGuard 
          permission="settings:access"
          fallback={
            <Alert
              message="权限不足"
              description="您没有访问性能监控的权限，请联系管理员。"
              type="error"
              showIcon
            />
          }
        >
          <div className="performance-monitoring">
            {/* 控制面板 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space>
                <Button type="primary" onClick={loadPerformanceMetrics} loading={performanceLoading}>
                  刷新数据
                </Button>
                <Switch
                  checked={performanceAutoRefresh}
                  onChange={toggleAutoRefresh}
                  checkedChildren="自动刷新"
                  unCheckedChildren="手动刷新"
                />
              </Space>
            </Card>

            {performanceMetrics && (
              <>
                {/* 系统概览 */}
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Card>
                      <Statistic 
                        title="系统负载"
                        value={performanceMetrics.system_load.average}
                        precision={2}
                        suffix="%" 
                        valueStyle={{ color: performanceMetrics.system_load.average > 80 ? '#f5222d' : '#3f8600' }}
                      />
                      <Progress 
                        percent={performanceMetrics.system_load.average} 
                        strokeColor={performanceMetrics.system_load.average > 80 ? '#f5222d' : '#52c41a'}
                        size="small"
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic 
                        title="CPU使用率"
                        value={performanceMetrics.cpu_usage}
                        precision={1}
                        suffix="%" 
                        valueStyle={{ color: performanceMetrics.cpu_usage > 80 ? '#f5222d' : '#3f8600' }}
                      />
                      <Progress 
                        percent={performanceMetrics.cpu_usage} 
                        strokeColor={performanceMetrics.cpu_usage > 80 ? '#f5222d' : '#52c41a'}
                        size="small"
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic 
                        title="内存使用率"
                        value={performanceMetrics.memory_usage.percent}
                        precision={1}
                        suffix="%" 
                        valueStyle={{ color: performanceMetrics.memory_usage.percent > 80 ? '#f5222d' : '#3f8600' }}
                      />
                      <Progress 
                        percent={performanceMetrics.memory_usage.percent} 
                        strokeColor={performanceMetrics.memory_usage.percent > 80 ? '#f5222d' : '#52c41a'}
                        size="small"
                      />
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        {formatBytes(performanceMetrics.memory_usage.used)} / {formatBytes(performanceMetrics.memory_usage.total)}
                      </div>
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic 
                        title="磁盘使用率"
                        value={performanceMetrics.disk_usage.percent}
                        precision={1}
                        suffix="%" 
                        valueStyle={{ color: performanceMetrics.disk_usage.percent > 80 ? '#f5222d' : '#3f8600' }}
                      />
                      <Progress 
                        percent={performanceMetrics.disk_usage.percent} 
                        strokeColor={performanceMetrics.disk_usage.percent > 80 ? '#f5222d' : '#52c41a'}
                        size="small"
                      />
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        {formatBytes(performanceMetrics.disk_usage.used)} / {formatBytes(performanceMetrics.disk_usage.total)}
                      </div>
                    </Card>
                  </Col>
                </Row>

                {/* 详细信息 */}
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card title={<><DatabaseOutlined /> 数据库性能</>} size="small">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>连接数:</span>
                          <span>{performanceMetrics.database_stats.connections}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>活跃连接:</span>
                          <span>{performanceMetrics.database_stats.active_connections}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>查询/秒:</span>
                          <span>{performanceMetrics.database_stats.queries_per_second}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>平均查询时间:</span>
                          <span>{performanceMetrics.database_stats.avg_query_time}ms</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>数据库大小:</span>
                          <span>{formatBytes(performanceMetrics.database_stats.db_size)}</span>
                        </div>
                      </div>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title={<><CloudServerOutlined /> 网络状态</>} size="small">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>活跃连接:</span>
                          <span>{performanceMetrics.network_stats.active_connections}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>入站流量:</span>
                          <span>{formatBytes(performanceMetrics.network_stats.bytes_in)}/s</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>出站流量:</span>
                          <span>{formatBytes(performanceMetrics.network_stats.bytes_out)}/s</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>数据包丢失:</span>
                          <span>{formatPercent(performanceMetrics.network_stats.packet_loss)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>平均延迟:</span>
                          <span>{performanceMetrics.network_stats.latency}ms</span>
                        </div>
                      </div>
                    </Card>
                  </Col>
                </Row>

                {/* 应用性能 */}
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                  <Col span={24}>
                    <Card title={<><LineChartOutlined /> 应用性能</>} size="small">
                      <Row gutter={[16, 16]}>
                        <Col span={8}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>在线用户数:</span>
                              <span>{performanceMetrics.app_stats.online_users}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>总用户数:</span>
                              <span>{performanceMetrics.app_stats.total_users}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>活跃会话:</span>
                              <span>{performanceMetrics.app_stats.active_sessions}</span>
                            </div>
                          </div>
                        </Col>
                        <Col span={8}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>RDP连接:</span>
                              <span>{performanceMetrics.app_stats.rdp_connections}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>SSH连接:</span>
                              <span>{performanceMetrics.app_stats.ssh_connections}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Telnet连接:</span>
                              <span>{performanceMetrics.app_stats.telnet_connections}</span>
                            </div>
                          </div>
                        </Col>
                        <Col span={8}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>请求/分钟:</span>
                              <span>{performanceMetrics.app_stats.requests_per_minute}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>平均响应时间:</span>
                              <span>{performanceMetrics.app_stats.avg_response_time}ms</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>错误率:</span>
                              <span>{formatPercent(performanceMetrics.app_stats.error_rate)}</span>
                            </div>
                          </div>
                        </Col>
                      </Row>
                    </Card>
                  </Col>
                </Row>
              </>
            )}
          </div>
        </PermissionGuard>
      ),
    },
    {
      key: 'logs',
      label: (
        <span>
          <FileTextOutlined />
          系统日志
        </span>
      ),
      children: (
        <PermissionGuard 
          permission="logs:access"
          fallback={
            <Alert
              message="权限不足"
              description="您没有访问系统日志的权限，请联系管理员。"
              type="error"
              showIcon
            />
          }
        >
          <div className="logs-management">
            {/* 日志统计卡片 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Card size="small" style={{ flex: 1 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1677ff' }}>
                    {logStats.total || 0}
                  </div>
                  <div>总日志数</div>
                </div>
              </Card>
              <Card size="small" style={{ flex: 1 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                    {logStats.today_count || 0}
                  </div>
                  <div>今日日志</div>
                </div>
              </Card>
              <Card size="small" style={{ flex: 1 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#fa541c' }}>
                    {logStats.by_level?.error || 0}
                  </div>
                  <div>错误日志</div>
                </div>
              </Card>
              <Card size="small" style={{ flex: 1 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>
                    {logStats.by_level?.warn || 0}
                  </div>
                  <div>警告日志</div>
                </div>
              </Card>
            </div>

            {/* 日志筛选器 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <Select
                  placeholder="选择日志级别"
                  allowClear
                  style={{ width: 120 }}
                  value={logFilters.level || undefined}
                  onChange={(value) => setLogFilters({ ...logFilters, level: value || '' })}
                >
                  <Option value="info">信息</Option>
                  <Option value="warn">警告</Option>
                  <Option value="error">错误</Option>
                  <Option value="debug">调试</Option>
                </Select>
                <Select
                  placeholder="选择模块"
                  allowClear
                  style={{ width: 120 }}
                  value={logFilters.module || undefined}
                  onChange={(value) => setLogFilters({ ...logFilters, module: value || '' })}
                >
                  <Option value="system">系统</Option>
                  <Option value="auth">认证</Option>
                  <Option value="user">用户</Option>
                  <Option value="connection">连接</Option>
                </Select>
                <DatePicker
                  placeholder="开始日期"
                  style={{ width: 120 }}
                  value={logFilters.start_time ? dayjs(logFilters.start_time) : null}
                  onChange={(date) => setLogFilters({ 
                    ...logFilters, 
                    start_time: date ? date.format('YYYY-MM-DD') : '' 
                  })}
                />
                <DatePicker
                  placeholder="结束日期"
                  style={{ width: 120 }}
                  value={logFilters.end_time ? dayjs(logFilters.end_time) : null}
                  onChange={(date) => setLogFilters({ 
                    ...logFilters, 
                    end_time: date ? date.format('YYYY-MM-DD') : '' 
                  })}
                />
                <Button type="primary" onClick={handleFilterLogs}>
                  筛选
                </Button>
                <Button onClick={() => {
                  setLogFilters({ level: '', module: '', start_time: '', end_time: '' });
                  loadLogs();
                }}>
                  重置
                </Button>
                <Button 
                  type="primary" 
                  danger 
                  icon={<ClearOutlined />}
                  onClick={handleClearLogs}
                >
                  清除日志
                </Button>
              </div>
            </Card>

            {/* 日志表格 */}
            <Table
              dataSource={logs}
              loading={logsLoading}
              rowKey="id"
              size="small"
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 条记录`,
              }}
              columns={[
                {
                  title: '时间',
                  dataIndex: 'created_at',
                  width: 160,
                  render: (text) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
                },
                {
                  title: '级别',
                  dataIndex: 'level',
                  width: 80,
                  render: (level) => {
                    const colors = {
                      info: 'blue',
                      warn: 'orange',
                      error: 'red',
                      debug: 'green',
                    };
                    return <Tag color={colors[level as keyof typeof colors]}>{level}</Tag>;
                  },
                },
                {
                  title: '模块',
                  dataIndex: 'module',
                  width: 100,
                },
                {
                  title: '消息',
                  dataIndex: 'message',
                  ellipsis: true,
                },
                {
                  title: '用户ID',
                  dataIndex: 'user_id',
                  width: 80,
                  render: (id) => id || '-',
                },
                {
                  title: 'IP地址',
                  dataIndex: 'ip_address',
                  width: 130,
                  render: (ip) => ip || '-',
                },
                {
                  title: '操作',
                  width: 100,
                  render: (_, record) => (
                    <Space>
                      <Button
                        type="link"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => setLogDetailModal({ visible: true, log: record })}
                      >
                        详情
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          Modal.confirm({
                            title: '删除日志',
                            content: '确定要删除这条日志吗？',
                            onOk: () => handleDeleteLog(record.id),
                          });
                        }}
                      >
                        删除
                      </Button>
                    </Space>
                  ),
                },
              ]}
            />

            {/* 日志详情弹窗 */}
            <Modal
              title="日志详情"
              open={logDetailModal.visible}
              onCancel={() => setLogDetailModal({ visible: false, log: null })}
              footer={[
                <Button key="close" onClick={() => setLogDetailModal({ visible: false, log: null })}>
                  关闭
                </Button>
              ]}
              width={600}
            >
              {logDetailModal.log && (
                <div>
                  <p><strong>时间：</strong>{dayjs(logDetailModal.log.created_at).format('YYYY-MM-DD HH:mm:ss')}</p>
                  <p><strong>级别：</strong>
                    <Tag color={
                      logDetailModal.log.level === 'error' ? 'red' :
                      logDetailModal.log.level === 'warn' ? 'orange' :
                      logDetailModal.log.level === 'info' ? 'blue' : 'green'
                    }>
                      {logDetailModal.log.level}
                    </Tag>
                  </p>
                  <p><strong>模块：</strong>{logDetailModal.log.module}</p>
                  <p><strong>消息：</strong>{logDetailModal.log.message}</p>
                  {logDetailModal.log.details && (
                    <p><strong>详情：</strong><br />{logDetailModal.log.details}</p>
                  )}
                  <p><strong>用户ID：</strong>{logDetailModal.log.user_id || '-'}</p>
                  <p><strong>IP地址：</strong>{logDetailModal.log.ip_address || '-'}</p>
                </div>
              )}
            </Modal>
          </div>
        </PermissionGuard>
      ),
    }
  ];

  return (
    <div className="settings-page">
      <Card variant="borderless">
        <Title level={4}>
          <SettingOutlined /> 系统设置
        </Title>
        <Text type="secondary">
          配置系统的各项参数和行为
        </Text>
        
        <Divider />
        
        <Tabs defaultActiveKey="general" items={tabItems} />
      </Card>
    </div>
  );
};

export default SettingsPage;
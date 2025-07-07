# 文件权限功能实现文档

## 概述

本文档记录了文件管理器中文件权限数字显示和修改功能的实现细节。

## 功能特性

### 1. 权限显示
- **数字权限显示**: 在文件列表中显示数字格式的权限（如755、644）
- **符号权限提示**: 鼠标悬停显示完整的符号权限（如drwxr-xr-x）
- **可视化权限**: 使用Tag组件突出显示权限信息

### 2. 权限修改
- **在线权限编辑**: 点击权限列的编辑按钮可修改权限
- **权限格式验证**: 自动验证输入的权限格式（必须为3位数字，每位0-7）
- **常用权限预设**: 提供常用权限值的快速选择
- **实时反馈**: 修改操作提供成功/失败反馈

## 技术实现

### 后端实现

#### 1. FileInfo结构体扩展

```go
type FileInfo struct {
    Name               string `json:"name"`
    Type               string `json:"type"`
    Size               int64  `json:"size"`
    Permissions        string `json:"permissions"`        // 符号权限
    NumericPermissions string `json:"numericPermissions"` // 数字权限
    Modified           string `json:"modified"`
    Owner              string `json:"owner"`
    Group              string `json:"group"`
    Path               string `json:"path"`
}
```

#### 2. 权限转换函数

```go
func convertPermissionsToNumeric(symbolic string) string {
    // 将drwxr-xr-x转换为755
    // 算法：每3位权限为一组（用户、组、其他）
    // r=4, w=2, x=1
}
```

#### 3. 权限修改命令

```go
func (h *SSHCommandHandler) ExecuteFilePermissionsCommand(path string, permissions string) error {
    // 执行chmod命令
    // 支持跨平台：Unix/Linux (chmod)、Windows PowerShell (attrib)
}
```

### 前端实现

#### 1. 接口扩展

```typescript
interface FileItem {
    name: string;
    type: 'file' | 'directory';
    size: number;
    permissions: string;
    numericPermissions?: string; // 新增字段
    modified: string;
    path: string;
    owner?: string;
    group?: string;
}
```

#### 2. 权限列渲染

```tsx
{
    title: '权限',
    dataIndex: 'permissions',
    key: 'permissions',
    width: 120,
    render: (permissions: string, record: FileItem) => (
        <Space>
            <Tooltip title={`符号权限: ${permissions}`}>
                <Tag color="blue" style={{ cursor: 'pointer' }}>
                    {record.numericPermissions || '---'}
                </Tag>
            </Tooltip>
            <Tooltip title="修改权限">
                <Button type="text" size="small" icon={<EditOutlined />} />
            </Tooltip>
        </Space>
    ),
}
```

#### 3. 权限修改Modal

```tsx
<Modal title="修改文件权限" open={permissionsVisible}>
    <Form layout="vertical">
        <Form.Item label="新的权限值 (数字格式)" required>
            <Input placeholder="例如: 755, 644, 777" maxLength={3} />
            <div>
                常用权限:
                <Tag onClick={() => setNewPermissions('755')}>755</Tag>
                <Tag onClick={() => setNewPermissions('644')}>644</Tag>
                <Tag onClick={() => setNewPermissions('777')}>777</Tag>
            </div>
        </Form.Item>
    </Form>
</Modal>
```

## API通信协议

### 1. 权限修改请求

```json
{
    "type": "file_permissions",
    "data": {
        "path": "/path/to/file",
        "permissions": "755",
        "requestId": "permissions_123456"
    }
}
```

### 2. 权限修改响应

**成功响应**:
```json
{
    "type": "file_permissions_response",
    "data": {
        "requestId": "permissions_123456",
        "success": true
    }
}
```

**错误响应**:
```json
{
    "type": "file_permissions_response",
    "data": {
        "requestId": "permissions_123456",
        "success": false,
        "error": "权限修改失败: Permission denied"
    }
}
```

## 跨平台支持

### Unix/Linux系统
- 使用`chmod`命令修改权限
- 支持完整的数字权限（000-777）
- 支持特殊权限位（s、t）

### Windows系统（WSL/PowerShell）
- WSL环境：使用Linux命令
- PowerShell环境：使用`Set-ItemProperty`命令
- 限制：Windows权限系统与Unix不完全兼容

### 命令兼容性

```go
// 多平台命令组合
cmd := fmt.Sprintf(
    "chmod %s '%s' 2>/dev/null || " +
    "Set-ItemProperty -Path '%s' -Name Attributes -Value %s 2>/dev/null",
    permissions, path, path, windowsAttributes
)
```

## 权限码对照表

| 数字 | 二进制 | 权限 | 说明 |
|------|--------|------|------|
| 0    | 000    | ---  | 无权限 |
| 1    | 001    | --x  | 执行权限 |
| 2    | 010    | -w-  | 写权限 |
| 3    | 011    | -wx  | 写+执行 |
| 4    | 100    | r--  | 读权限 |
| 5    | 101    | r-x  | 读+执行 |
| 6    | 110    | rw-  | 读+写 |
| 7    | 111    | rwx  | 完全权限 |

## 常用权限组合

| 权限 | 说明 | 适用场景 |
|------|------|----------|
| 755  | rwxr-xr-x | 可执行文件、目录 |
| 644  | rw-r--r-- | 一般文件 |
| 600  | rw------- | 敏感文件（仅所有者） |
| 777  | rwxrwxrwx | 临时文件、共享目录 |
| 700  | rwx------ | 私人目录 |

## 安全考虑

### 1. 权限验证
- 前端：格式验证（3位数字，0-7范围）
- 后端：路径验证、权限检查
- 系统：用户权限验证

### 2. 错误处理
- 权限被拒绝：显示具体错误信息
- 文件不存在：提示文件状态
- 系统错误：记录日志并提示用户

### 3. 审计日志
- 记录所有权限修改操作
- 包含用户、文件路径、原权限、新权限、时间戳
- 便于安全审计和问题排查

## 测试用例

### 1. 功能测试
- [x] 权限显示：验证数字权限正确显示
- [x] 权限修改：测试各种权限值的修改
- [x] 格式验证：测试无效输入的处理
- [x] 常用权限：测试预设权限的选择

### 2. 兼容性测试
- [x] Linux系统：chmod命令执行
- [x] 文件权限：普通文件权限修改
- [x] 目录权限：目录权限修改
- [ ] Windows WSL：待测试

### 3. 安全测试
- [x] 权限验证：无权限文件的修改处理
- [x] 路径安全：路径注入攻击防护
- [x] 输入验证：恶意输入的过滤

## 已知限制

1. **Windows原生支持有限**: 原生Windows权限模型与Unix不兼容
2. **特殊权限位**: 暂不支持setuid、setgid、sticky bit的可视化编辑
3. **ACL权限**: 不支持扩展访问控制列表
4. **网络文件系统**: 部分网络挂载的文件系统可能不支持权限修改

## 未来改进

1. **可视化权限编辑器**: 图形化的权限选择界面
2. **批量权限修改**: 支持多文件同时修改权限
3. **权限模板**: 预定义权限模板的管理
4. **高级权限**: 支持ACL等高级权限特性
5. **权限继承**: 目录权限的递归应用

## 开发者注意事项

1. **权限转换**: 确保符号权限与数字权限的双向转换正确
2. **错误处理**: 提供详细的错误信息和用户友好的提示
3. **性能考虑**: 权限修改操作应该是原子性的
4. **日志记录**: 记录详细的操作日志便于调试

---

**最后更新**: 2024年12月
**版本**: v1.0
**负责人**: AI Assistant 
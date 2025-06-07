# 文件操作功能实现文档

## 概述

本文档描述了文件管理器中文件删除和重命名操作的实现，包括跨平台兼容性和安全性考虑。

## 功能特性

### 1. 文件删除功能
- **支持文件和目录删除**
- **递归删除目录及其内容**
- **跨平台命令兼容**
- **权限检查**
- **安全确认机制**

### 2. 文件重命名功能
- **支持文件和目录重命名**
- **路径验证**
- **重名检查**
- **跨平台命令兼容**

## 技术实现

### 后端实现

#### SSH命令处理器新增方法

**删除操作 (`ExecuteFileDeleteCommand`)**
```go
func (h *SSHCommandHandler) ExecuteFileDeleteCommand(path string, isDirectory bool) error
```

**重命名操作 (`ExecuteFileRenameCommand`)**
```go
func (h *SSHCommandHandler) ExecuteFileRenameCommand(oldPath string, newPath string) error
```

#### 跨平台命令支持

**删除命令组合**
- **Unix/Linux**: `rm -rf` (目录) / `rm -f` (文件)
- **Windows CMD**: `rmdir /S /Q` (目录) / `del /F /Q` (文件)
- **PowerShell**: `Remove-Item -Recurse -Force`

**重命名命令组合**
- **Unix/Linux**: `mv`
- **Windows CMD**: `move` / `ren`
- **PowerShell**: `Rename-Item` / `Move-Item`

#### 实际命令示例

**删除文件**:
```bash
rm -f 'file.txt' 2>/dev/null || del /F /Q "file.txt" 2>/dev/null || Remove-Item -Path 'file.txt' -Force 2>/dev/null
```

**删除目录**:
```bash
rm -rf 'directory' 2>/dev/null || rmdir /S /Q "directory" 2>/dev/null || Remove-Item -Path 'directory' -Recurse -Force 2>/dev/null
```

**重命名**:
```bash
mv 'old.txt' 'new.txt' 2>/dev/null || move "old.txt" "new.txt" 2>/dev/null || ren "old.txt" "new.txt" 2>/dev/null || Rename-Item -Path 'old.txt' -NewName 'new.txt' 2>/dev/null
```

### WebSocket API

#### 删除请求
```json
{
  "type": "file_delete",
  "data": {
    "path": "/path/to/file",
    "isDirectory": false,
    "requestId": "delete_123456"
  }
}
```

#### 删除响应
```json
{
  "type": "file_delete_response",
  "data": {
    "requestId": "delete_123456",
    "success": true
  }
}
```

#### 重命名请求
```json
{
  "type": "file_rename",
  "data": {
    "oldPath": "/path/to/old.txt",
    "newPath": "/path/to/new.txt",
    "requestId": "rename_123456"
  }
}
```

#### 重命名响应
```json
{
  "type": "file_rename_response",
  "data": {
    "requestId": "rename_123456",
    "success": true
  }
}
```

### 前端实现

#### 用户界面
- **删除按钮**: 每个文件/目录行都有删除图标
- **重命名按钮**: 每个文件/目录行都有编辑图标
- **确认对话框**: 删除操作需要用户确认
- **重命名模态框**: 提供输入新名称的界面

#### 操作流程

**删除流程**:
1. 用户点击删除按钮
2. 显示确认对话框
3. 用户确认后发送WebSocket请求
4. 显示加载状态
5. 接收响应并显示结果
6. 自动刷新文件列表

**重命名流程**:
1. 用户点击重命名按钮
2. 显示重命名输入框
3. 用户输入新名称并确认
4. 发送WebSocket请求
5. 显示加载状态
6. 接收响应并显示结果
7. 自动刷新文件列表

## 安全性考虑

### 1. 权限检查
- **父目录写权限验证**
- **文件/目录存在性检查**
- **操作权限验证**

### 2. 路径验证
- **路径注入防护**
- **相对路径处理**
- **特殊字符转义**

### 3. 错误处理
- **详细的错误分类**
- **用户友好的错误消息**
- **操作失败回滚机制**

## 错误处理

### 常见错误类型
1. **权限被拒绝**: 用户没有足够权限
2. **文件不存在**: 操作的文件/目录不存在
3. **目录不为空**: 尝试删除非空目录（非递归）
4. **文件已存在**: 重命名目标已存在
5. **跨设备操作**: 跨文件系统的移动操作
6. **操作超时**: 长时间运行的操作超时

### 错误消息映射

| 错误类型 | Unix/Linux | Windows | 统一消息 |
|---------|-----------|---------|----------|
| 权限错误 | Permission denied | Access is denied | 权限被拒绝 |
| 文件不存在 | No such file or directory | cannot find | 文件/目录不存在 |
| 文件已存在 | File exists | A duplicate file name exists | 目标文件/目录已存在 |

## 测试建议

### 1. 功能测试
- **删除普通文件**
- **删除空目录**
- **递归删除目录**
- **重命名文件**
- **重命名目录**

### 2. 边界测试
- **特殊字符文件名**
- **长文件名**
- **深层级目录**
- **权限受限文件**

### 3. 错误测试
- **删除不存在的文件**
- **重命名到已存在的名称**
- **权限不足的操作**
- **网络连接中断**

## 性能优化

### 1. 异步操作
- **非阻塞命令执行**
- **超时控制机制**
- **用户反馈及时性**

### 2. 批量操作
- **支持多选删除**（后续版本）
- **批量重命名**（后续版本）

### 3. 缓存策略
- **文件列表自动刷新**
- **操作后状态更新**

## 未来改进

1. **拖拽操作支持**
2. **批量文件操作**
3. **操作历史记录**
4. **撤销/恢复功能**
5. **回收站机制**
6. **文件操作进度显示** 
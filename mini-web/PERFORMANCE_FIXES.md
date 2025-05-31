# 文件浏览器性能优化记录

## 2024-05-31 性能修复

### 问题描述
控制台出现以下性能警告：
1. `[Violation] 'message' handler 用时 <N> 毫秒`
2. `@tanstack/react-virtual.js scroll handler took 398ms`
3. 表单字段元素缺少 id 或 name 属性警告

### 修复措施

#### 1. WebSocket消息处理器优化
- 使用异步处理避免阻塞主线程
- 增加防抖间隔到1000ms
- 简化消息解析逻辑
- 添加更严格的处理条件判断

```typescript
const processMessage = () => {
    // 使用 requestIdleCallback 或 setTimeout 异步处理消息
    const currentTime = Date.now();
    
    // 防抖检查，增加到1000ms
    if (isUpdatingRef.current || (currentTime - lastUpdateTimeRef.current) < 1000) {
        return;
    }
    
    // ... 简化的处理逻辑
};

// 使用异步处理
if (window.requestIdleCallback) {
    window.requestIdleCallback(processMessage);
} else {
    setTimeout(processMessage, 0);
}
```

#### 2. 虚拟化列表优化
- 完全禁用 overscan (设为0)，最大化性能
- 简化 getItemKey 函数
- 移除不必要的配置选项

```typescript
const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 48,
    overscan: 0, // 完全禁用 overscan
    getItemKey: (index) => filteredFiles[index]?.name || index, // 简化key生成
    debug: false,
});
```

#### 3. 表单字段属性修复
为所有表单字段添加必需的 id 和 name 属性：

- 搜索输入框：`id="file-browser-search" name="fileSearch"`
- 全选复选框：`id="file-browser-select-all" name="selectAll"`
- 文件复选框：`id="file-checkbox-${index}" name="fileCheckbox_${file.name}"`
- 新建文件夹输入框：`id="new-folder-name-input" name="newFolderName"`
- 重命名输入框：`id="rename-input" name="renameName"`

### 预期效果
- WebSocket消息处理性能提升
- 虚拟化滚动性能改善
- 消除浏览器表单相关警告
- 改善整体用户体验 
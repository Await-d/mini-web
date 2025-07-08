# 更新日志

## [2025-05-31] 文件浏览器增强功能

### 🎯 问题解决

#### 问题一：不同tab中的保留地址都是一样的问题
- **修复内容**: 修改了FileBrowser组件的路径存储逻辑
- **实现方式**: 
  - 使用`tabKey`作为localStorage的唯一键标识符
  - 每个tab现在拥有独立的路径存储：`file_browser_path_{tabKey}`
  - 在TerminalContext中添加了清除tab路径的功能
  - 关闭tab时会自动清除对应的localStorage记录
- **涉及文件**:
  - `FileBrowser.tsx`: 更新路径存储逻辑
  - `TerminalContext.tsx`: 添加清除路径功能
  - `TerminalContainers.tsx`: 传递tabKey参数
  - `SimpleTerminal/index.tsx`: 支持tabKey属性

#### 问题二：文件列表高度撑开太多且没有滚动条问题
- **问题描述**: 文件列表高度撑开过多，导致界面布局异常，且缺少滚动条
- **修复内容**: 
  - 设置虚拟化文件列表容器的最大高度限制：`maxHeight: '60vh'`
  - 修改容器overflow属性为`hidden`，让滚动由内部元素处理
  - 优化滚动容器CSS样式，增加`height: 100%`和`min-height: 0`
  - 增强滚动条可视性：宽度从8px增加到10px，添加边框效果
  - 为Firefox浏览器添加滚动条样式支持
  - 设置文件浏览器面板和模态框的最大高度限制
- **具体修改**:
  - **FileBrowser.tsx**: 虚拟化容器添加`maxHeight: '60vh'`限制
  - **FileBrowser.css**: 优化滚动容器样式和滚动条外观
  - **styles.css**: 为文件浏览器面板添加高度限制
- **效果**: 文件列表现在有清晰的滚动条，高度不会过度撑开，用户体验更佳

### 🚀 新增功能

#### 功能一：文件查看器 (FileViewer)
- **功能描述**: 实现基本的文件查看功能，支持文本和图片文件
- **支持的文件类型**:
  - **文本文件**: txt, md, json, xml, html, css, js, ts, py, java, cpp, c, php, rb, go, rust, swift, yml, yaml, sql, sh, bash, dockerfile, gitignore, env, properties, csv等
  - **图片文件**: jpg, jpeg, png, gif, bmp, svg, webp, ico, tiff等
- **主要特性**:
  - 语法高亮显示（基于文件扩展名）
  - 图片缩放控制（10%-500%）
  - 图片全屏预览
  - 文件信息展示（大小、路径、类型、编码、MIME类型）
  - 文本内容复制到剪贴板
  - 文件下载功能
  - 响应式设计，适配不同屏幕尺寸
- **涉及文件**:
  - `FileViewer.tsx`: 文件查看器主组件
  - `FileViewer.css`: 文件查看器样式文件

#### 功能二：压缩包管理器 (ArchiveManager)
- **功能描述**: 支持常见压缩包格式的解压缩操作
- **支持的压缩格式**: 
  - zip, tar, gz, tgz, tar.gz, rar, 7z, bz2, xz
- **主要特性**:
  - 查看压缩包内容和文件列表
  - 批量或选择性解压缩文件
  - 创建新的压缩包
  - 解压缩进度显示
  - 压缩选项设置（压缩级别、密码保护等）
  - 解压路径自定义
  - 文件冲突处理（覆盖、跳过、重命名）
- **涉及文件**:
  - `ArchiveManager.tsx`: 压缩包管理器主组件

### 🔧 组件集成和优化

#### FileBrowser组件增强
- **新增状态管理**: 
  - `fileViewerVisible`: 控制文件查看器显示状态
  - `archiveManagerVisible`: 控制压缩包管理器显示状态
  - `selectedFileForView`: 当前选中查看的文件
- **更新查看文件逻辑**: 
  - 自动识别文件类型（普通文件 vs 压缩包）
  - 根据文件类型打开相应的查看器或管理器
- **操作菜单扩展**: 
  - 为压缩包文件添加"解压缩"操作选项
  - 为普通文件保留"查看"操作选项

#### 组件参数传递优化
- **tabKey传递链路完善**: 
  - `TerminalContainers` → `SimpleTerminal` → `FileBrowser`
  - 确保每个组件都能接收到正确的tabKey参数
- **sessionId参数补充**: 
  - 为FileViewer和ArchiveManager添加sessionId参数
  - 支持基于会话的文件操作

### 📱 用户体验改进

#### 界面优化
- **更好的视觉反馈**: 文件操作按钮hover效果优化
- **响应式设计**: 所有新组件都支持移动端适配
- **加载状态**: 文件查看和压缩包操作时显示加载状态
- **错误处理**: 完善的错误提示和用户指导

#### 性能优化
- **虚拟化列表**: 文件列表使用虚拟化提升大文件夹性能
- **异步处理**: 文件查看和压缩包操作采用异步处理
- **内存管理**: 避免大文件加载时的内存溢出

### 🛠️ 技术实现细节

#### 使用的技术栈
- **React 19**: 使用最新的Actions和Hooks特性
- **Ant Design 5**: UI组件库，保持设计一致性
- **@tanstack/react-virtual**: 虚拟化列表性能优化
- **CSS模块化**: 独立的样式文件，避免样式冲突

#### 代码质量
- **TypeScript**: 完整的类型定义，提高代码可维护性
- **组件复用**: 可复用的文件操作组件设计
- **错误边界**: 完善的错误处理机制
- **性能优化**: 使用React.memo和useCallback优化渲染

---

## 总结

本次更新主要解决了tab路径存储问题和文件列表显示问题，同时新增了强大的文件查看和压缩包管理功能。这些改进显著提升了用户在文件管理方面的体验，使得远程文件操作更加便捷和高效。 
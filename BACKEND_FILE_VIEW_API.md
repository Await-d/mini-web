# 后端文件查看API实现指南

## 概述

前端发送 `file_view` 类型的WebSocket消息来请求查看文件内容，后端需要返回JSON格式的响应。

## 前端请求格式

```json
{
  "type": "file_view",
  "data": {
    "path": "/path/to/file.txt",
    "requestId": "file_view_1640995200000_abc123",
    "fileType": "text",
    "maxSize": 10485760
  }
}
```

### 请求参数说明

- `type`: 消息类型，固定为 "file_view"
- `data.path`: 文件的完整路径
- `data.requestId`: 唯一请求ID，用于匹配响应
- `data.fileType`: 文件类型 ("text" | "image" | "video" | "binary")
- `data.maxSize`: 最大文件大小限制（字节）

## 后端响应格式

### 成功响应

```json
{
  "type": "file_view_response",
  "data": {
    "requestId": "file_view_1640995200000_abc123",
    "fileType": "text",
    "content": "文件内容或base64编码的内容",
    "encoding": "utf-8",
    "mimeType": "text/plain",
    "error": null
  }
}
```

### 错误响应

```json
{
  "type": "file_view_response",
  "data": {
    "requestId": "file_view_1640995200000_abc123",
    "error": "文件不存在或无法读取"
  }
}
```

### 响应参数说明

- `type`: 响应类型，固定为 "file_view_response"
- `data.requestId`: 与请求中的requestId相同
- `data.fileType`: 实际的文件类型
- `data.content`: 文件内容
  - 文本文件：直接是文本内容
  - 图片文件：base64编码的内容（不包含data:前缀）
  - 二进制文件：base64编码的内容
- `data.encoding`: 文件编码（如 "utf-8"）
- `data.mimeType`: MIME类型（如 "text/plain", "image/jpeg"）
- `data.error`: 错误信息，成功时为null

## 实现示例（Node.js）

```javascript
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

async function handleFileView(ws, message) {
  const { path: filePath, requestId, fileType, maxSize } = message.data;
  
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return sendFileViewResponse(ws, requestId, null, '文件不存在');
    }
    
    // 检查文件大小
    const stats = fs.statSync(filePath);
    if (stats.size > maxSize) {
      return sendFileViewResponse(ws, requestId, null, `文件过大，超过${maxSize}字节限制`);
    }
    
    // 获取MIME类型
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    const actualFileType = getFileType(mimeType);
    
    let content;
    let encoding = null;
    
    if (actualFileType === 'text') {
      // 文本文件直接读取
      content = fs.readFileSync(filePath, 'utf8');
      encoding = 'utf-8';
    } else if (actualFileType === 'image' || actualFileType === 'binary') {
      // 图片和二进制文件使用base64编码
      const buffer = fs.readFileSync(filePath);
      content = buffer.toString('base64');
      encoding = 'base64';
    } else {
      return sendFileViewResponse(ws, requestId, null, '不支持的文件类型');
    }
    
    // 发送成功响应
    sendFileViewResponse(ws, requestId, {
      fileType: actualFileType,
      content,
      encoding,
      mimeType
    });
    
  } catch (error) {
    console.error('处理文件查看请求失败:', error);
    sendFileViewResponse(ws, requestId, null, `读取文件失败: ${error.message}`);
  }
}

function sendFileViewResponse(ws, requestId, data, error = null) {
  const response = {
    type: 'file_view_response',
    data: {
      requestId,
      error,
      ...data
    }
  };
  
  // 重要：必须发送JSON字符串，不能发送对象或Blob
  ws.send(JSON.stringify(response));
}

function getFileType(mimeType) {
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'binary';
}

// WebSocket消息处理
ws.on('message', (message) => {
  try {
    const data = JSON.parse(message);
    
    if (data.type === 'file_view') {
      handleFileView(ws, data);
    }
    // 处理其他消息类型...
    
  } catch (error) {
    console.error('解析WebSocket消息失败:', error);
  }
});
```

## 实现示例（Python）

```python
import json
import os
import base64
import mimetypes
from pathlib import Path

async def handle_file_view(websocket, message):
    file_path = message['data']['path']
    request_id = message['data']['requestId']
    file_type = message['data']['fileType']
    max_size = message['data']['maxSize']
    
    try:
        # 检查文件是否存在
        if not os.path.exists(file_path):
            await send_file_view_response(websocket, request_id, error="文件不存在")
            return
        
        # 检查文件大小
        file_size = os.path.getsize(file_path)
        if file_size > max_size:
            await send_file_view_response(websocket, request_id, error=f"文件过大，超过{max_size}字节限制")
            return
        
        # 获取MIME类型
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        actual_file_type = get_file_type(mime_type)
        
        if actual_file_type == 'text':
            # 文本文件
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            encoding = 'utf-8'
        elif actual_file_type in ['image', 'binary']:
            # 图片和二进制文件
            with open(file_path, 'rb') as f:
                content = base64.b64encode(f.read()).decode('utf-8')
            encoding = 'base64'
        else:
            await send_file_view_response(websocket, request_id, error="不支持的文件类型")
            return
        
        # 发送成功响应
        await send_file_view_response(websocket, request_id, {
            'fileType': actual_file_type,
            'content': content,
            'encoding': encoding,
            'mimeType': mime_type
        })
        
    except Exception as e:
        print(f"处理文件查看请求失败: {e}")
        await send_file_view_response(websocket, request_id, error=f"读取文件失败: {str(e)}")

async def send_file_view_response(websocket, request_id, data=None, error=None):
    response = {
        'type': 'file_view_response',
        'data': {
            'requestId': request_id,
            'error': error
        }
    }
    
    if data:
        response['data'].update(data)
    
    # 重要：必须发送JSON字符串
    await websocket.send(json.dumps(response))

def get_file_type(mime_type):
    if mime_type.startswith('text/'):
        return 'text'
    elif mime_type.startswith('image/'):
        return 'image'
    elif mime_type.startswith('video/'):
        return 'video'
    else:
        return 'binary'

# WebSocket消息处理
async def handle_message(websocket, message):
    try:
        data = json.loads(message)
        
        if data['type'] == 'file_view':
            await handle_file_view(websocket, data)
        # 处理其他消息类型...
        
    except Exception as e:
        print(f"解析WebSocket消息失败: {e}")
```

## 关键注意事项

1. **必须返回JSON字符串**：后端不能直接发送Blob或二进制数据，必须使用 `JSON.stringify()` 或 `json.dumps()` 序列化后发送

2. **requestId匹配**：响应中的requestId必须与请求中的requestId完全相同

3. **Base64编码**：图片和二进制文件内容需要使用base64编码，但不要添加 `data:` 前缀

4. **错误处理**：任何错误都应该通过 `error` 字段返回，而不是抛出异常

5. **文件大小限制**：检查文件大小，避免加载过大的文件

6. **MIME类型检测**：正确检测和返回文件的MIME类型

7. **字符编码**：文本文件要正确处理字符编码，推荐使用UTF-8

## 测试验证

可以使用以下WebSocket消息测试API：

```json
{
  "type": "file_view",
  "data": {
    "path": "/path/to/test.txt",
    "requestId": "test_123",
    "fileType": "text",
    "maxSize": 1048576
  }
}
```

期望收到类似如下响应：

```json
{
  "type": "file_view_response",
  "data": {
    "requestId": "test_123",
    "fileType": "text",
    "content": "文件内容",
    "encoding": "utf-8",
    "mimeType": "text/plain",
    "error": null
  }
}
``` 
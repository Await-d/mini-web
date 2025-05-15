-- 更新示例RDP服务器为本地RDP服务器
UPDATE connections 
SET 
  host = '127.0.0.1', 
  port = 3389,
  username = 'await',
  password = 'await'
WHERE 
  id = 2 AND name = '示例RDP服务器';

-- 查看更新后的配置
SELECT id, name, protocol, host, port, username, password FROM connections WHERE id = 2; 
-- 更新示例RDP服务器为可用的RDP测试服务器
UPDATE connections 
SET 
  host = 'testrdp.remotetest.net', 
  port = 3389,
  username = 'test',
  password = 'Password1'
WHERE 
  id = 2 AND name = '示例RDP服务器';

-- 查看更新后的配置
SELECT id, name, protocol, host, port, username, password FROM connections WHERE id = 2; 
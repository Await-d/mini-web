-- 更新示例RDP服务器为公共可用的测试服务器
UPDATE connections 
SET 
  host = 'lab.crossle.icu', 
  port = 3389,
  username = 'Administrator',
  password = 'crossle'
WHERE 
  id = 2 AND name = '示例RDP服务器';

-- 查看更新后的配置
SELECT id, name, protocol, host, port, username, password FROM connections WHERE id = 2; 
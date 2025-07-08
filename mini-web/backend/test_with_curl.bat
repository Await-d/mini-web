@echo off
echo 测试登录API：admin用户

echo 发送请求到 http://localhost:8080/api/auth/login
curl -X POST http://localhost:8080/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"

echo.
echo.
pause
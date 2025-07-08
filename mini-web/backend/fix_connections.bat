@echo off
echo 正在修复数据库连接表...
echo 此脚本将解决连接表中NULL值导致的错误问题

cd /d %~dp0
go run tools/fix_connections.go

echo.
pause
@echo off
chcp 65001 >nul
setlocal

set "SESSION=C:\Users\me\.dsh\sessions\--C-Users-me-Documents-deepseek-harness-default-workspace--\session-10d841fa-6514-4a8f-8bb2-6d4a3fe41e9f\session.v4.jsonl.zstd"
set "CACHE=C:\Users\me\.dsh\storages\session_projcache\sessions\session-10d841fa-6514-4a8f-8bb2-6d4a3fe41e9f.json"
set "TOOL=D:\Work\Code\FatFishsMemory\tools\repair-session.mjs"
set "APP=C:\Users\me\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe"

echo.
echo === 修复会话日志（剔除插件注入的事件）===
if not exist "%SESSION%" (
  echo [错误] 找不到会话文件：%SESSION%
  pause
  exit /b 1
)

node "%TOOL%" "%SESSION%" --apply
if errorlevel 1 (
  echo [错误] 修复失败，原文件已保留
  pause
  exit /b 1
)

echo.
echo === 把 UI 投影缓存挪走（让界面重建）===
if exist "%CACHE%" (
  move /y "%CACHE%" "%CACHE%.bak" >nul
  echo 已移动缓存 -> .bak
) else (
  echo 没有缓存文件，跳过
)

echo.
echo === 启动 DSH ===
start "" "%APP%"

echo 完成，可以关掉这个窗口了。
timeout /t 3 >nul

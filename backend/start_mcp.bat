@echo off
echo Starting Playwright MCP Server...
echo Ensure you have Node.js installed.
npx -y @playwright/mcp@latest --browser=chrome --port=8931 --isolated --output-dir ./mcp --save-session
pause

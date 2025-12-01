@echo off
echo ========================================
echo   Agentic Flow - Backend Server
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

echo [1/3] Checking dependencies...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r requirements.txt
) else (
    echo Dependencies already installed
)

echo.
echo [2/3] Starting FastAPI server...
echo.
echo Server will be available at:
echo   - Main: http://localhost:8000
echo   - Docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

echo IMPORTANT: Make sure 'start_mcp.bat' is running in another terminal!
echo.

REM Start the server
python main.py

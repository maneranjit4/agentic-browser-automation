# Agentic Flow - Dummy Backend

A FastAPI backend that simulates an agentic workflow with human-in-the-loop functionality.

## Features

✅ **Plan Generation** - Automatically generates execution plans based on user input
✅ **Human-in-the-Loop** - Waits for user approval before executing plans
✅ **Tool Execution Simulation** - Simulates various browser and search tools
✅ **Streaming Responses** - Server-Sent Events (SSE) for real-time updates
✅ **Session Management** - Maintains conversation state per session
✅ **CORS Enabled** - Works with any frontend origin

## Quick Start

### Option 1: Using the Batch File (Recommended)

Simply double-click `start_backend.bat` - it will:
1. Check if Python is installed
2. Install dependencies if needed
3. Start the server

### Option 2: Manual Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Start the server
python main.py
```

The server will start at **http://localhost:8000**

## API Endpoints

### 🏠 Root Endpoint
```
GET /
```
Returns server information and available endpoints.

### 💬 Chat Endpoint
```
POST /chat
Content-Type: application/json

{
  "message": "Please visit amazon for me",
  "session_id": "session_123"
}
```

Returns a **Server-Sent Events (SSE)** stream with the following event types:

#### Plan Event
Sent first to show the execution plan:
```json
{
  "type": "plan",
  "data": {
    "steps": [
      {
        "title": "Navigate to Amazon",
        "description": "Open browser and navigate to amazon.com",
        "action": "browser_navigate",
        "params": {"url": "https://amazon.com"}
      }
    ]
  }
}
```

#### Tool Start Event
Sent when a tool begins execution:
```json
{
  "type": "tool_start",
  "data": {
    "tool_name": "browser_navigate",
    "input": {"url": "https://amazon.com"},
    "step_index": 0
  }
}
```

#### Tool End Event
Sent when a tool completes:
```json
{
  "type": "tool_end",
  "data": {
    "tool_name": "browser_navigate",
    "output": {
      "success": true,
      "url": "https://amazon.com",
      "status_code": 200
    },
    "error": null,
    "step_index": 0
  }
}
```

#### Message Event
Sent for final response:
```json
{
  "type": "message",
  "data": {
    "content": "✅ Successfully completed all steps!"
  }
}
```

### ✅ Approve Plan Endpoint
```
POST /approve-plan
Content-Type: application/json

{
  "session_id": "session_123",
  "approved": true
}
```

Response:
```json
{
  "status": "approved",
  "message": "Plan approved and executing"
}
```

### 🏥 Health Check
```
GET /health
```

Returns server health status and active session count.

## Simulated Tools

The backend simulates the following tools:

| Tool | Description | Duration | Success Rate |
|------|-------------|----------|--------------|
| `browser_navigate` | Navigate to a URL | 2s | 95% |
| `browser_click` | Click an element | 1s | 90% |
| `browser_type` | Type text | 1.5s | 95% |
| `browser_screenshot` | Take screenshot | 0.5s | 100% |
| `browser_scroll` | Scroll page | 0.5s | 100% |
| `search_web` | Search the web | 2s | 95% |

## Smart Plan Generation

The backend generates different plans based on keywords in your message:

- **"amazon"** → Navigate to Amazon, take screenshot, search for product
- **"google" or "search"** → Navigate to Google, perform search, take screenshot
- **Other messages** → Generic 3-step plan

## Example Usage

### Using cURL
```bash
# Start a chat
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Please visit amazon for me", "session_id": "test_123"}'

# Approve the plan (in another terminal while chat is waiting)
curl -X POST http://localhost:8000/approve-plan \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test_123", "approved": true}'
```

### Using Python
```python
import requests
import json

# Start chat
response = requests.post(
    "http://localhost:8000/chat",
    json={"message": "Search for laptops", "session_id": "py_session"},
    stream=True
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = line[6:]
            if data != '[DONE]':
                event = json.loads(data)
                print(f"Event: {event['type']}")
                
                # Approve plan when received
                if event['type'] == 'plan':
                    requests.post(
                        "http://localhost:8000/approve-plan",
                        json={"session_id": "py_session", "approved": True}
                    )
```

## Interactive API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Configuration

Edit `main.py` to customize:

- **Port**: Change `port=8000` in the `uvicorn.run()` call
- **Host**: Change `host="0.0.0.0"` to restrict access
- **Tools**: Add/modify tools in the `DUMMY_TOOLS` list
- **Plan Generation**: Customize the `generate_plan()` function
- **Execution Time**: Adjust `duration` values in tool definitions

## Troubleshooting

### Port Already in Use
If port 8000 is already in use, edit `main.py` and change:
```python
uvicorn.run(app, host="0.0.0.0", port=8001)  # Use different port
```

### CORS Issues
CORS is already enabled for all origins. If you still have issues, check your browser console.

### Dependencies Not Installing
Make sure you have Python 3.8+ installed:
```bash
python --version
```

## Testing with the Frontend

1. Start the backend: `start_backend.bat`
2. Open the frontend: `../start.bat`
3. Send a message like "Please visit amazon for me"
4. Watch the plan appear at the top
5. Click "Approve & Execute" to see the tools execute

## License

MIT License - Free to use and modify!

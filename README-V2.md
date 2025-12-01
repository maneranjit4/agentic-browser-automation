# 🎉 Agentic Flow V2 - Playwright Browser Automation UI

## ✨ New Design Overview

This is a **completely redesigned** UI specifically for Playwright MCP-based browser automation with human-in-the-loop workflow.

### 📐 Layout

```
┌─────────────────────────────────────────────────────────┐
│              Agentic Flow Header                         │
├──────────────────────────┬──────────────────────────────┤
│   CHAT (50%)             │   BROWSER VIEW (50%)         │
│                          │                              │
│  User: "Visit amazon"    │   ┌────────────────────┐    │
│                          │   │                    │    │
│  ┌─ Execution Plan ───┐ │   │  Latest Screenshot │    │
│  │ 1. Navigate        │ │   │  from Playwright   │    │
│  │ 2. Screenshot      │ │   │                    │    │
│  │ [Approve] [Reject] │ │   │  Auto-updates      │    │
│  └────────────────────┘ │   │  during execution  │    │
│                          │   └────────────────────┘    │
│  🔧 Tool: Navigate       │                              │
│     ├─ Input: {...}      │                              │
│     └─ Output: ✓         │                              │
│                          │                              │
│  AI: "Done! ✓"          │                              │
│                          │                              │
│  [Type message...]       │                              │
└──────────────────────────┴──────────────────────────────┘
```

## 🎯 Key Features

### Left Panel - Chat (50%)
- ✅ **User messages** - Your input
- ✅ **Inline plan cards** - Collapsed by default, expandable
  - Shows all execution steps
  - Approve/Reject buttons
  - Stays visible during execution
- ✅ **Inline tool execution cards** - Collapsed by default
  - Shows tool name with emoji icon
  - Real-time status updates (Running → Completed/Failed)
  - Expandable to show input/output details
- ✅ **AI responses** - Final messages from the assistant

### Right Panel - Browser View (50%)
- ✅ **Latest screenshot** from Playwright
- ✅ **Auto-updates** when tools execute
- ✅ **Fit to screen** button
- ✅ **Refresh** button

## 🚀 Quick Start

### 1. Start Backend
```bash
cd backend
py .\main.py
```
Backend should be running on **http://localhost:8001**

### 2. Open Frontend
Double-click `start-v2.bat` or open `index-v2.html` in your browser

### 3. Test It Out
Send a message like:
- "Please visit amazon.com"
- "Navigate to google.com and search for laptops"
- "Go to github.com and take a screenshot"

## 📋 How It Works

### 1. User Sends Message
```
User: "Visit amazon for me"
```

### 2. Plan Appears (Collapsed by Default)
```
┌─ Execution Plan ─────────────────┐
│ 📋 Execution Plan  [3 steps]  ▼ │
└──────────────────────────────────┘
```

Click to expand:
```
┌─ Execution Plan ─────────────────┐
│ 📋 Execution Plan  [3 steps]  ▼ │
├──────────────────────────────────┤
│ 1. Navigate to Amazon            │
│ 2. Take Screenshot               │
│ 3. Analyze Page                  │
│                                  │
│ [Reject]  [Approve & Execute]    │
└──────────────────────────────────┘
```

### 3. Click "Approve & Execute"
Plan stays visible, approval buttons disappear

### 4. Tools Execute (Inline in Chat)
```
🔧 browser_navigate  [✓ Completed]
```

Click to expand:
```
┌─ browser_navigate ───────────────┐
│ 🌐 browser_navigate  [✓ Completed]│
├──────────────────────────────────┤
│ Input:                           │
│ {                                │
│   "url": "https://amazon.com"    │
│ }                                │
│                                  │
│ Output:                          │
│ {                                │
│   "success": true,               │
│   "status_code": 200             │
│ }                                │
└──────────────────────────────────┘
```

### 5. Browser View Updates
Right panel shows the latest screenshot automatically

### 6. AI Responds
```
AI: "✅ Successfully navigated to Amazon!"
```

## 🎨 Design Features

### Inline Plans
- **Default state**: Collapsed (shows just title and step count)
- **Expandable**: Click to see all steps
- **Persistent**: Stays visible during and after execution
- **Contextual**: Appears right after the user message it belongs to

### Inline Tool Cards
- **Default state**: Collapsed (shows just tool name and status)
- **Expandable**: Click to see input/output details
- **Real-time updates**: Status changes from Running → Completed/Failed
- **Color-coded**: Blue (running), Green (completed), Red (failed)
- **Emoji icons**: Visual indicators for different tool types

### Browser View
- **Auto-updates**: Shows latest screenshot from any tool
- **Responsive**: Fits to screen size
- **Controls**: Refresh and fit-to-screen buttons
- **Empty state**: Shows placeholder when no screenshot available

## 🔧 Backend Integration

Your backend should send these events:

### Plan Event
```json
{
  "type": "plan",
  "data": {
    "steps": [
      {
        "title": "Navigate to Amazon",
        "description": "Open browser and go to amazon.com",
        "action": "browser_navigate"
      }
    ]
  }
}
```

### Tool Start Event
```json
{
  "type": "tool_start",
  "data": {
    "tool_name": "browser_navigate",
    "input": {"url": "https://amazon.com"}
  }
}
```

### Tool End Event
```json
{
  "type": "tool_end",
  "data": {
    "tool_name": "browser_navigate",
    "output": {
      "success": true,
      "screenshot": "data:image/png;base64,..."
    },
    "error": null
  }
}
```

**Important**: Include `screenshot` in the output of any tool that captures the browser state!

### Message Event
```json
{
  "type": "message",
  "data": {
    "content": "Successfully completed the task!"
  }
}
```

## 📁 Files

- `index-v2.html` - New HTML structure
- `style-v2.css` - New CSS with inline cards
- `app-v2.js` - New JavaScript logic
- `start-v2.bat` - Quick launcher

## ⚙️ Settings

Click the settings icon (⚙️) to configure:
- **API Endpoint**: Backend URL (default: http://localhost:8001)
- **Auto-approve plans**: Skip manual approval for testing
- **Show timestamps**: Display message times

## 🎯 Differences from V1

| Feature | V1 | V2 |
|---------|----|----|
| Plan location | Pinned at top | Inline in chat |
| Plan default state | Expanded | Collapsed |
| Tool execution | Separate panel | Inline in chat |
| Browser view | Tool panel | Screenshot panel |
| Layout | Chat + Tools | Chat + Browser |

## 🐛 Troubleshooting

### Plan not appearing
- Check backend is sending `plan` event
- Check browser console (F12) for errors

### Tools not showing
- Verify backend sends `tool_start` and `tool_end` events
- Check event structure matches expected format

### Browser view empty
- Ensure tool output includes `screenshot` field
- Screenshot should be base64 data URL: `data:image/png;base64,...`

### Can't approve plan
- Check backend `/approve-plan` endpoint is working
- Verify session_id matches

## 🎉 Enjoy!

This new design is specifically optimized for Playwright browser automation workflows with clear visual feedback and human control at every step!

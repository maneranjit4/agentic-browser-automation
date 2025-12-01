# 🚀 Quick Start Guide - Agentic Flow

## ✅ Setup Complete!

Your agentic chatbot UI with human-in-the-loop is ready to use!

## 📁 Project Structure

```
fe/
├── index.html              # Main frontend UI
├── style.css              # Premium design system
├── app.js                 # Frontend logic & API integration
├── start.bat              # Launch frontend
├── README.md              # Frontend documentation
│
└── backend/
    ├── main.py            # FastAPI backend server
    ├── requirements.txt   # Python dependencies
    ├── start_backend.bat  # Launch backend
    └── README.md          # Backend documentation
```

## 🎯 How to Use

### Step 1: Start the Backend ✅ (Already Running!)

The backend is currently running at **http://localhost:8000**

To restart it later:
```bash
cd backend
python main.py
```

Or double-click `backend/start_backend.bat`

### Step 2: Open the Frontend

**Option A: Double-click `start.bat`**

**Option B: Manual**
- Open `index.html` in your browser
- Or use: `python -m http.server 8080` and visit http://localhost:8080

### Step 3: Test the Flow

1. **Send a message** like:
   - "Please visit amazon for me"
   - "Search for laptops on Google"
   - "Navigate to github.com"

2. **Watch the plan appear** at the top of the screen
   - It will show all the steps the agent plans to execute
   - Each step has a title, description, and status

3. **Approve or Reject** the plan
   - Click "Approve & Execute" to proceed
   - Click "Reject" to cancel

4. **Monitor tool execution** on the right panel
   - Each tool call appears as an expandable card
   - Shows input parameters and output results
   - Real-time status updates (Running → Completed/Failed)

5. **See the final response** in the chat

## 🎨 Features Showcase

### Pinned Plan Section
- Appears at the top when a plan is generated
- Expandable/collapsible
- Shows step-by-step execution plan
- Real-time status updates for each step

### Tool Execution Panel
- Right side of the screen
- Shows all tool calls in real-time
- Expandable cards with input/output
- Supports screenshots in outputs

### Chat Interface
- Beautiful message bubbles
- Typing indicators
- Timestamps (toggleable in settings)
- Smooth animations

## 🧪 Example Messages to Try

### Amazon Flow
```
Please visit amazon for me
```
**Plan Generated:**
1. Navigate to Amazon
2. Take Screenshot
3. Search for Product

### Google Search Flow
```
Search for "best laptops 2024"
```
**Plan Generated:**
1. Navigate to Google
2. Perform Search
3. Take Screenshot

### Generic Flow
```
Help me automate my workflow
```
**Plan Generated:**
1. Analyze Request
2. Execute Action
3. Generate Response

## ⚙️ Settings

Click the settings icon (⚙️) to configure:

- **API Endpoint**: Backend URL (default: http://localhost:8000)
- **Auto-approve plans**: Skip manual approval (for testing)
- **Show timestamps**: Display message times

## 🔧 Troubleshooting

### Backend Not Responding
1. Check if backend is running: http://localhost:8000
2. You should see: `{"name":"Agentic Flow Backend","version":"1.0.0",...}`
3. If not, restart: `cd backend && python main.py`

### CORS Errors
- The backend has CORS enabled by default
- If you still see errors, make sure you're accessing the frontend via a proper URL (not `file://`)
- Use: `python -m http.server 8080` in the `fe` folder

### Plan Not Appearing
1. Open browser console (F12)
2. Check for errors
3. Verify the backend is sending plan events
4. Test backend directly: http://localhost:8000/docs

### Tools Not Executing
- Make sure you clicked "Approve & Execute"
- The backend waits for approval before executing
- Check the browser console for errors

## 📊 Backend API Testing

Visit **http://localhost:8000/docs** for interactive API documentation!

### Test with cURL

```bash
# Health check
curl http://localhost:8000/health

# Start a chat (will stream events)
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"visit amazon\", \"session_id\": \"test_123\"}"

# Approve plan (in another terminal)
curl -X POST http://localhost:8000/approve-plan \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"test_123\", \"approved\": true}"
```

## 🎥 Expected Flow

1. **User sends message** → Frontend sends POST to `/chat`
2. **Backend generates plan** → Sends `plan` event
3. **Plan appears at top** → User sees expandable plan section
4. **User approves** → Frontend sends POST to `/approve-plan`
5. **Backend executes tools** → Sends `tool_start` and `tool_end` events
6. **Tools appear on right** → Real-time execution monitoring
7. **Backend sends final message** → Appears in chat
8. **Flow complete** → User can send another message

## 🌟 What Makes This Special

✨ **Premium Design** - Glassmorphism, gradients, smooth animations
🎯 **Split View** - Chat + Tool monitoring side-by-side
📋 **Pinned Plans** - Always visible at the top during execution
🔧 **Tool Transparency** - See exactly what the agent is doing
👤 **Human Control** - Approve/reject before execution
⚡ **Real-time** - Streaming updates via Server-Sent Events
💾 **Session Persistence** - Maintains conversation state
🎨 **Responsive** - Works on desktop and mobile

## 📝 Next Steps

### For Development:
1. Replace dummy backend with your real LangGraph implementation
2. Customize the plan generation logic
3. Add more tool types
4. Implement authentication
5. Add conversation history

### For Production:
1. Use environment variables for configuration
2. Add proper error handling
3. Implement rate limiting
4. Add logging and monitoring
5. Deploy to a cloud service

## 🆘 Need Help?

1. **Check the READMEs**:
   - Frontend: `README.md`
   - Backend: `backend/README.md`

2. **Browser Console** (F12):
   - See network requests
   - Check for JavaScript errors
   - View streaming events

3. **Backend Logs**:
   - Check the terminal where backend is running
   - See incoming requests and responses

4. **API Documentation**:
   - http://localhost:8000/docs (Swagger UI)
   - http://localhost:8000/redoc (ReDoc)

## 🎉 Enjoy!

You now have a fully functional agentic chatbot UI with:
- Beautiful, modern interface
- Human-in-the-loop workflow
- Real-time tool execution monitoring
- Plan visualization and approval

Start chatting and watch the magic happen! ✨

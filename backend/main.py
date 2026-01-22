from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import json
import asyncio
from typing import Optional, Dict
from pathlib import Path
from langchain_core.messages import HumanMessage, AIMessage

from mcp.client.sse import sse_client
from mcp.client.session import ClientSession
from langchain_mcp_adapters.tools import load_mcp_tools
from agent.config import MCP_SERVER_URL

# Import our agent setup
from agent.graph import build_graph

app = FastAPI(title="Agentic Flow Backend", version="1.0.0")

# Mount static files for screenshots
mcp_dir = Path(__file__).parent.parent / "mcp"
mcp_dir.mkdir(exist_ok=True)
app.mount("/screenshots", StaticFiles(directory=str(mcp_dir)), name="screenshots")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for approval events
# Format: session_id -> {"event": asyncio.Event(), "approved": bool}
approval_states: Dict[str, Dict] = {}

class ChatRequest(BaseModel):
    message: str
    session_id: str

class ApprovalRequest(BaseModel):
    session_id: str
    approved: bool
    feedback: Optional[str] = ""

def json_default(obj):
    try:
        return str(obj)
    except:
        return "<non-serializable>"

from langgraph.checkpoint.memory import MemorySaver

# Global memory saver for in-memory persistence
memory = MemorySaver()

# ... imports ...

async def chat_stream(message: str, session_id: str):
    # Connect to MCP Server
    try:
        async with sse_client(MCP_SERVER_URL) as streams:
            async with ClientSession(streams[0], streams[1]) as session:
                await session.initialize()
                
                # Load tools
                try:
                    tools = await load_mcp_tools(session)
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'data': {'message': f'Failed to load tools: {str(e)}'}})}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                # Initialize Graph with global memory
                try:
                    # We use the global memory saver
                    try:
                        graph = await build_graph(tools, checkpointer=memory)
                    except Exception as e:
                        yield f"data: {json.dumps({'type': 'error', 'data': {'message': f'Failed to init graph: {str(e)}'}})}\n\n"
                        yield "data: [DONE]\n\n"
                        return

                    config = {"configurable": {"thread_id": session_id}}
                    
                    # Initial run or resume
                    # If this is a new session, we start with the user message
                    # If resuming, we might need to handle feedback
                    
                    # We'll use a loop to handle the "Run -> Interrupt -> Wait -> Resume" cycle
                    # For a single HTTP request, we might only do one cycle if we want to hold the connection,
                    # or we can keep the connection open. The user wants "streaming", so we keep it open.
                    
                    current_input = {"messages": [HumanMessage(content=message)]}
                    
                    while True:
                        try:
                            async for event in graph.astream_events(
                                current_input,
                                config,
                                version="v1"
                            ):
                                kind = event["event"]
                                name = event["name"]
                                
                                # 1. Handle Planning Output
                                if kind == "on_chain_end" and name == "planning":
                                    output = event["data"].get("output")
                                    # print(f"DEBUG: Planning output: {output}")
                                    if output and "todos" in output:
                                        todos = output["todos"]
                                        # Map todos to frontend plan format
                                        steps = []
                                        for t in todos:
                                            # Handle both dict and object access
                                            step_id = t.get('step') if isinstance(t, dict) else getattr(t, 'step', 0)
                                            content = t.get('content') if isinstance(t, dict) else getattr(t, 'content', '')
                                            status = t.get('status') if isinstance(t, dict) else getattr(t, 'status', 'pending')
                                            
                                            steps.append({
                                                "title": f"Step {step_id}",
                                                "description": content,
                                                "status": status,
                                                "step_index": step_id
                                            })
                                        plan = {"steps": steps}
                                        # print(f"DEBUG: Sending plan: {plan}")
                                        yield f"data: {json.dumps({'type': 'plan', 'data': plan})}\n\n"

                                # 2. Handle Tool Execution
                                elif kind == "on_tool_start" and event['metadata']['langgraph_node'] != "screenshot":
                                    print(f"{event=}")
                                    print(f"{name=}")
                                    yield f"data: {json.dumps({'type': 'tool_start', 'data': {'tool_name': event['name'], 'input': event['data'].get('input')}}, default=json_default)}\n\n"
                                elif kind == "on_tool_end" and event['metadata']['langgraph_node'] != "screenshot":
                                    yield f"data: {json.dumps({'type': 'tool_end', 'data': {'tool_name': event['name'], 'output': str(event['data'].get('output'))}}, default=json_default)}\n\n"
                                
                                # 3. Handle Screenshot Updates  
                                elif kind == "on_chain_end" and name == "screenshot":
                                    output = event["data"].get("output")
                                    # print(f"DEBUG: Screenshot node output: {output}")
                                    
                                    if output:
                                        # The output is a dict with 'screenshot' and 'snapshot' keys
                                        screenshot_text = output.get("screenshot", "")
                                        # print(f"DEBUG: Screenshot text: {screenshot_text[:200]}")
                                        
                                        # Extract the file path from the Playwright MCP output
                                        # Format: "### Result\nTook the viewport screenshot and saved it as C:\...\screenshot_1.png\n..."
                                        import re
                                        
                                        # Look for the specific filename pattern we requested
                                        # We know it should end with session_id/screenshot_*.png
                                        # But regex on full path is safer.

                                        # If the tool output is just the path (some implementations might do that)
                                        if screenshot_text.strip().endswith(".png") and len(screenshot_text.split('\n')) == 1:
                                             path_match_str = screenshot_text.strip()
                                        else:
                                             match = re.search(r'(?:saved it as|path:) ([^\n]+\.png)', screenshot_text, re.IGNORECASE)
                                             path_match_str = match.group(1).strip() if match else None

                                        if path_match_str:
                                            screenshot_path = path_match_str
                                            # print(f"DEBUG: Extracted screenshot path: {screenshot_path}")
                                            
                                            # robustly extract relative path based on session_id
                                            if session_id in screenshot_path:
                                                 # Extract from session_id onwards
                                                 idx = screenshot_path.find(session_id)
                                                 rel_path = screenshot_path[idx:]
                                                 # Normalize slashes
                                                 rel_path = rel_path.replace("\\", "/")
                                                 screenshot_url = f"http://localhost:8001/screenshots/{rel_path}"
                                                 yield f"data: {json.dumps({'type': 'screenshot', 'data': {'url': screenshot_url}})}\n\n"
                                            elif "mcp" in screenshot_path:
                                                 # Fallback to old logic
                                                 parts = screenshot_path.split("mcp")[-1]
                                                 parts = parts.strip("\\/")
                                                 screenshot_url = f"http://localhost:8001/screenshots/{parts.replace(chr(92), '/')}"
                                                 yield f"data: {json.dumps({'type': 'screenshot', 'data': {'url': screenshot_url}})}\n\n"
 
                                # 4. Handle LLM Message (optional, for transparency)
                                # elif kind == "on_chat_model_stream": ...

                        except Exception as e:
                            yield f"data: {json.dumps({'type': 'error', 'data': {'message': f'Error during execution: {str(e)}'}})}\n\n"
                            yield "data: [DONE]\n\n"
                            return
                        
                        # Check state after run
                        state = await graph.aget_state(config)
                        
                        if not state.next:
                            # Execution finished (END reached)
                            # Send final message
                            last_msg = state.values["messages"][-1] if state.values.get("messages") else None
                            content = last_msg.content if last_msg else "Task completed."
                            yield f"data: {json.dumps({'type': 'message', 'data': {'content': content}})}\n\n"
                            yield "data: [DONE]\n\n"
                            return
                        
                        # Check if we have an interrupt
                        if state.tasks and len(state.tasks) > 0:
                            task = state.tasks[0]
                            if hasattr(task, 'interrupts') and task.interrupts:
                                # We have an interrupt - send it to the frontend
                                interrupt_data = task.interrupts[0].value
                                # print(f"DEBUG: Interrupt data: {interrupt_data}")
                                
                                # Send approval request to frontend
                                yield f"data: {json.dumps({'type': 'approval', 'data': interrupt_data})}\n\n"
                                
                                # Wait for user decision
                                if session_id not in approval_states:
                                    approval_states[session_id] = {"event": asyncio.Event(), "approved": False}
                                
                                approval_states[session_id]["event"].clear()
                                approval_states[session_id]["approved"] = False
                                
                                try:
                                    await asyncio.wait_for(approval_states[session_id]["event"].wait(), timeout=300)
                                except asyncio.TimeoutError:
                                    yield f"data: {json.dumps({'type': 'error', 'data': {'message': 'Approval timeout'}})}\n\n"
                                    yield "data: [DONE]\n\n"
                                    return
                                
                                decision = approval_states[session_id]["approved"]
                                feedback = approval_states[session_id].get("feedback", "")
                                
                                # Resume with the decision using Command
                                from langgraph.types import Command
                                # If feedback is provided, send it as a dict
                                if feedback:
                                    current_input = Command(resume={"approved": decision, "feedback": feedback})
                                else:
                                    current_input = Command(resume=decision)
                            else:
                                # No interrupt, just continue
                                current_input = None
                        else:
                            # No tasks, continue
                            current_input = None
 

                except Exception as e:
                     yield f"data: {json.dumps({'type': 'error', 'data': {'message': f'Graph error: {str(e)}'}})}\n\n"
                     yield "data: [DONE]\n\n"
                     return
        
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'data': {'message': f'Failed to connect to MCP server: {str(e)}'}})}\n\n"
        yield "data: [DONE]\n\n"
        return
        
    yield "data: [DONE]\n\n"

@app.post("/chat")
async def chat(request: ChatRequest):
    """Chat endpoint with streaming response"""
    return StreamingResponse(
        chat_stream(request.message, request.session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@app.post("/approve-plan")
async def approve_plan(request: ApprovalRequest):
    """Handle plan approval/rejection"""
    if request.session_id in approval_states:
        approval_states[request.session_id]["approved"] = request.approved
        approval_states[request.session_id]["feedback"] = request.feedback or ""
        approval_states[request.session_id]["event"].set()
        
        status = "approved" if request.approved else "rejected"
        return {
            "status": status,
            "message": f"Plan {status}"
        }
    return {"status": "error", "message": "Session not found or not waiting for approval"}

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Agentic Flow Backend",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "chat": "/chat",
            "approve_plan": "/approve-plan"
        }
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "sessions_waiting": len(approval_states)
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Agentic Flow Backend...")
    print("📡 Server running at: http://localhost:8001")
    print("📚 API docs at: http://localhost:8001/docs")
    uvicorn.run(app, host="0.0.0.0", port=8001)

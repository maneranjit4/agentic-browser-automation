import asyncio
import os
import json
from typing import Literal, Dict, Any, List, Optional
from datetime import datetime
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI, AzureChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langgraph.config import RunnableConfig
from langgraph.types import Command, interrupt

load_dotenv()
from .state import AgentState, Todo
from .config import MCP_SERVER_URL

# --- Prompts ---

PLANNER_PROMPT = """You are a Planning Agent.
Your job is to create or update a plan status to achieve the user's objective.
when there is no plan, create a detailed step-by-step plan and have 1st step's status as "in_progress".
when there is a plan, review the "in_progress" step.

Current Objective: {objective}

User Feedback: {user_feedback}

Current Plan:
{current_plan}

Current Page Snapshot/Observation:
{snapshot}

Current Screenshot:
{current_screenshot}

Instructions:
1. If there is no plan, create a detailed step-by-step plan by breaking the user query as per you understanding.
    - just break the user query into steps.
    - if user query itself is a step then create a plan with that step.
    - content of the step should be an action to be taken, like "navigate to some-site.com" or "search something" or "fill the form" or "click on the ..."
    - content should not be like ensure something... or check something...
    - do not add any step that is not related to the user query and do not exaggerate the steps.
    - status can be only "pending"->"in_progress"->"completed".
2. If there is a plan, review the "in_progress" step.
   - If it seems completed based on observations, mark it "completed" and set the next step to "in_progress".
   - If there is some blockage then keep that step's status as "in_progress".
   - you can only update the statuses but not thet plan.
   - do not add any new step/s unless there is User Feedback.
3. Return the full updated list of todos.
"""

ACTOR_PROMPT = """You are an Actor Agent.
Your job is to execute the current "in_progress" step of the plan.

Current Plan:
{plan_status}

Instructions:
1. Focus ONLY on the current "in_progress" step.
2. Use the available tools (browser navigation, clicking, typing) to accomplish this step.
3. If the step requires multiple actions (e.g., fill form and submit), you can chain them.
4. If you have completed the step or need to verify, stop and let the planner review.
5. If you cannot proceed, explain why.
"""

# --- Structured Output Models ---

class Plan(BaseModel):
    todos: List[Todo]

# --- Graph Definition ---

async def build_graph(tools=None, checkpointer=None):
    # Setup Model
    llm = AzureChatOpenAI(
        azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-5-nano"),
        openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
    )
    
    # Bind tools to model for the actor
    if tools:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    # --- Nodes ---

    async def start_node(state: AgentState, config: RunnableConfig):
        # Initialize state if needed
        return {"todos": [], "session_id": config["configurable"]["thread_id"]}

    async def planning_node(state: AgentState):
        messages = state["messages"]
        user_msg = next((m for m in messages if isinstance(m, HumanMessage)), None)
        objective = user_msg.content if user_msg else "Unknown"
        current_snapshot = state.get("snapshot", None)
        current_screenshot = state.get("screenshot", None)
        user_feedback = state.get("user_feedback", None)
        
        current_todos = state.get("todos", [])
        plan_str = json.dumps(current_todos, indent=2) if current_todos else "No plan yet."
        
        # Prepare input for planner
        # We use a separate LLM call for planning to keep it focused
        # IMPORTANT: We must pass the conversation history so the planner sees tool outputs!
        planner_messages = [
            SystemMessage(content=PLANNER_PROMPT.format(
                objective=objective, 
                current_plan=plan_str,
                user_feedback=user_feedback,
                snapshot=current_snapshot,
                current_screenshot=current_screenshot))
        ] + messages + [
            HumanMessage(content="Update the plan based on the current state. If the current step is done, mark it completed.")
        ]
        
        # If we have a screenshot, we could add it here (multimodal)
        # For now, we rely on text descriptions or previous tool outputs
        
        # Use structured output for reliability
        planner = llm.with_structured_output(Plan)
        plan_result = await planner.ainvoke(planner_messages)
        
        return {"todos": plan_result.todos, "user_feedback": ""}

    async def llm_node(state: AgentState):
        # Filter for the in_progress step
        todos = state.get("todos", [])
        in_progress = next((t for t in todos if t["status"] == "in_progress"), None)
        if not in_progress:
            # If nothing in progress, maybe we are done or need to start the first pending
            pending = next((t for t in todos if t["status"] == "pending"), None)
            if pending:
                pending["status"] = "in_progress"
                in_progress = pending
                # IMPORTANT: Update the state with the modified todo list
                # We need to replace the old todo with the new one in the list
                # Since 'todos' is a list of dicts, we modified it in place.
                # We do NOT return yet, we want to execute this step immediately.
                # However, we must ensure the state update happens eventually.
                # LangGraph usually merges updates. If we return {"todos": todos} AND {"messages": ...} it should work.
            else:
                # All done?
                return {"messages": [AIMessage(content="Task appears to be completed based on the plan.")]}
        
        # If we just updated the status, we might want to return and let the graph loop back 
        # or proceed immediately. Proceeding immediately is better for efficiency.
        
        plan_status = f"Current Step: {in_progress['step']}. {in_progress['content']}"
        
        messages = [SystemMessage(content=ACTOR_PROMPT.format(plan_status=plan_status))] + state["messages"]
        
        response = await llm_with_tools.ainvoke(messages)
        
        # Sanitize response
        sanitized_response = AIMessage(
            content=response.content,
            tool_calls=response.tool_calls,
            id=response.id,
        )
        return {"messages": [sanitized_response], "todos": todos}

    async def run_tools(state: AgentState):
        last_message = state["messages"][-1]
        if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
            return {"messages": []}
            
        results = []
        for tc in last_message.tool_calls:
            tool = next((t for t in tools if t.name == tc["name"]), None)
            if tool:
                try:
                    output = await tool.ainvoke(tc["args"])
                    results.append(ToolMessage(
                        tool_call_id=tc["id"],
                        name=tc["name"],
                        content=str(output)
                    ))
                except Exception as e:
                    results.append(ToolMessage(
                        tool_call_id=tc["id"],
                        name=tc["name"],
                        content=f"Error executing tool: {str(e)}"
                    ))
            else:
                 results.append(ToolMessage(
                        tool_call_id=tc["id"],
                        name=tc["name"],
                        content=f"Error: Tool {tc['name']} not found"
                    ))
        return {"messages": results}

    async def screenshot_node(state: AgentState):
        # Find screenshot tool
        screenshot_tool = next((t for t in tools if "screenshot" in t.name.lower()), None)
        snapshot_tool = next((t for t in tools if "snapshot" in t.name.lower()), None)
        
        todos = state.get("todos", [])
        in_progress_step = next((t["step"] for t in todos if t["status"] == "in_progress"), "step0")
        
        if screenshot_tool:
            try:
                # We assume the tool takes no args or simple args. 
                # Adjust based on actual MCP tool signature.
                # Playwright MCP usually has 'page_screenshot'
                output = await screenshot_tool.ainvoke({"filename": f"{state['session_id']}/screenshot_{in_progress_step}.png"})
                output2 = await snapshot_tool.ainvoke({})
                # Output is likely a base64 string or binary
                return {"screenshot": str(output), "snapshot": str(output2)} 
            except Exception as e:
                print(f"Screenshot failed: {e}")
        return {}

    async def hil_node(state: AgentState) -> Command[Literal["planning", "end"]]:
        # Check if all todos are completed
        todos = state.get("todos", [])
        all_completed = all(t["status"] == "completed" for t in todos)
        
        if all_completed:
            # If all tasks are done, ask if user wants to continue or finish
            result = interrupt({
                "question": "All steps completed! Do you want to continue with more tasks?",
                "type": "completion"
            })
        else:
            # If tasks are pending, ask if user wants to continue execution
            pending_count = sum(1 for t in todos if t["status"] == "pending")
            in_progress_count = sum(1 for t in todos if t["status"] == "in_progress")
            
            result = interrupt({
                "question": f"Do you want to continue with more tasks?",
                "type": "approval"
            })
        
        # Result can be either a boolean or a dict with 'approved' and 'feedback'
        if isinstance(result, dict):
            decision = result.get("approved", False)
            feedback = result.get("feedback", "")
            
            # If user provided feedback, add it to messages
            if feedback and decision:
                return Command(
                    goto="planning",
                    update={"messages": [HumanMessage(content=feedback)], "user_feedback": feedback}
                )
        else:
            decision = result
        
        # Route based on decision
        return Command(goto="planning" if decision else "end")

    async def end_node(state: AgentState):
        # Summarize and give final response to user query
        todos = state.get("todos", [])
        completed = sum(1 for t in todos if t["status"] == "completed")
        total = len(todos)
        
        summary = f"Task execution completed. {completed}/{total} steps finished successfully."
        
        return {"messages": [AIMessage(content=summary)]}


    # --- Workflow Construction ---
    
    workflow = StateGraph(AgentState)
    
    workflow.add_node("start", start_node)
    workflow.add_node("planning", planning_node)
    workflow.add_node("llm", llm_node)
    workflow.add_node("tools", run_tools)
    workflow.add_node("screenshot", screenshot_node)
    workflow.add_node("hil", hil_node),
    workflow.add_node("end", end_node)
    
    # Edges
    workflow.add_edge(START, "start")
    workflow.add_edge("start", "planning")
    workflow.add_edge("planning", "llm")
    
    def route_llm(state):
        last_message = state["messages"][-1]
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            return "tools"
        return "hil"
        
    workflow.add_conditional_edges("llm", route_llm, {"tools": "tools", "hil": "hil"})
    
    workflow.add_edge("tools", "screenshot")
    workflow.add_edge("screenshot", "planning")
    workflow.add_edge("end", END)

    # Compile - the interrupt is now handled inside the hil_node using interrupt()
    app = workflow.compile(checkpointer=checkpointer)
    
    return app


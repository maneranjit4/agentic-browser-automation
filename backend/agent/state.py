from typing import Annotated, List, TypedDict, Dict, Any, Optional
from langchain_core.messages import BaseMessage
import operator

class Todo(TypedDict):
    step: int
    content: str
    status: str # "pending", "in_progress", "completed", "failed"
    reason: Optional[str]

class AgentState(TypedDict):
    session_id: str
    messages: Annotated[List[BaseMessage], operator.add]
    todos: List[Todo]
    screenshot: Optional[str] # Base64 string
    snapshot: Optional[str] # DOM snapshot
    user_feedback: Optional[str] # For HIL inputs

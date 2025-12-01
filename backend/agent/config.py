import os

# URL for the Playwright MCP Server (SSE endpoint)
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8931/sse")

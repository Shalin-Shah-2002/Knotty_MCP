# Test the MCP server locally

Write-Host "Starting MCP Server..." -ForegroundColor Green

$env:OPENAPI_SPEC_URL = "https://petstore.swagger.io/v2/swagger.json"
$env:LOG_LEVEL = "info"

# Run the server (Ctrl+C to stop)
node dist/index.js

# The server is now listening on stdio
# Send MCP protocol messages to test

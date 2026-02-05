# Testing SA SSBI Tech API

## API Details
- **Swagger UI**: https://sa.ssbi.tech/api-docs/#/
- **OpenAPI Spec**: https://sa.ssbi.tech/api-docs/v3/api-docs

## Setup Complete ✓

The MCP server has been configured to use this API.

## How to Use in Claude Desktop

**After restarting Claude Desktop, try these prompts:**

### Get API Overview
```
Use getApiInfo to show me what this API offers
```

### Search for Endpoints
```
Search for all endpoints using getApiSchema with query "user"
```

### List All Endpoints
```
Use listEndpoints to show me all available API endpoints
```

### Dynamic Analysis (Alternative)
You can also analyze it on-demand:
```
Analyze the API at https://sa.ssbi.tech/api-docs/v3/api-docs
```

## If Authentication Required

If the API returns 401/403 errors, provide your token:
```
Analyze https://sa.ssbi.tech/api-docs/v3/api-docs with authToken YOUR_TOKEN_HERE
```

Or configure it permanently in the config file by adding:
```json
"SWAGGER_AUTH_TOKEN": "your-token-here"
```

## Configuration

Current Claude Desktop config:
```json
{
  "mcpServers": {
    "swagger-api": {
      "command": "node",
      "args": ["d:/S_Projects/Swagger_MCP/dist/index.js"],
      "env": {
        "OPENAPI_SPEC_URL": "https://sa.ssbi.tech/api-docs/v3/api-docs",
        "LOG_LEVEL": "info",
        "CACHE_REFRESH_MINUTES": "10",
        "RATE_LIMIT_MAX": "60"
      }
    }
  }
}
```

## Next Steps

1. **Restart Claude Desktop** (completely quit and reopen)
2. **Look for the 🔌 icon** in Claude
3. **Test with a simple query**: "What endpoints does this API have?"
4. The MCP server will fetch and cache the API spec automatically

## Switching APIs

To test with a different API later, use the dynamic analysis:
```
Analyze https://petstore.swagger.io/v2/swagger.json
```

Or update the config:
```powershell
.\configure-url.ps1
```

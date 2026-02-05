# Swagger MCP Server - URL Configuration

This guide shows you how to change the OpenAPI/Swagger URL for different APIs.

## Quick Setup (Predefined APIs)

```powershell
# Swagger Petstore (default)
.\setup-quick.ps1 -API petstore

# GitHub API
.\setup-quick.ps1 -API github

# Stripe API
.\setup-quick.ps1 -API stripe

# Custom URL
.\setup-quick.ps1
# Then enter your URL when prompted
```

## Interactive Configuration

For full control with auth tokens and cache settings:

```powershell
.\configure-url.ps1
```

This will prompt you for:
- OpenAPI/Swagger URL
- Authentication token (optional)
- Cache refresh interval

## Manual Configuration

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "swagger-api": {
      "command": "node",
      "args": ["d:/S_Projects/Swagger_MCP/dist/index.js"],
      "env": {
        "OPENAPI_SPEC_URL": "https://your-api.com/openapi.json",
        "SWAGGER_AUTH_TOKEN": "your-token-here",
        "LOG_LEVEL": "info",
        "CACHE_REFRESH_MINUTES": "10",
        "RATE_LIMIT_MAX": "60"
      }
    }
  }
}
```

## Supported Formats

- ✅ OpenAPI 3.0.x (JSON)
- ✅ OpenAPI 3.0.x (YAML)
- ✅ OpenAPI 3.1.x (JSON/YAML)
- ✅ Swagger 2.0 (JSON)
- ✅ Swagger 2.0 (YAML)

## Examples URLs

### Public APIs (No Auth)
- Petstore: `https://petstore.swagger.io/v2/swagger.json`
- GitHub: `https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json`
- JSONPlaceholder: `https://jsonplaceholder.typicode.com/openapi.json`

### Authenticated APIs
For APIs requiring authentication, use:
```powershell
.\configure-url.ps1
# Enter URL, then 'y' for auth, then your Bearer token
```

## After Configuration

1. **Restart Claude Desktop** completely (quit and reopen)
2. Click the **🔌 icon** to verify tools are loaded
3. Test with: `"Use getApiInfo to show me API details"`

## Troubleshooting

If the URL doesn't load:
- Check URL is accessible in browser
- Verify it returns JSON or YAML
- Check if authentication is required
- Look at logs in Claude Desktop developer tools

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAPI_SPEC_URL` | *(required)* | URL to OpenAPI spec |
| `SWAGGER_AUTH_TOKEN` | - | Bearer token for auth |
| `CACHE_REFRESH_MINUTES` | 10 | How often to refresh |
| `RATE_LIMIT_MAX` | 60 | Requests per minute |
| `LOG_LEVEL` | info | debug/info/warn/error |

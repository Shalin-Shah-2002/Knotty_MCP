# Authentication Guide for Swagger MCP Server

## Public APIs (No Auth Required)

Most public API specifications are accessible without authentication:

```
✅ Analyze https://petstore.swagger.io/v2/swagger.json
✅ Analyze https://api.github.com/openapi.json  
✅ Analyze https://jsonplaceholder.typicode.com/openapi.json
```

## Protected API Specs (Bearer Token Required)

Some organizations protect their OpenAPI spec endpoints with authentication.

### How to Provide Tokens in Prompts

**Method 1: Natural Language**
```
Analyze https://api.example.com/openapi.json using token abc123xyz
```

**Method 2: Explicit Parameters**
```
Use analyzeApiFromUrl with:
- url: https://api.example.com/openapi.json
- authToken: abc123xyz
```

**Method 3: JSON Format** (Claude will understand)
```
Call analyzeApiFromUrl with {
  "url": "https://api.example.com/openapi.json",
  "authToken": "abc123xyz"
}
```

### Getting Authentication Tokens

**For Internal APIs:**
1. Contact your API team for a token
2. Generate one from your API dashboard
3. Use your API key or access token

**For Third-Party APIs:**
1. Sign up for an account
2. Navigate to API settings/developer console
3. Generate an API token or access key
4. Use that token with the MCP server

### Token Formats Supported

The server automatically adds "Bearer" prefix, so just provide the token:

✅ **Correct:**
```
authToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

❌ **Don't include "Bearer":**
```
authToken: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Error Handling

**If you forget the token:**

**You:** Analyze https://protected-api.com/openapi.json

**Server Response:**
```
❌ Error: Authentication required. This API requires a Bearer token.

Please provide the authToken parameter.

Example:
{
  "url": "https://protected-api.com/openapi.json",
  "authToken": "your-token-here"
}
```

**You:** Use that URL with authToken "xyz123"

**Server:** ✅ Successfully fetches and analyzes the API

## Pre-Configured vs On-Demand Auth

### Pre-Configured (in config file)
```json
{
  "mcpServers": {
    "swagger-api": {
      "env": {
        "OPENAPI_SPEC_URL": "https://api.example.com/openapi.json",
        "SWAGGER_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

**Use for:** Your primary/main API that you use frequently

### On-Demand (in prompts)
```
Analyze https://api.example.com/openapi.json with token xyz123
```

**Use for:** 
- Exploring multiple APIs
- One-time analysis
- APIs you don't use regularly
- Comparing different APIs

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never commit tokens to git** - Use environment variables or secure storage
2. **Rotate tokens regularly** - Follow your organization's security policy
3. **Use minimal permissions** - Tokens only need read access to the spec
4. **Tokens in prompts** - Are sent only to the spec URL, not logged elsewhere
5. **Rate limiting** - Prevents token abuse (60 requests/minute default)

## Common Authentication Scenarios

### Scenario 1: Corporate Internal API
```
Your company's API at https://internal-api.corp.com/openapi.json
requires SSO token from your identity provider.

Solution:
1. Get token from your SSO/identity portal
2. Use in prompt: "Analyze https://internal-api.corp.com/openapi.json with token <your-sso-token>"
```

### Scenario 2: SaaS API Documentation
```
SaaS provider protects their spec with API keys.

Solution:
1. Log into their dashboard
2. Generate API key from developer settings
3. Use in prompt: "Analyze their API using my key <api-key>"
```

### Scenario 3: GitHub Private Repos
```
OpenAPI spec in a private GitHub repo.

Solution:
1. Generate GitHub Personal Access Token
2. Use: "Analyze https://raw.githubusercontent.com/user/private-repo/main/openapi.json with token <github-pat>"
```

### Scenario 4: Multi-Environment APIs
```
Different tokens for dev/staging/prod environments.

Solution:
# Development
Analyze https://dev-api.example.com/openapi.json with token <dev-token>

# Production  
Analyze https://api.example.com/openapi.json with token <prod-token>
```

## Troubleshooting

### 401 Unauthorized
```
Error: Authentication failed: 401 Unauthorized

Solutions:
- Check token is valid and not expired
- Verify token has read permissions
- Confirm you're using the correct token for this environment
```

### 403 Forbidden
```
Error: Authentication failed: 403 Forbidden

Solutions:
- Token may lack necessary permissions
- API may require different auth method
- Contact API administrator
```

### Token Rejected
```
Error: Invalid token format

Solutions:
- Remove any "Bearer" prefix
- Check for extra spaces or quotes
- Verify token was copied correctly
```

## Examples

### Example 1: Private Swagger Spec
```bash
# In Claude prompt:
"I need to analyze our company API. The spec is at 
https://api.company.com/v2/swagger.json and here's my token: 
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
```

### Example 2: Multiple APIs with Different Tokens
```bash
# API 1
"Analyze https://api-1.com/openapi.json with token token-1-abc"

# API 2  
"Now analyze https://api-2.com/openapi.json with token token-2-xyz"

# Compare them
"Compare the authentication methods between these two APIs"
```

### Example 3: Search with Authentication
```bash
"Analyze https://private-api.com/openapi.json using token xyz123 
and find all endpoints related to user management"
```

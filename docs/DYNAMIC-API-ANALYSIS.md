# Dynamic API Analysis Examples

Now you can analyze ANY OpenAPI/Swagger API directly in your Claude prompts!

## Basic Usage

**Just give Claude a URL:**
```
Analyze this API: https://petstore.swagger.io/v2/swagger.json
```

**With authentication token:**
```
Analyze https://api.example.com/openapi.json using Bearer token abc123xyz
```

or more explicitly:
```
Use analyzeApiFromUrl with:
- url: https://api.example.com/openapi.json
- authToken: abc123xyz
```

**Search for specific endpoints:**
```
Analyze https://api.github.com/openapi.json and find all endpoints related to "repositories"
```

## Example Prompts

### Explore an API
```
Use analyzeApiFromUrl to explore the Stripe API at https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json
```

### Find Specific Endpoints
```
Analyze https://petstore.swagger.io/v2/swagger.json and search for "pet" endpoints
```

### Compare Multiple APIs
```
1. Analyze https://petstore.swagger.io/v2/swagger.json
2. Then analyze https://api.github.com/openapi.json
3. Compare their structures
```

### With Authentication
```
Analyze the API at https://my-private-api.com/openapi.json using Bearer token: my-secret-token-123
```

Or if you get a 401/403 error:
```
# Claude will tell you authentication is required
# Then you provide the token:

Use analyzeApiFromUrl with url "https://my-private-api.com/openapi.json" and authToken "my-secret-token-123"
```

### Handling Authentication Errors

If you try to access a protected API without a token:

**You:** Analyze https://private-api.com/openapi.json

**Response:** 
```
Error: Authentication required. This API requires a Bearer token to access. 
Please provide the authToken parameter.

Example: Call this tool again with:
{
  "url": "https://private-api.com/openapi.json",
  "authToken": "your-bearer-token-here"
}
```

**You:** Use the same URL with authToken "xyz123"

**Response:** ✅ Successfully analyzes the API

## How It Works

The `analyzeApiFromUrl` tool:
1. ✅ Fetches the spec from the URL you provide
2. ✅ Parses OpenAPI 3.x or Swagger 2.0 (JSON/YAML)
3. ✅ Returns API info (title, version, endpoints count, tags)
4. ✅ Optionally searches for specific endpoints
5. ✅ Supports Bearer token authentication
6. ✅ Works on-demand (not cached)

## Tool Parameters

```json
{
  "url": "https://api.example.com/openapi.json",  // Required
  "authToken": "your-token-here",                  // Optional (no "Bearer" prefix needed)
  "query": "search term",                          // Optional
  "maxResults": 10                                 // Optional (default: 10, max: 50)
}
```

**Authentication Notes:**
- The `authToken` is sent as `Authorization: Bearer <token>`
- Don't include "Bearer" in the token - it's added automatically
- If you get 401/403, the error message will guide you to add the token
- Tokens are used for the spec URL itself, not the API endpoints

## Example Claude Conversation

**You:** 
> Can you analyze the Swagger Petstore API?

**Claude will call:**
```json
{
  "name": "analyzeApiFromUrl",
  "arguments": {
    "url": "https://petstore.swagger.io/v2/swagger.json"
  }
}
```

**Response includes:**
- API title, version, description
- Total endpoints count
- Available tags/categories
- Base URL
- OpenAPI version

**You:** 
> Now show me all the POST endpoints

**Claude will call:**
```json
{
  "name": "analyzeApiFromUrl",
  "arguments": {
    "url": "https://petstore.swagger.io/v2/swagger.json",
    "query": "POST"
  }
}
```

## Benefits

✅ **No Configuration Needed** - Just paste the URL
✅ **Explore Multiple APIs** - Switch between APIs instantly  
✅ **Quick Comparisons** - Analyze multiple APIs in one conversation
✅ **Ad-hoc Analysis** - Perfect for one-time API exploration
✅ **Authenticated APIs** - Supports Bearer tokens

## Rate Limiting

- Subject to the same rate limits (60 requests/minute by default)
- Each URL analysis counts as 1 request
- Not cached (each call fetches fresh)

## Supported Formats

- ✅ OpenAPI 3.0.x (JSON or YAML)
- ✅ OpenAPI 3.1.x (JSON or YAML)  
- ✅ Swagger 2.0 (JSON or YAML)

## Common Use Cases

1. **API Discovery**: "What endpoints does this API have?"
2. **Documentation**: "Explain how to create a user in this API"
3. **Integration Planning**: "What authentication does this API use?"
4. **Comparison**: "Compare these two APIs"
5. **Quick Reference**: "Find the endpoint for uploading files"

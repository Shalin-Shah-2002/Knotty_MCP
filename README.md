<div align="center">

# 🪢 Knotty

### *Untangle Your APIs*

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blueviolet?style=for-the-badge)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**A powerful MCP server that transforms Swagger/OpenAPI docs into AI-readable context — and lets Claude execute API requests like Postman!**

[Features](#-what-knotty-can-do) • [The Problem](#-the-problem-it-solves) • [Setup](#-setup) • [Tools](#-tools-reference) • [Author](#-author)

---

</div>

## 🎯 What Knotty Can Do

<table>
<tr>
<td width="50%">

### 📄 **Parse Any OpenAPI Spec**
- OpenAPI 3.x and Swagger 2.0
- JSON and YAML formats
- Direct URLs or Swagger UI pages

### 🌐 **Swagger UI Auto-Scraping**
- Paste a Swagger UI URL — Knotty finds the spec
- Extracts embedded specs from `swagger-ui-init.js`
- Discovers common spec paths automatically

### 🔍 **Intelligent API Search**
- Search by path, method, tags, description
- Filter endpoints precisely
- Get request/response schemas instantly

</td>
<td width="50%">

### 🚀 **Execute API Requests (Postman-like)**
- Send GET, POST, PUT, PATCH, DELETE
- Custom headers and auth tokens
- See full request/response details

### 🔐 **Authentication Support**
- Bearer token authentication
- Works with protected API docs
- Secure credential handling

### ⚡ **Production-Ready**
- Smart caching with auto-refresh
- Rate limiting built-in
- Docker-ready deployment
- Structured logging

</td>
</tr>
</table>

---

## 😤 The Problem It Solves

> *"Here's the Swagger UI link. Build the frontend."*

If you've ever received a Swagger UI URL from a backend developer and been expected to figure out:

- ❓ What does this endpoint actually do?
- ❓ What's the request body structure?
- ❓ What are the required parameters?
- ❓ What responses should I expect?
- ❓ How do I test if this even works?

**You know the pain.**

### The Reality for Frontend/Mobile Developers

```
Backend Dev: "API is ready, here's the docs: https://api.example.com/swagger-ui/"
You: *Opens link, sees 200+ endpoints, no context, no examples*
You: "Which endpoint do I use for user registration?"
Backend Dev: "It's in there somewhere 🤷"
```

Sound familiar?

---

## 💡 Why Knotty Was Built

**Knotty was born out of frustration.**

As a Flutter developer constantly integrating with backend APIs, I was tired of:

1. **Digging through massive Swagger UIs** trying to find the right endpoint
2. **Manually copying request body schemas** into my code
3. **Guessing what fields are required** vs optional
4. **Testing endpoints in Postman** then switching back to Claude
5. **Getting zero context** from a bare Swagger URL

So I built **Knotty** — an MCP server that:

- **Ingests any Swagger/OpenAPI spec** (even from UI pages!)
- **Makes it searchable and understandable** for AI assistants
- **Lets Claude execute actual API requests** so you can test and build simultaneously

Now when someone sends me a Swagger URL, I just paste it into Claude and ask:
> *"What endpoints do I need for user authentication? Show me the request/response schemas and test the login endpoint."*

**Done.** 🎉

---

## ✨ Why Knotty is Different

| Traditional Approach | With Knotty |
|---------------------|-------------|
| Open Swagger UI → Search manually → Copy schemas → Test in Postman → Back to coding | Paste URL → Ask Claude → Get schemas + test results instantly |
| Context switching between 4+ tools | Everything in one conversation |
| "What does this endpoint do?" | Claude explains it with examples |
| Manual request body construction | AI generates it from the schema |
| No way to test from chat | Execute requests directly! |

---

## 🚀 Setup

### Prerequisites

- **Node.js 18+**
- **Claude Desktop** (or any MCP-compatible client)

### Installation

```bash
# Clone the repository
git clone https://github.com/shalin-shah-2002/knotty.git
cd knotty

# Install dependencies
npm install

# Build
npm run build
```

### Configure for Claude Desktop

#### Quick Setup (Recommended)

```powershell
# Use a predefined API
.\setup-quick.ps1 -API petstore

# Or configure your own URL
.\setup-quick.ps1
```

#### Manual Configuration

Add to your `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "knotty": {
      "command": "node",
      "args": ["PATH_TO_KNOTTY/dist/index.js"],
      "env": {
        "OPENAPI_SPEC_URL": "https://petstore.swagger.io/v2/swagger.json",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAPI_SPEC_URL` | URL to OpenAPI spec or Swagger UI page | *required* |
| `SWAGGER_AUTH_TOKEN` | Bearer token for protected specs | - |
| `CACHE_REFRESH_MINUTES` | How often to refresh the cache | `10` |
| `RATE_LIMIT_MAX` | Max requests per minute | `60` |
| `LOG_LEVEL` | Logging level | `info` |

---

## 🛠️ Tools Reference

### 1️⃣ `getApiSchema`

**Search for API endpoints matching your query.**

Perfect for finding endpoints when you know what you're looking for but not the exact path.

```
"Find all endpoints related to user authentication"
"Show me the POST endpoint for creating orders"
"What endpoints are tagged with 'payments'?"
```

**What you get:**
- Full path and HTTP method
- Request body schema with required fields
- Response schemas for all status codes
- Parameter details (path, query, header)
- Security requirements

---

### 2️⃣ `getApiInfo`

**Get an overview of the entire API.**

Use this first to understand what you're working with.

```
"What does this API do?"
"How many endpoints are there?"
"What authentication does it use?"
```

**What you get:**
- API title, version, description
- Base URL
- Total endpoint count
- Available tags/categories
- Security schemes

---

### 3️⃣ `listEndpoints`

**List all endpoints in a compact format.**

Great for getting a bird's-eye view.

```
"List all POST endpoints"
"Show endpoints tagged 'users'"
"What endpoints are available?"
```

---

### 4️⃣ `analyzeApiFromUrl`

**Analyze ANY OpenAPI spec on-the-fly.**

Don't want to configure a default URL? Just pass one directly!

```
"Analyze https://api.example.com/swagger-ui/ and find the login endpoint"
"Check this spec URL and show me all user-related endpoints"
```

**Supports:**
- Direct JSON/YAML spec URLs
- Swagger UI pages (auto-scraped!)
- Protected specs with auth tokens

---

### 5️⃣ `executeApiRequest` 🔥

**Execute actual HTTP requests — like Postman, but in chat!**

This is the game-changer. Test APIs without leaving Claude.

```
"Call GET https://api.example.com/users/1"
"Send a POST to create a new user with this body: {...}"
"Test the login endpoint with these credentials"
```

**Features:**
- All HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Custom headers and request bodies
- Bearer token authentication
- Configurable timeouts
- Full response details (status, headers, body, timing)

**Example Response:**
```json
{
  "status": 200,
  "statusText": "OK",
  "responseTime": 127,
  "body": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

---

### 6️⃣ `refreshCache`

**Force-refresh the cached API spec.**

Use when the backend team updates their API and you need the latest schema.

---

### 7️⃣ `getCacheStatus`

**Check when the spec was last fetched.**

Useful for debugging or knowing if you have stale data.

---

## 🐳 Docker Deployment

```bash
# Build
docker build -t knotty .

# Run
docker run -it \
  -e OPENAPI_SPEC_URL=https://your-api.com/swagger.json \
  knotty
```

Or with Docker Compose:

```bash
cp .env.example .env
# Edit .env with your settings
docker-compose up -d
```

---

## 📁 Project Structure

```
knotty/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── config.ts         # Configuration management
│   ├── fetcher/          # Spec fetching + Swagger UI scraping
│   ├── parser/           # OpenAPI parsing & normalization
│   ├── cache/            # Smart caching layer
│   ├── tools/            # MCP tool implementations
│   └── utils/            # Logger, rate limiter
├── bin/
│   └── knotty.js         # CLI entry point
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

---

## 👨‍💻 Author

<div align="center">

**Shalin Shah**

*Flutter Developer | Problem Solver | Builder*

[![GitHub](https://img.shields.io/badge/GitHub-shalin--shah--2002-181717?style=for-the-badge&logo=github)](https://github.com/shalin-shah-2002)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Shalin%20Shah-0A66C2?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/shalin-shah0705/)

---

*Built with ❤️ and mass frustration*

*If Knotty helped untangle your API mess, consider giving it a ⭐!*

</div>

---

## 📄 License

MIT — Use it, modify it, ship it. Just don't blame me if your API still doesn't work. 😄

---

<div align="center">

**[⬆ Back to Top](#-knotty)**

</div>

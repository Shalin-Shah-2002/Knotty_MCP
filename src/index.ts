#!/usr/bin/env node

/**
 * Knotty (Swagger/OpenAPI) MCP Server
 * 
 * A production-ready MCP server that ingests Swagger/OpenAPI documentation
 * and exposes it for LLM consumption via the Model Context Protocol.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig, type Config } from './config.js';
import { createLogger, getLogger } from './utils/logger.js';
import { RateLimiter } from './utils/rateLimiter.js';
import { OpenAPIFetcher } from './fetcher/index.js';
import { OpenAPIParser, type NormalizedApiSpec } from './parser/index.js';
import { SpecCache } from './cache/index.js';
import { ToolHandler, type GetApiSchemaArgs } from './tools/index.js';

// Tool definitions
const TOOLS = [
  {
    name: 'getApiSchema',
    description:
      'Search for API endpoint definitions in the OpenAPI/Swagger specification. Returns matching endpoints with their paths, methods, parameters, request bodies, and response schemas. Use this to understand how to call specific API endpoints.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Search query to find endpoints. Can match against path, operationId, summary, description, or tags. Examples: "users", "createUser", "GET /pets", "authentication"',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of endpoints to return (default: 10, max: 50)',
          default: 10,
        },
        method: {
          type: 'string',
          description: 'Filter by HTTP method (GET, POST, PUT, PATCH, DELETE, etc.)',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        },
        tag: {
          type: 'string',
          description: 'Filter by API tag/category',
        },
        includeRequestBody: {
          type: 'boolean',
          description: 'Include request body schema in results (default: true)',
          default: true,
        },
        includeResponses: {
          type: 'boolean',
          description: 'Include response schemas in results (default: true)',
          default: true,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'getApiInfo',
    description:
      'Get general information about the API including title, version, description, base URL, available tags, and security schemes. Use this to understand the overall API structure before searching for specific endpoints.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'listEndpoints',
    description:
      'List all available API endpoints in a brief format (method, path, operationId, summary). Use this to get an overview of all available endpoints, optionally filtered by method or tag.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        method: {
          type: 'string',
          description: 'Filter by HTTP method',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        },
        tag: {
          type: 'string',
          description: 'Filter by API tag/category',
        },
      },
      required: [],
    },
  },
  {
    name: 'refreshCache',
    description:
      'Force a refresh of the cached OpenAPI specification. Use this if you suspect the API spec has been updated.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'getCacheStatus',
    description:
      'Get the current cache status including when the spec was last fetched and when it will expire.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'analyzeApiFromUrl',
    description:
      'Analyze any OpenAPI/Swagger specification from a given URL. Supports both direct spec URLs (JSON/YAML) and Swagger UI pages - automatically scrapes the UI to find the spec! Use this to explore APIs on-demand without pre-configuration. Returns API info and optionally searches for specific endpoints. Supports authenticated APIs via Bearer token.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description:
            'URL to the OpenAPI/Swagger specification OR a Swagger UI page. The server will automatically detect Swagger UI pages and extract the spec. Examples: "https://petstore.swagger.io/v2/swagger.json", "https://api.example.com/api-docs/", "https://example.com/swagger-ui.html"',
        },
        authToken: {
          type: 'string',
          description: 'Bearer token for authentication. Required if the API spec endpoint returns 401/403. Example: "your-secret-token-123". The token will be sent as "Authorization: Bearer <token>"',
        },
        query: {
          type: 'string',
          description:
            'Optional: search query to find specific endpoints in the API (e.g., "users", "create", "authentication", "POST /orders")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of matching endpoints to return when using query (default: 10, max: 50)',
          default: 10,
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'executeApiRequest',
    description:
      'Execute an actual HTTP API request and get the response - like Postman! Use this to test APIs, send data, and see real responses. Supports all HTTP methods, request bodies, headers, and authentication. IMPORTANT: Only use this when the user explicitly wants to make an API call.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description:
            'Full URL for the API request. Example: "https://api.example.com/api/v1/users"',
        },
        method: {
          type: 'string',
          description: 'HTTP method to use',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
          default: 'GET',
        },
        body: {
          type: 'object',
          additionalProperties: true,
          description:
            'Request body for POST/PUT/PATCH requests. Will be sent as JSON. Example: { "name": "John", "email": "john@example.com" }',
        },
        headers: {
          type: 'object',
          additionalProperties: true,
          description:
            'Custom headers to include in the request. Example: { "X-API-Key": "abc123", "Accept-Language": "en" }',
        },
        authToken: {
          type: 'string',
          description:
            'Bearer token for authentication. Will be sent as "Authorization: Bearer <token>"',
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds (default: 30000, max: 60000)',
          default: 30000,
        },
        followRedirects: {
          type: 'boolean',
          description: 'Whether to follow HTTP redirects (default: true)',
          default: true,
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'req',
    description:
      'Shorthand for executeApiRequest - make HTTP requests quickly! Send GET, POST, PUT, PATCH, DELETE requests with custom body, headers, and auth. Use this to test any API endpoint.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'Full URL for the API request',
        },
        method: {
          type: 'string',
          description: 'HTTP method (GET, POST, PUT, PATCH, DELETE)',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
          default: 'GET',
        },
        body: {
          type: 'object',
          additionalProperties: true,
          description: 'Request body (JSON) for POST/PUT/PATCH',
        },
        headers: {
          type: 'object',
          additionalProperties: true,
          description: 'Custom headers as key-value pairs',
        },
        authToken: {
          type: 'string',
          description: 'Bearer token for Authorization header',
        },
      },
      required: ['url'],
    },
  },
];

class SwaggerMcpServer {
  private server: Server;
  private config: Config;
  private fetcher: OpenAPIFetcher;
  private parser: OpenAPIParser;
  private cache: SpecCache;
  private toolHandler: ToolHandler;
  private logger = getLogger();

  constructor(config: Config) {
    this.config = config;

    // Initialize components
    this.fetcher = new OpenAPIFetcher({
      url: config.openApiSpecUrl,
      authToken: config.authToken,
    });

    this.parser = new OpenAPIParser();

    this.cache = new SpecCache({
      ttlMinutes: config.cacheRefreshMinutes,
      onRefresh: () => this.fetchAndParse(),
    });

    const rateLimiter = new RateLimiter(config.rateLimitMax);

    this.toolHandler = new ToolHandler({
      cache: this.cache,
      rateLimiter,
    });

    // Initialize MCP server
    this.server = new Server(
      {
        name: config.serverName,
        version: config.serverVersion,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  /**
   * Fetch and parse the OpenAPI spec
   */
  private async fetchAndParse(): Promise<NormalizedApiSpec> {
    const fetchResult = await this.fetcher.fetch();
    return this.parser.parse(fetchResult);
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info({ tool: name }, 'Tool called');

      try {
        switch (name) {
          case 'getApiSchema': {
            const schemaArgs = args as unknown as GetApiSchemaArgs;
            if (!schemaArgs.query || typeof schemaArgs.query !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'query parameter is required and must be a string'
              );
            }

            // Clamp maxResults
            if (schemaArgs.maxResults) {
              schemaArgs.maxResults = Math.min(Math.max(1, schemaArgs.maxResults), 50);
            }

            const result = await this.toolHandler.getApiSchema(schemaArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'getApiInfo': {
            const result = await this.toolHandler.getApiInfo();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'listEndpoints': {
            const listArgs = args as { method?: string; tag?: string };
            const result = await this.toolHandler.listEndpoints(listArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'refreshCache': {
            const result = await this.toolHandler.refreshCache();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'getCacheStatus': {
            const result = this.toolHandler.getCacheStatus();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'analyzeApiFromUrl': {
            const urlArgs = args as {
              url: string;
              authToken?: string;
              query?: string;
              maxResults?: number;
            };

            if (!urlArgs.url || typeof urlArgs.url !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'url parameter is required and must be a string'
              );
            }

            // Clamp maxResults
            if (urlArgs.maxResults) {
              urlArgs.maxResults = Math.min(Math.max(1, urlArgs.maxResults), 50);
            }

            const result = await this.toolHandler.analyzeApiFromUrl(urlArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'executeApiRequest': {
            const requestArgs = args as {
              url: string;
              method?: string;
              body?: Record<string, unknown>;
              headers?: Record<string, string>;
              authToken?: string;
              timeout?: number;
              followRedirects?: boolean;
            };

            if (!requestArgs.url || typeof requestArgs.url !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'url parameter is required and must be a string'
              );
            }

            // Clamp timeout
            if (requestArgs.timeout) {
              requestArgs.timeout = Math.min(Math.max(1000, requestArgs.timeout), 60000);
            }

            const result = await this.toolHandler.executeApiRequest(requestArgs);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'req': {
            // Shorthand alias for executeApiRequest
            const requestArgs = args as {
              url: string;
              method?: string;
              body?: Record<string, unknown>;
              headers?: Record<string, string>;
              authToken?: string;
            };

            if (!requestArgs.url || typeof requestArgs.url !== 'string') {
              throw new McpError(
                ErrorCode.InvalidParams,
                'url parameter is required and must be a string'
              );
            }

            const result = await this.toolHandler.executeApiRequest({
              ...requestArgs,
              timeout: 30000,
              followRedirects: true,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error({ tool: name, error: errorMessage }, 'Tool execution failed');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, error: errorMessage }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Set up error handling
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      this.logger.error({ error }, 'MCP Server error');
    };

    process.on('SIGINT', async () => {
      this.logger.info('Shutting down...');
      this.cache.stopAutoRefresh();
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.logger.info('Shutting down...');
      this.cache.stopAutoRefresh();
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Initialize and start the server
   */
  async start(): Promise<void> {
    this.logger.info(
      {
        server: this.config.serverName,
        version: this.config.serverVersion,
        specUrl: this.config.openApiSpecUrl,
        cacheRefreshMinutes: this.config.cacheRefreshMinutes,
      },
      'Starting Swagger MCP Server'
    );

    // Initial fetch to validate configuration
    try {
      this.logger.info('Performing initial spec fetch...');
      await this.cache.refresh();
      this.logger.info('Initial spec fetch successful');
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Initial spec fetch failed, will retry on first request'
      );
    }

    // Start automatic refresh
    this.cache.startAutoRefresh();

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logger.info('MCP Server connected and ready');
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Load configuration
    const config = loadConfig();

    // Initialize logger
    createLogger(config.logLevel);

    // Create and start server
    const server = new SwaggerMcpServer(config);
    await server.start();
  } catch (error) {
    // Use console.error for startup errors since logger might not be initialized
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
}

main();

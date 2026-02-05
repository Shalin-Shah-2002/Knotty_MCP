/**
 * MCP Tool Handler for API schema queries
 */

import axios, { AxiosError, AxiosRequestConfig, Method } from 'axios';
import { getLogger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import type { SpecCache } from '../cache/index.js';
import type {
  NormalizedApiSpec,
  NormalizedEndpoint,
  SearchResult,
} from '../parser/index.js';
import { OpenAPIFetcher } from '../fetcher/index.js';
import { OpenAPIParser } from '../parser/index.js';

export interface ToolHandlerOptions {
  cache: SpecCache;
  rateLimiter: RateLimiter;
  fetcher?: OpenAPIFetcher;
  parser?: OpenAPIParser;
}

export interface GetApiSchemaArgs {
  query: string;
  maxResults?: number;
  includeRequestBody?: boolean;
  includeResponses?: boolean;
  method?: string;
  tag?: string;
}

export interface ApiSchemaResult {
  success: boolean;
  data?: SearchResult;
  error?: string;
  metadata: {
    cacheStatus: 'hit' | 'miss' | 'refreshed';
    remainingRequests: number;
    specVersion?: string;
    totalEndpointsInSpec?: number;
  };
}

export interface ApiInfoResult {
  success: boolean;
  data?: {
    title: string;
    version: string;
    description?: string;
    baseUrl?: string;
    totalEndpoints: number;
    tags: string[];
    securitySchemes: string[];
    fetchedAt: string;
    specVersion: string;
  };
  error?: string;
}

export class ToolHandler {
  private readonly cache: SpecCache;
  private readonly rateLimiter: RateLimiter;
  private readonly logger = getLogger();
  private readonly parser: OpenAPIParser;

  constructor(options: ToolHandlerOptions) {
    this.cache = options.cache;
    this.rateLimiter = options.rateLimiter;
    this.parser = options.parser || new OpenAPIParser();
  }

  /**
   * Search for API endpoints matching the query
   */
  async getApiSchema(args: GetApiSchemaArgs): Promise<ApiSchemaResult> {
    // Rate limiting check
    if (!this.rateLimiter.tryAcquire()) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        metadata: {
          cacheStatus: 'hit',
          remainingRequests: 0,
        },
      };
    }

    const { query, maxResults = 10, includeRequestBody = true, includeResponses = true, method, tag } = args;

    this.logger.info({ query, maxResults, method, tag }, 'Processing getApiSchema request');

    try {
      // Get spec from cache or refresh
      const cacheStatus = this.cache.get() ? 'hit' : 'miss';
      const spec = await this.cache.getOrRefresh();

      // Search endpoints
      const matchingEndpoints = this.searchEndpoints(spec, query, { method, tag });

      // Limit results
      const limitedEndpoints = matchingEndpoints.slice(0, maxResults);

      // Optionally strip large fields
      const processedEndpoints = limitedEndpoints.map((ep) => {
        const processed = { ...ep };
        if (!includeRequestBody) {
          processed.requestBody = undefined;
        }
        if (!includeResponses) {
          processed.responses = [];
        }
        return processed;
      });

      const result: SearchResult = {
        endpoints: processedEndpoints,
        query,
        totalMatches: matchingEndpoints.length,
        searchedFields: ['path', 'operationId', 'summary', 'description', 'tags'],
      };

      this.logger.info(
        { query, matches: matchingEndpoints.length, returned: limitedEndpoints.length },
        'Search completed'
      );

      return {
        success: true,
        data: result,
        metadata: {
          cacheStatus: cacheStatus === 'hit' ? 'hit' : 'refreshed',
          remainingRequests: this.rateLimiter.getRemaining(),
          specVersion: spec.specVersion,
          totalEndpointsInSpec: spec.totalEndpoints,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ error: errorMessage }, 'getApiSchema failed');

      return {
        success: false,
        error: errorMessage,
        metadata: {
          cacheStatus: 'miss',
          remainingRequests: this.rateLimiter.getRemaining(),
        },
      };
    }
  }

  /**
   * Get general API information
   */
  async getApiInfo(): Promise<ApiInfoResult> {
    if (!this.rateLimiter.tryAcquire()) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
      };
    }

    try {
      const spec = await this.cache.getOrRefresh();

      // Extract unique tags
      const tags = new Set<string>();
      for (const endpoint of spec.endpoints) {
        endpoint.tags.forEach((t) => tags.add(t));
      }

      return {
        success: true,
        data: {
          title: spec.title,
          version: spec.version,
          description: spec.description,
          baseUrl: spec.baseUrl,
          totalEndpoints: spec.totalEndpoints,
          tags: Array.from(tags).sort(),
          securitySchemes: Object.keys(spec.securitySchemes),
          fetchedAt: spec.fetchedAt,
          specVersion: spec.specVersion,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ error: errorMessage }, 'getApiInfo failed');

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * List all endpoints (brief format)
   */
  async listEndpoints(options?: {
    method?: string;
    tag?: string;
  }): Promise<{
    success: boolean;
    data?: { method: string; path: string; operationId?: string; summary?: string }[];
    error?: string;
  }> {
    if (!this.rateLimiter.tryAcquire()) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
      };
    }

    try {
      const spec = await this.cache.getOrRefresh();

      let endpoints = spec.endpoints;

      if (options?.method) {
        endpoints = endpoints.filter(
          (ep) => ep.method.toLowerCase() === options.method!.toLowerCase()
        );
      }

      if (options?.tag) {
        endpoints = endpoints.filter((ep) =>
          ep.tags.some((t) => t.toLowerCase().includes(options.tag!.toLowerCase()))
        );
      }

      return {
        success: true,
        data: endpoints.map((ep) => ({
          method: ep.method.toUpperCase(),
          path: ep.path,
          operationId: ep.operationId,
          summary: ep.summary,
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get cache status
   */
  getCacheStatus(): {
    isCached: boolean;
    createdAt?: string;
    expiresAt?: string;
    isExpired: boolean;
    ageSeconds?: number;
  } {
    return this.cache.getMetadata();
  }

  /**
   * Force cache refresh
   */
  async refreshCache(): Promise<{ success: boolean; error?: string }> {
    if (!this.rateLimiter.tryAcquire()) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
      };
    }

    try {
      await this.cache.refresh();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Search endpoints by query
   */
  private searchEndpoints(
    spec: NormalizedApiSpec,
    query: string,
    filters?: { method?: string; tag?: string }
  ): NormalizedEndpoint[] {
    const normalizedQuery = query.toLowerCase().trim();
    const queryTerms = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);

    let endpoints = spec.endpoints;

    // Apply method filter
    if (filters?.method) {
      endpoints = endpoints.filter(
        (ep) => ep.method.toLowerCase() === filters.method!.toLowerCase()
      );
    }

    // Apply tag filter
    if (filters?.tag) {
      endpoints = endpoints.filter((ep) =>
        ep.tags.some((t) => t.toLowerCase().includes(filters.tag!.toLowerCase()))
      );
    }

    // Score and sort by relevance
    const scored = endpoints.map((endpoint) => {
      let score = 0;

      // Exact operationId match
      if (endpoint.operationId?.toLowerCase() === normalizedQuery) {
        score += 100;
      }
      // Partial operationId match
      else if (endpoint.operationId?.toLowerCase().includes(normalizedQuery)) {
        score += 50;
      }

      // Path match
      if (endpoint.path.toLowerCase().includes(normalizedQuery)) {
        score += 40;
      }

      // Summary match
      if (endpoint.summary?.toLowerCase().includes(normalizedQuery)) {
        score += 30;
      }

      // Description match
      if (endpoint.description?.toLowerCase().includes(normalizedQuery)) {
        score += 20;
      }

      // Tag match
      if (endpoint.tags.some((t) => t.toLowerCase().includes(normalizedQuery))) {
        score += 15;
      }

      // Multi-term matching
      for (const term of queryTerms) {
        if (endpoint.path.toLowerCase().includes(term)) score += 5;
        if (endpoint.operationId?.toLowerCase().includes(term)) score += 5;
        if (endpoint.summary?.toLowerCase().includes(term)) score += 3;
        if (endpoint.description?.toLowerCase().includes(term)) score += 2;
      }

      return { endpoint, score };
    });

    // Filter out zero scores and sort by relevance
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.endpoint);
  }

  /**
   * Analyze an API from a custom URL (on-demand, not cached)
   * Supports Swagger UI pages - will automatically scrape and find the spec URL
   */
  async analyzeApiFromUrl(args: {
    url: string;
    authToken?: string;
    query?: string;
    maxResults?: number;
  }): Promise<{
    success: boolean;
    data?: {
      apiInfo: {
        title: string;
        version: string;
        description?: string;
        baseUrl?: string;
        totalEndpoints: number;
        tags: string[];
        specVersion: string;
      };
      endpoints?: NormalizedEndpoint[];
      searchQuery?: string;
      totalMatches?: number;
      /** If true, the spec was auto-discovered from a Swagger UI page */
      scrapedFromUI?: boolean;
      /** The actual spec URL that was fetched (may differ from input URL) */
      resolvedSpecUrl?: string;
    };
    error?: string;
    metadata: {
      remainingRequests: number;
      processingTime?: number;
    };
  }> {
    // Rate limiting check
    if (!this.rateLimiter.tryAcquire()) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        metadata: {
          remainingRequests: 0,
        },
      };
    }

    const startTime = Date.now();

    try {
      this.logger.info({ url: args.url }, 'Analyzing API from custom URL');

      // Validate URL
      try {
        new URL(args.url);
      } catch {
        return {
          success: false,
          error: 'Invalid URL format. Must be a valid http:// or https:// URL.',
          metadata: {
            remainingRequests: this.rateLimiter.getRemaining(),
          },
        };
      }

      // Fetch and parse the spec
      const fetcher = new OpenAPIFetcher({
        url: args.url,
        authToken: args.authToken,
        timeout: 30000,
      });

      const fetchResult = await fetcher.fetch();
      const spec = this.parser.parse(fetchResult);

      // Extract unique tags
      const tags = new Set<string>();
      for (const endpoint of spec.endpoints) {
        endpoint.tags.forEach((t) => tags.add(t));
      }

      const apiInfo = {
        title: spec.title,
        version: spec.version,
        description: spec.description,
        baseUrl: spec.baseUrl,
        totalEndpoints: spec.totalEndpoints,
        tags: Array.from(tags).sort(),
        specVersion: spec.specVersion,
      };

      // If query provided, search endpoints
      let endpoints: NormalizedEndpoint[] | undefined;
      let totalMatches: number | undefined;

      if (args.query) {
        const allMatches = this.searchEndpoints(spec, args.query, {});
        totalMatches = allMatches.length;
        const maxResults = Math.min(args.maxResults || 10, 50);
        endpoints = allMatches.slice(0, maxResults);
      }

      const processingTime = Date.now() - startTime;

      // Log additional info if scraped from UI
      if (fetchResult.scrapedFromUI) {
        this.logger.info(
          {
            originalUrl: args.url,
            resolvedSpecUrl: fetchResult.resolvedSpecUrl,
            totalEndpoints: spec.totalEndpoints,
            processingTime,
          },
          'API analysis completed (spec scraped from Swagger UI)'
        );
      } else {
        this.logger.info(
          {
            url: args.url,
            totalEndpoints: spec.totalEndpoints,
            processingTime,
          },
          'API analysis completed'
        );
      }

      return {
        success: true,
        data: {
          apiInfo,
          endpoints,
          searchQuery: args.query,
          totalMatches,
          scrapedFromUI: fetchResult.scrapedFromUI,
          resolvedSpecUrl: fetchResult.resolvedSpecUrl,
        },
        metadata: {
          remainingRequests: this.rateLimiter.getRemaining(),
          processingTime,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ url: args.url, error: errorMessage }, 'API analysis failed');

      // Enhanced error messages for authentication issues
      let userFriendlyError = errorMessage;
      
      if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('Authentication failed')) {
        userFriendlyError = `Authentication required. This API requires a Bearer token to access. Please provide the authToken parameter.\n\nExample: Call this tool again with:\n{\n  "url": "${args.url}",\n  "authToken": "your-bearer-token-here"\n}\n\nOriginal error: ${errorMessage}`;
      } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        userFriendlyError = `API specification not found at ${args.url}. Please verify:\n- The URL is correct\n- The API spec is publicly accessible\n- The endpoint returns OpenAPI/Swagger JSON or YAML\n\nOriginal error: ${errorMessage}`;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        userFriendlyError = `Request timed out while fetching ${args.url}. The API may be slow or unreachable. Try again or check if the URL is accessible.\n\nOriginal error: ${errorMessage}`;
      } else if (errorMessage.includes('Parse') || errorMessage.includes('parse')) {
        userFriendlyError = `Failed to parse the API specification. The URL may not be returning valid OpenAPI/Swagger JSON or YAML format.\n\nOriginal error: ${errorMessage}`;
      }

      return {
        success: false,
        error: userFriendlyError,
        metadata: {
          remainingRequests: this.rateLimiter.getRemaining(),
          processingTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Execute an actual API request (like Postman)
   */
  async executeApiRequest(args: {
    url: string;
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    authToken?: string;
    timeout?: number;
    followRedirects?: boolean;
  }): Promise<{
    success: boolean;
    data?: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: unknown;
      responseTime: number;
      requestDetails: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: unknown;
      };
    };
    error?: string;
    metadata: {
      remainingRequests: number;
    };
  }> {
    // Rate limiting check
    if (!this.rateLimiter.tryAcquire()) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        metadata: {
          remainingRequests: 0,
        },
      };
    }

    const startTime = Date.now();
    const method = (args.method || 'GET').toUpperCase() as Method;
    const timeout = args.timeout || 30000;

    this.logger.info(
      { url: args.url, method },
      'Executing API request'
    );

    try {
      // Validate URL
      try {
        new URL(args.url);
      } catch {
        return {
          success: false,
          error: 'Invalid URL format. Must be a valid http:// or https:// URL.',
          metadata: {
            remainingRequests: this.rateLimiter.getRemaining(),
          },
        };
      }

      // Build headers
      const headers: Record<string, string> = {
        'User-Agent': 'knotty/1.0.0',
        'Accept': 'application/json, text/plain, */*',
        ...(args.headers || {}),
      };

      // Add auth token
      if (args.authToken) {
        headers['Authorization'] = `Bearer ${args.authToken}`;
      }

      // Add content-type for body requests
      if (args.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        headers['Content-Type'] = 'application/json';
      }

      // Build request config
      const config: AxiosRequestConfig = {
        url: args.url,
        method,
        headers,
        timeout,
        maxRedirects: args.followRedirects === false ? 0 : 5,
        validateStatus: () => true, // Accept all status codes
      };

      // Add body for appropriate methods
      if (args.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        config.data = args.body;
      }

      // Log request details (without sensitive headers)
      const safeHeaders = { ...headers };
      if (safeHeaders['Authorization']) {
        safeHeaders['Authorization'] = 'Bearer [REDACTED]';
      }

      this.logger.debug(
        { method, url: args.url, headers: safeHeaders },
        'Sending request'
      );

      // Execute request
      const response = await axios.request(config);
      const responseTime = Date.now() - startTime;

      // Parse response headers (flatten arrays)
      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value || '');
      }

      // Handle response body
      let responseBody = response.data;
      
      // If it's a string, try to parse as JSON
      if (typeof responseBody === 'string') {
        try {
          responseBody = JSON.parse(responseBody);
        } catch {
          // Keep as string if not JSON
        }
      }

      // Truncate very large responses
      const bodyStr = JSON.stringify(responseBody);
      const maxBodySize = 100000; // 100KB
      let truncated = false;
      if (bodyStr.length > maxBodySize) {
        truncated = true;
        responseBody = {
          _truncated: true,
          _message: `Response body too large (${bodyStr.length} chars). Showing first ${maxBodySize} chars.`,
          _preview: bodyStr.substring(0, maxBodySize),
        };
      }

      this.logger.info(
        {
          url: args.url,
          method,
          status: response.status,
          responseTime,
          truncated,
        },
        'API request completed'
      );

      return {
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          responseTime,
          requestDetails: {
            method,
            url: args.url,
            headers: safeHeaders,
            body: args.body,
          },
        },
        metadata: {
          remainingRequests: this.rateLimiter.getRemaining(),
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (error instanceof AxiosError) {
        // Network or timeout errors
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          return {
            success: false,
            error: `Request timed out after ${timeout}ms. The server may be slow or unreachable.`,
            metadata: {
              remainingRequests: this.rateLimiter.getRemaining(),
            },
          };
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          return {
            success: false,
            error: `Cannot connect to ${args.url}: ${error.code}. Check if the URL is correct and the server is running.`,
            metadata: {
              remainingRequests: this.rateLimiter.getRemaining(),
            },
          };
        }

        // SSL errors
        if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || error.code === 'CERT_HAS_EXPIRED') {
          return {
            success: false,
            error: `SSL certificate error: ${error.code}. The server may have an invalid certificate.`,
            metadata: {
              remainingRequests: this.rateLimiter.getRemaining(),
            },
          };
        }

        this.logger.error(
          { url: args.url, method, error: error.message, code: error.code },
          'API request failed'
        );

        return {
          success: false,
          error: `Request failed: ${error.message}`,
          metadata: {
            remainingRequests: this.rateLimiter.getRemaining(),
          },
        };
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ url: args.url, error: errorMessage }, 'API request failed');

      return {
        success: false,
        error: errorMessage,
        metadata: {
          remainingRequests: this.rateLimiter.getRemaining(),
        },
      };
    }
  }
}

/**
 * OpenAPI specification fetcher with authentication support
 * and Swagger UI scraping capability
 */

import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import yaml from 'js-yaml';
import { getLogger } from '../utils/logger.js';
import type { OpenAPIV3, OpenAPIV2 } from 'openapi-types';

export type OpenAPISpec = OpenAPIV3.Document | OpenAPIV2.Document;

export interface FetcherOptions {
  url: string;
  authToken?: string;
  timeout?: number;
}

export interface FetchResult {
  spec: OpenAPISpec;
  fetchedAt: Date;
  sourceUrl: string;
  specVersion: string;
  /** If true, the spec was extracted from a Swagger UI page */
  scrapedFromUI?: boolean;
  /** The actual spec URL if different from input URL */
  resolvedSpecUrl?: string;
}

export class OpenAPIFetcher {
  private readonly url: string;
  private readonly authToken?: string;
  private readonly timeout: number;
  private readonly logger = getLogger();

  constructor(options: FetcherOptions) {
    this.url = options.url;
    this.authToken = options.authToken;
    this.timeout = options.timeout ?? 30000;
  }

  /**
   * Fetch the OpenAPI spec from the configured URL
   * Automatically detects and scrapes Swagger UI pages
   */
  async fetch(): Promise<FetchResult> {
    this.logger.info({ url: this.url }, 'Fetching OpenAPI spec');

    const config: AxiosRequestConfig = {
      url: this.url,
      method: 'GET',
      timeout: this.timeout,
      headers: {
        'Accept': 'application/json, application/yaml, text/yaml, text/html, */*',
        'User-Agent': 'knotty/1.0.0',
      },
      responseType: 'text',
    };

    if (this.authToken) {
      config.headers!['Authorization'] = `Bearer ${this.authToken}`;
      this.logger.debug('Using Bearer token authentication');
    }

    try {
      const response = await axios.request(config);
      const contentType = response.headers['content-type'] || '';
      const data = response.data as string;

      // Check if response is HTML (likely Swagger UI)
      if (this.isHtmlResponse(data, contentType)) {
        this.logger.info('Detected HTML response, attempting to extract OpenAPI spec URL from Swagger UI');
        return await this.scrapeSwaggerUI(data);
      }

      // Try to parse as JSON/YAML directly
      const spec = this.parseResponse(data, contentType);
      this.validateSpec(spec);

      const specVersion = this.detectSpecVersion(spec);
      this.logger.info({ specVersion, url: this.url }, 'Successfully fetched OpenAPI spec');

      return {
        spec,
        fetchedAt: new Date(),
        sourceUrl: this.url,
        specVersion,
      };
    } catch (error) {
      throw this.handleFetchError(error);
    }
  }

  /**
   * Check if the response is HTML
   */
  private isHtmlResponse(data: string, contentType: string): boolean {
    const trimmed = data.trim().toLowerCase();
    return (
      contentType.includes('text/html') ||
      trimmed.startsWith('<!doctype html') ||
      trimmed.startsWith('<html') ||
      (trimmed.includes('<head') && trimmed.includes('<body'))
    );
  }

  /**
   * Scrape Swagger UI page to extract the OpenAPI spec URL or embedded spec
   */
  private async scrapeSwaggerUI(html: string): Promise<FetchResult> {
    this.logger.debug('Parsing Swagger UI HTML to find spec URL or embedded spec');

    // First, check if the spec URL is in the HTML
    const specUrl = this.extractSpecUrlFromHtml(html);
    
    if (specUrl) {
      return this.fetchFromUrl(specUrl, true);
    }

    // Check for external init scripts that might contain the spec
    const embeddedSpec = await this.tryFetchEmbeddedSpec(html);
    if (embeddedSpec) {
      this.validateSpec(embeddedSpec);
      const specVersion = this.detectSpecVersion(embeddedSpec);
      this.logger.info({ specVersion }, 'Extracted embedded spec from Swagger UI init script');
      
      return {
        spec: embeddedSpec,
        fetchedAt: new Date(),
        sourceUrl: this.url,
        specVersion,
        scrapedFromUI: true,
        resolvedSpecUrl: `${this.url} (embedded in init script)`,
      };
    }

    // Try common URL patterns based on the original URL
    const discoveredUrl = await this.discoverSpecUrl();
    if (discoveredUrl) {
      return this.fetchFromUrl(discoveredUrl, true);
    }

    throw new OpenAPIFetchError(
      `Could not find OpenAPI spec URL in Swagger UI page at ${this.url}. ` +
      `Try providing the direct JSON/YAML spec URL instead (e.g., /v3/api-docs, /swagger.json).`,
      'SWAGGER_UI_PARSE_ERROR'
    );
  }

  /**
   * Try to fetch embedded spec from external init scripts
   */
  private async tryFetchEmbeddedSpec(html: string): Promise<OpenAPISpec | null> {
    // Look for swagger-ui-init.js or similar script references
    const initScriptPatterns = [
      /src\s*=\s*["']([^"']*swagger-ui-init[^"']*\.js)["']/i,
      /src\s*=\s*["']([^"']*swagger-initializer[^"']*\.js)["']/i,
      /src\s*=\s*["']([^"']*swagger-config[^"']*\.js)["']/i,
    ];

    for (const pattern of initScriptPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const scriptUrl = this.resolveUrl(match[1]);
        this.logger.debug({ scriptUrl }, 'Found init script, checking for embedded spec');

        try {
          const response = await axios.get(scriptUrl, {
            timeout: 10000,
            headers: {
              'User-Agent': 'knotty/1.0.0',
              ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
            },
            responseType: 'text',
          });

          const scriptContent = response.data as string;
          
          // Look for swaggerDoc or spec embedded in the script
          const embeddedSpec = this.extractEmbeddedSpec(scriptContent);
          if (embeddedSpec) {
            return embeddedSpec;
          }
        } catch (err) {
          this.logger.debug({ scriptUrl, error: err instanceof Error ? err.message : 'unknown' }, 
            'Failed to fetch init script');
        }
      }
    }

    // Also check for inline scripts with embedded spec
    const inlineScriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const script of inlineScriptMatches) {
      const embeddedSpec = this.extractEmbeddedSpec(script);
      if (embeddedSpec) {
        return embeddedSpec;
      }
    }

    return null;
  }

  /**
   * Extract embedded OpenAPI spec from JavaScript content
   */
  private extractEmbeddedSpec(jsContent: string): OpenAPISpec | null {
    // Pattern 1: "swaggerDoc": {...} or swaggerDoc: {...}
    const swaggerDocMatch = jsContent.match(/"?swaggerDoc"?\s*:\s*(\{[\s\S]*)/);
    if (swaggerDocMatch) {
      try {
        // Extract the JSON object - need to find matching braces
        const jsonStr = this.extractJsonObject(swaggerDocMatch[1]);
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          if (parsed.openapi || parsed.swagger) {
            this.logger.debug('Found embedded swaggerDoc');
            return parsed as OpenAPISpec;
          }
        }
      } catch (err) {
        this.logger.debug('Failed to parse swaggerDoc');
      }
    }

    // Pattern 2: spec: {...} with openapi or swagger field
    const specMatch = jsContent.match(/"?spec"?\s*:\s*(\{[\s\S]*"(?:openapi|swagger)"[\s\S]*)/);
    if (specMatch) {
      try {
        const jsonStr = this.extractJsonObject(specMatch[1]);
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          if (parsed.openapi || parsed.swagger) {
            this.logger.debug('Found embedded spec object');
            return parsed as OpenAPISpec;
          }
        }
      } catch (err) {
        this.logger.debug('Failed to parse spec object');
      }
    }

    return null;
  }

  /**
   * Extract a complete JSON object from a string starting with {
   */
  private extractJsonObject(str: string): string | null {
    if (!str.startsWith('{')) return null;
    
    let depth = 0;
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      
      if (escape) {
        escape = false;
        continue;
      }
      
      if (char === '\\') {
        escape = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') depth--;
        
        if (depth === 0) {
          return str.substring(0, i + 1);
        }
      }
    }
    
    return null;
  }

  /**
   * Extract the spec URL from Swagger UI HTML
   */
  private extractSpecUrlFromHtml(html: string): string | null {
    const patterns = [
      // SwaggerUIBundle({ url: "..." })
      /SwaggerUIBundle\s*\(\s*\{[^}]*url\s*:\s*["']([^"']+)["']/i,
      // SwaggerUIStandalonePreset with url
      /SwaggerUIStandalonePreset[^}]*url\s*:\s*["']([^"']+)["']/i,
      // url: "..." in any config object
      /["']?url["']?\s*:\s*["']([^"']+\.(?:json|yaml|yml))["']/i,
      // spec url in config
      /configUrl\s*:\s*["']([^"']+)["']/i,
      // data-url attribute
      /data-url\s*=\s*["']([^"']+)["']/i,
      // href to spec file
      /href\s*=\s*["']([^"']*(?:swagger|openapi|api-docs)[^"']*\.(?:json|yaml|yml))["']/i,
      // url parameter in any script context - more permissive
      /["']?url["']?\s*[=:]\s*["']([^"']+(?:api-docs|swagger|openapi)[^"']*)["']/i,
      // Common API doc paths in any context
      /["']([^"']*\/v[23]\/api-docs[^"']*)["']/i,
      /["']([^"']*\/swagger\.json[^"']*)["']/i,
      /["']([^"']*\/openapi\.json[^"']*)["']/i,
      /["']([^"']*\/api\/docs[^"']*)["']/i,
      // Springdoc/Springfox patterns
      /["']([^"']*\/api-docs[^"'\/]*)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let specUrl = match[1];
        
        // Skip if it's clearly not a spec URL (CSS, JS, images, etc.)
        if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|ttf|eot)(\?|$)/i.test(specUrl)) {
          continue;
        }

        // Make relative URLs absolute
        specUrl = this.resolveUrl(specUrl);
        
        this.logger.info({ specUrl }, 'Found spec URL in Swagger UI HTML');
        return specUrl;
      }
    }

    return null;
  }

  /**
   * Resolve a relative URL to an absolute URL
   */
  private resolveUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const baseUrl = new URL(this.url);
    
    if (url.startsWith('/')) {
      return `${baseUrl.protocol}//${baseUrl.host}${url}`;
    }
    
    // Relative path
    const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
    return `${baseUrl.protocol}//${baseUrl.host}${basePath}${url}`;
  }

  /**
   * Try to discover the spec URL by checking common patterns
   */
  private async discoverSpecUrl(): Promise<string | null> {
    const baseUrl = new URL(this.url);
    // Clean up the path - remove hash, trailing slashes
    const basePath = baseUrl.pathname.replace(/\/?#?\/?$/, '').replace(/\/+$/, '');
    
    // Common OpenAPI spec URL patterns to try
    const patterns = [
      // Springdoc patterns (most common for Spring Boot)
      '/v3/api-docs',
      '/v2/api-docs',
      `${basePath}/v3/api-docs`,
      `${basePath}/v2/api-docs`,
      
      // If URL ends with api-docs or swagger-ui, try variants
      `${basePath.replace(/\/(api-docs|swagger-ui|swagger)$/, '')}/v3/api-docs`,
      `${basePath.replace(/\/(api-docs|swagger-ui|swagger)$/, '')}/v2/api-docs`,
      
      // Swagger.json patterns
      '/swagger.json',
      '/openapi.json',
      `${basePath}/swagger.json`,
      `${basePath}/openapi.json`,
      `${basePath.replace(/\/(api-docs|swagger-ui|swagger)$/, '')}/swagger.json`,
      
      // API prefix patterns
      '/api/swagger.json',
      '/api/openapi.json',
      '/api/v3/api-docs',
      '/api/v2/api-docs',
      
      // Other common patterns
      `${basePath}-json`,
      `${basePath.replace('#/', '')}/swagger.json`,
    ];

    // Remove duplicates
    const uniquePatterns = [...new Set(patterns)];

    this.logger.debug({ patternsCount: uniquePatterns.length }, 'Trying common spec URL patterns');

    for (const pattern of uniquePatterns) {
      const testUrl = `${baseUrl.protocol}//${baseUrl.host}${pattern}`;
      
      try {
        const response = await axios.get(testUrl, {
          timeout: 5000,
          headers: {
            'Accept': 'application/json, application/yaml, */*',
            'User-Agent': 'knotty/1.0.0',
            ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
          },
          validateStatus: (status) => status === 200,
          responseType: 'text',
        });

        const contentType = response.headers['content-type'] || '';
        const data = response.data;
        
        // Skip if it's HTML
        if (contentType.includes('text/html')) {
          continue;
        }

        // Check if it's valid JSON/YAML with OpenAPI structure
        if (this.isValidSpecResponse(data, contentType)) {
          this.logger.info({ discoveredUrl: testUrl }, 'Discovered OpenAPI spec URL');
          return testUrl;
        }
      } catch {
        // Not found or error, try next pattern
        continue;
      }
    }

    return null;
  }

  /**
   * Check if a response looks like a valid OpenAPI spec
   */
  private isValidSpecResponse(data: unknown, contentType: string): boolean {
    try {
      let parsed: unknown = data;
      
      // Parse if string
      if (typeof data === 'string') {
        const trimmed = data.trim();
        
        // Skip if it looks like HTML
        if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
          return false;
        }
        
        // Try JSON
        if (contentType.includes('json') || trimmed.startsWith('{')) {
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            // Try YAML
            parsed = yaml.load(trimmed);
          }
        } else {
          // Try YAML
          parsed = yaml.load(trimmed);
        }
      }

      // Check for OpenAPI/Swagger markers
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        return !!(obj.openapi || obj.swagger);
      }
    } catch {
      return false;
    }
    
    return false;
  }

  /**
   * Fetch spec from a discovered URL
   */
  private async fetchFromUrl(specUrl: string, scrapedFromUI: boolean): Promise<FetchResult> {
    this.logger.info({ specUrl }, 'Fetching OpenAPI spec from discovered URL');

    const config: AxiosRequestConfig = {
      url: specUrl,
      method: 'GET',
      timeout: this.timeout,
      headers: {
        'Accept': 'application/json, application/yaml, text/yaml, */*',
        'User-Agent': 'knotty/1.0.0',
      },
      responseType: 'text',
    };

    if (this.authToken) {
      config.headers!['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await axios.request(config);
      const contentType = response.headers['content-type'] || '';
      const spec = this.parseResponse(response.data, contentType);
      
      this.validateSpec(spec);

      const specVersion = this.detectSpecVersion(spec);
      this.logger.info({ specVersion, specUrl }, 'Successfully fetched OpenAPI spec from Swagger UI');

      return {
        spec,
        fetchedAt: new Date(),
        sourceUrl: this.url,
        specVersion,
        scrapedFromUI,
        resolvedSpecUrl: specUrl,
      };
    } catch (error) {
      throw this.handleFetchError(error);
    }
  }

  /**
   * Parse the response body as JSON or YAML
   */
  private parseResponse(data: string, contentType?: string): OpenAPISpec {
    const trimmedData = data.trim();
    
    // Try JSON first if content type suggests it or data looks like JSON
    if (contentType?.includes('json') || trimmedData.startsWith('{')) {
      try {
        return JSON.parse(trimmedData) as OpenAPISpec;
      } catch {
        this.logger.debug('Failed to parse as JSON, trying YAML');
      }
    }

    // Try YAML
    try {
      const parsed = yaml.load(trimmedData);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Parsed YAML is not an object');
      }
      return parsed as OpenAPISpec;
    } catch (yamlError) {
      throw new OpenAPIFetchError(
        'Failed to parse OpenAPI spec as JSON or YAML',
        'PARSE_ERROR',
        yamlError
      );
    }
  }

  /**
   * Detect the OpenAPI/Swagger spec version
   */
  private detectSpecVersion(spec: OpenAPISpec): string {
    if ('openapi' in spec && spec.openapi) {
      return `OpenAPI ${spec.openapi}`;
    }
    if ('swagger' in spec && spec.swagger) {
      return `Swagger ${spec.swagger}`;
    }
    return 'Unknown';
  }

  /**
   * Validate that the spec has required fields
   */
  private validateSpec(spec: OpenAPISpec): void {
    if (!spec || typeof spec !== 'object') {
      throw new OpenAPIFetchError('Invalid OpenAPI spec: not an object', 'VALIDATION_ERROR');
    }

    // Check for OpenAPI 3.x
    if ('openapi' in spec) {
      if (!spec.openapi || !spec.info || !spec.paths) {
        throw new OpenAPIFetchError(
          'Invalid OpenAPI 3.x spec: missing required fields (openapi, info, paths)',
          'VALIDATION_ERROR'
        );
      }
      const versionParts = spec.openapi.split('.');
      if (versionParts[0] !== '3') {
        throw new OpenAPIFetchError(
          `Unsupported OpenAPI version: ${spec.openapi}`,
          'VALIDATION_ERROR'
        );
      }
      return;
    }

    // Check for Swagger 2.0
    if ('swagger' in spec) {
      if (!spec.swagger || !spec.info || !spec.paths) {
        throw new OpenAPIFetchError(
          'Invalid Swagger 2.0 spec: missing required fields (swagger, info, paths)',
          'VALIDATION_ERROR'
        );
      }
      if (spec.swagger !== '2.0') {
        throw new OpenAPIFetchError(
          `Unsupported Swagger version: ${spec.swagger}`,
          'VALIDATION_ERROR'
        );
      }
      return;
    }

    throw new OpenAPIFetchError(
      'Invalid spec: must be OpenAPI 3.x or Swagger 2.0',
      'VALIDATION_ERROR'
    );
  }

  /**
   * Handle and wrap fetch errors
   */
  private handleFetchError(error: unknown): OpenAPIFetchError {
    if (error instanceof OpenAPIFetchError) {
      return error;
    }

    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;

      if (status === 401 || status === 403) {
        return new OpenAPIFetchError(
          `Authentication failed (${status} ${statusText}). ` +
          `This API requires authentication. Use the authToken parameter: ` +
          `"Please analyze the API at [URL] with auth token [YOUR_TOKEN]"`,
          'AUTH_ERROR',
          error
        );
      }

      if (status === 404) {
        return new OpenAPIFetchError(
          `OpenAPI spec not found at ${this.url}. ` +
          `Try using the Swagger UI URL (e.g., /swagger-ui.html) and I'll try to find the spec automatically.`,
          'NOT_FOUND',
          error
        );
      }

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return new OpenAPIFetchError(
          `Request timeout fetching OpenAPI spec from ${this.url}`,
          'TIMEOUT',
          error
        );
      }

      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return new OpenAPIFetchError(
          `Cannot connect to ${this.url}: ${error.code}`,
          'CONNECTION_ERROR',
          error
        );
      }

      return new OpenAPIFetchError(
        `HTTP error fetching OpenAPI spec: ${status} ${statusText}`,
        'HTTP_ERROR',
        error
      );
    }

    if (error instanceof Error) {
      return new OpenAPIFetchError(error.message, 'UNKNOWN_ERROR', error);
    }

    return new OpenAPIFetchError(
      'Unknown error fetching OpenAPI spec',
      'UNKNOWN_ERROR'
    );
  }
}

export class OpenAPIFetchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'OpenAPIFetchError';
  }
}

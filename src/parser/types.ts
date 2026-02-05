/**
 * Normalized types for LLM consumption
 */

export interface NormalizedEndpoint {
  /** Full path with parameters, e.g., "/users/{id}" */
  path: string;
  /** HTTP method in lowercase */
  method: string;
  /** Unique operation identifier */
  operationId?: string;
  /** Short summary of the endpoint */
  summary?: string;
  /** Detailed description */
  description?: string;
  /** Tags/categories for the endpoint */
  tags: string[];
  /** Whether the endpoint is deprecated */
  deprecated: boolean;
  /** Path parameters */
  pathParameters: NormalizedParameter[];
  /** Query parameters */
  queryParameters: NormalizedParameter[];
  /** Header parameters */
  headerParameters: NormalizedParameter[];
  /** Cookie parameters */
  cookieParameters: NormalizedParameter[];
  /** Request body schema */
  requestBody?: NormalizedRequestBody;
  /** Response schemas by status code */
  responses: NormalizedResponse[];
  /** Authentication requirements */
  security: NormalizedSecurity[];
}

export interface NormalizedParameter {
  name: string;
  description?: string;
  required: boolean;
  deprecated: boolean;
  schema: NormalizedSchema;
  example?: unknown;
}

export interface NormalizedRequestBody {
  description?: string;
  required: boolean;
  contentTypes: string[];
  schema: NormalizedSchema;
  examples?: Record<string, unknown>;
}

export interface NormalizedResponse {
  statusCode: string;
  description: string;
  contentTypes: string[];
  schema?: NormalizedSchema;
  headers?: Record<string, NormalizedParameter>;
}

export interface NormalizedSecurity {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'basic' | 'bearer' | 'unknown';
  name: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  description?: string;
  scopes?: string[];
}

export interface NormalizedSchema {
  type: string;
  format?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, NormalizedSchema>;
  items?: NormalizedSchema;
  enum?: (string | number | boolean)[];
  default?: unknown;
  example?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  nullable?: boolean;
  oneOf?: NormalizedSchema[];
  anyOf?: NormalizedSchema[];
  allOf?: NormalizedSchema[];
  ref?: string;
}

export interface NormalizedApiSpec {
  title: string;
  version: string;
  description?: string;
  baseUrl?: string;
  servers: { url: string; description?: string }[];
  endpoints: NormalizedEndpoint[];
  securitySchemes: Record<string, NormalizedSecurity>;
  totalEndpoints: number;
  fetchedAt: string;
  sourceUrl: string;
  specVersion: string;
}

export interface SearchResult {
  endpoints: NormalizedEndpoint[];
  query: string;
  totalMatches: number;
  searchedFields: string[];
}

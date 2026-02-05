/**
 * OpenAPI specification parser
 * Converts OpenAPI 3.x and Swagger 2.0 specs to normalized format
 */

import type { OpenAPIV3, OpenAPIV2 } from 'openapi-types';
import type { FetchResult, OpenAPISpec } from '../fetcher/index.js';
import type {
  NormalizedApiSpec,
  NormalizedEndpoint,
  NormalizedParameter,
  NormalizedRequestBody,
  NormalizedResponse,
  NormalizedSchema,
  NormalizedSecurity,
} from './types.js';
import { getLogger } from '../utils/logger.js';

export class OpenAPIParser {
  private readonly logger = getLogger();
  private spec!: OpenAPISpec;
  private isV3 = false;

  /**
   * Parse an OpenAPI spec into normalized format
   */
  parse(fetchResult: FetchResult): NormalizedApiSpec {
    this.spec = fetchResult.spec;
    this.isV3 = 'openapi' in this.spec;

    this.logger.info(
      { specVersion: fetchResult.specVersion },
      'Parsing OpenAPI specification'
    );

    const endpoints = this.parseEndpoints();
    const securitySchemes = this.parseSecuritySchemes();

    const normalized: NormalizedApiSpec = {
      title: this.spec.info.title,
      version: this.spec.info.version,
      description: this.spec.info.description,
      baseUrl: this.getBaseUrl(),
      servers: this.getServers(),
      endpoints,
      securitySchemes,
      totalEndpoints: endpoints.length,
      fetchedAt: fetchResult.fetchedAt.toISOString(),
      sourceUrl: fetchResult.sourceUrl,
      specVersion: fetchResult.specVersion,
    };

    this.logger.info(
      { totalEndpoints: endpoints.length },
      'Successfully parsed OpenAPI specification'
    );

    return normalized;
  }

  /**
   * Get the base URL from the spec
   */
  private getBaseUrl(): string | undefined {
    if (this.isV3) {
      const v3Spec = this.spec as OpenAPIV3.Document;
      return v3Spec.servers?.[0]?.url;
    } else {
      const v2Spec = this.spec as OpenAPIV2.Document;
      if (v2Spec.host) {
        const scheme = v2Spec.schemes?.[0] || 'https';
        const basePath = v2Spec.basePath || '';
        return `${scheme}://${v2Spec.host}${basePath}`;
      }
    }
    return undefined;
  }

  /**
   * Get servers list
   */
  private getServers(): { url: string; description?: string }[] {
    if (this.isV3) {
      const v3Spec = this.spec as OpenAPIV3.Document;
      return (v3Spec.servers || []).map((s) => ({
        url: s.url,
        description: s.description,
      }));
    } else {
      const baseUrl = this.getBaseUrl();
      return baseUrl ? [{ url: baseUrl }] : [];
    }
  }

  /**
   * Parse all endpoints from paths
   */
  private parseEndpoints(): NormalizedEndpoint[] {
    const endpoints: NormalizedEndpoint[] = [];
    const paths = this.spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;

      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)[method] as
          | OpenAPIV3.OperationObject
          | OpenAPIV2.OperationObject
          | undefined;

        if (!operation) continue;

        try {
          const endpoint = this.parseOperation(path, method, operation, pathItem);
          endpoints.push(endpoint);
        } catch (error) {
          this.logger.warn(
            { path, method, error },
            'Failed to parse endpoint, skipping'
          );
        }
      }
    }

    return endpoints;
  }

  /**
   * Parse a single operation
   */
  private parseOperation(
    path: string,
    method: string,
    operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject,
    pathItem: OpenAPIV3.PathItemObject | OpenAPIV2.PathItemObject
  ): NormalizedEndpoint {
    // Combine path-level and operation-level parameters
    const pathParams = (pathItem.parameters || []) as (OpenAPIV3.ParameterObject | OpenAPIV2.ParameterObject)[];
    const opParams = (operation.parameters || []) as (OpenAPIV3.ParameterObject | OpenAPIV2.ParameterObject)[];
    const allParams = [...pathParams, ...opParams];

    // Deduplicate by name and in
    const paramMap = new Map<string, OpenAPIV3.ParameterObject | OpenAPIV2.ParameterObject>();
    for (const param of allParams) {
      if ('$ref' in param) continue; // Skip references for now
      const key = `${param.in}:${param.name}`;
      paramMap.set(key, param);
    }

    const parameters = Array.from(paramMap.values());

    return {
      path,
      method,
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags || [],
      deprecated: operation.deprecated || false,
      pathParameters: this.filterParameters(parameters, 'path'),
      queryParameters: this.filterParameters(parameters, 'query'),
      headerParameters: this.filterParameters(parameters, 'header'),
      cookieParameters: this.filterParameters(parameters, 'cookie'),
      requestBody: this.parseRequestBody(operation),
      responses: this.parseResponses(operation.responses),
      security: this.parseSecurity(operation.security),
    };
  }

  /**
   * Filter and normalize parameters by location
   */
  private filterParameters(
    params: (OpenAPIV3.ParameterObject | OpenAPIV2.ParameterObject)[],
    location: string
  ): NormalizedParameter[] {
    return params
      .filter((p) => p.in === location)
      .map((p) => this.normalizeParameter(p));
  }

  /**
   * Normalize a parameter
   */
  private normalizeParameter(
    param: OpenAPIV3.ParameterObject | OpenAPIV2.ParameterObject
  ): NormalizedParameter {
    let schema: NormalizedSchema;

    if (this.isV3) {
      const v3Param = param as OpenAPIV3.ParameterObject;
      schema = this.normalizeSchema(v3Param.schema as OpenAPIV3.SchemaObject);
    } else {
      // Swagger 2.0 has inline type info
      const v2Param = param as OpenAPIV2.ParameterObject;
      schema = {
        type: v2Param.type || 'string',
        format: v2Param.format,
        enum: v2Param.enum,
        default: v2Param.default,
      };
    }

    return {
      name: param.name,
      description: param.description,
      required: param.required || false,
      deprecated: (param as OpenAPIV3.ParameterObject).deprecated || false,
      schema,
      example: (param as OpenAPIV3.ParameterObject).example,
    };
  }

  /**
   * Parse request body
   */
  private parseRequestBody(
    operation: OpenAPIV3.OperationObject | OpenAPIV2.OperationObject
  ): NormalizedRequestBody | undefined {
    if (this.isV3) {
      const v3Op = operation as OpenAPIV3.OperationObject;
      const requestBody = v3Op.requestBody as OpenAPIV3.RequestBodyObject | undefined;
      
      if (!requestBody?.content) return undefined;

      const contentTypes = Object.keys(requestBody.content);
      const firstContent = requestBody.content[contentTypes[0]];

      return {
        description: requestBody.description,
        required: requestBody.required || false,
        contentTypes,
        schema: this.normalizeSchema(firstContent?.schema as OpenAPIV3.SchemaObject),
        examples: firstContent?.examples as Record<string, unknown> | undefined,
      };
    } else {
      // Swagger 2.0: body parameter
      const v2Op = operation as OpenAPIV2.OperationObject;
      const bodyParam = v2Op.parameters?.find(
        (p) => (p as OpenAPIV2.InBodyParameterObject).in === 'body'
      ) as OpenAPIV2.InBodyParameterObject | undefined;

      if (!bodyParam?.schema) return undefined;

      return {
        description: bodyParam.description,
        required: bodyParam.required || false,
        contentTypes: ['application/json'],
        schema: this.normalizeSchema(bodyParam.schema as OpenAPIV2.SchemaObject),
      };
    }
  }

  /**
   * Parse responses
   */
  private parseResponses(
    responses: OpenAPIV3.ResponsesObject | OpenAPIV2.ResponsesObject | undefined
  ): NormalizedResponse[] {
    if (!responses) return [];

    const normalized: NormalizedResponse[] = [];

    for (const [statusCode, response] of Object.entries(responses)) {
      if (!response || '$ref' in response) continue;

      const resp = response as OpenAPIV3.ResponseObject | OpenAPIV2.ResponseObject;

      if (this.isV3) {
        const v3Resp = resp as OpenAPIV3.ResponseObject;
        const contentTypes = v3Resp.content ? Object.keys(v3Resp.content) : [];
        const firstContent = v3Resp.content?.[contentTypes[0]];

        normalized.push({
          statusCode,
          description: v3Resp.description || '',
          contentTypes,
          schema: firstContent?.schema
            ? this.normalizeSchema(firstContent.schema as OpenAPIV3.SchemaObject)
            : undefined,
        });
      } else {
        const v2Resp = resp as OpenAPIV2.ResponseObject;
        normalized.push({
          statusCode,
          description: v2Resp.description || '',
          contentTypes: ['application/json'],
          schema: v2Resp.schema
            ? this.normalizeSchema(v2Resp.schema as OpenAPIV2.SchemaObject)
            : undefined,
        });
      }
    }

    return normalized;
  }

  /**
   * Parse security requirements
   */
  private parseSecurity(
    security?: (OpenAPIV3.SecurityRequirementObject | OpenAPIV2.SecurityRequirementObject)[]
  ): NormalizedSecurity[] {
    if (!security) return [];

    const result: NormalizedSecurity[] = [];

    for (const requirement of security) {
      for (const [name, scopes] of Object.entries(requirement)) {
        const scheme = this.getSecurityScheme(name);
        if (scheme) {
          result.push({
            ...scheme,
            scopes: scopes as string[],
          });
        }
      }
    }

    return result;
  }

  /**
   * Get a security scheme by name
   */
  private getSecurityScheme(name: string): NormalizedSecurity | undefined {
    if (this.isV3) {
      const v3Spec = this.spec as OpenAPIV3.Document;
      const scheme = v3Spec.components?.securitySchemes?.[name] as
        | OpenAPIV3.SecuritySchemeObject
        | undefined;
      if (!scheme) return undefined;

      return this.normalizeSecurityScheme(name, scheme);
    } else {
      const v2Spec = this.spec as OpenAPIV2.Document;
      const scheme = v2Spec.securityDefinitions?.[name];
      if (!scheme) return undefined;

      return this.normalizeSecuritySchemeV2(name, scheme);
    }
  }

  /**
   * Parse all security schemes
   */
  private parseSecuritySchemes(): Record<string, NormalizedSecurity> {
    const schemes: Record<string, NormalizedSecurity> = {};

    if (this.isV3) {
      const v3Spec = this.spec as OpenAPIV3.Document;
      const securitySchemes = v3Spec.components?.securitySchemes || {};

      for (const [name, scheme] of Object.entries(securitySchemes)) {
        if ('$ref' in scheme) continue;
        schemes[name] = this.normalizeSecurityScheme(
          name,
          scheme as OpenAPIV3.SecuritySchemeObject
        );
      }
    } else {
      const v2Spec = this.spec as OpenAPIV2.Document;
      const securityDefinitions = v2Spec.securityDefinitions || {};

      for (const [name, scheme] of Object.entries(securityDefinitions)) {
        schemes[name] = this.normalizeSecuritySchemeV2(name, scheme);
      }
    }

    return schemes;
  }

  /**
   * Normalize an OpenAPI 3.x security scheme
   */
  private normalizeSecurityScheme(
    name: string,
    scheme: OpenAPIV3.SecuritySchemeObject
  ): NormalizedSecurity {
    switch (scheme.type) {
      case 'apiKey':
        return {
          type: 'apiKey',
          name,
          in: scheme.in as 'header' | 'query' | 'cookie',
          description: scheme.description,
        };
      case 'http':
        return {
          type: scheme.scheme === 'bearer' ? 'bearer' : 'http',
          name,
          scheme: scheme.scheme,
          description: scheme.description,
        };
      case 'oauth2':
        return {
          type: 'oauth2',
          name,
          description: scheme.description,
        };
      case 'openIdConnect':
        return {
          type: 'openIdConnect',
          name,
          description: scheme.description,
        };
      default: {
        const unknownScheme = scheme as { description?: string };
        return {
          type: 'unknown',
          name,
          description: unknownScheme.description,
        };
      }
    }
  }

  /**
   * Normalize a Swagger 2.0 security scheme
   */
  private normalizeSecuritySchemeV2(
    name: string,
    scheme: OpenAPIV2.SecuritySchemeObject
  ): NormalizedSecurity {
    switch (scheme.type) {
      case 'apiKey':
        return {
          type: 'apiKey',
          name,
          in: scheme.in as 'header' | 'query',
          description: scheme.description,
        };
      case 'basic':
        return {
          type: 'basic',
          name,
          description: scheme.description,
        };
      case 'oauth2':
        return {
          type: 'oauth2',
          name,
          description: scheme.description,
        };
      default: {
        const unknownScheme = scheme as { description?: string };
        return {
          type: 'unknown',
          name,
          description: unknownScheme.description,
        };
      }
    }
  }

  /**
   * Normalize a schema object
   */
  private normalizeSchema(
    schema: OpenAPIV3.SchemaObject | OpenAPIV2.SchemaObject | undefined,
    depth: number = 0
  ): NormalizedSchema {
    // Prevent infinite recursion
    if (depth > 10 || !schema) {
      return { type: 'object' };
    }

    // Handle references
    if ('$ref' in schema && schema.$ref) {
      const refPath = schema.$ref;
      const resolved = this.resolveRef(refPath);
      if (resolved) {
        return {
          ...this.normalizeSchema(resolved, depth + 1),
          ref: refPath,
        };
      }
      return { type: 'object', ref: refPath };
    }

    const normalized: NormalizedSchema = {
      type: this.getSchemaType(schema),
    };

    if (schema.format) normalized.format = schema.format;
    if (schema.description) normalized.description = schema.description;
    if (schema.enum) normalized.enum = schema.enum;
    if (schema.default !== undefined) normalized.default = schema.default;
    if (schema.example !== undefined) normalized.example = schema.example;
    if (schema.minimum !== undefined) normalized.minimum = schema.minimum;
    if (schema.maximum !== undefined) normalized.maximum = schema.maximum;
    if (schema.minLength !== undefined) normalized.minLength = schema.minLength;
    if (schema.maxLength !== undefined) normalized.maxLength = schema.maxLength;
    if (schema.pattern) normalized.pattern = schema.pattern;

    if (this.isV3) {
      const v3Schema = schema as OpenAPIV3.SchemaObject;
      if (v3Schema.nullable) normalized.nullable = true;
    }

    // Handle arrays
    if (schema.type === 'array' && schema.items) {
      normalized.items = this.normalizeSchema(
        schema.items as OpenAPIV3.SchemaObject,
        depth + 1
      );
    }

    // Handle objects
    if (schema.type === 'object' || schema.properties) {
      if (schema.required) {
        normalized.required = schema.required as string[];
      }
      if (schema.properties) {
        normalized.properties = {};
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          normalized.properties[propName] = this.normalizeSchema(
            propSchema as OpenAPIV3.SchemaObject,
            depth + 1
          );
        }
      }
    }

    // Handle composition
    if ('oneOf' in schema && schema.oneOf) {
      normalized.oneOf = schema.oneOf.map((s) =>
        this.normalizeSchema(s as OpenAPIV3.SchemaObject, depth + 1)
      );
    }
    if ('anyOf' in schema && schema.anyOf) {
      normalized.anyOf = schema.anyOf.map((s) =>
        this.normalizeSchema(s as OpenAPIV3.SchemaObject, depth + 1)
      );
    }
    if ('allOf' in schema && schema.allOf) {
      normalized.allOf = schema.allOf.map((s) =>
        this.normalizeSchema(s as OpenAPIV3.SchemaObject, depth + 1)
      );
    }

    return normalized;
  }

  /**
   * Get schema type with fallback
   */
  private getSchemaType(
    schema: OpenAPIV3.SchemaObject | OpenAPIV2.SchemaObject
  ): string {
    if (schema.type) {
      return Array.isArray(schema.type) ? schema.type[0] : schema.type;
    }
    if (schema.properties) return 'object';
    if ('items' in schema) return 'array';
    if (schema.enum) return 'string';
    return 'object';
  }

  /**
   * Resolve a $ref pointer
   */
  private resolveRef(
    ref: string
  ): OpenAPIV3.SchemaObject | OpenAPIV2.SchemaObject | undefined {
    if (!ref.startsWith('#/')) return undefined;

    const parts = ref.slice(2).split('/');
    let current: unknown = this.spec;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current as OpenAPIV3.SchemaObject | OpenAPIV2.SchemaObject;
  }
}

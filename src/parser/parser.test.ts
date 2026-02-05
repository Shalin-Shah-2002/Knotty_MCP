import { describe, it, expect } from 'vitest';
import { OpenAPIParser } from './parser.js';
import type { FetchResult } from '../fetcher/index.js';

describe('OpenAPIParser', () => {
  const parser = new OpenAPIParser();

  it('should parse OpenAPI 3.0 spec', () => {
    const fetchResult: FetchResult = {
      spec: {
        openapi: '3.0.3',
        info: {
          title: 'Test API',
          version: '1.0.0',
          description: 'A test API',
        },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              summary: 'Get all users',
              tags: ['users'],
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
            post: {
              operationId: 'createUser',
              summary: 'Create a user',
              tags: ['users'],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                      },
                      required: ['name', 'email'],
                    },
                  },
                },
              },
              responses: {
                '201': {
                  description: 'Created',
                },
              },
            },
          },
          '/users/{id}': {
            get: {
              operationId: 'getUserById',
              summary: 'Get user by ID',
              tags: ['users'],
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': {
                  description: 'Success',
                },
                '404': {
                  description: 'Not found',
                },
              },
            },
          },
        },
      },
      fetchedAt: new Date(),
      sourceUrl: 'https://api.example.com/openapi.json',
      specVersion: 'OpenAPI 3.0.3',
    };

    const result = parser.parse(fetchResult);

    expect(result.title).toBe('Test API');
    expect(result.version).toBe('1.0.0');
    expect(result.totalEndpoints).toBe(3);
    expect(result.endpoints).toHaveLength(3);

    // Check GET /users
    const getUsers = result.endpoints.find(
      (e) => e.path === '/users' && e.method === 'get'
    );
    expect(getUsers).toBeDefined();
    expect(getUsers?.operationId).toBe('getUsers');
    expect(getUsers?.tags).toContain('users');

    // Check POST /users
    const createUser = result.endpoints.find(
      (e) => e.path === '/users' && e.method === 'post'
    );
    expect(createUser).toBeDefined();
    expect(createUser?.requestBody).toBeDefined();
    expect(createUser?.requestBody?.required).toBe(true);
    expect(createUser?.requestBody?.schema.properties).toBeDefined();

    // Check GET /users/{id}
    const getUserById = result.endpoints.find((e) => e.path === '/users/{id}');
    expect(getUserById).toBeDefined();
    expect(getUserById?.pathParameters).toHaveLength(1);
    expect(getUserById?.pathParameters[0].name).toBe('id');
    expect(getUserById?.pathParameters[0].required).toBe(true);
  });

  it('should parse Swagger 2.0 spec', () => {
    const fetchResult: FetchResult = {
      spec: {
        swagger: '2.0',
        info: {
          title: 'Swagger Test API',
          version: '2.0.0',
        },
        host: 'api.example.com',
        basePath: '/v1',
        schemes: ['https'],
        paths: {
          '/pets': {
            get: {
              operationId: 'getPets',
              summary: 'List pets',
              produces: ['application/json'],
              responses: {
                '200': {
                  description: 'List of pets',
                },
              },
            },
          },
        },
      },
      fetchedAt: new Date(),
      sourceUrl: 'https://api.example.com/swagger.json',
      specVersion: 'Swagger 2.0',
    };

    const result = parser.parse(fetchResult);

    expect(result.title).toBe('Swagger Test API');
    expect(result.version).toBe('2.0.0');
    expect(result.baseUrl).toBe('https://api.example.com/v1');
    expect(result.totalEndpoints).toBe(1);
  });

  it('should handle endpoints with security requirements', () => {
    const fetchResult: FetchResult = {
      spec: {
        openapi: '3.0.3',
        info: {
          title: 'Secure API',
          version: '1.0.0',
        },
        paths: {
          '/secure': {
            get: {
              operationId: 'secureEndpoint',
              summary: 'Secure endpoint',
              security: [{ bearerAuth: [] }],
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
      fetchedAt: new Date(),
      sourceUrl: 'https://api.example.com/openapi.json',
      specVersion: 'OpenAPI 3.0.3',
    };

    const result = parser.parse(fetchResult);
    const endpoint = result.endpoints[0];

    expect(endpoint.security).toHaveLength(1);
    expect(endpoint.security[0].type).toBe('bearer');
    expect(result.securitySchemes).toHaveProperty('bearerAuth');
  });
});

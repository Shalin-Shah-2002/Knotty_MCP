import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpecCache } from './cache.js';
import type { NormalizedApiSpec } from '../parser/index.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('SpecCache', () => {
  const mockSpec: NormalizedApiSpec = {
    title: 'Test API',
    version: '1.0.0',
    description: 'Test description',
    baseUrl: 'https://api.test.com',
    servers: [{ url: 'https://api.test.com' }],
    endpoints: [],
    securitySchemes: {},
    totalEndpoints: 0,
    fetchedAt: new Date().toISOString(),
    sourceUrl: 'https://api.test.com/openapi.json',
    specVersion: 'OpenAPI 3.0.3',
  };

  let cache: SpecCache;

  beforeEach(() => {
    cache = new SpecCache({ ttlMinutes: 10 });
  });

  it('should return null when cache is empty', () => {
    expect(cache.get()).toBeNull();
  });

  it('should store and retrieve cached spec', () => {
    cache.set(mockSpec);
    const retrieved = cache.get();
    expect(retrieved).toEqual(mockSpec);
  });

  it('should report correct cache metadata', () => {
    expect(cache.getMetadata().isCached).toBe(false);
    expect(cache.getMetadata().isExpired).toBe(true);

    cache.set(mockSpec);

    const metadata = cache.getMetadata();
    expect(metadata.isCached).toBe(true);
    expect(metadata.isExpired).toBe(false);
    expect(metadata.createdAt).toBeDefined();
    expect(metadata.expiresAt).toBeDefined();
  });

  it('should clear cache', () => {
    cache.set(mockSpec);
    expect(cache.get()).not.toBeNull();

    cache.clear();
    expect(cache.get()).toBeNull();
  });

  it('should handle expired cache', () => {
    // Create cache with very short TTL
    const shortCache = new SpecCache({ ttlMinutes: 0.001 }); // ~60ms
    shortCache.set(mockSpec);

    // Wait for expiration
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(shortCache.isExpired()).toBe(true);
        resolve();
      }, 100);
    });
  });

  it('should call refresh callback when refreshing', async () => {
    const refreshFn = vi.fn().mockResolvedValue(mockSpec);
    const cacheWithRefresh = new SpecCache({
      ttlMinutes: 10,
      onRefresh: refreshFn,
    });

    await cacheWithRefresh.refresh();
    expect(refreshFn).toHaveBeenCalled();
    expect(cacheWithRefresh.get()).toEqual(mockSpec);
  });

  it('should use cached value in getOrRefresh when valid', async () => {
    const refreshFn = vi.fn().mockResolvedValue(mockSpec);
    const cacheWithRefresh = new SpecCache({
      ttlMinutes: 10,
      onRefresh: refreshFn,
    });

    // First call should trigger refresh
    await cacheWithRefresh.getOrRefresh();
    expect(refreshFn).toHaveBeenCalledTimes(1);

    // Second call should use cache
    await cacheWithRefresh.getOrRefresh();
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });
});

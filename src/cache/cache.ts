/**
 * In-memory cache with TTL and automatic refresh
 */

import { getLogger } from '../utils/logger.js';
import type { NormalizedApiSpec } from '../parser/index.js';

export interface CacheEntry<T> {
  data: T;
  createdAt: Date;
  expiresAt: Date;
}

export interface CacheOptions {
  ttlMinutes: number;
  onRefresh?: () => Promise<NormalizedApiSpec>;
}

export class SpecCache {
  private cache: CacheEntry<NormalizedApiSpec> | null = null;
  private readonly ttlMs: number;
  private refreshTimer: NodeJS.Timeout | null = null;
  private onRefresh?: () => Promise<NormalizedApiSpec>;
  private isRefreshing = false;
  private readonly logger = getLogger();

  constructor(options: CacheOptions) {
    this.ttlMs = options.ttlMinutes * 60 * 1000;
    this.onRefresh = options.onRefresh;
  }

  /**
   * Get cached spec if valid, otherwise return null
   */
  get(): NormalizedApiSpec | null {
    if (!this.cache) {
      return null;
    }

    if (this.isExpired()) {
      this.logger.debug('Cache expired');
      return null;
    }

    return this.cache.data;
  }

  /**
   * Set the cached spec
   */
  set(spec: NormalizedApiSpec): void {
    const now = new Date();
    this.cache = {
      data: spec,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };

    this.logger.info(
      {
        expiresAt: this.cache.expiresAt.toISOString(),
        endpoints: spec.totalEndpoints,
      },
      'Cache updated'
    );
  }

  /**
   * Check if cache is expired
   */
  isExpired(): boolean {
    if (!this.cache) return true;
    return new Date() > this.cache.expiresAt;
  }

  /**
   * Get cache metadata
   */
  getMetadata(): {
    isCached: boolean;
    createdAt?: string;
    expiresAt?: string;
    isExpired: boolean;
    ageSeconds?: number;
  } {
    if (!this.cache) {
      return { isCached: false, isExpired: true };
    }

    const now = new Date();
    return {
      isCached: true,
      createdAt: this.cache.createdAt.toISOString(),
      expiresAt: this.cache.expiresAt.toISOString(),
      isExpired: this.isExpired(),
      ageSeconds: Math.floor((now.getTime() - this.cache.createdAt.getTime()) / 1000),
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache = null;
    this.logger.info('Cache cleared');
  }

  /**
   * Start automatic refresh timer
   */
  startAutoRefresh(): void {
    if (this.refreshTimer) {
      return;
    }

    if (!this.onRefresh) {
      this.logger.warn('Cannot start auto-refresh without onRefresh callback');
      return;
    }

    this.logger.info(
      { intervalMinutes: this.ttlMs / 60000 },
      'Starting automatic cache refresh'
    );

    this.refreshTimer = setInterval(() => {
      this.refresh().catch((error) => {
        this.logger.error({ error }, 'Auto-refresh failed');
      });
    }, this.ttlMs);

    // Don't prevent process exit
    this.refreshTimer.unref();
  }

  /**
   * Stop automatic refresh timer
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      this.logger.info('Stopped automatic cache refresh');
    }
  }

  /**
   * Manually trigger a refresh
   */
  async refresh(): Promise<NormalizedApiSpec> {
    if (!this.onRefresh) {
      throw new Error('No refresh callback configured');
    }

    if (this.isRefreshing) {
      this.logger.debug('Refresh already in progress, waiting...');
      // Wait for current refresh to complete
      while (this.isRefreshing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const cached = this.get();
      if (cached) return cached;
      throw new Error('Refresh failed');
    }

    this.isRefreshing = true;
    this.logger.info('Refreshing cache');

    try {
      const spec = await this.onRefresh();
      this.set(spec);
      return spec;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get cached spec or refresh if expired
   */
  async getOrRefresh(): Promise<NormalizedApiSpec> {
    const cached = this.get();
    if (cached) {
      return cached;
    }
    return this.refresh();
  }
}

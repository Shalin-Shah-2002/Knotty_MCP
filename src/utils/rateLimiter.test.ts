import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from './rateLimiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(60); // 60 requests per minute
  });

  it('should allow requests within limit', () => {
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('should return remaining tokens', () => {
    const initial = limiter.getRemaining();
    expect(initial).toBe(60);
    
    limiter.tryAcquire();
    const after = limiter.getRemaining();
    expect(after).toBe(59);
  });

  it('should reset tokens', () => {
    // Consume some tokens
    for (let i = 0; i < 10; i++) {
      limiter.tryAcquire();
    }
    
    expect(limiter.getRemaining()).toBe(50);
    
    limiter.reset();
    expect(limiter.getRemaining()).toBe(60);
  });

  it('should deny requests when limit exceeded', () => {
    const smallLimiter = new RateLimiter(3);
    
    expect(smallLimiter.tryAcquire()).toBe(true);
    expect(smallLimiter.tryAcquire()).toBe(true);
    expect(smallLimiter.tryAcquire()).toBe(true);
    expect(smallLimiter.tryAcquire()).toBe(false);
  });
});

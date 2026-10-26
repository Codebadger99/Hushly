import { Injectable, OnModuleDestroy } from '@nestjs/common';

// Keep every window you use at 60 seconds or less (the sweeper assumes that)
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private hits = new Map<string, number[]>();
  private readonly maxTrackedKeys = 50_000;
  private sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  // true = allowed, false = too many requests
  allow(key: string, limit: number, windowMs: number): boolean {
    if (!this.hits.has(key) && this.hits.size >= this.maxTrackedKeys) return false;
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  private sweep() {
    const now = Date.now();
    for (const [key, times] of this.hits) {
      const recent = times.filter((t) => now - t < 60_000);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }
}

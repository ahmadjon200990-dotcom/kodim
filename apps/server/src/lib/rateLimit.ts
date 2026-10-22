// Oddiy xotiradagi rate limiter (bitta server jarayoni uchun yetarli; bir nechta nusxada Redis kerak bo'ladi).
// Kalit bo'yicha belgilangan oynada urinishlar soni; chegaradan oshsa `blockMs` davomida bloklanadi.

interface Bucket {
  count: number;
  resetAt: number;
  blockedUntil: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly blockMs = windowMs,
  ) {
    // Eskirgan yozuvlarni vaqti-vaqti bilan tozalash.
    setInterval(() => this.sweep(), Math.max(60_000, windowMs)).unref();
  }

  /** Urinishni hisoblaydi. `false` — ruxsat yo'q (qolgan soniyalar `retryAfter`). */
  hit(key: string): { ok: boolean; retryAfter: number } {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (b && b.blockedUntil > now) return { ok: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000) };
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + this.windowMs, blockedUntil: 0 };
      this.buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > this.limit) {
      b.blockedUntil = now + this.blockMs;
      return { ok: false, retryAfter: Math.ceil(this.blockMs / 1000) };
    }
    return { ok: true, retryAfter: 0 };
  }

  /** Bloklanganmi (hisoblamasdan). */
  blocked(key: string): number {
    const b = this.buckets.get(key);
    const now = Date.now();
    return b && b.blockedUntil > now ? Math.ceil((b.blockedUntil - now) / 1000) : 0;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, b] of this.buckets) if (b.resetAt <= now && b.blockedUntil <= now) this.buckets.delete(k);
  }
}

// ---- Chegaralar (CLAUDE.md 0.8.4) ----
/** O'qituvchi kirishi: IP bo'yicha 10 ta / 5 daqiqa, email bo'yicha 8 ta xato / 15 daqiqa. */
export const loginByIp = new RateLimiter(10, 5 * 60_000, 15 * 60_000);
export const loginFailByEmail = new RateLimiter(8, 15 * 60_000, 15 * 60_000);
/** Google OAuth boshlash/qaytish: IP bo'yicha 30 ta / 5 daqiqa. */
export const googleByIp = new RateLimiter(30, 5 * 60_000);
/**
 * O'quvchi kirishi (6 xonali kod — taxmin qilib topishdan himoya):
 * - qurilma (IP + deviceId) bo'yicha noto'g'ri kod: 10 ta / 10 daqiqa → 30 daqiqa bloklash;
 * - IP bo'yicha noto'g'ri kod: 50 ta / 10 daqiqa → 30 daqiqa (bitta sinf NAT ortida — bir o'quvchi xatosi hammani bloklamasin);
 * - IP bo'yicha jami urinishlar: 60 ta / daqiqa (bitta sinf NAT ortida bo'lishi mumkin);
 * - butun server bo'yicha noto'g'ri kodlar: 300 ta / daqiqa → 1 daqiqa hammaga sekinlashtirish;
 * - bitta kodga: 200 ta kirish / daqiqa.
 */
export const joinFailByDevice = new RateLimiter(10, 10 * 60_000, 30 * 60_000);
export const joinFailByIp = new RateLimiter(50, 10 * 60_000, 30 * 60_000);
export const joinByIp = new RateLimiter(60, 60_000);
export const joinFailGlobal = new RateLimiter(300, 60_000);
export const joinByCode = new RateLimiter(200, 60_000);

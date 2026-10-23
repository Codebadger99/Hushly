import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class TokenService {
  generate(): string {
    return randomBytes(32).toString('hex');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  matches(storedHash: string, candidateHash: string): boolean {
    if (!storedHash || storedHash.length !== candidateHash.length) return false;
    return timingSafeEqual(Buffer.from(storedHash), Buffer.from(candidateHash));
  }
}
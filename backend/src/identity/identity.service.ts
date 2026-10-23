import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';

const ADJECTIVES = [
  'Quiet', 'Blue', 'Swift', 'Gentle', 'Brave', 'Calm', 'Clever', 'Misty',
  'Golden', 'Silver', 'Lucky', 'Sleepy', 'Bright', 'Cosmic', 'Fuzzy', 'Hidden',
];
const ANIMALS = [
  'Fox', 'Ghost', 'Owl', 'Panda', 'Wolf', 'Otter', 'Falcon', 'Tiger',
  'Koala', 'Raven', 'Lynx', 'Heron', 'Badger', 'Moth', 'Newt', 'Whale',
];

@Injectable()
export class IdentityService {
  // `taken` = names already used in this room, so names stay unique per room
  generateName(taken: Set<string>): string {
    for (let attempt = 0; ; attempt++) {
      const max = attempt < 20 ? 100 : 10000; // widen the number range if crowded
      const name =
        ADJECTIVES[randomInt(ADJECTIVES.length)] +
        ANIMALS[randomInt(ANIMALS.length)] +
        randomInt(1, max);
      if (!taken.has(name)) return name;
    }
  }
}
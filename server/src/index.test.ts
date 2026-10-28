import { describe, expect, it } from 'vitest';
import { start } from './index.js';

describe('server placeholder', () => {
  it('refuses to start before slice S01 is implemented', () => {
    expect(() => start()).toThrow(/not implemented/i);
  });
});

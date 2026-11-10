import { describe, expect, it } from 'vitest';
import { ACCOUNT_SHARE_LEVELS } from '../src';

describe('account sharing contract', () => {
  it('supports the two access levels defined by the specification', () => {
    expect(ACCOUNT_SHARE_LEVELS).toEqual(['BALANCE_ONLY', 'FULL']);
  });
});
